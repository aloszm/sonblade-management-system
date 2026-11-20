-- Pruebas de 20261120081000_appointment_notifications.sql (D3: WhatsApp de un clic).
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;  (o después de aplicarla: la prueba sola).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda. Las citas de prueba se insertan con source
-- 'walk_in' solo para que el horario del negocio no impida correr la prueba a cualquier hora.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  deya uuid := 'cb89067a-6cb5-4473-8ff5-ff1fcf83bd12';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  dani_emp uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  biz uuid; a1 uuid; a2 uuid; v jsonb; n int; who uuid; k text; slot timestamptz;
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
  slot := date_trunc('hour', now()) + interval '1 day';
  insert into public.appointments (business_id, branch_id, assigned_employee_id, customer_name, customer_phone, scheduled_start_at, scheduled_end_at, status, source)
  values (biz, b, dani_emp, 'Prueba Notificación', '5512345678', slot, slot + interval '30 minutes', 'scheduled', 'walk_in') returning id into a1;
  insert into public.appointments (business_id, branch_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
  values (biz, b, dani_emp, 'Prueba Cancelada', slot, slot + interval '30 minutes', 'cancelled', 'walk_in') returning id into a2;

  -- 1-4 recepción (emi, dago), gerencia y dueño registran
  for who, k in select * from (values (emi, 'confirmation'), (dago, 'reminder'), (sonia, 'reminder'), (owner, 'confirmation')) x(u, e) loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    v := public.record_appointment_notification(a1, k);
    r := r || E'\n1-4 ' || case when v ->> 'kind' = k and (v ->> 'created_by')::uuid = who and v ->> 'channel' = 'whatsapp' then 'OK' else 'FALLA' end || ' registra ' || k;
  end loop;
  select count(*) into n from public.audit_log where entity_id = a1::text and action = 'appointment_notification_opened'
    and not (after_data ? 'phone') and after_data ->> 'kind' in ('confirmation', 'reminder');
  r := r || E'\n5 ' || case when n = 4 then 'OK' else 'FALLA' end || ' bitácora sin teléfono (' || n || ')';

  -- 6 barbero y consulta no registran
  for who, k in select * from (values (dani, 'barbero'), (lucia, 'consulta')) x(u, e) loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    begin
      perform public.record_appointment_notification(a1, 'reminder');
      r := r || E'\n6 FALLA ' || k || ' registró';
    exception when others then r := r || E'\n6 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ' || k || ' no registra [' || sqlstate || ']'; end;
  end loop;

  -- 7 tipo inválido y cita cerrada
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  begin
    perform public.record_appointment_notification(a1, 'numero_cliente');
    r := r || E'\n7 FALLA aceptó un tipo inválido';
  exception when others then r := r || E'\n7 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' tipo inválido [' || sqlstate || ']'; end;
  begin
    perform public.record_appointment_notification(a2, 'reminder');
    r := r || E'\n8 FALLA aceptó una cita cancelada';
  exception when others then r := r || E'\n8 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' cita cancelada [' || sqlstate || ']'; end;

  -- 9 lectura por RLS: recepción, gerencia y el barbero de la cita ven; otro barbero y consulta no
  for who, k in select * from (values (emi, '4'), (sonia, '4'), (owner, '4'), (dani, '4'), (deya, '0'), (lucia, '0')) x(u, e) loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.appointment_notifications where appointment_id = a1;
    execute 'reset role';
    r := r || E'\n9 ' || case when n::text = k then 'OK' else 'FALLA' end || ' lectura ' || who || ' -> ' || n || ' (esperado ' || k || ')';
  end loop;

  -- 10 nadie inserta, cambia ni borra directo
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into public.appointment_notifications (business_id, branch_id, appointment_id, kind, created_by) values (biz, b, a1, 'reminder', owner);
    execute 'reset role';
    r := r || E'\n10 FALLA INSERT directo';
  exception when others then execute 'reset role'; r := r || E'\n10 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' INSERT directo rechazado [' || sqlstate || ']'; end;
  begin
    execute 'set local role authenticated';
    update public.appointment_notifications set kind = 'reminder' where appointment_id = a1;
    execute 'reset role';
    r := r || E'\n11 FALLA UPDATE directo';
  exception when others then execute 'reset role'; r := r || E'\n11 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' UPDATE directo rechazado [' || sqlstate || ']'; end;
  begin
    delete from public.appointment_notifications where appointment_id = a1;
    r := r || E'\n12 FALLA DELETE como dueño de la base';
  exception when others then r := r || E'\n12 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' DELETE rechazado incluso sin RLS [' || sqlstate || ']'; end;
  begin
    insert into public.appointment_notifications (business_id, branch_id, appointment_id, kind, created_by, channel) values (biz, b, a1, 'reminder', owner, 'sms');
    r := r || E'\n13 FALLA aceptó canal sms';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '23514' then 'OK' else 'FALLA' end || ' canal distinto de whatsapp rechazado [' || sqlstate || ']'; end;

  -- 14 freno: más de 20 por cita y tipo
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  -- ya hay 2 de confirmación (casos 1-4): 18 más llegan a 20
  for n in 1..18 loop perform public.record_appointment_notification(a1, 'confirmation'); end loop;
  begin
    perform public.record_appointment_notification(a1, 'confirmation');
    r := r || E'\n14 FALLA pasó de 20';
  exception when others then r := r || E'\n14 ' || case when sqlstate = '54000' then 'OK' else 'FALLA' end || ' tope de 20 por tipo [' || sqlstate || ']'; end;

  -- 15 permisos de ejecución
  r := r || E'\n15 ' || case when not has_function_privilege('anon', 'public.record_appointment_notification(uuid,text)', 'execute')
      and not has_table_privilege('anon', 'public.appointment_notifications', 'select')
      and not has_table_privilege('authenticated', 'public.appointment_notifications', 'insert')
      and has_table_privilege('authenticated', 'public.appointment_notifications', 'select') then 'OK' else 'FALLA' end || ' permisos';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
