-- Pruebas de reglas (ejecutar DESPUÉS de aplicar cash_reasons_and_pin_confirmation.sql).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda; el mensaje de error trae los resultados.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  s uuid; sid uuid; n int; v jsonb; prod uuid; t text;
begin
  -- Precondición dentro de la prueba (no depender del estado de desarrollo, donde todas las cuentas tienen PIN temporal
  -- y has_business_role/can_access_branch las rechazan): se revierte con el simulacro.
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
  r := r || E'\nmigración ejecutada dentro de la transacción';
  -- sesión vieja de todos (no reciente)
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  select id into s from public.cash_sessions where branch_id = b and status = 'open';
  if s is not null then
    perform public.close_cash_session(s, 1000, null, 500, 500, null);
    r := r || E'\n0 caja abierta previa cerrada (fondo 500)';
  end if;
  -- 1 apertura igual a lo dejado, llamada antigua (2 parámetros)
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated')::text, true);
  select float_left into t from public.cash_sessions where branch_id=b and status='closed' order by closed_at desc limit 1;
  begin
    perform public.open_cash_session(p_branch_id => b, p_opening_cash => t::numeric);
    r := r || E'\n1 OK apertura igual a lo dejado ('||t||') sin motivo, firma antigua: pasa';
  exception when others then r := r || E'\n1 FALLA '||sqlerrm; end;
  select id into s from public.cash_sessions where branch_id = b and status = 'open';
  -- 2 cierre dejando 300 sin motivo
  begin
    perform public.close_cash_session(p_cash_session_id => s, p_counted_cash => 1000, p_breakdown => null, p_float_left => 300, p_reserve_amount => 600, p_withdrawal_delivered_to => null);
    r := r || E'\n2 FALLA cierre con 300 sin motivo pasó';
  exception when others then r := r || E'\n2 OK rechazo ['||sqlstate||'] '||sqlerrm; end;
  -- 3 cierre con motivo
  begin
    perform public.close_cash_session(s, 1000, null, 300, 600, null, 'Se pagó al proveedor de ceras en efectivo');
    select closing_note into t from public.cash_sessions where id = s;
    r := r || E'\n3 OK cierre con motivo pasa; closing_note='||coalesce(t,'NULL')||'; bitácora='||coalesce((select after_data->>'short_float_reason' from public.audit_log where entity_id = s::text and action='cash_closed' limit 1),'NULL');
  exception when others then r := r || E'\n3 FALLA '||sqlerrm; end;
  -- 4 apertura con 250 sin motivo
  begin
    perform public.open_cash_session(b, 250);
    r := r || E'\n4 FALLA apertura distinta sin motivo pasó';
  exception when others then r := r || E'\n4 OK rechazo ['||sqlstate||'] '||sqlerrm; end;
  -- 5 apertura con motivo corto
  begin
    perform public.open_cash_session(b, 250, 'x');
    r := r || E'\n5 FALLA motivo corto pasó';
  exception when others then r := r || E'\n5 OK rechazo motivo corto ['||sqlstate||']'; end;
  -- 6 apertura con motivo
  begin
    perform public.open_cash_session(b, 250, 'Faltaban 50 de cambio que se llevó Dago al banco');
    select id, opening_note into s, t from public.cash_sessions where branch_id=b and status='open';
    r := r || E'\n6 OK apertura con motivo pasa; opening_note='||t||'; bitácora='||coalesce((select after_data->>'opening_reason' from public.audit_log where entity_id = s::text and action='cash_opened' limit 1),'NULL');
  exception when others then r := r || E'\n6 FALLA '||sqlerrm; end;
  -- 7 cierre dejando 500 sin motivo (firma antigua) pasa
  begin
    perform public.close_cash_session(s, 1200, null, 500, 600, null);
    r := r || E'\n7 OK cierre con el fondo completo sin motivo (firma antigua): pasa; closing_note='||coalesce((select closing_note from public.cash_sessions where id=s),'NULL');
  exception when others then r := r || E'\n7 FALLA '||sqlerrm; end;

  -- 8 Sonia: RPC confirmada sin sesión reciente
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now() - interval '10 minutes', now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.set_cash_settings_confirmed(b, 450, 600, 'Renta', 'Ajuste pedido por Alonso');
    r := r || E'\n8 FALLA sesión vieja pasó';
  exception when others then r := r || E'\n8 OK sesión de hace 10 min: rechazo ['||sqlstate||'] '||sqlerrm; end;
  -- 9 Sonia con sesión recién creada (PIN)
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.set_cash_settings_confirmed(b, 450, 600, 'Renta', 'x');
    r := r || E'\n9a FALLA comentario corto pasó';
  exception when others then r := r || E'\n9a OK comentario corto: rechazo ['||sqlstate||']'; end;
  begin
    v := public.set_cash_settings_confirmed(b, 450, 600, 'Renta', 'Ajuste pedido por Alonso');
    r := r || E'\n9 OK gerencia cambia ajustes con RPC + PIN: '||v::text||'; bitácora pin='||(select count(*) from public.audit_log where action='pin_confirmed_action' and actor_user_id=sonia and after_data->>'action'='cash_settings_changed' and created_at >= now())::text;
  exception when others then r := r || E'\n9 FALLA '||sqlerrm; end;
  begin
    perform public.set_cash_settings_confirmed(b, 500, 600, 'Renta', 'Segundo intento misma sesión');
    r := r || E'\n10 FALLA reutilizar la confirmación pasó';
  exception when others then r := r || E'\n10 OK reutilizar la misma sesión: rechazo ['||sqlstate||'] '||sqlerrm; end;
  -- 11 Sonia: RPC vieja set_cash_settings
  begin
    perform public.set_cash_settings(b, 500, 600, 'Renta');
    r := r || E'\n11 FALLA set_cash_settings vieja pasó para gerencia';
  exception when others then r := r || E'\n11 OK set_cash_settings (solo dueño) sigue rechazando a gerencia ['||sqlstate||']'; end;
  -- 12 Sonia: UPDATE directo
  begin
    execute 'set local role authenticated';
    update public.branches set cash_float_target = 1 where id = b;
    get diagnostics n = row_count;
    execute 'reset role';
    r := r || E'\n12 '||case when n = 0 then 'OK' else 'FALLA' end||' UPDATE directo de gerencia a branches: filas='||n;
  exception when others then execute 'reset role'; r := r || E'\n12 OK UPDATE directo rechazado ['||sqlstate||'] '||sqlerrm; end;
  -- 13 barbero, recepción, consulta con sesión reciente
  foreach s in array array[dani, emi, lucia] loop
    sid := gen_random_uuid();
    insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, s, now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', s, 'role','authenticated','session_id',sid)::text, true);
    begin
      perform public.set_cash_settings_confirmed(b, 100, 0, 'Renta', 'Intento sin permiso');
      r := r || E'\n13 FALLA '||s||' cambió ajustes';
    exception when others then r := r || E'\n13 OK '||(select login_name from public.business_memberships where user_id=s)||' ajustes de caja: rechazo ['||sqlstate||']'; end;
    begin
      select p.id into prod from public.products p join public.branch_inventory bi on bi.product_id=p.id where p.is_active and p.tracks_inventory and bi.branch_id=b limit 1;
      perform public.adjust_inventory_stock_confirmed(b, prod, 1, 'Intento sin permiso');
      r := r || E'\n13 FALLA '||s||' ajustó inventario';
    exception when others then r := r || E'\n13 OK '||(select login_name from public.business_memberships where user_id=s)||' inventario: rechazo ['||sqlstate||']'; end;
  end loop;
  -- 14 Sonia inventario y mínimo con PIN
  select p.id into prod from public.products p join public.branch_inventory bi on bi.product_id=p.id where p.is_active and p.tracks_inventory and bi.branch_id=b limit 1;
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.adjust_inventory_stock_confirmed(b, prod, 3, 'Llegó pedido de ceras');
    r := r || E'\n14 OK gerencia entrada de inventario con PIN: '||v::text;
  exception when others then r := r || E'\n14 FALLA '||sqlerrm; end;
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.set_inventory_minimum_confirmed(b, prod, 4, 'Se vende más en diciembre');
    r := r || E'\n15 OK gerencia cambia mínimo con PIN: '||v::text;
  exception when others then r := r || E'\n15 FALLA '||sqlerrm; end;
  -- 16 movimiento manual por gerencia (abre caja como Emi primero)
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated')::text, true);
  -- (abre con lo que dejó el último cierre, sea cual sea: no depende de los cierres previos de esta prueba)
  perform public.open_cash_session(b, (select float_left from public.cash_sessions where branch_id=b and status='closed' order by closed_at desc limit 1));
  select id into s from public.cash_sessions where branch_id=b and status='open';
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.record_cash_movement_confirmed(s, 'deposit', 'cash', 200, 'Cambio en monedas');
    r := r || E'\n16 OK gerencia entrada manual con PIN: bitácora pin='||(select count(*) from public.audit_log where action='pin_confirmed_action' and after_data->>'action'='cash_movement_recorded' and entity_id = v->>'movement_id')::text;
  exception when others then r := r || E'\n16 FALLA '||sqlerrm; end;
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, emi, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated','session_id',sid)::text, true);
  begin
    perform public.record_cash_movement_confirmed(s, 'deposit', 'cash', 200, 'Cambio en monedas');
    r := r || E'\n17 FALLA recepción usó la RPC de gerencia';
  exception when others then r := r || E'\n17 OK recepción en RPC confirmada: rechazo ['||sqlstate||']'; end;
  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
