-- Ajuste de seguridad al bloqueo por intentos (sin cambiar su comportamiento):
-- 1) Las dos funciones que se llaman SIN sesión (antes de iniciar sesión) pasan a un esquema
--    propio, `login_gate`, que no está expuesto en la API y solo contiene estas dos funciones.
--    Así los envoltorios de `public` vuelven a ser security invoker y anon no recibe USAGE en
--    `private` (eso le abriría otras funciones de ese esquema).
-- 2) Las tablas privadas del bloqueo declaran explícitamente que nadie de la API las lee ni las
--    escribe (política que siempre niega); solo las funciones security definer las tocan.
create schema login_gate;
revoke all on schema login_gate from public;
grant usage on schema login_gate to anon, authenticated;

alter function private.login_attempt_check_impl(text) set schema login_gate;
alter function private.login_attempt_failed_impl(text) set schema login_gate;
revoke all on function login_gate.login_attempt_check_impl(text) from public, anon, authenticated;
revoke all on function login_gate.login_attempt_failed_impl(text) from public, anon, authenticated;
grant execute on function login_gate.login_attempt_check_impl(text) to anon, authenticated;
grant execute on function login_gate.login_attempt_failed_impl(text) to anon, authenticated;

create or replace function public.login_attempt_check(p_login_id text)
returns integer language sql security invoker set search_path = ''
as $$ select login_gate.login_attempt_check_impl(p_login_id) $$;
create or replace function public.login_attempt_failed(p_login_id text)
returns integer language sql security invoker set search_path = ''
as $$ select login_gate.login_attempt_failed_impl(p_login_id) $$;

create policy login_attempts_no_api_access on private.login_attempts
  for all to anon, authenticated using (false) with check (false);
create policy pin_resets_no_api_access on private.pin_resets
  for all to anon, authenticated using (false) with check (false);
