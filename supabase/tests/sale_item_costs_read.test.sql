-- Pruebas de 20261120100000_sale_item_costs_read.sql (costo guardado en cada venta, por puesto).
-- Simulacro: begin; <migración>; <este archivo>; rollback;  — el DO termina con RAISE: nada se guarda.
-- Arma su propio estado: un producto y una venta de prueba con costo guardado ($45), y pone puestos de prueba
-- (gerencia y caja) cambiando el puesto de dos cuentas dentro del simulacro. Quita el PIN temporal de desarrollo.
-- También corre, como recepción, las MISMAS consultas que hace la app (lista de Ventas, ticket, "Barberos hoy",
-- desglose sin costo) y un cobro real con producto: ninguna pide el costo y todas deben seguir funcionando.
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  biz uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';    -- en el simulacro: gerencia (admin)
  viewer uuid := 'a2626c47-1c4e-4a1f-867e-cefcecdf0d44';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';      -- recepción
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';     -- en el simulacro: caja (cashier)
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';     -- barbero
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  dago_e uuid := '67db0358-6563-4879-a9c6-340420ad846d';
  prod uuid; s1 uuid := gen_random_uuid(); i1 uuid := gen_random_uuid(); n int; c numeric; v jsonb; sale2 uuid;
  who record;
