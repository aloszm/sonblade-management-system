-- El retiro del cierre de caja se entrega a una persona fija (decisión del dueño, 21 nov 2026):
-- "El efectivo sobrante es después de los sobres. El efectivo sobrante se le tiene que entregar a Sonia."
-- Antes, "a quién se entrega" era un texto libre y opcional: se podía cerrar con un retiro sin decir quién lo recibía.
-- * Cada sucursal guarda QUIÉN recibe el retiro (branches.withdrawal_recipient_user_id). No va un nombre en el código:
--   la cuenta principal lo elige con su PIN (set_cash_withdrawal_recipient). Solo gerencia o cuenta principal pueden recibirlo.
-- * Con receptor configurado, el cierre guarda a esa persona (su id y su nombre) en todo retiro mayor a $0 y NO usa
--   lo que mande la pantalla. La firma de close_cash_session no cambia: la app anterior sigue cerrando y el retiro
--   queda a nombre del receptor sin que la pantalla haga nada.
-- * Sin receptor configurado (o si esa persona ya no está activa o cambió de puesto) todo sigue como antes: texto opcional.
-- * Sin retiro ($0) no se guarda a quién se entrega (antes se guardaba el texto aunque no hubiera retiro).
-- * El reparto no cambia: primero el fondo, después el apartado al sobre, y el retiro es lo que sobra.
-- * Las cajas ya cerradas no se tocan. Esta migración no carga datos: el receptor de cada base se fija aparte
--   (supabase/pending/cash_withdrawal_recipient_gallo.sql o la pantalla Caja → Ajustes de caja).

alter table public.branches add column if not exists withdrawal_recipient_user_id uuid;
alter table public.branches add constraint branches_withdrawal_recipient_fk
  foreign key (business_id, withdrawal_recipient_user_id)
  references public.business_memberships (business_id, user_id) on delete restrict;
create index if not exists branches_withdrawal_recipient on public.branches (business_id, withdrawal_recipient_user_id);
comment on column public.branches.withdrawal_recipient_user_id is
  'Persona (gerencia o cuenta principal) a quien se entrega el retiro del cierre de caja. Nulo = sin receptor fijo. Solo cambia con set_cash_withdrawal_recipient.';

alter table public.cash_sessions add column if not exists withdrawal_recipient_user_id uuid;
alter table public.cash_sessions add constraint cash_sessions_withdrawal_recipient_fk
  foreign key (business_id, withdrawal_recipient_user_id)
  references public.business_memberships (business_id, user_id) on delete restrict;
alter table public.cash_sessions add constraint cash_sessions_withdrawal_recipient_check
  check (withdrawal_recipient_user_id is null or (status = 'closed' and withdrawn_amount is not null and withdrawn_amount > 0));
create index if not exists cash_sessions_withdrawal_recipient on public.cash_sessions (business_id, withdrawal_recipient_user_id);
comment on column public.cash_sessions.withdrawal_recipient_user_id is
  'Receptor fijo del retiro que tenía la sucursal al cerrar. Nulo si no hubo retiro, si no había receptor fijo o si la caja se cerró antes del 21 nov 2026.';

-- ───────────── Quién recibe hoy el retiro de una sucursal (solo para las funciones de la base)
-- Devuelve una fila solo si la persona configurada sigue activa y es gerencia o cuenta principal.
create or replace function private.cash_withdrawal_recipient(p_business_id uuid, p_branch_id uuid)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $function$
  select m.user_id,
         coalesce(
           (select nullif(btrim(e.display_name), '') from public.employees e
             where e.business_id = m.business_id and e.user_id = m.user_id order by e.is_active desc, e.created_at limit 1),
           (select nullif(btrim(p.full_name), '') from public.profiles p where p.user_id = m.user_id and position('@' in p.full_name) = 0),
           m.login_name)
  from public.branches b
  join public.business_memberships m on m.business_id = b.business_id and m.user_id = b.withdrawal_recipient_user_id
  where b.id = p_branch_id and b.business_id = p_business_id
    and m.is_active and m.role in ('owner', 'admin');
$function$;
revoke all on function private.cash_withdrawal_recipient(uuid, uuid) from public, anon, authenticated;

