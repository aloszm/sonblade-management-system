-- Caja con motivo y confirmación con PIN.
-- 1) Cierre con menos del fondo recomendado y apertura distinta de lo que se dejó: motivo obligatorio.
-- 2) Cambios sensibles de gerencia (ajustes de caja, inventario, movimientos manuales) confirmados con PIN:
--    el servidor verifica el PIN abriendo una sesión aparte y ejecuta la acción con esa sesión recién creada;
--    la base exige que la sesión tenga menos de 2 minutos y que no se haya usado antes (un solo uso).

alter table public.cash_sessions
  add column if not exists opening_note text,
  add column if not exists closing_note text;

create or replace function private.money_text(p numeric) returns text
language sql immutable set search_path = ''
as $$ select '$' || regexp_replace(to_char(p, 'FM999,999,990.00'), '\.00$', '') $$;

-- Prueba de PIN reciente: la sesión del JWT se creó hace menos de 2 minutos (inicio con PIN) y no se ha usado.
create table if not exists private.pin_confirmations (
  session_id uuid primary key,
  user_id uuid not null,
  used_at timestamptz not null default now()
);
alter table private.pin_confirmations enable row level security;
revoke all on private.pin_confirmations from public, anon, authenticated;

create or replace function private.consume_pin_proof()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sid uuid;
begin
  begin
    v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_sid := null;
  end;
  if auth.uid() is null or v_sid is null or not exists (
    select 1 from auth.sessions s
    where s.id = v_sid and s.user_id = auth.uid() and s.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'Confirma con tu PIN para hacer este cambio.' using errcode = '42501';
  end if;
  insert into private.pin_confirmations (session_id, user_id) values (v_sid, auth.uid()) on conflict do nothing;
  if not found then
    raise exception 'Esa confirmación con PIN ya se usó. Vuelve a escribir tu PIN.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.consume_pin_proof() from public, anon, authenticated;

create or replace function private.valid_pin_comment(p text) returns boolean
language sql immutable set search_path = ''
as $$ select length(btrim(coalesce(p, ''))) between 5 and 300 $$;

create or replace function private.log_pin_confirmed(p_business_id uuid, p_branch_id uuid, p_action text,
  p_entity_type text, p_entity_id text, p_comment text, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (p_business_id, p_branch_id, auth.uid(), p_entity_type, p_entity_id, 'pin_confirmed_action',
    jsonb_build_object('action', p_action, 'comment', btrim(p_comment), 'confirmed_with_pin', true) || coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function private.log_pin_confirmed(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- ───────────── Apertura: motivo obligatorio si el monto difiere de lo que se dejó (o del fondo recomendado)
drop function if exists public.open_cash_session(uuid, numeric);
drop function if exists private.open_cash_session_impl(uuid, numeric);

create function private.open_cash_session_impl(p_branch_id uuid, p_opening_cash numeric, p_opening_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
DECLARE
  v_business_id uuid;
  v_session_id uuid;
  v_target numeric(12,2);
  v_left numeric(12,2);
  v_reference numeric(12,2);
  v_reason text := nullif(btrim(coalesce(p_opening_reason, '')), '');
BEGIN
  SELECT b.business_id, b.cash_float_target INTO v_business_id, v_target FROM public.branches b WHERE b.id = p_branch_id AND b.is_active;
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin','cashier','receptionist']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Cash permission denied' USING ERRCODE = '42501';
  END IF;
  IF NOT private.valid_cash_amount(p_opening_cash, true) THEN
    RAISE EXCEPTION 'El efectivo inicial debe ser un monto de 0 a 1,000,000 con máximo 2 decimales.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_branch_id::text || ':cash-open', 0));
  IF EXISTS (SELECT 1 FROM public.cash_sessions WHERE branch_id = p_branch_id AND status = 'open') THEN
    RAISE EXCEPTION 'A cash session is already open for this branch' USING ERRCODE = '23505';
  END IF;
  SELECT s.float_left INTO v_left FROM public.cash_sessions s WHERE s.branch_id = p_branch_id AND s.status = 'closed' ORDER BY s.closed_at DESC LIMIT 1;
  v_reference := coalesce(v_left, v_target);
  IF p_opening_cash <> v_reference THEN
    IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 5 AND 300 THEN
      IF v_left IS NOT NULL THEN
        RAISE EXCEPTION 'En el cierre anterior se dejaron %; estás abriendo con %. Escribe el motivo (de 5 a 300 letras).',
          private.money_text(v_left), private.money_text(p_opening_cash) USING ERRCODE = '22023';
      ELSE
        RAISE EXCEPTION 'El fondo recomendado es %; estás abriendo con %. Escribe el motivo (de 5 a 300 letras).',
          private.money_text(v_target), private.money_text(p_opening_cash) USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSE
    v_reason := NULL;
  END IF;
  INSERT INTO public.cash_sessions (business_id, branch_id, opened_by, opening_cash, status, opening_expected, opening_note)
  VALUES (v_business_id, p_branch_id, auth.uid(), p_opening_cash, 'open', v_left, v_reason)
  RETURNING id INTO v_session_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'cash_session', v_session_id::text, 'cash_opened',
    jsonb_build_object('opening_cash', p_opening_cash, 'opening_expected', v_left, 'float_target', v_target, 'opening_reason', v_reason));
  RETURN jsonb_build_object('cash_session_id', v_session_id);
END;
$function$;
revoke all on function private.open_cash_session_impl(uuid, numeric, text) from public, anon;
grant execute on function private.open_cash_session_impl(uuid, numeric, text) to authenticated, service_role;

create function public.open_cash_session(p_branch_id uuid, p_opening_cash numeric, p_opening_reason text default null)
returns jsonb
language sql
set search_path = ''
as $function$ SELECT private.open_cash_session_impl($1, $2, $3) $function$;
revoke all on function public.open_cash_session(uuid, numeric, text) from public, anon;
grant execute on function public.open_cash_session(uuid, numeric, text) to authenticated, service_role;

-- ───────────── Cierre: motivo obligatorio si se deja menos del fondo recomendado
drop function if exists public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text);
drop function if exists private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text);

create function private.close_cash_session_impl(p_cash_session_id uuid, p_counted_cash numeric, p_breakdown jsonb DEFAULT NULL::jsonb, p_float_left numeric DEFAULT NULL::numeric, p_reserve_amount numeric DEFAULT NULL::numeric, p_withdrawal_delivered_to text DEFAULT NULL::text, p_short_float_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.cash_sessions%rowtype;
  v_branch record;
  v_expected numeric(12,2);
  v_difference numeric(12,2);
  v_float numeric(12,2);
  v_reserve numeric(12,2);
  v_withdrawn numeric(12,2);
  v_sum numeric := 0;
  v_key text;
  v_value jsonb;
  v_delivered_to text := nullif(trim(coalesce(p_withdrawal_delivered_to, '')), '');
  v_short_reason text := nullif(btrim(coalesce(p_short_float_reason, '')), '');
begin
  select * into v_session from public.cash_sessions where id = p_cash_session_id for update;
  if not found or not private.has_business_role(v_session.business_id, array['owner','admin','cashier','receptionist']::public.business_role[])
     or not private.can_access_branch(v_session.business_id, v_session.branch_id) then
    raise exception 'Cash permission denied' using errcode = '42501';
  end if;
  if v_session.status <> 'open' or p_counted_cash is null or p_counted_cash < 0 or p_counted_cash <> round(p_counted_cash, 2) then
    raise exception 'La caja no está abierta o el conteo no es válido.' using errcode = '22023';
  end if;

  -- Conteo por billetes y monedas: debe sumar exactamente lo contado.
  if p_breakdown is not null then
    if jsonb_typeof(p_breakdown) <> 'object' then
      raise exception 'El conteo por denominación no es válido.' using errcode = '22023';
    end if;
    for v_key, v_value in select key, value from jsonb_each(p_breakdown) loop
      if v_key !~ '^[0-9]+(\.[0-9]+)?$' or jsonb_typeof(v_value) <> 'number'
         or (v_value::text)::numeric < 0 or (v_value::text)::numeric > 100000
         or (v_value::text)::numeric <> floor((v_value::text)::numeric) then
        raise exception 'El conteo por denominación no es válido.' using errcode = '22023';
      end if;
      v_sum := v_sum + v_key::numeric * (v_value::text)::numeric;
    end loop;
    if v_sum <> p_counted_cash then
      raise exception 'Los billetes y monedas suman $%, pero el total contado es $%.', v_sum, p_counted_cash using errcode = '22023';
    end if;
  end if;

  select b.cash_float_target, b.daily_reserve_amount, b.daily_reserve_label into v_branch
  from public.branches b where b.id = v_session.branch_id;

  -- Orden cuando no alcanza: primero el fondo, después el apartado, y el retiro con lo que sobre.
  v_float := coalesce(p_float_left, least(p_counted_cash, v_branch.cash_float_target));
  if v_float < 0 or v_float > p_counted_cash or v_float <> round(v_float, 2) then
    raise exception 'El fondo que se deja no puede ser mayor a lo contado.' using errcode = '22023';
  end if;
  v_reserve := coalesce(p_reserve_amount, least(p_counted_cash - v_float, v_branch.daily_reserve_amount));
  if v_reserve < 0 or v_reserve > p_counted_cash - v_float or v_reserve <> round(v_reserve, 2) then
    raise exception 'El apartado no puede ser mayor a lo que queda después del fondo.' using errcode = '22023';
  end if;
  v_withdrawn := p_counted_cash - v_float - v_reserve;
  if v_delivered_to is not null and length(v_delivered_to) not between 2 and 120 then
    raise exception 'Escribe a quién se entrega el retiro (de 2 a 120 letras).' using errcode = '22023';
  end if;
  -- Dejar menos del fondo recomendado se puede, pero con motivo.
  if v_float < v_branch.cash_float_target then
    if v_short_reason is null or length(v_short_reason) not between 5 and 300 then
      raise exception 'Se recomienda dejar % para mañana; vas a dejar %. Escribe el motivo (de 5 a 300 letras).',
        private.money_text(v_branch.cash_float_target), private.money_text(v_float) using errcode = '22023';
    end if;
  else
    v_short_reason := null;
  end if;

  select v_session.opening_cash + coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
  into v_expected from public.cash_movements
  where cash_session_id = p_cash_session_id and method = 'cash';
  v_difference := p_counted_cash - v_expected;

  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid(),
    expected_cash = v_expected, counted_cash = p_counted_cash, difference_amount = v_difference,
    counted_breakdown = p_breakdown, float_left = v_float, reserve_amount = v_reserve, withdrawn_amount = v_withdrawn,
    withdrawal_delivered_to = v_delivered_to, closing_note = v_short_reason
  where id = p_cash_session_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_session.business_id, v_session.branch_id, auth.uid(), 'cash_session', p_cash_session_id::text, 'cash_closed',
    jsonb_build_object('expected_cash', v_expected, 'counted_cash', p_counted_cash, 'difference', v_difference,
      'float_left', v_float, 'float_target', v_branch.cash_float_target, 'short_float_reason', v_short_reason,
      'reserve_amount', v_reserve, 'reserve_label', v_branch.daily_reserve_label,
      'withdrawn_amount', v_withdrawn, 'withdrawal_delivered_to', v_delivered_to, 'breakdown', p_breakdown));
  return jsonb_build_object('cash_session_id', p_cash_session_id, 'expected_cash', v_expected, 'counted_cash', p_counted_cash,
    'difference_amount', v_difference, 'float_left', v_float, 'reserve_amount', v_reserve,
    'reserve_label', v_branch.daily_reserve_label, 'withdrawn_amount', v_withdrawn, 'withdrawal_delivered_to', v_delivered_to,
    'closing_note', v_short_reason);
end;
$function$;
revoke all on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text, text) from public, anon;
grant execute on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text, text) to authenticated;

