-- Pruebas de 20261120080000_booking_settings.sql (D1: interruptor de reservas en línea con PIN).
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;  (o después de aplicarla: la prueba sola).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda. Las sesiones de "PIN" son filas de
-- auth.sessions recién creadas (como las que abre runWithPin) y se revierten con todo.
do $t$
declare
  r text := '';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  biz uuid; sid uuid; v jsonb; n int; who uuid; k text; before_settings jsonb; s jsonb;
  bad record;
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
  select id, settings into biz, before_settings from public.businesses where slug = 'gallo-420';

  -- 1 dueño con PIN apaga y cambia la anticipación; el resto de settings y de booking se conserva
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
  v := public.set_booking_settings(biz, false, 120, null, null, null, 'Prueba de apagado');
  select settings into s from public.businesses where id = biz;
  r := r || E'\n1 ' || case when (v ->> 'enabled')::boolean = false and (v ->> 'lead_minutes')::int = 120
      and (s -> 'booking' ->> 'enabled')::boolean = false and (s -> 'booking' ->> 'lead_minutes')::int = 120
      and (s -> 'booking' -> 'privacy_version') is not distinct from (before_settings -> 'booking' -> 'privacy_version')
      and (s -> 'booking' -> 'max_active_per_phone') is not distinct from (before_settings -> 'booking' -> 'max_active_per_phone')
      and (s -> 'booking' -> 'max_days_ahead') is not distinct from (before_settings -> 'booking' -> 'max_days_ahead')
      and (s - 'booking') = (before_settings - 'booking')
      then 'OK' else 'FALLA' end || ' dueño con PIN apaga; resto de settings igual -> ' || (s -> 'booking')::text;

  -- 2 bitácora: antes y después, y la huella del PIN
  select count(*) into n from public.audit_log where business_id = biz and action = 'booking_settings_changed' and actor_user_id = owner
     and (after_data ->> 'enabled')::boolean = false and (before_data ->> 'enabled') is not null
     and (after_data ->> 'confirmed_with_pin')::boolean and after_data ->> 'comment' = 'Prueba de apagado' and created_at = now();
  select count(*) + n * 10 into n from public.audit_log where business_id = biz and action = 'pin_confirmed_action'
     and after_data ->> 'action' = 'booking_settings_changed' and created_at = now();
  r := r || E'\n2 ' || case when n = 11 then 'OK' else 'FALLA' end || ' bitácora booking_settings_changed + pin_confirmed_action (' || n || ')';

  -- 3 la misma prueba de PIN no sirve dos veces
  begin
    perform public.set_booking_settings(biz, true);
    r := r || E'\n3 FALLA reutilizó el PIN';
  exception when others then r := r || E'\n3 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' PIN reutilizado rechazado [' || sqlstate || ']'; end;

  -- 4 sin PIN (sesión normal, sin session_id reciente) se rechaza
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    perform public.set_booking_settings(biz, true);
    r := r || E'\n4 FALLA cambió sin PIN';
  exception when others then r := r || E'\n4 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin PIN rechazado [' || sqlstate || ']'; end;

  -- 5 sesión de PIN vieja (más de 2 minutos) se rechaza
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now() - interval '3 minutes', now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
  begin
    perform public.set_booking_settings(biz, true);
    r := r || E'\n5 FALLA aceptó una sesión vieja';
  exception when others then r := r || E'\n5 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' PIN caducado rechazado [' || sqlstate || ']'; end;

  -- 6-9 nadie más cambia, ni con su PIN: gerencia, recepción, barbero, consulta
  for who, k in select * from (values (sonia, 'gerencia'), (emi, 'recepción'), (dani, 'barbero'), (lucia, 'consulta')) x(u, e) loop
    sid := gen_random_uuid();
    insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, who, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated', 'session_id', sid)::text, true);
    begin
      perform public.set_booking_settings(biz, true);
      r := r || E'\n6-9 FALLA ' || k || ' cambió las reservas';
    exception when others then r := r || E'\n6-9 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ' || k || ' con PIN rechazado [' || sqlstate || ']'; end;
  end loop;
  select (settings -> 'booking' ->> 'enabled')::boolean into k from public.businesses where id = biz;
  r := r || E'\n10 ' || case when k = 'false' then 'OK' else 'FALLA' end || ' después de los rechazos sigue apagada (' || k || ')';

  -- 11 rangos: fuera se rechaza (22023) sin gastar el PIN; las orillas se aceptan
  for bad in select * from (values (1441, null::int, null::int, null::int, 'anticipación 1441'), (-1, null, null, null, 'anticipación -1'),
      (null, 0, null, null, 'días 0'), (null, 91, null, null, 'días 91'), (null, null, 73, null, 'cancelar 73 h'), (null, null, -1, null, 'cancelar -1'),
      (null, null, null, 0, 'tope 0'), (null, null, null, 201, 'tope 201')) x(l, d, c, m, label) loop
    sid := gen_random_uuid();
    insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
    begin
      perform public.set_booking_settings(biz, true, bad.l, bad.d, bad.c, bad.m);
      r := r || E'\n11 FALLA aceptó ' || bad.label;
    exception when others then r := r || E'\n11 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' ' || bad.label || ' rechazado [' || sqlstate || ']'; end;
    select count(*) into n from private.pin_confirmations where session_id = sid;
    if n <> 0 then r := r || E'\n11 FALLA gastó el PIN con datos inválidos'; end if;
  end loop;
  begin
    perform public.set_booking_settings(biz, null);
    r := r || E'\n12 FALLA aceptó enabled nulo';
  exception when others then r := r || E'\n12 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' enabled nulo rechazado [' || sqlstate || ']'; end;
  v := public.set_booking_settings(biz, true, 0, 1, 0, 1);
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
  v := v || jsonb_build_object('max', public.set_booking_settings(biz, true, 1440, 90, 72, 200));
  r := r || E'\n13 ' || case when (v ->> 'lead_minutes')::int = 0 and (v ->> 'max_days_ahead')::int = 1 and (v ->> 'cancel_hours')::int = 0 and (v ->> 'max_online_per_day')::int = 1
      and (v -> 'max' ->> 'lead_minutes')::int = 1440 and (v -> 'max' ->> 'max_days_ahead')::int = 90 and (v -> 'max' ->> 'cancel_hours')::int = 72
      and (v -> 'max' ->> 'max_online_per_day')::int = 200 and (v -> 'max' ->> 'enabled')::boolean then 'OK' else 'FALLA' end || ' orillas aceptadas (0/1440, 1/90, 0/72, 1/200)';

  -- 14 lectura: dueño (puede editar) y gerencia (no puede editar); recepción, barbero y consulta no
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  v := public.get_booking_settings(biz);
  r := r || E'\n14 ' || case when (v ->> 'can_edit')::boolean and (v ->> 'lead_minutes')::int = 1440 and v ? 'privacy_version'
      and v ->> 'last_changed_at' is not null then 'OK' else 'FALLA' end || ' dueño lee reglas vigentes -> ' || v::text;
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated')::text, true);
  v := public.get_booking_settings(biz);
  r := r || E'\n15 ' || case when not (v ->> 'can_edit')::boolean and (v ->> 'max_online_per_day')::int = 200 then 'OK' else 'FALLA' end || ' gerencia lee sin poder editar';
  for who, k in select * from (values (emi, 'recepción'), (dani, 'barbero'), (lucia, 'consulta')) x(u, e) loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    begin
      perform public.get_booking_settings(biz);
      r := r || E'\n16 FALLA ' || k || ' leyó las reglas';
    exception when others then r := r || E'\n16 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ' || k || ' no lee [' || sqlstate || ']'; end;
  end loop;

  -- 17 sin atajos: UPDATE directo (como authenticated, dueño) que toca booking se rechaza; otras claves sí pasan
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    update public.businesses set settings = jsonb_set(settings, '{booking,enabled}', 'false') where id = biz;
    execute 'reset role';
    r := r || E'\n17 FALLA el UPDATE directo cambió booking';
  exception when others then execute 'reset role'; r := r || E'\n17 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' UPDATE directo de booking rechazado [' || sqlstate || ']'; end;
  begin
    execute 'set local role authenticated';
    update public.businesses set settings = settings || '{"tagline": "Prueba de lema (se revierte)"}'::jsonb where id = biz;
    get diagnostics n = row_count;
    execute 'reset role';
    r := r || E'\n18 ' || case when n = 1 then 'OK' else 'FALLA' end || ' UPDATE directo de otra clave sigue funcionando (' || n || ')';
  exception when others then execute 'reset role'; r := r || E'\n18 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 19 update_business_profile ignora booking aunque llegue en p_settings
  perform public.update_business_profile(biz, (select id from public.branches where business_id = biz order by created_at limit 1),
    (select name from public.businesses where id = biz), (select currency from public.businesses where id = biz), (select timezone from public.businesses where id = biz),
    (select address from public.branches where business_id = biz order by created_at limit 1), (select phone from public.branches where business_id = biz order by created_at limit 1),
    '{"booking": {"enabled": false}, "city": "Ciudad de México"}'::jsonb);
  select (settings -> 'booking' ->> 'enabled') into k from public.businesses where id = biz;
  r := r || E'\n19 ' || case when k = 'true' then 'OK' else 'FALLA' end || ' update_business_profile no cambia booking (enabled = ' || k || ')';

  -- 20 otro negocio (sin membresía) y sin sesión: rechazado
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
  begin
    perform public.set_booking_settings(gen_random_uuid(), true);
    r := r || E'\n20 FALLA cambió un negocio ajeno';
  exception when others then r := r || E'\n20 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' negocio ajeno rechazado [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.set_booking_settings(biz, true);
    r := r || E'\n21 FALLA cambió sin sesión';
  exception when others then r := r || E'\n21 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin sesión rechazado [' || sqlstate || ']'; end;

  -- 22 permisos de ejecución: anon no puede llamar; authenticated sí (la regla está dentro)
  r := r || E'\n22 ' || case when not has_function_privilege('anon', 'public.set_booking_settings(uuid,boolean,integer,integer,integer,integer,text)', 'execute')
      and not has_function_privilege('anon', 'public.get_booking_settings(uuid)', 'execute')
      and not has_function_privilege('anon', 'private.set_booking_settings_impl(uuid,boolean,integer,integer,integer,integer,text)', 'execute')
      and has_function_privilege('authenticated', 'public.set_booking_settings(uuid,boolean,integer,integer,integer,integer,text)', 'execute')
      and not has_function_privilege('authenticated', 'private.guard_booking_settings()', 'execute')
      then 'OK' else 'FALLA' end || ' permisos de ejecución';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
