-- Corrección de seguridad (auditoría previa a producción), parte 1: accesos y permisos.
-- 1) El bloqueo por intentos solo lo usa el servidor (llave secreta): nadie sin sesión puede
--    sumar fallos a otra persona ni consultar bloqueos. Un usuario ya bloqueado no suma más.
-- 2) Puestos y accesos (business_memberships) solo cambian por las funciones que validan quién
--    puede con quién (provision_account, set_account_active, mark_pin_reset, pin_changed).
-- 3) Comisiones y ajustes de la sucursal: solo el dueño. Empleados: user_id y
--    can_authorize_discounts ya no se escriben directo (función con reglas y bitácora).
-- 4) Una cuenta con PIN temporal no tiene acceso a datos del negocio hasta cambiarlo.
-- 5) Restablecer o cambiar el PIN y desactivar un acceso cierran las sesiones abiertas.

-- ───────────── 1) Bloqueo por intentos: solo service_role ─────────────
revoke usage on schema login_gate from anon, authenticated;
grant usage on schema login_gate to service_role;

create or replace function login_gate.login_attempt_failed_impl(p_login_id text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_id text := lower(left(coalesce(p_login_id, ''), 254));
  r private.login_attempts;
begin
  if v_id = '' then return 0; end if;
  -- Ya bloqueado: no se suman fallos ni sube el nivel (si no, cualquiera alargaría el bloqueo ajeno).
  select * into r from private.login_attempts a where a.login_id = v_id for update;
  if found and r.locked_until is not null and r.locked_until > now() then
    return greatest(0, ceil(extract(epoch from (r.locked_until - now())))::integer);
  end if;
  insert into private.login_attempts as a (login_id, failed_count, last_failed_at, updated_at)
    values (v_id, 1, now(), now())
  on conflict (login_id) do update
    set failed_count = a.failed_count + 1, last_failed_at = now(), updated_at = now()
  returning * into r;
  if r.failed_count >= 5 and r.failed_count % 5 = 0 then
    update private.login_attempts
       set lock_level = lock_level + 1,
           locked_until = now() + make_interval(mins => private.login_lock_minutes(lock_level + 1))
     where login_id = v_id
    returning * into r;
  end if;
  return coalesce(greatest(0, ceil(extract(epoch from (r.locked_until - now())))::integer), 0);
end
$$;

-- Entrar bien limpia el contador: ahora lo hace el servidor indicando el usuario (antes se
-- deducía de la sesión, lo que obligaba a dejarlo abierto a authenticated).
drop function public.login_attempt_succeeded();
drop function private.login_attempt_succeeded_impl();
create function login_gate.login_attempt_succeeded_impl(p_login_id text)
returns void language sql security definer set search_path = ''
as $$ delete from private.login_attempts where login_id = lower(left(coalesce(p_login_id, ''), 254)) $$;
create function public.login_attempt_succeeded(p_login_id text)
returns void language sql security invoker set search_path = ''
as $$ select login_gate.login_attempt_succeeded_impl(p_login_id) $$;

revoke all on function login_gate.login_attempt_check_impl(text) from public, anon, authenticated;
revoke all on function login_gate.login_attempt_failed_impl(text) from public, anon, authenticated;
revoke all on function login_gate.login_attempt_succeeded_impl(text) from public, anon, authenticated;
revoke all on function public.login_attempt_check(text) from public, anon, authenticated;
revoke all on function public.login_attempt_failed(text) from public, anon, authenticated;
revoke all on function public.login_attempt_succeeded(text) from public, anon, authenticated;
grant execute on function login_gate.login_attempt_check_impl(text) to service_role;
grant execute on function login_gate.login_attempt_failed_impl(text) to service_role;
grant execute on function login_gate.login_attempt_succeeded_impl(text) to service_role;
grant execute on function public.login_attempt_check(text) to service_role;
grant execute on function public.login_attempt_failed(text) to service_role;
grant execute on function public.login_attempt_succeeded(text) to service_role;

-- ───────────── 4) PIN temporal: sin acceso a datos del negocio ─────────────
create or replace function private.has_business_role(p_business_id uuid, p_roles public.business_role[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships as m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and not m.must_change_pin
      and m.role = any (p_roles)
  );
$$;

create or replace function private.has_business_access(p_business_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships as m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and not m.must_change_pin
  );
$$;

create or replace function private.can_access_branch(p_business_id uuid, p_branch_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships as m
    join public.branches as b on b.business_id = m.business_id
    where m.business_id = p_business_id
      and b.id = p_branch_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and not m.must_change_pin
      and (
        m.role in ('owner', 'admin', 'viewer')
        or exists (
          select 1
          from public.user_branch_access as uba
          where uba.business_id = p_business_id
            and uba.branch_id = p_branch_id
            and uba.user_id = (select auth.uid())
        )
      )
  );
$$;

-- La sucursal (id y nombre) sí la ve quien tiene PIN temporal: la app la necesita para armar su
-- sesión y dejarle cambiar el PIN. Nada más del negocio.
create function private.can_see_branch(p_business_id uuid, p_branch_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.business_memberships as m
    join public.branches as b on b.business_id = m.business_id
    where m.business_id = p_business_id
      and b.id = p_branch_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and (
        m.role in ('owner', 'admin', 'viewer')
        or exists (
          select 1 from public.user_branch_access as uba
          where uba.business_id = p_business_id and uba.branch_id = p_branch_id and uba.user_id = (select auth.uid())
        )
      )
  );
$$;
revoke all on function private.can_see_branch(uuid, uuid) from public, anon;
grant execute on function private.can_see_branch(uuid, uuid) to authenticated;
drop policy branches_select_accessible on public.branches;
create policy branches_select_accessible on public.branches for select to authenticated
  using (private.can_see_branch(business_id, id));

-- ───────────── 2) Puestos y accesos: solo por funciones ─────────────
revoke insert, update on public.business_memberships from authenticated;
drop policy business_memberships_insert_owner_bootstrap_or_admin on public.business_memberships;
drop policy business_memberships_update_owner_or_admin on public.business_memberships;

