-- Pruebas de C2 (20261119213000_save_appointment.sql): crear y reprogramar citas con sus servicios.
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
-- Usa al barbero de pruebas (horario de 0:00 a 23:59 de lunes a sábado) y el miércoles 7 de mayo de 2031
-- (el negocio abre de 12:30 a 20:00), para no chocar con citas de desarrollo.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  e2e uuid := 'e6f79729-e9af-44d6-9097-027a932cdfc2';
  tz text := 'America/Mexico_City';
  biz uuid; corte uuid; ritual uuid; v jsonb; v2 jsonb; id1 uuid; id2 uuid; n int; key text := 'prueba-c2-' || gen_random_uuid();
  day timestamp := '2031-05-07';
begin
  update public.business_memberships set must_change_pin = false;
  -- Puestos que esta prueba supone (FASE_4 §2.4). En desarrollo pueden cambiar a petición del dueño (p. ej. Sonia y Lucía
  -- como cuenta principal para la práctica): se fijan aquí, dentro de la transacción del simulacro, igual que el PIN temporal.
  update public.business_memberships m set role = x.role::public.business_role
  from (values ('76c82fae-6754-4be2-916e-b883890e524f'::uuid, 'owner'),          -- Alonso: cuenta principal
               ('0760694d-ea50-462b-8e11-b9478e564607'::uuid, 'admin'),          -- Sonia: gerencia
               ('6a8d153e-cf8d-4dd7-8029-01bc42481159'::uuid, 'viewer'),         -- Lucía: consulta
               ('a3b429be-3d7b-4c46-90fd-e15722193e27'::uuid, 'receptionist'),   -- Emi
               ('afe3a615-74ec-4c50-81b8-98c39fa4741a'::uuid, 'receptionist'),   -- Dago
               ('bfae5380-f99c-4c62-ae7d-17130f832cf4'::uuid, 'barber'),         -- Dani
               ('cb89067a-6cb5-4473-8ff5-ff1fcf83bd12'::uuid, 'barber')) x(u, role)  -- Deya
  where m.business_id = 'e9ee2431-110b-4105-96bc-63f362c84c09' and m.user_id = x.u and m.role::text <> x.role;
  select business_id into biz from public.branches where id = b;
  select id into corte from public.services where business_id = biz and name = 'Corte adulto';
  select id into ritual from public.services where business_id = biz and name = 'Ritual de barba';
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);

  -- 1 crear con dos servicios: dura la suma (30 + 60) y guarda precio y duración del momento
  v := public.save_appointment(b, (day + time '14:00') at time zone tz, null, e2e, array[corte, ritual], null, 'Cliente prueba C2',
    null, null, null, key);
  id1 := (v ->> 'appointment_id')::uuid;
  r := r || E'\n1 ' || case when (v ->> 'duration_minutes')::int = 90 and jsonb_array_length(v -> 'items') = 2
                              and (v -> 'items' -> 0 ->> 'service_id')::uuid = corte and (v -> 'items' -> 1 ->> 'duration_minutes')::int = 60
                              and (select notes from public.appointments where id = id1) = 'Corte adulto + Ritual de barba'
                              and (select count(*) from public.appointment_items where appointment_id = id1 and price_snapshot > 0) = 2
                              then 'OK' else 'FALLA' end || ' crea con 2 servicios, 90 min: ' || v::text;
  -- 2 idempotencia
  v2 := public.save_appointment(b, (day + time '14:00') at time zone tz, null, e2e, array[corte, ritual], null, 'Cliente prueba C2',
    null, null, null, key);
  select count(*) into n from public.appointments where customer_name = 'Cliente prueba C2';
  r := r || E'\n2 ' || case when (v2 ->> 'appointment_id')::uuid = id1 and (v2 ->> 'idempotent_replay')::boolean and n = 1 then 'OK' else 'FALLA' end
         || ' misma llave: la misma cita';
  -- 3 empalme
  begin
    perform public.save_appointment(b, (day + time '15:00') at time zone tz, null, e2e, array[corte], null, 'Otro cliente C2');
    r := r || E'\n3 FALLA aceptó una cita empalmada';
  exception when others then r := r || E'\n3 ' || case when sqlstate = '23P01' and sqlerrm like 'Ese barbero ya tiene%' then 'OK' else 'FALLA' end
    || ' empalme [' || sqlstate || '] ' || sqlerrm; end;
  -- 4 fuera de horario (19:30 + 60 min pasa de las 20:00)
  begin
    perform public.save_appointment(b, (day + time '19:30') at time zone tz, null, e2e, array[ritual], null, 'Otro cliente C2');
    r := r || E'\n4 FALLA aceptó una cita fuera de horario';
  exception when others then r := r || E'\n4 ' || case when sqlstate = '23514' then 'OK' else 'FALLA' end || ' fuera de horario [' || sqlstate || '] ' || sqlerrm; end;
  -- 5 ausencia del barbero
  insert into public.employee_time_off (business_id, branch_id, employee_id, starts_at, ends_at, reason, requested_at, requested_via, created_by)
  values (biz, b, e2e, (day + interval '1 day' + time '14:00') at time zone tz, (day + interval '1 day' + time '16:00') at time zone tz,
          'Trámite', now(), 'en_persona', owner);
  begin
    perform public.save_appointment(b, (day + interval '1 day' + time '14:30') at time zone tz, null, e2e, array[corte], null, 'Otro cliente C2');
    r := r || E'\n5 FALLA aceptó una cita durante una ausencia';
  exception when others then r := r || E'\n5 ' || case when sqlstate = '23P01' and sqlerrm like '%no estará disponible%' then 'OK' else 'FALLA' end
    || ' ausencia [' || sqlstate || '] ' || sqlerrm; end;
  -- 6 sin servicios: la duración indicada, sin renglones
  v := public.save_appointment(b, (day + time '17:00') at time zone tz, null, e2e, null, null, 'Cliente sin servicio C2', null, null, 60);
  id2 := (v ->> 'appointment_id')::uuid;
  r := r || E'\n6 ' || case when (v ->> 'duration_minutes')::int = 60 and jsonb_array_length(v -> 'items') = 0 then 'OK' else 'FALLA' end
         || ' sin servicios: 60 min indicados';

  -- 7 reprogramar: mismo id, nueva hora y servicios; bitácora con lo anterior
  v := public.save_appointment(b, (day + time '16:00') at time zone tz, id1, null, array[corte]);
  select count(*) into n from public.appointment_items where appointment_id = id1 and removed_at is not null;
  r := r || E'\n7 ' || case when (v ->> 'appointment_id')::uuid = id1 and (v ->> 'duration_minutes')::int = 30
                              and (v ->> 'starts_at')::timestamptz = (day + time '16:00') at time zone tz
                              and jsonb_array_length(v -> 'items') = 1 and n = 2 then 'OK' else 'FALLA' end
         || ' reprograma a las 16:00 con un servicio (2 renglones anteriores marcados)';
  select count(*) into n from public.audit_log where entity_id = id1::text and action = 'appointment_rescheduled'
    and (before_data ->> 'starts_at')::timestamptz = (day + time '14:00') at time zone tz
    and (after_data ->> 'starts_at')::timestamptz = (day + time '16:00') at time zone tz;
  r := r || E'\n8 ' || case when n = 1 then 'OK' else 'FALLA' end || ' bitácora con el horario anterior y el nuevo';
  -- 9 sin cambios: no escribe nada
  v := public.save_appointment(b, (day + time '16:00') at time zone tz, id1, null, array[corte]);
  select count(*) into n from public.audit_log where entity_id = id1::text and action = 'appointment_rescheduled';
  r := r || E'\n9 ' || case when (v ->> 'idempotent_replay')::boolean and n = 1 then 'OK' else 'FALLA' end || ' reprogramar sin cambios no escribe';
  -- 10 reprogramar encima de otra cita
  begin
    perform public.save_appointment(b, (day + time '17:00') at time zone tz, id1);
    r := r || E'\n10 FALLA reprogramó encima de otra cita';
  exception when others then r := r || E'\n10 ' || case when sqlstate = '23P01' then 'OK' else 'FALLA' end || ' reprogramar con empalme [' || sqlstate || ']'; end;
  -- 11 cambiar de barbero mueve también sus renglones
  v := public.save_appointment(b, null, id1, (select id from public.employees where user_id = dani));
  select count(*) into n from public.appointment_items where appointment_id = id1 and removed_at is null
    and employee_id = (select id from public.employees where user_id = dani);
  r := r || E'\n11 ' || case when n = 1 then 'OK' else 'FALLA' end || ' cambiar de barbero (sus renglones también)';
  v := public.save_appointment(b, null, id1, e2e);
  -- 12 cita cerrada (cancelada) no se reprograma
  update public.appointments set status = 'cancelled' where id = id2;
  begin
    perform public.save_appointment(b, (day + time '18:00') at time zone tz, id2);
    r := r || E'\n12 FALLA reprogramó una cita cancelada';
  exception when others then r := r || E'\n12 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' cita cancelada [' || sqlstate || '] ' || sqlerrm; end;
  -- 13 cita ya cobrada no se reprograma
  insert into public.sales (business_id, branch_id, appointment_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
  values (biz, b, id1, 'paid', 150, 0, 150, emi, now(), 'V3199-9601');
  begin
    perform public.save_appointment(b, (day + time '18:00') at time zone tz, id1);
    r := r || E'\n13 FALLA reprogramó una cita cobrada';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' cita cobrada [' || sqlstate || '] ' || sqlerrm; end;

  -- 14-15 puestos sin permiso de agenda
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  begin
    perform public.save_appointment(b, (day + time '13:00') at time zone tz, null, e2e, array[corte], null, 'Del barbero C2');
    r := r || E'\n14 FALLA el barbero agendó';
  exception when others then r := r || E'\n14 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero rechazado'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  begin
    perform public.save_appointment(b, (day + time '13:00') at time zone tz, null, e2e, array[corte], null, 'De consulta C2');
    r := r || E'\n15 FALLA consulta agendó';
  exception when others then r := r || E'\n15 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' consulta rechazada'; end;

  -- 16 servicio inexistente o inactivo
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  begin
    perform public.save_appointment(b, (day + time '13:00') at time zone tz, null, e2e, array[gen_random_uuid()], null, 'Cliente C2');
    r := r || E'\n16 FALLA aceptó un servicio inexistente';
  exception when others then r := r || E'\n16 ' || case when sqlstate = '23503' then 'OK' else 'FALLA' end || ' servicio inexistente [' || sqlstate || ']'; end;

  -- 17 la reserva en línea guarda su servicio
  update public.appointments set status = 'cancelled' where source = 'online' and customer_phone = '5512340000';
  v := null;
  <<buscar>>
  for d in 3..14 loop
    for i in 0..27 loop
      delete from private.booking_attempts where created_at = now();
      v := private.booking_create_impl('gallo-420', corte, null, (now() at time zone tz)::date + d,
        lpad((8 + i / 2)::text, 2, '0') || ':' || case when i % 2 = 0 then '00' else '30' end, 'Reserva prueba C2', '5512340000', true, 'prueba-c2');
      exit buscar when v ? 'token';
    end loop;
  end loop;
  select count(*) into n from private.public_bookings pb join public.appointment_items ai on ai.appointment_id = pb.appointment_id
   where pb.token_hash = encode(sha256(convert_to(coalesce(v ->> 'token', ''), 'UTF8')), 'hex') and ai.service_id = corte and ai.removed_at is null;
  r := r || E'\n17 ' || case when n = 1 then 'OK' else 'FALLA' end || ' la reserva en línea guarda el servicio ' || coalesce(v::text, '');

  -- 18 anon no ejecuta save_appointment
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'save_appointment' and grantee in ('anon', 'PUBLIC');
  r := r || E'\n18 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin permiso para anon/public';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