-- ───────────── Lectura para la pantalla de Caja (quien ve la caja de la sucursal)
create or replace function public.cash_withdrawal_recipient(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_row record;
begin
  select b.business_id into v_business_id from public.branches b where b.id = p_branch_id;
  if auth.uid() is null or v_business_id is null
     or not private.has_business_role(v_business_id, array['owner','admin','viewer','cashier','receptionist']::public.business_role[])
     or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'Cash permission denied' using errcode = '42501';
  end if;
  select r.user_id, r.display_name into v_row from private.cash_withdrawal_recipient(v_business_id, p_branch_id) r;
  if not found then
    return null;
  end if;
  return jsonb_build_object('user_id', v_row.user_id, 'name', v_row.display_name);
end;
$function$;
revoke all on function public.cash_withdrawal_recipient(uuid) from public, anon;
grant execute on function public.cash_withdrawal_recipient(uuid) to authenticated;

-- ───────────── Cambiar quién recibe el retiro: solo la cuenta principal, con su PIN y un comentario
-- p_user_id nulo quita el receptor fijo (vuelve el texto opcional).
create or replace function public.set_cash_withdrawal_recipient(p_branch_id uuid, p_user_id uuid, p_comment text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_before uuid;
  v_before_name text;
  v_name text;
begin
  select b.business_id into v_business_id from public.branches b where b.id = p_branch_id and b.is_active;
  if auth.uid() is null or v_business_id is null
     or not private.has_business_role(v_business_id, array['owner']::public.business_role[])
     or not private.can_access_branch(v_business_id, p_branch_id) then
    raise exception 'Solo la cuenta principal puede cambiar quién recibe el retiro de la caja.' using errcode = '42501';
  end if;
  if not private.valid_pin_comment(p_comment) then
    raise exception 'Escribe un comentario de por qué cambias quién recibe el retiro (de 5 a 300 letras).' using errcode = '22023';
  end if;
  if p_user_id is not null and not exists (
       select 1 from public.business_memberships m
       where m.business_id = v_business_id and m.user_id = p_user_id and m.is_active and m.role in ('owner', 'admin')) then
    raise exception 'El retiro solo se puede entregar a la gerencia o a la cuenta principal, con acceso activo.' using errcode = '22023';
  end if;
  perform private.consume_pin_proof();

  select b.withdrawal_recipient_user_id into v_before from public.branches b where b.id = p_branch_id for update;
  select r.display_name into v_before_name from private.cash_withdrawal_recipient(v_business_id, p_branch_id) r;
  update public.branches set withdrawal_recipient_user_id = p_user_id, updated_at = now() where id = p_branch_id;
  select r.display_name into v_name from private.cash_withdrawal_recipient(v_business_id, p_branch_id) r;

  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_business_id, p_branch_id, auth.uid(), 'branch', p_branch_id::text, 'cash_withdrawal_recipient_changed',
    jsonb_build_object('withdrawal_recipient_user_id', v_before, 'withdrawal_recipient_name', v_before_name),
    jsonb_build_object('withdrawal_recipient_user_id', p_user_id, 'withdrawal_recipient_name', v_name,
      'comment', btrim(p_comment), 'confirmed_with_pin', true));
  perform private.log_pin_confirmed(v_business_id, p_branch_id, 'cash_withdrawal_recipient_changed', 'branch', p_branch_id::text, p_comment,
    jsonb_build_object('withdrawal_recipient_user_id', p_user_id, 'withdrawal_recipient_name', v_name));
  return case when p_user_id is null then null else jsonb_build_object('user_id', p_user_id, 'name', v_name) end;
end;
$function$;
revoke all on function public.set_cash_withdrawal_recipient(uuid, uuid, text) from public, anon;
grant execute on function public.set_cash_withdrawal_recipient(uuid, uuid, text) to authenticated;

-- ───────────── Sin atajos: el receptor solo cambia por set_cash_withdrawal_recipient (o por SQL del dueño de la base).
-- Mismo mecanismo que guard_booking_settings: la función NO es security definer, así que current_user es quien hace el
-- cambio. Dentro de set_cash_withdrawal_recipient es el dueño de la base y pasa; un INSERT o UPDATE directo desde la API
-- (rol authenticated; la política de branches deja escribir a la cuenta principal) se rechaza.
create or replace function private.guard_withdrawal_recipient()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') and (
       (tg_op = 'INSERT' and new.withdrawal_recipient_user_id is not null)
       or (tg_op = 'UPDATE' and new.withdrawal_recipient_user_id is distinct from old.withdrawal_recipient_user_id)) then
    raise exception 'Quién recibe el retiro se cambia en Caja, en Ajustes de caja, con el PIN de la cuenta principal.' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function private.guard_withdrawal_recipient() from public, anon, authenticated;