begin
  update public.business_memberships set must_change_pin = false;
  update public.business_memberships set role = 'admin' where business_id = biz and user_id = sonia;
  update public.business_memberships set role = 'cashier' where business_id = biz and user_id = dago;
  update public.business_memberships set role = 'viewer' where business_id = biz and user_id = viewer;
  update public.business_memberships set role = 'owner' where business_id = biz and user_id = owner;
  update public.business_memberships set role = 'receptionist' where business_id = biz and user_id = emi;
  update public.business_memberships set role = 'barber' where business_id = biz and user_id = dani;

  insert into public.products (business_id, name, sku, sale_price, cost_price, tracks_inventory, is_active)
  values (biz, 'Prueba costo por puesto', 'PRUEBA-COSTO-1', 180, 45, true, true) returning id into prod;
  insert into public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity) values (biz, b, prod, 10, 0);
  insert into public.inventory_movements (business_id, branch_id, product_id, movement_type, quantity_delta, unit_cost_snapshot, created_by, notes)
  values (biz, b, prod, 'initial', 10, 45, owner, 'Existencia inicial de prueba');
  insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
  values (s1, biz, b, 'paid', 180, 0, 180, owner, now(), 'V9999-0001');
  insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, product_id, commission_employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, unit_cost_snapshot)
  values (i1, biz, b, s1, 'product', prod, dani_e, 'Prueba costo por puesto', 1, 180, 0, 180, 45);

  -- 1-3 dueño, gerencia y consulta leen el costo guardado con la función
  for who in select * from (values (1, owner, 'dueño'), (2, sonia, 'gerencia'), (3, viewer, 'consulta')) x(k, u, name) loop
    perform pg_temp.as_user(who.u);
    begin
      execute 'set local role authenticated';
      select unit_cost_snapshot into c from public.sale_item_costs(b, array[s1]) where sale_item_id = i1;
      execute 'reset role';
      r := r || E'\n' || who.k || ' ' || case when c = 45 then 'OK' else 'FALLA' end || ' ' || who.name || ' lee el costo guardado ($' || coalesce(c::text, 'nada') || ')';
    exception when others then execute 'reset role'; r := r || E'\n' || who.k || ' FALLA ' || who.name || ' no pudo leer [' || sqlstate || '] ' || sqlerrm; end;
  end loop;

  -- 4-6 recepción, caja y barbero: la función los rechaza
  for who in select * from (values (4, emi, 'recepción'), (5, dago, 'caja'), (6, dani, 'barbero')) x(k, u, name) loop
    perform pg_temp.as_user(who.u);
    begin
      execute 'set local role authenticated';
      perform * from public.sale_item_costs(b, array[s1]);
      execute 'reset role';
      r := r || E'\n' || who.k || ' FALLA ' || who.name || ' leyó el costo con la función';
    exception when others then execute 'reset role';
      r := r || E'\n' || who.k || ' ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ' || who.name || ' no lee el costo con la función [' || sqlstate || ']'; end;
  end loop;

  -- 7-9 movimientos de inventario: nadie lee el costo directo por la API (ni el dueño); el resto de columnas sí
  for who in select * from (values (7, emi, 'recepción'), (8, dani, 'barbero'), (9, owner, 'dueño')) x(k, u, name) loop
    perform pg_temp.as_user(who.u);
    begin
      execute 'set local role authenticated';
      perform unit_cost_snapshot from public.inventory_movements where product_id = prod;
      execute 'reset role';
      r := r || E'\n' || who.k || ' FALLA ' || who.name || ' leyó inventory_movements.unit_cost_snapshot';
    exception when others then execute 'reset role';
      r := r || E'\n' || who.k || ' ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ' || who.name || ' no lee el costo de los movimientos [' || sqlstate || ']'; end;
  end loop;
  perform pg_temp.as_user(emi);
  execute 'set local role authenticated';
  select count(*) into n from (select id, product_id, movement_type, quantity_delta, notes, created_at from public.inventory_movements where product_id = prod) x;
  execute 'reset role';
  r := r || E'\n10 ' || case when n = 1 then 'OK' else 'FALLA' end || ' recepción sigue leyendo los movimientos sin el costo (' || n || ')';

  -- 11-14 recepción: las mismas consultas que hace la app con su sesión
  perform pg_temp.as_user(emi);
  begin
    execute 'set local role authenticated';
    -- Ventas (app/api/sales/route.ts)
    select count(*) into n from (select s.id, s.folio, s.created_at, s.status, s.total_amount, s.notes, s.client_id,
      (select json_agg(json_build_object('id', si.id, 'item_type', si.item_type, 'item_name_snapshot', si.item_name_snapshot, 'unit_price', si.unit_price,
        'quantity', si.quantity, 'service_id', si.service_id, 'product_id', si.product_id, 'employee_id', si.employee_id, 'commission_employee_id', si.commission_employee_id))
        from public.sale_items si where si.sale_id = s.id) items
      from public.sales s where s.business_id = biz and s.branch_id = b and s.id = s1) x;
    execute 'reset role';
    r := r || E'\n11 ' || case when n = 1 then 'OK' else 'FALLA' end || ' recepción: lista de Ventas';
  exception when others then execute 'reset role'; r := r || E'\n11 FALLA lista de Ventas [' || sqlstate || '] ' || sqlerrm; end;
  begin
    execute 'set local role authenticated';
    -- Ticket (app/api/sales/[id]/route.ts)
    select count(*) into n from (select item_type, item_name_snapshot, quantity, unit_price, discount_amount, line_total, employee_id
      from public.sale_items where sale_id = s1) x;
    execute 'reset role';
    r := r || E'\n12 ' || case when n = 1 then 'OK' else 'FALLA' end || ' recepción: ticket';
  exception when others then execute 'reset role'; r := r || E'\n12 FALLA ticket [' || sqlstate || '] ' || sqlerrm; end;
  begin
    execute 'set local role authenticated';
    -- "Barberos hoy" (lib/team/load.ts) y desglose sin costo (app/api/sales/[id]/breakdown/route.ts)
    select count(*) into n from (select id, sale_id, item_type, item_name_snapshot, quantity, line_total, employee_id, commission_employee_id
      from public.sale_items where business_id = biz and branch_id = b and sale_id = s1) x;
    select n + count(*) into n from (select id, item_type, product_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, employee_id, commission_employee_id
      from public.sale_items where business_id = biz and branch_id = b and sale_id = s1) x;
    execute 'reset role';
    r := r || E'\n13 ' || case when n = 2 then 'OK' else 'FALLA' end || ' recepción: "Barberos hoy" y desglose sin costo';
  exception when others then execute 'reset role'; r := r || E'\n13 FALLA Barberos hoy / desglose [' || sqlstate || '] ' || sqlerrm; end;

  -- 14 recepción cobra una venta con producto (Cobro): la base guarda el costo aunque ella no lo vea
  if not exists (select 1 from public.cash_sessions where branch_id = b and status = 'open') then
    perform public.open_cash_session(b, coalesce((select float_left from public.cash_sessions where branch_id = b and status = 'closed' order by closed_at desc limit 1),
      (select cash_float_target from public.branches where id = b)));
  end if;
  begin
    execute 'set local role authenticated';
    v := public.confirm_sale(p_branch_id => b, p_idempotency_key => 'costo-puesto-' || gen_random_uuid(),
      p_items => jsonb_build_array(jsonb_build_object('item_type','product','catalog_id',prod,'quantity',1,'commission_employee_ids',jsonb_build_array(dago_e))),
      p_payments => jsonb_build_array(jsonb_build_object('method','cash','amount',180)));
    execute 'reset role';
    sale2 := (v ->> 'sale_id')::uuid;
    select unit_cost_snapshot into c from public.sale_items where sale_id = sale2;
    r := r || E'\n14 ' || case when v ->> 'status' = 'paid' and c = 45 then 'OK' else 'FALLA' end || ' recepción cobra; costo guardado = ' || coalesce(c::text, 'NULL');
  exception when others then execute 'reset role'; r := r || E'\n14 FALLA cobro de recepción [' || sqlstate || '] ' || sqlerrm; end;

  -- 15 la función no se puede llamar sin sesión ni el impl directo desde anon
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'sale_item_costs' and grantee in ('anon', 'PUBLIC');
  r := r || E'\n15 ' || case when n = 0 then 'OK' else 'FALLA' end || ' public.sale_item_costs sin permiso para anon';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
