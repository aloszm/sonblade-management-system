-- Prueba de la FASE 2 (supabase/pending/close_sale_items_cost.sql). Correr en simulacro:
--   begin; <20261120100000_sale_item_costs_read.sql si aún no está>; <close_sale_items_cost.sql>; <esta prueba>; rollback;
-- Arma su propio estado (producto y venta de prueba con costo $45) y pone gerencia/caja dentro del simulacro.
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;

do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  biz uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  viewer uuid := 'a2626c47-1c4e-4a1f-867e-cefcecdf0d44';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  prod uuid; s1 uuid := gen_random_uuid(); i1 uuid := gen_random_uuid(); n int; c numeric; who record;
begin
  update public.business_memberships set must_change_pin = false;
  update public.business_memberships set role = 'admin' where business_id = biz and user_id = sonia;
  update public.business_memberships set role = 'cashier' where business_id = biz and user_id = dago;
  update public.business_memberships set role = 'viewer' where business_id = biz and user_id = viewer;
  update public.business_memberships set role = 'owner' where business_id = biz and user_id = owner;
  update public.business_memberships set role = 'receptionist' where business_id = biz and user_id = emi;
  update public.business_memberships set role = 'barber' where business_id = biz and user_id = dani;
  insert into public.products (business_id, name, sku, sale_price, cost_price, tracks_inventory, is_active)
  values (biz, 'Prueba cierre costo venta', 'PRUEBA-COSTO-2', 180, 45, false, true) returning id into prod;
  insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
  values (s1, biz, b, 'paid', 180, 0, 180, owner, now(), 'V9999-0002');
  insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, product_id, commission_employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, unit_cost_snapshot)
  values (i1, biz, b, s1, 'product', prod, dani_e, 'Prueba cierre costo venta', 1, 180, 0, 180, 45);

  -- 1-6 nadie lee la columna directo (tampoco el dueño: usa la función)
  for who in select * from (values (1, owner, 'dueño'), (2, sonia, 'gerencia'), (3, viewer, 'consulta'), (4, emi, 'recepción'), (5, dago, 'caja'), (6, dani, 'barbero')) x(k, u, name) loop
    perform pg_temp.as_user(who.u);
    begin
      execute 'set local role authenticated';
      perform unit_cost_snapshot from public.sale_items where sale_id = s1;
      execute 'reset role';
      r := r || E'\n' || who.k || ' FALLA ' || who.name || ' leyó sale_items.unit_cost_snapshot directo';
    exception when others then execute 'reset role';
      r := r || E'\n' || who.k || ' ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ' || who.name || ' no lee la columna directo [' || sqlstate || ']'; end;
  end loop;

  -- 7-9 dueño, gerencia y consulta: sí con la función
  for who in select * from (values (7, owner, 'dueño'), (8, sonia, 'gerencia'), (9, viewer, 'consulta')) x(k, u, name) loop
    perform pg_temp.as_user(who.u);
    execute 'set local role authenticated';
    select unit_cost_snapshot into c from public.sale_item_costs(b, array[s1]) where sale_item_id = i1;
    execute 'reset role';
    r := r || E'\n' || who.k || ' ' || case when c = 45 then 'OK' else 'FALLA' end || ' ' || who.name || ' lee el costo con la función';
  end loop;

  -- 10-12 recepción y barbero siguen con las consultas de la app (sin el costo)
  perform pg_temp.as_user(emi);
  begin
    execute 'set local role authenticated';
    select count(*) into n from (select id, item_type, item_name_snapshot, unit_price, quantity, service_id, product_id, employee_id, commission_employee_id from public.sale_items where sale_id = s1) x;
    select n + count(*) into n from (select item_type, item_name_snapshot, quantity, unit_price, discount_amount, line_total, employee_id from public.sale_items where sale_id = s1) x;
    select n + count(*) into n from (select id, item_type, product_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, employee_id, commission_employee_id from public.sale_items where sale_id = s1) x;
    execute 'reset role';
    r := r || E'\n10 ' || case when n = 3 then 'OK' else 'FALLA' end || ' recepción: Ventas, ticket y desglose sin costo';
  exception when others then execute 'reset role'; r := r || E'\n10 FALLA [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.as_user(owner);
  begin
    execute 'set local role authenticated';
    -- Finanzas/Panel (lib/admin/profit-data.ts, versión nueva: sin la columna)
    select count(*) into n from (select id, sale_id, item_type, product_id, item_name_snapshot, quantity, discount_amount, line_total, employee_id, commission_employee_id from public.sale_items where sale_id = s1) x;
    execute 'reset role';
    r := r || E'\n11 ' || case when n = 1 then 'OK' else 'FALLA' end || ' dueño: renglones de Finanzas sin la columna';
  exception when others then execute 'reset role'; r := r || E'\n11 FALLA [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.as_user(dani);
  begin
    execute 'set local role authenticated';
    select count(*) into n from (select id, sale_id, item_type, item_name_snapshot, quantity, line_total, employee_id, commission_employee_id from public.sale_items where sale_id = s1) x;
    execute 'reset role';
    r := r || E'\n12 ' || case when n = 1 then 'OK' else 'FALLA' end || ' barbero ve su renglón sin el costo';
  exception when others then execute 'reset role'; r := r || E'\n12 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
