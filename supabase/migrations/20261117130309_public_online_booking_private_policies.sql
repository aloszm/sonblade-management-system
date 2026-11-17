-- Reservas en línea: políticas explícitas de "sin acceso por API" en las tablas privadas
-- (mismo patrón que private.login_attempts). Solo las funciones security definer las usan.
create policy booking_secret_no_api_access on private.booking_secret as permissive for all to anon, authenticated using (false) with check (false);
create policy booking_attempts_no_api_access on private.booking_attempts as permissive for all to anon, authenticated using (false) with check (false);
create policy public_bookings_no_api_access on private.public_bookings as permissive for all to anon, authenticated using (false) with check (false);