create function public.close_cash_session(p_cash_session_id uuid, p_counted_cash numeric, p_breakdown jsonb DEFAULT NULL::jsonb, p_float_left numeric DEFAULT NULL::numeric, p_reserve_amount numeric DEFAULT NULL::numeric, p_withdrawal_delivered_to text DEFAULT NULL::text, p_short_float_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.close_cash_session_impl($1, $2, $3, $4, $5, $6, $7) $function$;
revoke all on function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text, text) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric, text, text) to authenticated, service_role;

-- ───────────── Ajustes de caja con PIN: dueño o gerencia (la tabla branches sigue siendo solo del dueño)
create or replace function public.set_cash_settings_confirmed(p_branch_id uuid, p_float_target numeric, p_reserve_amount numeric, p_reserve_label text, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_before record;
  v_label text := btrim(coalesce(p_reserve_label, ''));
begin
  select b.business_id into v_business_id from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business_id is null
     or not private.has_business_role(v_business_id, array['owner','admin']::public.business_role[])
     or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'Cash settings permission denied' using errcode = '42501';
  end if;
  if not private.valid_pin_comment(p_comment) then
    raise exception 'Escribe un comentario de por qué cambias la caja (de 5 a 300 letras).' using errcode = '22023';
  end if;
  if p_float_target is null or p_float_target < 0 or p_float_target > 1000000
     or p_reserve_amount is null or p_reserve_amount < 0 or p_reserve_amount > 1000000
     or length(v_label) < 2 or length(v_label) > 60 then
    raise exception 'El fondo, el apartado o su nombre no son válidos.' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();
  select cash_float_target, daily_reserve_amount, daily_reserve_label into v_before from public.branches where id = p_branch_id for update;
  update public.branches set cash_float_target = round(p_float_target, 2), daily_reserve_amount = round(p_reserve_amount, 2),
    daily_reserve_label = v_label, updated_at = now() where id = p_branch_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_business_id, p_branch_id, auth.uid(), 'branch', p_branch_id::text, 'cash_settings_changed',
    jsonb_build_object('cash_float_target', v_before.cash_float_target, 'daily_reserve_amount', v_before.daily_reserve_amount, 'daily_reserve_label', v_before.daily_reserve_label),
    jsonb_build_object('cash_float_target', round(p_float_target, 2), 'daily_reserve_amount', round(p_reserve_amount, 2), 'daily_reserve_label', v_label,
      'comment', btrim(p_comment), 'confirmed_with_pin', true));
  perform private.log_pin_confirmed(v_business_id, p_branch_id, 'cash_settings_changed', 'branch', p_branch_id::text, p_comment,
    jsonb_build_object('cash_float_target', round(p_float_target, 2), 'daily_reserve_amount', round(p_reserve_amount, 2)));
  return jsonb_build_object('cash_float_target', round(p_float_target, 2), 'daily_reserve_amount', round(p_reserve_amount, 2), 'daily_reserve_label', v_label);
