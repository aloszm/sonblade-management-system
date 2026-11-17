-- Cuentas con usuario y PIN de 6 dígitos (sin correo real) y bloqueo por intentos fallidos.
--
-- POR QUÉ HACE FALTA EL BLOQUEO: un PIN de 6 dígitos tiene solo 1,000,000 de combinaciones.
-- El límite propio de Supabase Auth es por IP y no por cuenta, así que sin un freno por
-- usuario alguien podría ir probando PIN de una misma persona desde varias conexiones.
-- Aquí se cuenta cada fallo por USUARIO: al 5.º fallo seguido se bloquea 15 minutos, y si
-- reincide el bloqueo se duplica (30, 60, ... hasta 24 h). Se cuenta igual para usuarios que
-- no existen, para que el bloqueo no revele quién tiene cuenta. La tabla vive en el esquema
-- `private` (fuera de la API) con RLS y sin permisos para anon/authenticated.

-- 1) Usuario corto y marca "debe cambiar su PIN" en la membresía (la lee el middleware sin
--    consultas extra). El usuario es único dentro del negocio.
alter table public.business_memberships
  add column login_name text,
  add column must_change_pin boolean not null default false;
alter table public.business_memberships
  add constraint business_memberships_login_name_format
    check (login_name is null or login_name ~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$');
create unique index business_memberships_login_name_unique
  on public.business_memberships (business_id, login_name) where login_name is not null;

-- 2) Intentos fallidos por identificador de acceso (el correo sintético, en minúsculas).
create table private.login_attempts (
  login_id text primary key check (length(login_id) between 1 and 254),
  failed_count integer not null default 0,
  lock_level integer not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.login_attempts enable row level security;
revoke all on table private.login_attempts from public, anon, authenticated;

-- Huella de la contraseña al momento de restablecer: "Mi cuenta" solo puede quitar la marca
-- must_change_pin cuando el PIN realmente cambió (la huella ya no coincide).
create table private.pin_resets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  password_hash_at_reset text not null,
  reset_at timestamptz not null default now()
);
alter table private.pin_resets enable row level security;
revoke all on table private.pin_resets from public, anon, authenticated;

-- Minutos de bloqueo según el nivel (1 = 15 min, se duplica, tope 24 h). Igual que lib/auth/lockout.ts.
create function private.login_lock_minutes(p_level integer)
returns integer language sql immutable set search_path = ''
as $$ select least(1440, 15 * power(2, greatest(p_level, 1) - 1)::integer) $$;

-- ¿Puede intentar? Devuelve los segundos que faltan de bloqueo (0 = puede). No dice si existe.
create function private.login_attempt_check_impl(p_login_id text)
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select greatest(0, ceil(extract(epoch from (a.locked_until - now())))::integer)
    from private.login_attempts a where a.login_id = lower(left(p_login_id, 254))
  ), 0)
$$;

-- Registra un fallo y devuelve los segundos de bloqueo resultantes (0 si aún puede intentar).
create function private.login_attempt_failed_impl(p_login_id text)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_id text := lower(left(coalesce(p_login_id, ''), 254));
  r private.login_attempts;
begin
  if v_id = '' then return 0; end if;
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

-- Entrada correcta: limpia el contador de QUIEN inició sesión (no acepta un usuario ajeno).
create function private.login_attempt_succeeded_impl()
returns void language sql security definer set search_path = ''
as $$
  delete from private.login_attempts
   where login_id = (select lower(u.email) from auth.users u where u.id = (select auth.uid()))
$$;

-- Estado de mi cuenta: si debo cambiar el PIN.
create function private.my_account_status_impl()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'must_change_pin', coalesce(bool_or(m.must_change_pin), false),
    'login_name', min(m.login_name))
  from public.business_memberships m
  where m.user_id = (select auth.uid()) and m.is_active
$$;

-- Después de cambiar mi PIN: quita la marca solo si la contraseña guardada ya no es la del
-- restablecimiento. Deja constancia en la bitácora (nunca el PIN).
create function private.pin_changed_impl()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
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
  return true;
end
$$;

-- Quién puede administrar a quién (igual que lib/auth/account-rules.ts):
--   dueño: a cualquiera menos a sí mismo; gerencia: solo barberos y recepción.
create function private.can_manage_account(p_actor public.business_role, p_target public.business_role)
returns boolean language sql immutable set search_path = ''
as $$
  select case
    when p_actor = 'owner' then true
    when p_actor = 'admin' then p_target in ('barber', 'receptionist', 'cashier')
    else false end
$$;

