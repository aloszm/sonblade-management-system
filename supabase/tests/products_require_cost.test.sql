-- Pruebas de 20261120120000_products_require_cost.sql: todo producto activo tiene costo > 0, y una venta de producto
-- sin costo guardado no se bloquea pero queda en la bitácora para gerencia.
-- Simulacro: begin; <migración>; <este archivo>; rollback; — el DO termina con RAISE: nada se guarda.
-- Arma su propio estado: productos de prueba, puestos (dueño, gerencia, recepción) y quita el PIN temporal de desarrollo.
-- La "confirmación con PIN" de recepción se simula como en receive_inventory_stock.test.sql (fila nueva en auth.sessions).
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
create or replace function pg_temp.with_pin(u uuid) returns void language plpgsql as $$
declare sid uuid := gen_random_uuid();
begin
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, u, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', sid)::text, true);
end $$;

do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  biz uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';    -- en el simulacro: gerencia
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';      -- recepción
  dago_e uuid := '67db0358-6563-4879-a9c6-340420ad846d';
  prod uuid; off_prod uuid; v jsonb; n int; c numeric; s1 uuid := gen_random_uuid(); i1 uuid := gen_random_uuid();
  case_ record; msg text;
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
  update public.business_memberships set role = 'owner' where business_id = biz and user_id = owner;
  update public.business_memberships set role = 'admin' where business_id = biz and user_id = sonia;
  update public.business_memberships set role = 'receptionist' where business_id = biz and user_id = emi;

  -- 1-3 alta sin costo, con costo $0 o negativo: rechazada con mensaje claro
  perform pg_temp.as_user(owner);
  for case_ in select * from (values (1, null::numeric, 'sin costo'), (2, 0::numeric, 'costo $0'), (3, -5::numeric, 'costo negativo')) x(k, cost, name) loop
    begin
      perform public.create_catalog_product(b, 'Prueba sin costo ' || case_.k, 'PRUEBA-SC-' || case_.k, 'Ceras', 180, case_.cost, 0, 0);
      r := r || E'\n' || case_.k || ' FALLA se dio de alta un producto activo ' || case_.name;
    exception when others then
      r := r || E'\n' || case_.k || ' ' || case when sqlstate in ('23514', '22023') and (sqlerrm = 'Captura el costo del producto antes de activarlo.' or case_.k = 3) then 'OK' else 'FALLA' end
        || ' alta ' || case_.name || ' rechazada [' || sqlstate || '] ' || sqlerrm;
    end;
  end loop;

  -- 4 alta con costo: entra
  begin
    v := public.create_catalog_product(b, 'Prueba con costo', 'PRUEBA-CC-1', 'Ceras', 180, 45, 3, 1);
    prod := (v ->> 'product_id')::uuid;
    r := r || E'\n4 ' || case when (select cost_price from public.products where id = prod) = 45 then 'OK' else 'FALLA' end || ' alta con costo $45';
  exception when others then r := r || E'\n4 FALLA alta con costo [' || sqlstate || '] ' || sqlerrm; end;

  -- 5-6 gerencia edita el costo directo (como app/api/products/[id]): a $0 o vacío se rechaza; a $50 entra
  perform pg_temp.as_user(sonia);
  for case_ in select * from (values (5, 0::numeric, '$0'), (6, null::numeric, 'vacío')) x(k, cost, name) loop
    begin
      execute 'set local role authenticated';
      update public.products set cost_price = case_.cost where business_id = biz and id = prod;
      execute 'reset role';
      r := r || E'\n' || case_.k || ' FALLA gerencia dejó el costo en ' || case_.name;
    exception when others then execute 'reset role';
      r := r || E'\n' || case_.k || ' ' || case when sqlstate = '23514' and sqlerrm = 'Captura el costo del producto antes de activarlo.' then 'OK' else 'FALLA' end
        || ' costo ' || case_.name || ' rechazado [' || sqlstate || '] ' || sqlerrm;
    end;
  end loop;
  begin
    execute 'set local role authenticated';
    update public.products set cost_price = 50 where business_id = biz and id = prod;
    get diagnostics n = row_count;
    execute 'reset role';
    r := r || E'\n7 ' || case when n = 1 then 'OK' else 'FALLA' end || ' gerencia cambia el costo a $50';
  exception when others then execute 'reset role'; r := r || E'\n7 FALLA [' || sqlstate || '] ' || sqlerrm; end;

  -- 8 dar de baja sigue igual (como DELETE /api/products/[id]: UPDATE is_active … RETURNING id)
  begin
    execute 'set local role authenticated';
    update public.products set is_active = false where business_id = biz and id = prod returning id into off_prod;
    execute 'reset role';
    r := r || E'\n8 ' || case when off_prod = prod then 'OK' else 'FALLA' end || ' baja de producto';
  exception when others then execute 'reset role'; r := r || E'\n8 FALLA baja [' || sqlstate || '] ' || sqlerrm; end;

  -- 9-10 un producto INACTIVO puede quedar sin costo, pero no se reactiva sin capturarlo
  insert into public.products (business_id, name, sku, sale_price, tracks_inventory, is_active)
  values (biz, 'Prueba inactivo sin costo', 'PRUEBA-INACT-1', 99, true, false) returning id into off_prod;
  r := r || E'\n9 OK producto inactivo sin costo permitido';
  begin
    update public.products set is_active = true where id = off_prod;
    r := r || E'\n10 FALLA se reactivó sin costo';
  exception when others then
    r := r || E'\n10 ' || case when sqlstate = '23514' and sqlerrm = 'Captura el costo del producto antes de activarlo.' then 'OK' else 'FALLA' end
      || ' reactivar sin costo rechazado: ' || sqlerrm;
  end;
  update public.products set cost_price = 30, is_active = true where id = off_prod;
  r := r || E'\n11 ' || case when (select is_active from public.products where id = off_prod) then 'OK' else 'FALLA' end || ' con costo sí se reactiva';

  -- 12 la restricción quedó validada en la tabla (garantía de fondo aunque se quitara el disparador)
  select count(*) into n from pg_constraint where conrelid = 'public.products'::regclass and conname = 'products_active_requires_cost' and convalidated;
  r := r || E'\n12 ' || case when n = 1 then 'OK' else 'FALLA' end || ' check products_active_requires_cost validado';
  begin
    alter table public.products disable trigger products_require_cost;
    insert into public.products (business_id, name, sku, sale_price, tracks_inventory, is_active) values (biz, 'Prueba check', 'PRUEBA-CHK-1', 10, false, true);
    r := r || E'\n13 FALLA el check dejó pasar un activo sin costo';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '23514' then 'OK' else 'FALLA' end || ' sin disparador, el check también lo rechaza'; end;
  alter table public.products enable trigger products_require_cost;

  -- 14 recepción registra una entrada de inventario (no ve ni captura costo): sigue funcionando
  update public.products set is_active = true, cost_price = 50 where id = prod;
  perform pg_temp.with_pin(emi);
  begin
    v := public.receive_inventory_stock(b, prod, 2, 'Entrada de prueba con costo obligatorio');
    r := r || E'\n14 ' || case when (v ->> 'quantity_on_hand')::int = 5 then 'OK' else 'FALLA' end || ' recepción suma 2 piezas: ' || (v ->> 'quantity_on_hand');
  exception when others then r := r || E'\n14 FALLA entrada de recepción [' || sqlstate || '] ' || sqlerrm; end;

  -- 15-17 defensa en la venta: un renglón de producto sin costo guardado NO se bloquea y queda en la bitácora
  perform pg_temp.as_user(owner);
  insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio)
  values (s1, biz, b, 'paid', 180, 0, 180, owner, now(), 'V9999-0120');
  insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, product_id, commission_employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, unit_cost_snapshot)
  values (i1, biz, b, s1, 'product', prod, dago_e, 'Prueba con costo', 1, 180, 0, 180, null);
  select count(*) into n from public.audit_log where entity_type = 'sale' and entity_id = s1::text and action = 'sale_item_without_cost'
    and after_data ->> 'sale_item_id' = i1::text;
  r := r || E'\n15 ' || case when n = 1 then 'OK' else 'FALLA' end || ' venta sin costo guardado: registrada y marcada en la bitácora';
  begin
    execute 'set local role authenticated';
    select count(*) into n from public.audit_log where entity_id = s1::text and action = 'sale_item_without_cost';
    execute 'reset role';
    r := r || E'\n16 ' || case when n = 1 then 'OK' else 'FALLA' end || ' el dueño ve la marca en la bitácora';
  exception when others then execute 'reset role'; r := r || E'\n16 FALLA [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.as_user(emi);
  execute 'set local role authenticated';
  select count(*) into n from public.audit_log where entity_id = s1::text and action = 'sale_item_without_cost';
  execute 'reset role';
  r := r || E'\n17 ' || case when n = 0 then 'OK' else 'FALLA' end || ' recepción no ve la bitácora (' || n || ')';

  -- 18 un cobro normal guarda el costo y NO deja marca
  perform pg_temp.as_user(owner);
  if not exists (select 1 from public.cash_sessions where branch_id = b and status = 'open') then
    perform public.open_cash_session(b, coalesce((select float_left from public.cash_sessions where branch_id = b and status = 'closed' order by closed_at desc limit 1),
      (select cash_float_target from public.branches where id = b)));
  end if;
  v := public.confirm_sale(p_branch_id => b, p_idempotency_key => 'prueba-costo-oblig-' || gen_random_uuid(),
    p_items => jsonb_build_array(jsonb_build_object('item_type','product','catalog_id',prod,'quantity',1,'commission_employee_ids',jsonb_build_array(dago_e))),
    p_payments => jsonb_build_array(jsonb_build_object('method','cash','amount',180)));
  select unit_cost_snapshot into c from public.sale_items where sale_id = (v ->> 'sale_id')::uuid;
  select count(*) into n from public.audit_log where entity_id = v ->> 'sale_id' and action = 'sale_item_without_cost';
  r := r || E'\n18 ' || case when c = 50 and n = 0 then 'OK' else 'FALLA' end || ' cobro normal: costo guardado $' || coalesce(c::text, 'NULL') || ', sin marca';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