end;
$function$;
revoke all on function public.set_cash_settings_confirmed(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.set_cash_settings_confirmed(uuid, numeric, numeric, text, text) to authenticated;

-- ───────────── Inventario con PIN (dueño o gerencia; los permisos los revisa la función de siempre)
create or replace function public.adjust_inventory_stock_confirmed(p_branch_id uuid, p_product_id uuid, p_quantity_delta integer, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not private.valid_pin_comment(p_comment) then
    raise exception 'Escribe un comentario del ajuste de inventario (de 5 a 300 letras).' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();
  v_result := private.adjust_inventory_stock_impl(p_branch_id, p_product_id, p_quantity_delta, btrim(p_comment));
  perform private.log_pin_confirmed((select business_id from public.branches where id = p_branch_id), p_branch_id,
    'inventory_adjusted', 'inventory', v_result ->> 'movement_id', p_comment,
    jsonb_build_object('product_id', p_product_id, 'quantity_delta', p_quantity_delta, 'quantity_after', v_result -> 'quantity_on_hand'));
  return v_result;
end;
$function$;
revoke all on function public.adjust_inventory_stock_confirmed(uuid, uuid, integer, text) from public, anon;
grant execute on function public.adjust_inventory_stock_confirmed(uuid, uuid, integer, text) to authenticated;

create or replace function public.set_inventory_minimum_confirmed(p_branch_id uuid, p_product_id uuid, p_minimum_quantity integer, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not private.valid_pin_comment(p_comment) then
    raise exception 'Escribe un comentario del cambio de mínimo (de 5 a 300 letras).' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();
  v_result := private.set_inventory_minimum_impl(p_branch_id, p_product_id, p_minimum_quantity);
  perform private.log_pin_confirmed((select business_id from public.branches where id = p_branch_id), p_branch_id,
    'inventory_minimum_changed', 'inventory_threshold', p_product_id::text, p_comment,
    jsonb_build_object('product_id', p_product_id, 'minimum_quantity', p_minimum_quantity));
  return v_result;
end;
$function$;
revoke all on function public.set_inventory_minimum_confirmed(uuid, uuid, integer, text) from public, anon;
grant execute on function public.set_inventory_minimum_confirmed(uuid, uuid, integer, text) to authenticated;

-- ───────────── Movimiento manual de caja con PIN (gerencia). La descripción es el comentario.
create or replace function public.record_cash_movement_confirmed(p_cash_session_id uuid, p_movement_type public.cash_movement_type, p_method public.payment_method, p_amount numeric, p_description text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_session record;
begin
  select business_id, branch_id into v_session from public.cash_sessions where id = p_cash_session_id;
  if not found or not private.has_business_role(v_session.business_id, array['owner','admin']::public.business_role[]) then
    raise exception 'Cash permission denied' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 2 and 300 then
    raise exception 'Escribe el concepto del movimiento (de 2 a 300 letras).' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();
  v_result := private.record_cash_movement_impl(p_cash_session_id, p_movement_type, p_method, p_amount, p_description);
  perform private.log_pin_confirmed(v_session.business_id, v_session.branch_id, 'cash_movement_recorded', 'cash_movement',
    v_result ->> 'movement_id', p_description,
    jsonb_build_object('type', p_movement_type, 'method', p_method, 'amount', p_amount));
  return v_result;
end;
$function$;
revoke all on function public.record_cash_movement_confirmed(uuid, public.cash_movement_type, public.payment_method, numeric, text) from public, anon;
grant execute on function public.record_cash_movement_confirmed(uuid, public.cash_movement_type, public.payment_method, numeric, text) to authenticated;