drop trigger if exists guard_withdrawal_recipient on public.branches;
create trigger guard_withdrawal_recipient before insert or update of withdrawal_recipient_user_id on public.branches
  for each row execute function private.guard_withdrawal_recipient();

-- ───────────── Cierre de caja: el retiro queda a nombre del receptor de la sucursal
-- Cuerpo idéntico al de 20261121110000_cash_difference_reason salvo: (1) con receptor configurado y retiro > 0 se guarda
-- esa persona y se ignora el texto de la pantalla; (2) sin retiro no se guarda a quién se entrega; (3) la respuesta y la
-- bitácora llevan withdrawal_recipient_user_id. Misma firma y mismos permisos.
create or replace function private.close_cash_session_impl(p_cash_session_id uuid, p_counted_cash numeric, p_breakdown jsonb DEFAULT NULL::jsonb, p_float_left numeric DEFAULT NULL::numeric, p_reserve_amount numeric DEFAULT NULL::numeric, p_withdrawal_delivered_to text DEFAULT NULL::text, p_short_float_reason text DEFAULT NULL::text, p_difference_reason text DEFAULT NULL::text)
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
  v_recipient_id uuid;
  v_recipient_name text;
  v_short_reason text := nullif(btrim(coalesce(p_short_float_reason, '')), '');
  v_difference_reason text := nullif(btrim(coalesce(p_difference_reason, '')), '');
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

  -- A quién se entrega el retiro: si la sucursal tiene receptor, es esa persona (lo decide la base, no la pantalla).
  if v_withdrawn > 0 then
    select r.user_id, r.display_name into v_recipient_id, v_recipient_name
    from private.cash_withdrawal_recipient(v_session.business_id, v_session.branch_id) r;
    if v_recipient_id is not null then
      v_delivered_to := v_recipient_name;
    end if;
  else
    v_delivered_to := null;
  end if;
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

  -- Sobrante o faltante: se puede cerrar, pero escribiendo por qué. Lo decide esta cuenta, no la pantalla.
  if v_difference <> 0 then
    if v_difference_reason is null or length(v_difference_reason) not between 5 and 300 then
      raise exception 'Hay una diferencia de % (%): escribe el motivo para cerrar (de 5 a 300 letras).',
        private.money_text(abs(v_difference)), case when v_difference < 0 then 'faltante' else 'sobrante' end
        using errcode = '22023', hint = 'difference_reason_required';
    end if;
  else
    v_difference_reason := null;
  end if;

  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid(),
    expected_cash = v_expected, counted_cash = p_counted_cash, difference_amount = v_difference,
    counted_breakdown = p_breakdown, float_left = v_float, reserve_amount = v_reserve, withdrawn_amount = v_withdrawn,
    withdrawal_delivered_to = v_delivered_to, withdrawal_recipient_user_id = v_recipient_id,
    closing_note = v_short_reason, difference_reason = v_difference_reason
  where id = p_cash_session_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_session.business_id, v_session.branch_id, auth.uid(), 'cash_session', p_cash_session_id::text, 'cash_closed',
    jsonb_build_object('expected_cash', v_expected, 'counted_cash', p_counted_cash, 'difference', v_difference,
      'difference_reason', v_difference_reason,
      'float_left', v_float, 'float_target', v_branch.cash_float_target, 'short_float_reason', v_short_reason,
      'reserve_amount', v_reserve, 'reserve_label', v_branch.daily_reserve_label,
      'withdrawn_amount', v_withdrawn, 'withdrawal_delivered_to', v_delivered_to,
      'withdrawal_recipient_user_id', v_recipient_id, 'breakdown', p_breakdown));
  return jsonb_build_object('cash_session_id', p_cash_session_id, 'expected_cash', v_expected, 'counted_cash', p_counted_cash,
    'difference_amount', v_difference, 'float_left', v_float, 'reserve_amount', v_reserve,
    'reserve_label', v_branch.daily_reserve_label, 'withdrawn_amount', v_withdrawn, 'withdrawal_delivered_to', v_delivered_to,
    'withdrawal_recipient_user_id', v_recipient_id,
    'closing_note', v_short_reason, 'difference_reason', v_difference_reason);
end;
$function$;
revoke all on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text, text, text) from public, anon;
grant execute on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric, text, text, text) to authenticated;
