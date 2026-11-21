-- Pruebas de 20261120040000_cash_envelopes.sql (B5 sobres).
-- Correr en simulacro: begin; <foto de cash_available>; <migración>; <esta prueba>; rollback;
-- La foto previa (para comparar private.cash_available antes y después de la migración) es opcional:
--   create temp table envelope_test_cash_before on commit drop as
--     select id, private.cash_available(id) as available from public.cash_sessions;
-- Si no existe, la prueba 5 la compara contra expected_cash de los cierres ya guardados.
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  biz uuid; b2 uuid; env uuid; s1 uuid; s2 uuid; sid uuid; v jsonb; n int; bal numeric; bad int;
  biz3 uuid; b3 uuid; env3 uuid; who uuid; k text; ledger_before int;
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

  -- 1 cada sucursal existente tiene su sobre por omisión, y la migración no inventa saldos: toda entrada de cierre
  --   que ya exista corresponde a una caja cerrada con ese mismo apartado (no se exige libro vacío: en desarrollo
  --   ya hay cierres reales con apartado). Se toma la foto del libro para medir el efecto de la prueba (4b).
  select count(*) into n from public.branches br
   where not exists (select 1 from public.cash_envelopes e where e.branch_id = br.id and e.is_default and e.is_active);
  select count(*) into bad from public.envelope_movements m
   where m.source = 'cash_close'
     and not exists (select 1 from public.cash_sessions s where s.id = m.cash_session_id and s.status = 'closed'
                       and s.reserve_amount = m.amount and m.direction = 'in');
  select count(*) into ledger_before from public.envelope_movements;
  r := r || E'\n1 ' || case when n = 0 and bad = 0 then 'OK' else 'FALLA' end || ' sobre por omisión en cada sucursal; entradas de cierre = apartados de cajas cerradas ('
    || ledger_before || ' movimientos previos, ' || bad || ' sin respaldo)';

  -- Sucursal de prueba con su propia caja (las cajas reales no se tocan).
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba sobres (se revierte)') returning id into b2;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  v := public.open_cash_session(b2, 500, 'Prueba de sobres');
  s1 := (v ->> 'id')::uuid;
  if s1 is null then select id into s1 from public.cash_sessions where branch_id = b2 and status = 'open'; end if;

  -- 2 cerrar con apartado de 600 crea UNA entrada en el sobre por omisión
  v := public.close_cash_session(s1, 1100, null, 500, 600, null, null, 'Diferencia de prueba (se revierte)');
  env := private.default_envelope_id(b2);
  select count(*) into n from public.envelope_movements where cash_session_id = s1 and source = 'cash_close'
    and envelope_id = env and direction = 'in' and amount = 600 and created_by = owner;
  r := r || E'\n2 ' || case when n = 1 then 'OK' else 'FALLA' end || ' cierre con apartado $600 -> 1 entrada al sobre';

  -- 3 reintento: un segundo cierre se rechaza, y aunque la caja volviera a pasar de abierta a cerrada
  --   (reapertura forzada como dueño de la base), el índice único impide una segunda entrada.
  begin
    perform public.close_cash_session(s1, 1100, null, 500, 600, null, null, 'Diferencia de prueba (se revierte)');
    r := r || E'\n3a FALLA aceptó cerrar dos veces';
  exception when others then r := r || E'\n3a ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' segundo cierre rechazado [' || sqlstate || ']'; end;
  update public.cash_sessions set status = 'open', closed_at = null, closed_by = null, expected_cash = null, counted_cash = null,
    difference_amount = null, float_left = null, reserve_amount = null, withdrawn_amount = null, difference_reason = null where id = s1;
  perform public.close_cash_session(s1, 1100, null, 500, 600, null, null, 'Diferencia de prueba (se revierte)');
  select count(*) into n from public.envelope_movements where cash_session_id = s1;
  r := r || E'\n3b ' || case when n = 1 then 'OK' else 'FALLA' end || ' cerrar de nuevo la misma caja no duplica la entrada (' || n || ')';

  -- 4 cierre sin apartado no crea nada
  v := public.open_cash_session(b2, 500, null);
  select id into s2 from public.cash_sessions where branch_id = b2 and status = 'open';
  v := public.close_cash_session(s2, 500, null, 500, 0, null, null);
  select count(*) into n from public.envelope_movements where cash_session_id = s2;
  r := r || E'\n4 ' || case when n = 0 then 'OK' else 'FALLA' end || ' cierre con apartado 0 no crea entrada';
  -- 4b efecto relativo: hasta aquí la prueba agregó exactamente UNA fila al libro (la entrada de $600 de s1)
  select count(*) - ledger_before into n from public.envelope_movements;
  r := r || E'\n4b ' || case when n = 1 then 'OK' else 'FALLA' end || ' el libro creció exactamente 1 movimiento (' || n || ')';

  -- 5 cash_available y el cuadre no cambian
  if to_regclass('pg_temp.envelope_test_cash_before') is not null then
    execute 'select count(*) from pg_temp.envelope_test_cash_before x where private.cash_available(x.id) is distinct from x.available' into bad;
    execute 'select count(*) from pg_temp.envelope_test_cash_before' into n;
  else
    select count(*) into bad from public.cash_sessions s where s.status = 'closed' and s.expected_cash is not null
      and s.branch_id = b and private.cash_available(s.id) <> s.expected_cash
      and not exists (select 1 from public.cash_movements m where m.cash_session_id = s.id and m.created_at > s.closed_at);
    n := -1;
  end if;
  select count(*) + bad into bad from public.cash_sessions where id in (s1, s2) and expected_cash <> private.cash_available(id);
  r := r || E'\n5 ' || case when bad = 0 then 'OK' else 'FALLA' end || ' cash_available idéntico antes y después (' || n || ' cajas comparadas) y cuadre de los cierres de prueba igual';

  -- 6 saldo y movimientos con saldo corrido (dueño, por RLS)
  execute 'set local role authenticated';
  select balance into bal from public.envelope_balance(b2) where envelope_id = env;
  select count(*) into n from public.envelope_movements_list(env) where balance_after = 600 and signed_amount = 600;
  execute 'reset role';
  r := r || E'\n6 ' || case when bal = 600 and n = 1 then 'OK' else 'FALLA' end || ' saldo del sobre = ' || coalesce(bal::text, 'null') || ' y saldo corrido';

  -- 7 salida mayor al saldo: rechazada (gerencia con PIN)
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated', 'session_id', sid)::text, true);
  begin
    perform public.envelope_bank_deposit_confirmed(env, 700, 'Depósito al banco de prueba');
    r := r || E'\n7 FALLA permitió sacar más que el saldo';
  exception when others then r := r || E'\n7 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' salida mayor al saldo [' || sqlstate || '] ' || sqlerrm; end;

  -- 8 depósito al banco válido con PIN (misma sesión de PIN: la anterior no la consumió porque falló antes)
  begin
    v := public.envelope_bank_deposit_confirmed(env, 100, 'Depósito al banco de prueba', 'prueba-dep-000001');
    select count(*) into n from public.audit_log where entity_id = v ->> 'movement_id' and action = 'pin_confirmed_action'
      and after_data ->> 'action' = 'envelope_bank_deposit' and actor_user_id = sonia;
    r := r || E'\n8 ' || case when (v ->> 'balance')::numeric = 500 and private.envelope_balance_of(env) = 500 and n = 1 then 'OK' else 'FALLA' end
      || ' depósito al banco $100 -> saldo ' || private.envelope_balance_of(env) || ', bitácora con PIN';
  exception when others then r := r || E'\n8 FALLA depósito [' || sqlstate || '] ' || sqlerrm; end;

  -- 9 mismo envío (misma clave) no duplica, aunque el PIN ya se usó
  begin
    v := public.envelope_bank_deposit_confirmed(env, 100, 'Depósito al banco de prueba', 'prueba-dep-000001');
    select count(*) into n from public.envelope_movements where idempotency_key = 'prueba-dep-000001';
    r := r || E'\n9 ' || case when (v ->> 'replayed')::boolean and n = 1 and private.envelope_balance_of(env) = 500 then 'OK' else 'FALLA' end || ' doble envío no duplica';
  exception when others then r := r || E'\n9 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 10 la confirmación con PIN no sirve dos veces
  begin
    perform public.envelope_bank_deposit_confirmed(env, 10, 'Otro depósito de prueba');
    r := r || E'\n10 FALLA se reutilizó el PIN';
  exception when others then r := r || E'\n10 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' PIN reutilizado [' || sqlstate || ']'; end;

  -- 11 ajuste por conteo físico del dueño: contó 450 -> salida de 50
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
  begin
    v := public.envelope_adjust_confirmed(env, 450, 'Conteo físico del sobre');
    r := r || E'\n11 ' || case when (v ->> 'difference')::numeric = -50 and private.envelope_balance_of(env) = 450
      and exists (select 1 from public.envelope_movements where id = (v ->> 'movement_id')::uuid and direction = 'out' and amount = 50 and source = 'adjustment')
      then 'OK' else 'FALLA' end || ' ajuste por conteo: ' || v::text;
  exception when others then r := r || E'\n11 FALLA ajuste [' || sqlstate || '] ' || sqlerrm; end;

  -- 12-14 validaciones del ajuste (sin PIN, conteo negativo, comentario corto)
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    perform public.envelope_adjust_confirmed(env, 600, 'Conteo sin PIN de prueba');
    r := r || E'\n12 FALLA ajuste sin PIN aceptado';
  exception when others then r := r || E'\n12 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ajuste sin PIN [' || sqlstate || ']'; end;
  begin
    perform public.envelope_adjust_confirmed(env, -1, 'Conteo negativo de prueba');
    r := r || E'\n13 FALLA conteo negativo aceptado';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' conteo negativo [' || sqlstate || ']'; end;
  begin
    perform public.envelope_adjust_confirmed(env, 600, 'ok');
    r := r || E'\n14 FALLA comentario corto aceptado';
  exception when others then r := r || E'\n14 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' comentario corto [' || sqlstate || ']'; end;

  -- 15-17 recepción, barbero y consulta no mueven el sobre (aun con PIN)
  foreach who in array array[emi, dani, lucia] loop
    sid := gen_random_uuid();
    insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, who, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated', 'session_id', sid)::text, true);
    begin
      perform public.envelope_bank_deposit_confirmed(env, 10, 'Intento sin permiso');
      r := r || E'\n15-17 FALLA ' || who || ' movió el sobre';
    exception when others then r := r || E'\n15-17 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin permiso para mover el sobre [' || sqlstate || ']'; end;
  end loop;

  -- 18 lectura por RLS: recepción y barbero no ven sobres ni movimientos; consulta sí
  for who, k in select * from (values (emi, '0'), (dani, '0'), (lucia, 'si')) x(u, e) loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select (select count(*) from public.cash_envelopes) + (select count(*) from public.envelope_movements) + (select count(*) from public.envelope_balance(null))
      into n;
    execute 'reset role';
    r := r || E'\n18 ' || case when (k = '0' and n = 0) or (k = 'si' and n > 0) then 'OK' else 'FALLA' end || ' lectura ' || k || ' -> ' || n || ' filas';
  end loop;

  -- 19 otro negocio: gerencia no ve ni mueve su sobre
  insert into public.businesses (owner_user_id, name, slug) values (owner, 'Negocio de prueba (se revierte)', 'prueba-' || replace(gen_random_uuid()::text, '-', '')) returning id into biz3;
  insert into public.branches (business_id, name) values (biz3, 'Sucursal ajena (se revierte)') returning id into b3;
  env3 := private.default_envelope_id(b3);
  insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, reason, created_by)
  values (biz3, b3, env3, 'in', 999, 'adjustment', 'Saldo ajeno de prueba', owner);
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated', 'session_id', sid)::text, true);
  begin
    perform public.envelope_bank_deposit_confirmed(env3, 10, 'Sobre de otro negocio');
    r := r || E'\n19 FALLA movió el sobre de otro negocio';
  exception when others then r := r || E'\n19 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' otro negocio sin acceso [' || sqlstate || ']'; end;
  execute 'set local role authenticated';
  select count(*) into n from public.envelope_movements where business_id = biz3;
  execute 'reset role';
  r := r || E'\n20 ' || case when n = 0 then 'OK' else 'FALLA' end || ' gerencia no lee movimientos de otro negocio';

  -- 21-23 nadie actualiza ni borra el libro
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    update public.envelope_movements set amount = 1 where envelope_id = env;
    execute 'reset role';
    r := r || E'\n21 FALLA authenticated actualizó';
  exception when others then r := r || E'\n21 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' UPDATE como usuario rechazado [' || sqlstate || ']'; end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    delete from public.envelope_movements where envelope_id = env;
    execute 'reset role';
    r := r || E'\n22 FALLA authenticated borró';
  exception when others then r := r || E'\n22 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' DELETE como usuario rechazado [' || sqlstate || ']'; end;
  execute 'reset role';
  begin
    update public.envelope_movements set amount = 1 where envelope_id = env;
    r := r || E'\n23 FALLA el dueño de la base actualizó';
  exception when others then r := r || E'\n23 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' UPDATE aun como dueño de la base rechazado [' || sqlstate || ']'; end;
  begin
    delete from public.envelope_movements where envelope_id = env;
    r := r || E'\n24 FALLA el dueño de la base borró';
  exception when others then r := r || E'\n24 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' DELETE aun como dueño de la base rechazado [' || sqlstate || ']'; end;

  -- 25 sin permiso de ejecución para anon
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('envelope_balance', 'envelope_movements_list', 'envelope_adjust_confirmed', 'envelope_bank_deposit_confirmed')
     and grantee in ('anon', 'PUBLIC');
  r := r || E'\n25 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin permiso para anon/public';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
