-- Pruebas de S5 (ejecutar DESPUÉS de aplicar 20261119175000_s5_close_legacy_admin_shortcuts.sql).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda; el mensaje de error trae los resultados.
-- La prueba quita el PIN temporal de las cuentas ella misma (dentro del simulacro).
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  s uuid; sid uuid; v jsonb; prod uuid; n int;
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
  select p.id into prod from public.products p join public.branch_inventory bi on bi.product_id = p.id
   where p.is_active and p.tracks_inventory and bi.branch_id = b limit 1;
  -- caja abierta (como Emi) para los movimientos
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated')::text, true);
  select id into s from public.cash_sessions where branch_id = b and status = 'open';
  if s is null then
    perform public.open_cash_session(b, coalesce((select float_left from public.cash_sessions where branch_id = b and status = 'closed' order by closed_at desc limit 1),
      (select cash_float_target from public.branches where id = b)));
    select id into s from public.cash_sessions where branch_id = b and status = 'open';
  end if;

  -- 1-4 gerencia en las antiguas: rechazo 42501 con mensaje en español
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated')::text, true);
  begin
    perform public.adjust_inventory_stock(b, prod, 1, 'Atajo sin PIN');
    r := r || E'\n1 FALLA gerencia ajustó inventario sin PIN';
  exception when others then r := r || E'\n1 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' adjust_inventory_stock gerencia ['||sqlstate||'] '||sqlerrm; end;
  begin
    perform public.set_inventory_minimum(b, prod, 2);
    r := r || E'\n2 FALLA gerencia cambió mínimo sin PIN';
  exception when others then r := r || E'\n2 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' set_inventory_minimum gerencia ['||sqlstate||'] '||sqlerrm; end;
  begin
    perform public.record_cash_movement(s, 'deposit', 'cash', 10, 'Atajo sin PIN');
    r := r || E'\n3 FALLA gerencia registró movimiento sin PIN';
  exception when others then r := r || E'\n3 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' record_cash_movement gerencia ['||sqlstate||'] '||sqlerrm; end;
  begin
    perform public.set_cash_settings(b, 500, 600, 'Renta');
    r := r || E'\n4 FALLA gerencia cambió ajustes sin PIN';
  exception when others then r := r || E'\n4 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' set_cash_settings gerencia ['||sqlstate||'] '||sqlerrm; end;

  -- 5 gerencia con PIN (sesión recién creada) sigue funcionando por las _confirmed
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.adjust_inventory_stock_confirmed(b, prod, 1, 'Llegó pedido de ceras');
    r := r || E'\n5 OK gerencia con PIN por adjust_inventory_stock_confirmed: '||v::text;
  exception when others then r := r || E'\n5 FALLA '||sqlerrm; end;
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, sonia, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role','authenticated','session_id',sid)::text, true);
  begin
    v := public.record_cash_movement_confirmed(s, 'deposit', 'cash', 20, 'Cambio en monedas');
    r := r || E'\n6 OK gerencia con PIN por record_cash_movement_confirmed';
  exception when others then r := r || E'\n6 FALLA '||sqlerrm; end;

  -- 7-10 dueño: las antiguas siguen igual
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role','authenticated')::text, true);
  begin
    v := public.adjust_inventory_stock(b, prod, 1, 'Ajuste del dueño');
    r := r || E'\n7 OK dueño adjust_inventory_stock: '||v::text;
  exception when others then r := r || E'\n7 FALLA '||sqlerrm; end;
  begin
    v := public.set_inventory_minimum(b, prod, 3);
    r := r || E'\n8 OK dueño set_inventory_minimum: '||v::text;
  exception when others then r := r || E'\n8 FALLA '||sqlerrm; end;
  begin
    v := public.record_cash_movement(s, 'deposit', 'cash', 15, 'Cambio del dueño');
    r := r || E'\n9 OK dueño record_cash_movement';
  exception when others then r := r || E'\n9 FALLA '||sqlerrm; end;
  begin
    v := public.set_cash_settings(b, (select cash_float_target from public.branches where id = b), (select daily_reserve_amount from public.branches where id = b), (select daily_reserve_label from public.branches where id = b));
    r := r || E'\n10 OK dueño set_cash_settings: '||v::text;
  exception when others then r := r || E'\n10 FALLA '||sqlerrm; end;

  -- 11 recepción: movimiento manual igual que antes; inventario sigue rechazado por la regla de siempre
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role','authenticated')::text, true);
  begin
    v := public.record_cash_movement(s, 'deposit', 'cash', 5, 'Cambio de recepción');
    r := r || E'\n11 OK recepción record_cash_movement';
  exception when others then r := r || E'\n11 FALLA '||sqlerrm; end;
  begin
    perform public.adjust_inventory_stock(b, prod, 1, 'Intento de recepción');
    r := r || E'\n12 FALLA recepción ajustó inventario';
  exception when others then r := r || E'\n12 OK recepción adjust_inventory_stock rechazo de siempre ['||sqlstate||'] '||sqlerrm; end;

  -- 13 nada de gerencia quedó registrado por las antiguas
  select count(*) into n from public.audit_log where actor_user_id = sonia and created_at >= now()
    and action in ('inventory_adjusted','inventory_minimum_changed','cash_movement_recorded','cash_settings_changed')
    and not exists (select 1 from public.audit_log a2 where a2.entity_id = audit_log.entity_id and a2.action = 'pin_confirmed_action');
  r := r || E'\n13 ' || case when n = 0 then 'OK' else 'FALLA' end || ' cambios de gerencia sin PIN en bitácora: '||n;
  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