-- Activar o desactivar el acceso de otra persona. No necesita la llave de servidor: la
-- membresía inactiva ya no deja usar la app (el middleware la revisa en cada petición).
create function private.set_account_active_impl(p_business_id uuid, p_user_id uuid, p_active boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role public.business_role;
  v_target public.business_memberships;
begin
  select role into v_actor_role from public.business_memberships
   where business_id = p_business_id and user_id = v_actor and is_active;
  select * into v_target from public.business_memberships
   where business_id = p_business_id and user_id = p_user_id;
  if v_target.user_id is null then raise exception 'La cuenta no existe en este negocio' using errcode = 'P0002'; end if;
  if v_actor_role is null or v_actor = p_user_id or not private.can_manage_account(v_actor_role, v_target.role) then
    raise exception 'No tienes permiso para administrar esta cuenta' using errcode = '42501';
  end if;
  update public.business_memberships set is_active = p_active
   where business_id = p_business_id and user_id = p_user_id;
  insert into public.audit_log (business_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_business_id, v_actor, case when p_active then 'account.activated' else 'account.deactivated' end,
          'account', p_user_id::text, jsonb_build_object('is_active', v_target.is_active),
          jsonb_build_object('is_active', p_active, 'login_name', v_target.login_name));
  return jsonb_build_object('user_id', p_user_id, 'is_active', p_active);
end
$$;

-- Lo que hace el servidor (con la llave secreta) después de crear el usuario en Auth:
-- perfil, membresía, acceso a las sucursales activas, liga con el empleado y bitácora.
-- Todo en una transacción; si falla, el servidor borra el usuario de Auth recién creado.
create function private.provision_account(
  p_actor_user_id uuid, p_business_id uuid, p_user_id uuid, p_login_name text,
  p_role public.business_role, p_full_name text, p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_role public.business_role;
begin
  select role into v_actor_role from public.business_memberships
   where business_id = p_business_id and user_id = p_actor_user_id and is_active;
  if v_actor_role is null or not private.can_manage_account(v_actor_role, p_role) then
    raise exception 'No tienes permiso para crear ese puesto' using errcode = '42501';
  end if;
  if p_employee_id is not null and not exists (
    select 1 from public.employees where id = p_employee_id and business_id = p_business_id and user_id is null) then
    raise exception 'La persona no existe en este negocio o ya tiene acceso' using errcode = '23503';
  end if;
  insert into public.profiles (user_id, full_name) values (p_user_id, p_full_name)
    on conflict (user_id) do update set full_name = excluded.full_name, updated_at = now();
  insert into public.business_memberships (business_id, user_id, role, login_name, must_change_pin)
    values (p_business_id, p_user_id, p_role, p_login_name, true);
  insert into public.user_branch_access (business_id, branch_id, user_id)
    select p_business_id, b.id, p_user_id from public.branches b
     where b.business_id = p_business_id and b.is_active
    on conflict do nothing;
  if p_employee_id is not null then
    update public.employees set user_id = p_user_id, updated_at = now() where id = p_employee_id;
  end if;
  insert into private.pin_resets (user_id, password_hash_at_reset)
    select u.id, u.encrypted_password from auth.users u where u.id = p_user_id
    on conflict (user_id) do update set password_hash_at_reset = excluded.password_hash_at_reset, reset_at = now();
  insert into public.audit_log (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_business_id, p_actor_user_id, 'account.created', 'account', p_user_id::text,
          jsonb_build_object('login_name', p_login_name, 'role', p_role, 'employee_id', p_employee_id));
  return jsonb_build_object('user_id', p_user_id, 'login_name', p_login_name, 'role', p_role);
end
$$;

-- Después de que el servidor puso un PIN temporal con la API de administración: marca
-- "debe cambiarlo", guarda la huella, limpia el bloqueo y deja constancia (sin el PIN).
create function private.mark_pin_reset(p_actor_user_id uuid, p_business_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_actor_role public.business_role;
  v_target public.business_memberships;
begin
  select role into v_actor_role from public.business_memberships
   where business_id = p_business_id and user_id = p_actor_user_id and is_active;
  select * into v_target from public.business_memberships
   where business_id = p_business_id and user_id = p_user_id;
  if v_target.user_id is null then raise exception 'La cuenta no existe en este negocio' using errcode = 'P0002'; end if;
  if v_actor_role is null or p_actor_user_id = p_user_id or not private.can_manage_account(v_actor_role, v_target.role) then
    raise exception 'No tienes permiso para administrar esta cuenta' using errcode = '42501';
  end if;
  update public.business_memberships set must_change_pin = true where user_id = p_user_id;
  insert into private.pin_resets (user_id, password_hash_at_reset)
    select u.id, u.encrypted_password from auth.users u where u.id = p_user_id
    on conflict (user_id) do update set password_hash_at_reset = excluded.password_hash_at_reset, reset_at = now();
  delete from private.login_attempts
   where login_id = (select lower(u.email) from auth.users u where u.id = p_user_id);
  insert into public.audit_log (business_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_business_id, p_actor_user_id, 'account.pin_reset', 'account', p_user_id::text,
          jsonb_build_object('login_name', v_target.login_name));
end
$$;

-- Permisos: nada privado para el público; envoltorios en public con search_path vacío.
-- anon y service_role no tienen USAGE en el esquema private (y no se les da, porque abriría otras
-- funciones de ese esquema); por eso los envoltorios que ellos llaman son security definer y
-- solo reenvían a la función privada. Los que llama authenticated son security invoker.
revoke all on function private.login_lock_minutes(integer) from public, anon, authenticated;
revoke all on function private.login_attempt_check_impl(text) from public, anon, authenticated;
revoke all on function private.login_attempt_failed_impl(text) from public, anon, authenticated;
revoke all on function private.login_attempt_succeeded_impl() from public, anon, authenticated;
revoke all on function private.my_account_status_impl() from public, anon, authenticated;
revoke all on function private.pin_changed_impl() from public, anon, authenticated;
revoke all on function private.can_manage_account(public.business_role, public.business_role) from public, anon, authenticated;
revoke all on function private.set_account_active_impl(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.provision_account(uuid, uuid, uuid, text, public.business_role, text, uuid) from public, anon, authenticated;
revoke all on function private.mark_pin_reset(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.login_attempt_succeeded_impl() to authenticated;
grant execute on function private.my_account_status_impl() to authenticated;
grant execute on function private.pin_changed_impl() to authenticated;
grant execute on function private.set_account_active_impl(uuid, uuid, boolean) to authenticated;

create function public.login_attempt_check(p_login_id text)
returns integer language sql security definer set search_path = ''
as $$ select private.login_attempt_check_impl(p_login_id) $$;
create function public.login_attempt_failed(p_login_id text)
returns integer language sql security definer set search_path = ''
as $$ select private.login_attempt_failed_impl(p_login_id) $$;
create function public.login_attempt_succeeded()
returns void language sql security invoker set search_path = ''
as $$ select private.login_attempt_succeeded_impl() $$;
create function public.my_account_status()
returns jsonb language sql security invoker set search_path = ''
as $$ select private.my_account_status_impl() $$;
create function public.pin_changed()
returns boolean language sql security invoker set search_path = ''
as $$ select private.pin_changed_impl() $$;
create function public.set_account_active(p_business_id uuid, p_user_id uuid, p_active boolean)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_account_active_impl(p_business_id, p_user_id, p_active) $$;
create function public.provision_account(
  p_actor_user_id uuid, p_business_id uuid, p_user_id uuid, p_login_name text,
  p_role public.business_role, p_full_name text, p_employee_id uuid)
returns jsonb language sql security definer set search_path = ''
as $$ select private.provision_account(p_actor_user_id, p_business_id, p_user_id, p_login_name, p_role, p_full_name, p_employee_id) $$;
create function public.mark_pin_reset(p_actor_user_id uuid, p_business_id uuid, p_user_id uuid)
returns void language sql security definer set search_path = ''
as $$ select private.mark_pin_reset(p_actor_user_id, p_business_id, p_user_id) $$;

revoke all on function public.login_attempt_check(text) from public;
revoke all on function public.login_attempt_failed(text) from public;
revoke all on function public.login_attempt_succeeded() from public, anon;
revoke all on function public.my_account_status() from public, anon;
revoke all on function public.pin_changed() from public, anon;
revoke all on function public.set_account_active(uuid, uuid, boolean) from public, anon;
revoke all on function public.provision_account(uuid, uuid, uuid, text, public.business_role, text, uuid) from public, anon, authenticated;
revoke all on function public.mark_pin_reset(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.login_attempt_check(text) to anon, authenticated;
grant execute on function public.login_attempt_failed(text) to anon, authenticated;
grant execute on function public.login_attempt_succeeded() to authenticated;
grant execute on function public.my_account_status() to authenticated;
grant execute on function public.pin_changed() to authenticated;
grant execute on function public.set_account_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.provision_account(uuid, uuid, uuid, text, public.business_role, text, uuid) to service_role;
grant execute on function public.mark_pin_reset(uuid, uuid, uuid) to service_role;