-- ¿Puede este actor administrar la cuenta de esa persona? Lo usan restablecer PIN (antes de tocar
-- la contraseña) y mark_pin_reset. Devuelve el puesto y usuario de la cuenta.
create function private.assert_can_manage_account(p_actor_user_id uuid, p_business_id uuid, p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_actor_role public.business_role;
  v_target public.business_memberships;
begin
  select role into v_actor_role from public.business_memberships
   where business_id = p_business_id and user_id = p_actor_user_id and is_active and not must_change_pin;
  select * into v_target from public.business_memberships
   where business_id = p_business_id and user_id = p_user_id;
  if v_target.user_id is null then raise exception 'La cuenta no existe en este negocio' using errcode = 'P0002'; end if;
  if v_actor_role is null or p_actor_user_id = p_user_id or not private.can_manage_account(v_actor_role, v_target.role) then
    raise exception 'No tienes permiso para administrar esta cuenta' using errcode = '42501';
  end if;
  return jsonb_build_object('role', v_target.role, 'login_name', v_target.login_name);
end
$$;
revoke all on function private.assert_can_manage_account(uuid, uuid, uuid) from public, anon, authenticated;
create function public.assert_can_manage_account(p_actor_user_id uuid, p_business_id uuid, p_user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.assert_can_manage_account(p_actor_user_id, p_business_id, p_user_id) $$;
revoke all on function public.assert_can_manage_account(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.assert_can_manage_account(uuid, uuid, uuid) to service_role;
grant execute on function public.assert_can_manage_account(uuid, uuid, uuid) to service_role;

-- ───────────── 5) Cerrar sesiones abiertas ─────────────
create or replace function private.mark_pin_reset(p_actor_user_id uuid, p_business_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_target jsonb;
begin
  v_target := private.assert_can_manage_account(p_actor_user_id, p_business_id, p_user_id);
  update public.business_memberships set must_change_pin = true
   where user_id = p_user_id and business_id = p_business_id;
  insert into private.pin_resets (user_id, password_hash_at_reset)
    select u.id, u.encrypted_password from auth.users u where u.id = p_user_id
    on conflict (user_id) do update set password_hash_at_reset = excluded.password_hash_at_reset, reset_at = now();
  delete from private.login_attempts
   where login_id = (select lower(u.email) from auth.users u where u.id = p_user_id);
  -- Cierra todas sus sesiones (los refresh tokens se borran en cascada).
  delete from auth.sessions where user_id = p_user_id;
  insert into public.audit_log (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_business_id, p_actor_user_id, 'account.pin_reset', 'account', p_user_id::text,
          jsonb_build_object('login_name', v_target->>'login_name'));
end
$$;

create or replace function private.set_account_active_impl(p_business_id uuid, p_user_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role public.business_role;
  v_target public.business_memberships;
begin
  select role into v_actor_role from public.business_memberships
   where business_id = p_business_id and user_id = v_actor and is_active and not must_change_pin;
  select * into v_target from public.business_memberships
   where business_id = p_business_id and user_id = p_user_id;
  if v_target.user_id is null then raise exception 'La cuenta no existe en este negocio' using errcode = 'P0002'; end if;
  if v_actor_role is null or v_actor = p_user_id or not private.can_manage_account(v_actor_role, v_target.role) then
    raise exception 'No tienes permiso para administrar esta cuenta' using errcode = '42501';
  end if;
  update public.business_memberships set is_active = p_active
   where business_id = p_business_id and user_id = p_user_id;
  if not p_active then
    delete from auth.sessions where user_id = p_user_id;
  end if;
  insert into public.audit_log (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_business_id, v_actor, case when p_active then 'account.activated' else 'account.deactivated' end,
          'account', p_user_id::text, jsonb_build_object('is_active', v_target.is_active),
          jsonb_build_object('is_active', p_active, 'login_name', v_target.login_name));
  return jsonb_build_object('user_id', p_user_id, 'is_active', p_active);
end
$$;

create or replace function private.pin_changed_impl()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_session uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  v_changed boolean;
  v_m record;
begin
  if v_uid is null then raise exception 'Debes iniciar sesión' using errcode = '42501'; end if;
  select not exists (
    select 1 from private.pin_resets r join auth.users u on u.id = r.user_id
     where r.user_id = v_uid and u.encrypted_password = r.password_hash_at_reset
  ) into v_changed;
  if not v_changed then return false; end if;
  delete from private.pin_resets where user_id = v_uid;
  for v_m in update public.business_memberships set must_change_pin = false
              where user_id = v_uid returning business_id loop
    insert into public.audit_log (business_id, actor_user_id, action, entity_type, entity_id, after_data)
    values (v_m.business_id, v_uid, 'account.pin_changed', 'account', v_uid::text, jsonb_build_object('by', 'self'));
  end loop;
  delete from private.login_attempts
   where login_id = (select lower(u.email) from auth.users u where u.id = v_uid);
  -- Cierra las demás sesiones (otro celular con el PIN viejo); conserva la que hizo el cambio.
  delete from auth.sessions where user_id = v_uid and id is distinct from v_session;
  return true;
end
$$;

-- ───────────── 3) Comisiones, sucursal y empleados ─────────────
drop policy commission_rules_insert_admin on public.commission_rules;
drop policy commission_rules_update_admin on public.commission_rules;
create policy commission_rules_insert_owner on public.commission_rules for insert to authenticated
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy commission_rules_update_owner on public.commission_rules for update to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));

-- La app escribe la sucursal solo con update_business_profile y set_cash_settings (security
-- definer, validan al dueño). Directo, solo el dueño.
drop policy branches_insert_admin on public.branches;
drop policy branches_update_admin on public.branches;
create policy branches_insert_owner on public.branches for insert to authenticated
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy branches_update_owner on public.branches for update to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));

