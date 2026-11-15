-- Cierre de caja guiado: fondo fijo para el día siguiente, apartado diario (renta y gastos),
-- conteo por billetes y monedas, y retiro del resto. Todo queda en la sesión y en la bitácora.

-- 1) Ajustes por sucursal.
alter table public.branches
  add column if not exists cash_float_target numeric(12,2) not null default 500
    constraint branches_cash_float_target_check check (cash_float_target >= 0),
  add column if not exists daily_reserve_amount numeric(12,2) not null default 600
    constraint branches_daily_reserve_amount_check check (daily_reserve_amount >= 0),
  add column if not exists daily_reserve_label text not null default 'Renta y gastos'
    constraint branches_daily_reserve_label_check check (length(btrim(daily_reserve_label)) between 2 and 60);

-- 2) Lo que pasó con el efectivo al cerrar.
alter table public.cash_sessions
  add column if not exists opening_expected numeric(12,2),
  add column if not exists counted_breakdown jsonb,
  add column if not exists float_left numeric(12,2),
  add column if not exists reserve_amount numeric(12,2),
  add column if not exists withdrawn_amount numeric(12,2),
  add constraint cash_sessions_close_split_check check (
    (float_left is null and reserve_amount is null and withdrawn_amount is null)
    or (status = 'closed' and float_left >= 0 and reserve_amount >= 0 and withdrawn_amount >= 0
        and float_left + reserve_amount + withdrawn_amount = counted_cash)
  );

-- 3) Cambiar fondo y apartado: dueño y administración; queda en la bitácora.
create or replace function private.set_cash_settings_impl(p_branch_id uuid, p_float_target numeric, p_reserve_amount numeric, p_reserve_label text)
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
  if p_float_target is null or p_float_target < 0 or p_float_target > 1000000
     or p_reserve_amount is null or p_reserve_amount < 0 or p_reserve_amount > 1000000
     or length(v_label) < 2 or length(v_label) > 60 then
    raise exception 'El fondo, el apartado o su nombre no son válidos.' using errcode = '22023';
  end if;
  select cash_float_target, daily_reserve_amount, daily_reserve_label into v_before from public.branches where id = p_branch_id for update;
  update public.branches set cash_float_target = round(p_float_target, 2), daily_reserve_amount = round(p_reserve_amount, 2),
    daily_reserve_label = v_label, updated_at = now() where id = p_branch_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (v_business_id, p_branch_id, auth.uid(), 'branch', p_branch_id::text, 'cash_settings_changed',
    jsonb_build_object('cash_float_target', v_before.cash_float_target, 'daily_reserve_amount', v_before.daily_reserve_amount, 'daily_reserve_label', v_before.daily_reserve_label),
    jsonb_build_object('cash_float_target', round(p_float_target, 2), 'daily_reserve_amount', round(p_reserve_amount, 2), 'daily_reserve_label', v_label));
  return jsonb_build_object('cash_float_target', round(p_float_target, 2), 'daily_reserve_amount', round(p_reserve_amount, 2), 'daily_reserve_label', v_label);
end;
$function$;

create or replace function public.set_cash_settings(p_branch_id uuid, p_float_target numeric, p_reserve_amount numeric, p_reserve_label text)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.set_cash_settings_impl(p_branch_id, p_float_target, p_reserve_amount, p_reserve_label) $function$;

