-- RESTABLECER UN PIN DESDE LA BASE (solo emergencias).
--
-- Úsalo SOLO cuando nadie con permiso puede hacerlo desde la app (por ejemplo, el dueño olvidó su PIN
-- y es el único que restablece). En cualquier otro caso: Equipo → la persona → "Restablecer PIN".
--
-- Cómo usarlo:
--   1. Sustituye __LOGIN__ por el usuario (alonso, sonia, ...) y __PIN__ por un PIN TEMPORAL de 6 números.
--      Hazlo en una copia local; NUNCA guardes en el repositorio el archivo con el PIN escrito.
--   2. Ejecútalo en el SQL Editor de Supabase del proyecto correcto (producción = gallo420-prod).
--   3. Da el PIN temporal a la persona en privado. Al entrar, la app le pedirá elegir uno nuevo.
--
-- Qué hace (lo mismo que el restablecimiento de la app):
--   - Contraseña = crypt(HMAC-SHA256(pepper de ESTA base, '<correo>:<pin>')), igual que lib/auth/pin-hash.ts.
--   - Marca must_change_pin, quita el bloqueo por intentos y cierra todas sus sesiones abiertas.
--   - Deja constancia en la bitácora (audit_log).
do $reset$
declare
  v_login text := lower(btrim('__LOGIN__'));
  v_pin text := '__PIN__';
  v_email text;
  v_uid uuid;
  v_pepper bytea := (select decode(value, 'hex') from private.app_secrets where name = 'pin_pepper');
  v_business uuid;
begin
  if v_pin !~ '^[0-9]{6}$' then raise exception 'El PIN debe ser de 6 números.'; end if;
  if v_pepper is null then raise exception 'Esta base no tiene pepper (migración pin_pepper_in_database).'; end if;
  v_email := v_login || '@gallo-420.barberos.invalid';
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then raise exception 'No existe el usuario %', v_login; end if;

  update auth.users
     set encrypted_password = extensions.crypt(
           encode(extensions.hmac(convert_to(v_email || ':' || v_pin, 'UTF8'), v_pepper, 'sha256'), 'hex'),
           extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_uid;
  update public.business_memberships set must_change_pin = true where user_id = v_uid returning business_id into v_business;
  delete from private.login_attempts where login_id = v_email;
  delete from auth.sessions where user_id = v_uid;
  insert into public.audit_log (business_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (v_business, null, 'account', v_uid::text, 'pin_reset_emergency', jsonb_build_object('login', v_login, 'via', 'sql'));
  raise notice 'PIN temporal asignado a %. Debe cambiarlo al entrar.', v_login;
end;
$reset$;