-- Empleados: dueño y gerencia siguen editando nombre, teléfono, estado y si es barbero; la cuenta
-- ligada (user_id) solo la pone provision_account y el permiso de descuentos su propia función.
revoke insert, update on public.employees from authenticated;
grant insert (business_id, display_name, phone, is_active, is_barber, accepts_online_booking) on public.employees to authenticated;
grant update (display_name, phone, is_active, is_barber, accepts_online_booking, updated_at) on public.employees to authenticated;

create function private.set_employee_discount_permission_impl(p_employee_id uuid, p_allowed boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_employee public.employees;
  v_actor_role public.business_role;
  v_target_role public.business_role;
begin
  select * into v_employee from public.employees where id = p_employee_id;
  if v_employee.id is null then raise exception 'Empleado no encontrado' using errcode = 'P0002'; end if;
  select role into v_actor_role from public.business_memberships
   where business_id = v_employee.business_id and user_id = v_actor and is_active and not must_change_pin;
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'No tienes permiso para cambiar quién autoriza descuentos' using errcode = '42501';
  end if;
  if v_employee.user_id is not null then
    select role into v_target_role from public.business_memberships
     where business_id = v_employee.business_id and user_id = v_employee.user_id;
  end if;
  -- Gerencia: solo con barberos y recepción (misma regla que los accesos), nunca consigo misma.
  if v_actor_role = 'admin' and (v_employee.user_id = v_actor
       or (v_target_role is not null and not private.can_manage_account(v_actor_role, v_target_role))) then
    raise exception 'Tu puesto no puede cambiar este permiso para esta persona' using errcode = '42501';
  end if;
  update public.employees set can_authorize_discounts = coalesce(p_allowed, false), updated_at = now()
   where id = p_employee_id;
  return jsonb_build_object('employee_id', p_employee_id, 'can_authorize_discounts', coalesce(p_allowed, false));
end
$$;
revoke all on function private.set_employee_discount_permission_impl(uuid, boolean) from public, anon;
grant execute on function private.set_employee_discount_permission_impl(uuid, boolean) to authenticated;
create function public.set_employee_discount_permission(p_employee_id uuid, p_allowed boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_employee_discount_permission_impl(p_employee_id, p_allowed) $$;
revoke all on function public.set_employee_discount_permission(uuid, boolean) from public, anon;
grant execute on function public.set_employee_discount_permission(uuid, boolean) to authenticated, service_role;