revoke all on function private.set_cash_settings_impl(uuid, numeric, numeric, text) from public, anon;
revoke all on function public.set_cash_settings(uuid, numeric, numeric, text) from public, anon;
grant execute on function private.set_cash_settings_impl(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.set_cash_settings(uuid, numeric, numeric, text) to authenticated;

-- 4) Abrir: se anota cuánto se dejó ayer para poder avisar si no coincide.
do $do$
declare
  v_def text := pg_get_functiondef('private.open_cash_session_impl(uuid,numeric)'::regprocedure);
  v_pairs text[][] := array[
    array[E'  INSERT INTO public.cash_sessions (business_id, branch_id, opened_by, opening_cash, status)\n  VALUES (v_business_id, p_branch_id, auth.uid(), p_opening_cash, ''open'') RETURNING id INTO v_session_id;',
          E'  INSERT INTO public.cash_sessions (business_id, branch_id, opened_by, opening_cash, status, opening_expected)\n'
          || E'  VALUES (v_business_id, p_branch_id, auth.uid(), p_opening_cash, ''open'',\n'
          || E'    (SELECT s.float_left FROM public.cash_sessions s WHERE s.branch_id = p_branch_id AND s.status = ''closed'' ORDER BY s.closed_at DESC LIMIT 1))\n'
          || E'  RETURNING id INTO v_session_id;'],
    array[E'jsonb_build_object(''opening_cash'', p_opening_cash));',
          E'jsonb_build_object(''opening_cash'', p_opening_cash, ''opening_expected'',\n'
          || E'            (SELECT s.opening_expected FROM public.cash_sessions s WHERE s.id = v_session_id)));']
  ];
  i integer;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    if array_length(string_to_array(v_def, v_pairs[i][1]), 1) <> 2 then
      raise exception 'open_cash_session_impl: el fragmento % no aparece exactamente una vez', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$do$;

-- 5) Cerrar: la firma anterior se conserva renombrada y sin permisos.
alter function private.close_cash_session_impl(uuid, numeric) rename to close_cash_session_impl_legacy;
alter function public.close_cash_session(uuid, numeric) rename to close_cash_session_legacy;
revoke all on function private.close_cash_session_impl_legacy(uuid, numeric) from public, anon, authenticated;
revoke all on function public.close_cash_session_legacy(uuid, numeric) from public, anon, authenticated;

create function private.close_cash_session_impl(p_cash_session_id uuid, p_counted_cash numeric,
  p_breakdown jsonb default null, p_float_left numeric default null, p_reserve_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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

  select v_session.opening_cash + coalesce(sum(case when direction = 'in' then amount else -amount end), 0)
  into v_expected from public.cash_movements
  where cash_session_id = p_cash_session_id and method = 'cash';
  v_difference := p_counted_cash - v_expected;

  update public.cash_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid(),
    expected_cash = v_expected, counted_cash = p_counted_cash, difference_amount = v_difference,
    counted_breakdown = p_breakdown, float_left = v_float, reserve_amount = v_reserve, withdrawn_amount = v_withdrawn
  where id = p_cash_session_id;
  insert into public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_session.business_id, v_session.branch_id, auth.uid(), 'cash_session', p_cash_session_id::text, 'cash_closed',
    jsonb_build_object('expected_cash', v_expected, 'counted_cash', p_counted_cash, 'difference', v_difference,
      'float_left', v_float, 'reserve_amount', v_reserve, 'reserve_label', v_branch.daily_reserve_label,
      'withdrawn_amount', v_withdrawn, 'breakdown', p_breakdown));
  return jsonb_build_object('cash_session_id', p_cash_session_id, 'expected_cash', v_expected, 'counted_cash', p_counted_cash,
    'difference_amount', v_difference, 'float_left', v_float, 'reserve_amount', v_reserve,
    'reserve_label', v_branch.daily_reserve_label, 'withdrawn_amount', v_withdrawn);
end;
$function$;

create function public.close_cash_session(p_cash_session_id uuid, p_counted_cash numeric,
  p_breakdown jsonb default null, p_float_left numeric default null, p_reserve_amount numeric default null)
returns jsonb language sql security invoker set search_path = ''
as $function$ select private.close_cash_session_impl($1, $2, $3, $4, $5) $function$;

revoke all on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric) from public, anon;
revoke all on function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric) from public, anon;
grant execute on function private.close_cash_session_impl(uuid, numeric, jsonb, numeric, numeric) to authenticated;
grant execute on function public.close_cash_session(uuid, numeric, jsonb, numeric, numeric) to authenticated;
