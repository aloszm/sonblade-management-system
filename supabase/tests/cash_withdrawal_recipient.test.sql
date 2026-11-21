-- Pruebas de 20261121120000_cash_withdrawal_recipient.sql (el retiro del cierre se entrega a una persona fija).
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;
-- Prepara su propio estado (PIN temporal apagado, puestos, sucursal de prueba) dentro de la transacción.
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
do $t$
declare
  r text := '';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  biz uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  b2 uuid; s uuid; sid uuid; v jsonb; n int; t text; u uuid; w numeric;
  old_closed int; old_with_recipient int;
  claims_owner text; claims_emi text; claims_sonia text;
  sonia_name text;

  -- Sesión recién abierta con PIN (la prueba de consume_pin_proof): menos de 2 minutos y de un solo uso.
  -- Deja las credenciales de esa persona puestas.
begin
  update public.business_memberships set must_change_pin = false;
  update public.business_memberships m set role = x.role::public.business_role
  from (values ('76c82fae-6754-4be2-916e-b883890e524f'::uuid, 'owner'),          -- Alonso: cuenta principal
               ('0760694d-ea50-462b-8e11-b9478e564607'::uuid, 'admin'),          -- Sonia: gerencia
               ('6a8d153e-cf8d-4dd7-8029-01bc42481159'::uuid, 'viewer'),         -- Lucía: consulta
               ('a3b429be-3d7b-4c46-90fd-e15722193e27'::uuid, 'receptionist'),   -- Emi
               ('afe3a615-74ec-4c50-81b8-98c39fa4741a'::uuid, 'receptionist'),   -- Dago
               ('bfae5380-f99c-4c62-ae7d-17130f832cf4'::uuid, 'barber'),         -- Dani
               ('cb89067a-6cb5-4473-8ff5-ff1fcf83bd12'::uuid, 'barber')) x(u, role)  -- Deya
  where m.business_id = biz and m.user_id = x.u and m.role::text <> x.role;
  update public.business_memberships set is_active = true where business_id = biz and user_id in (owner, sonia, lucia, emi, dani) and not is_active;
  select display_name into sonia_name from public.employees where business_id = biz and user_id = sonia;

  select count(*), count(*) filter (where withdrawal_recipient_user_id is not null) into old_closed, old_with_recipient
  from public.cash_sessions where status = 'closed';

  -- Sucursal de prueba (las cajas reales no se tocan): fondo 500, apartado 600; Emi y Sonia con acceso.
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba retiro (se revierte)') returning id into b2;
  update public.branches set cash_float_target = 500, daily_reserve_amount = 600 where id = b2;
  insert into public.user_branch_access (business_id, branch_id, user_id) values (biz, b2, emi), (biz, b2, sonia), (biz, b2, lucia), (biz, b2, dani)
    on conflict do nothing;
  claims_owner := json_build_object('sub', owner, 'role', 'authenticated')::text;
  claims_emi := json_build_object('sub', emi, 'role', 'authenticated')::text;
  claims_sonia := json_build_object('sub', sonia, 'role', 'authenticated')::text;

  -- 1 sin receptor: cierre con retiro y sin texto sigue pasando (la app anterior no se rompe); nada a nombre de nadie
  perform set_config('request.jwt.claims', claims_emi, true);
  perform public.open_cash_session(b2, 2000, 'Prueba de retiro');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    v := public.close_cash_session(s, 2000, null, 500, 600, null, null, null);
    select withdrawn_amount, withdrawal_delivered_to, withdrawal_recipient_user_id into w, t, u from public.cash_sessions where id = s;
    r := r || E'\n1 ' || case when w = 900 and t is null and u is null and v ? 'withdrawal_recipient_user_id' and v ->> 'withdrawal_recipient_user_id' is null
      then 'OK' else 'FALLA' end || ' sin receptor: retiro ' || w || ' sin texto pasa, sin nombre (' || coalesce(t, 'nulo') || ')';
  exception when others then r := r || E'\n1 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 2 sin receptor: el texto libre se guarda como antes
  perform public.open_cash_session(b2, 2000, 'Prueba de retiro');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(s, 2000, null, 500, 600, '  Depósito al banco ', null, null);
    select withdrawal_delivered_to, withdrawal_recipient_user_id into t, u from public.cash_sessions where id = s;
    r := r || E'\n2 ' || case when t = 'Depósito al banco' and u is null then 'OK' else 'FALLA' end || ' sin receptor: texto libre guardado (' || coalesce(t, 'nulo') || ')';
  exception when others then r := r || E'\n2 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 3 lectura sin receptor: null
  begin
    v := public.cash_withdrawal_recipient(b2);
    r := r || E'\n3 ' || case when v is null then 'OK' else 'FALLA' end || ' lectura sin receptor: ' || coalesce(v::text, 'null');
  exception when others then r := r || E'\n3 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 4 la cuenta principal SIN sesión de PIN: rechazado
  perform set_config('request.jwt.claims', claims_owner, true);
  begin
    perform public.set_cash_withdrawal_recipient(b2, sonia, 'El sobrante se entrega a Sonia');
    r := r || E'\n4 FALLA cambió sin PIN';
  exception when others then
    r := r || E'\n4 ' || case when sqlstate = '42501' and (select withdrawal_recipient_user_id from public.branches where id = b2) is null then 'OK' else 'FALLA' end || ' sin PIN [' || sqlstate || '] ' || sqlerrm;
  end;

  -- 5 gerencia (Sonia) con PIN: no puede nombrarse a sí misma ni a nadie
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated', 'session_id', sid)::text, true);
  begin
    perform public.set_cash_withdrawal_recipient(b2, sonia, 'Yo recibo el sobrante');
    r := r || E'\n5 FALLA gerencia cambió el receptor';
  exception when others then
    r := r || E'\n5 ' || case when sqlstate = '42501' and sqlerrm = 'Solo la cuenta principal puede cambiar quién recibe el retiro de la caja.' then 'OK' else 'FALLA' end || ' gerencia [' || sqlstate || '] ' || sqlerrm;
  end;

  -- 6 recepción, consulta y barbero con PIN: rechazados
  n := 0;
  foreach u in array array[emi, lucia, dani] loop
    sid := gen_random_uuid();
    insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, u, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', sid)::text, true);
    begin
      perform public.set_cash_withdrawal_recipient(b2, sonia, 'Intento sin permiso');
    exception when others then if sqlstate = '42501' then n := n + 1; end if; end;
  end loop;
  r := r || E'\n6 ' || case when n = 3 and (select withdrawal_recipient_user_id from public.branches where id = b2) is null then 'OK' else 'FALLA' end || ' recepción, consulta y barbero rechazados (' || n || '/3)';

  -- 7 la cuenta principal con PIN pero sin comentario válido: rechazado
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
  begin
    perform public.set_cash_withdrawal_recipient(b2, sonia, 'abc');
    r := r || E'\n7 FALLA aceptó comentario corto';
  exception when others then r := r || E'\n7 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' comentario corto [' || sqlstate || '] ' || sqlerrm; end;

  -- 8 no se puede nombrar a recepción, consulta ni barbero (solo gerencia o cuenta principal), ni a alguien de fuera
  n := 0;
  foreach u in array array[emi, lucia, dani, gen_random_uuid()] loop
    begin
      perform public.set_cash_withdrawal_recipient(b2, u, 'Receptor no permitido');
    exception when others then if sqlstate = '22023' then n := n + 1; end if; end;
  end loop;
  r := r || E'\n8 ' || case when n = 4 and (select withdrawal_recipient_user_id from public.branches where id = b2) is null then 'OK' else 'FALLA' end || ' receptor que no es gerencia ni cuenta principal: rechazado (' || n || '/4)';

  -- 9 la cuenta principal con PIN y comentario nombra a Sonia: guardado, bitácora y PIN consumido
  begin
    v := public.set_cash_withdrawal_recipient(b2, sonia, 'El sobrante de cada cierre se entrega a Sonia');
    r := r || E'\n9 ' || case when (v ->> 'user_id')::uuid = sonia and v ->> 'name' = sonia_name
        and (select withdrawal_recipient_user_id from public.branches where id = b2) = sonia
        and exists (select 1 from public.audit_log where branch_id = b2 and action = 'cash_withdrawal_recipient_changed'
                    and after_data ->> 'withdrawal_recipient_name' = sonia_name and (after_data ->> 'confirmed_with_pin')::boolean
                    and before_data ->> 'withdrawal_recipient_user_id' is null)
        and exists (select 1 from public.audit_log where branch_id = b2 and action = 'pin_confirmed_action' and after_data ->> 'action' = 'cash_withdrawal_recipient_changed')
      then 'OK' else 'FALLA' end || ' receptor = ' || coalesce(v ->> 'name', 'nulo') || ', con bitácora';
  exception when others then r := r || E'\n9 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 10 la misma sesión de PIN no sirve dos veces
  begin
    perform public.set_cash_withdrawal_recipient(b2, owner, 'Segundo cambio con el mismo PIN');
    r := r || E'\n10 FALLA reutilizó la confirmación con PIN';
  exception when others then
    r := r || E'\n10 ' || case when sqlstate = '42501' and (select withdrawal_recipient_user_id from public.branches where id = b2) = sonia then 'OK' else 'FALLA' end || ' PIN de un solo uso [' || sqlstate || ']';
  end;

  -- 11 sin atajos: UPDATE directo de la cuenta principal (rol authenticated) sobre la columna, rechazado; otras columnas sí
  perform set_config('request.jwt.claims', claims_owner, true);
  begin
    execute 'set local role authenticated';
    update public.branches set withdrawal_recipient_user_id = owner where id = b2;
    execute 'reset role';
    r := r || E'\n11 FALLA el UPDATE directo cambió el receptor';
  exception when others then execute 'reset role';
    r := r || E'\n11 ' || case when sqlstate = '42501' and (select withdrawal_recipient_user_id from public.branches where id = b2) = sonia then 'OK' else 'FALLA' end || ' UPDATE directo rechazado [' || sqlstate || ']';
  end;
  begin
    execute 'set local role authenticated';
    update public.branches set phone = '55 0000 0000' where id = b2;
    get diagnostics n = row_count;
    execute 'reset role';
    r := r || E'\n12 ' || case when n = 1 then 'OK' else 'FALLA' end || ' UPDATE directo de otra columna sigue funcionando (' || n || ')';
  exception when others then execute 'reset role'; r := r || E'\n12 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 13 lectura: recepción y consulta ven a quién se entrega; el barbero no
  begin
    perform set_config('request.jwt.claims', claims_emi, true);
    v := public.cash_withdrawal_recipient(b2);
    perform set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
    t := public.cash_withdrawal_recipient(b2) ->> 'name';
    r := r || E'\n13 ' || case when v ->> 'name' = sonia_name and (v ->> 'user_id')::uuid = sonia and t = sonia_name then 'OK' else 'FALLA' end || ' recepción y consulta leen: ' || coalesce(v ->> 'name', 'nulo');
  exception when others then r := r || E'\n13 FALLA [' || sqlstate || '] ' || sqlerrm; end;
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  begin
    perform public.cash_withdrawal_recipient(b2);
    r := r || E'\n14 FALLA el barbero leyó el receptor';
  exception when others then r := r || E'\n14 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero no lee [' || sqlstate || ']'; end;

  -- 15 con receptor: recepción cierra SIN mandar texto (app anterior) → el retiro queda a nombre de Sonia
  perform set_config('request.jwt.claims', claims_emi, true);
  perform public.open_cash_session(b2, 2000, 'Prueba de retiro');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    v := public.close_cash_session(s, 2000, null, 500, 600, null, null, null);
    select withdrawn_amount, withdrawal_delivered_to, withdrawal_recipient_user_id into w, t, u from public.cash_sessions where id = s;
    r := r || E'\n15 ' || case when w = 900 and t = sonia_name and u = sonia and (v ->> 'withdrawal_recipient_user_id')::uuid = sonia and v ->> 'withdrawal_delivered_to' = sonia_name
        and exists (select 1 from public.audit_log where entity_id = s::text and action = 'cash_closed'
                    and (after_data ->> 'withdrawal_recipient_user_id')::uuid = sonia and after_data ->> 'withdrawal_delivered_to' = sonia_name)
      then 'OK' else 'FALLA' end || ' fondo 500 + sobre 600 → retiro ' || w || ' a ' || coalesce(t, 'nulo');
  exception when others then r := r || E'\n15 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 16 con receptor: lo que mande la pantalla se ignora (nadie puede escribir otro nombre)
  perform public.open_cash_session(b2, 2000, 'Prueba de retiro');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(s, 2000, null, 500, 600, 'Me lo llevo yo', null, null);
    select withdrawal_delivered_to, withdrawal_recipient_user_id into t, u from public.cash_sessions where id = s;
    r := r || E'\n16 ' || case when t = sonia_name and u = sonia then 'OK' else 'FALLA' end || ' el texto de la pantalla se ignora: queda ' || coalesce(t, 'nulo');
  exception when others then r := r || E'\n16 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 17 con receptor y SIN retiro (todo se fue a fondo y sobre): no se guarda a nadie, aunque llegue texto
  perform public.open_cash_session(b2, 1100, 'Prueba de retiro sin sobrante');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    perform public.close_cash_session(s, 1100, null, 500, 600, 'Texto que sobra', null, null);
    select withdrawn_amount, withdrawal_delivered_to, withdrawal_recipient_user_id into w, t, u from public.cash_sessions where id = s;
    r := r || E'\n17 ' || case when w = 0 and t is null and u is null then 'OK' else 'FALLA' end || ' sin retiro: sin receptor (' || coalesce(t, 'nulo') || ')';
  exception when others then r := r || E'\n17 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 18 la propia Sonia cierra: el retiro queda a su nombre igual
  perform set_config('request.jwt.claims', claims_sonia, true);
  perform public.open_cash_session(b2, 500, null);
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  insert into public.cash_movements (business_id, branch_id, cash_session_id, movement_type, direction, method, amount, description, created_by)
    values (biz, b2, s, 'deposit', 'in', 'cash', 1500, 'Entrada de prueba', sonia);
  begin
    perform public.close_cash_session(s, 2000, null, 500, 600, null, null, null);
    select withdrawal_delivered_to, withdrawal_recipient_user_id into t, u from public.cash_sessions where id = s;
    r := r || E'\n18 ' || case when t = sonia_name and u = sonia then 'OK' else 'FALLA' end || ' cierra la propia receptora: ' || coalesce(t, 'nulo');
  exception when others then r := r || E'\n18 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 19 si la receptora deja de ser gerencia (o se desactiva), el cierre NO se bloquea: vuelve el texto opcional
  update public.business_memberships set role = 'barber' where business_id = biz and user_id = sonia;
  perform set_config('request.jwt.claims', claims_emi, true);
  perform public.open_cash_session(b2, 2000, 'Prueba de retiro');
  select id into s from public.cash_sessions where branch_id = b2 and status = 'open';
  begin
    v := public.cash_withdrawal_recipient(b2);
    perform public.close_cash_session(s, 2000, null, 500, 600, 'Dueño', null, null);
    select withdrawal_delivered_to, withdrawal_recipient_user_id into t, u from public.cash_sessions where id = s;
    r := r || E'\n19 ' || case when v is null and t = 'Dueño' and u is null then 'OK' else 'FALLA' end || ' receptora ya no es gerencia: se cierra con texto libre (' || coalesce(t, 'nulo') || ')';
  exception when others then r := r || E'\n19 FALLA [' || sqlstate || '] ' || sqlerrm; end;
  update public.business_memberships set role = 'admin' where business_id = biz and user_id = sonia;

  -- 20 la cuenta principal quita el receptor (null) con PIN: vuelve el comportamiento anterior
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
  begin
    v := public.set_cash_withdrawal_recipient(b2, null, 'Se quita el receptor fijo de prueba');
    r := r || E'\n20 ' || case when v is null and (select withdrawal_recipient_user_id from public.branches where id = b2) is null and public.cash_withdrawal_recipient(b2) is null
      then 'OK' else 'FALLA' end || ' receptor quitado';
  exception when others then r := r || E'\n20 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 21 las cajas cerradas antes no cambiaron: ninguna ganó receptor
  select count(*) filter (where withdrawal_recipient_user_id is not null) into n
  from public.cash_sessions where status = 'closed' and branch_id <> b2;
  r := r || E'\n21 ' || case when n = old_with_recipient then 'OK' else 'FALLA' end || ' ' || old_closed || ' cajas cerradas antes: sin cambios (' || n || ' con receptor)';

  -- 22 la tabla no admite receptor en una caja sin retiro (aunque se escriba a mano)
  select id into s from public.cash_sessions where branch_id = b2 and status = 'closed' and withdrawn_amount = 0 limit 1;
  begin
    update public.cash_sessions set withdrawal_recipient_user_id = sonia where id = s;
    r := r || E'\n22 FALLA aceptó receptor en una caja sin retiro';
  exception when others then r := r || E'\n22 ' || case when sqlstate = '23514' then 'OK' else 'FALLA' end || ' receptor en caja sin retiro: rechazado por la tabla [' || sqlstate || ']'; end;

  raise exception 'RESULTADOS (todo se revierte):%', r;
end;
$t$;
