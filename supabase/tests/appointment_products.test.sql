-- Pruebas de 20261120082000_appointment_products.sql (productos en la cita, con vendedor) y de su cobro.
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;  (o después de aplicarla: la prueba sola).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda. Usa un producto de prueba creado aquí
-- ("Prueba cera cita", 10 piezas) para no depender de las existencias de desarrollo. La cita se inserta con source
-- 'walk_in' solo para que el horario del negocio no impida correr la prueba a cualquier hora.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  deya uuid := 'cb89067a-6cb5-4473-8ff5-ff1fcf83bd12';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  dani_emp uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  emi_emp uuid := '1ef32d3d-8cf8-4441-aa6c-7a1674d874e4';
  dago_emp uuid := '67db0358-6563-4879-a9c6-340420ad846d';
  biz uuid; svc uuid; price numeric; prod uuid; prod_off uuid; a1 uuid; a2 uuid; l1 uuid; l2 uuid; v jsonb; n int; k text;
  slot timestamptz; sale uuid; stock numeric; sid uuid; tz text; wk date;
  c_svc numeric; c_prod numeric; pre_dani numeric; pre_emi numeric; post_dani numeric; post_emi numeric;
  kpi_x jsonb; kpi_y jsonb; t0 timestamptz; items jsonb; pays jsonb;
begin
  update public.business_memberships set must_change_pin = false;
  select business_id into biz from public.branches where id = b;
  select timezone into tz from public.businesses where id = biz;
  t0 := now() - interval '1 second';

  -- 0 las funciones de dinero no cambiaron (huella del cuerpo vigente antes de esta migración)
  r := r || E'\n0 ' || case when md5(pg_get_functiondef('private.confirm_sale_impl'::regproc)) = '7ba5b5e43bcf8ec2f3aaaad69c9a386b'
      and md5(pg_get_functiondef('private.generate_sale_commissions_impl'::regproc)) = 'cbaba71a6ac7eddaaf5e2c09148d52f2'
      and md5(pg_get_functiondef('private.confirm_sale_with_approval_impl'::regproc)) = '18cda0db3486f1d82dedb7453d2e3b13'
      then 'OK' else 'FALLA' end || ' confirm_sale_impl, confirm_sale_with_approval_impl y generate_sale_commissions_impl sin cambios';

  if not exists (select 1 from public.cash_sessions where branch_id = b and status = 'open') then
    perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
    perform public.open_cash_session(b, coalesce((select float_left from public.cash_sessions where branch_id = b and status = 'closed' order by closed_at desc limit 1),
      (select cash_float_target from public.branches where id = b)), 'Prueba de productos en la cita');
  end if;
  select s.id, s.price into svc, price from public.services s where s.business_id = biz and s.is_active and not s.variable_price and s.price > 0 order by s.name limit 1;
  insert into public.products (business_id, name, sale_price, cost_price, tracks_inventory, is_active)
  values (biz, 'Prueba cera cita', 150, 60, true, true) returning id into prod;
  insert into public.products (business_id, name, sale_price, tracks_inventory, is_active)
  values (biz, 'Prueba producto inactivo', 99, true, false) returning id into prod_off;
  insert into public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity) values (biz, b, prod, 10, 0);
  slot := date_trunc('hour', now());
  insert into public.appointments (business_id, branch_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
  values (biz, b, dani_emp, 'Prueba Productos', slot, slot + interval '30 minutes', 'checked_in', 'walk_in') returning id into a1;

  -- 1 el barbero agrega en su cita: el vendedor es él, capturó él
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  v := public.add_appointment_product(a1, prod, 1);
  l1 := (v ->> 'id')::uuid;
  r := r || E'\n1 ' || case when (v ->> 'seller_employee_id')::uuid = dani_emp and (v ->> 'added_by')::uuid = dani and (v ->> 'quantity')::int = 1
      and v ->> 'seller_name' = 'Dani' and (v ->> 'stock')::numeric = 10 and (v ->> 'unit_price')::numeric = 150 and not v ? 'cost_price'
      then 'OK' else 'FALLA' end || ' barbero agrega en su cita -> ' || v::text;
  -- 2 el barbero no puede apuntarla a otro
  begin
    perform public.add_appointment_product(a1, prod, 1, emi_emp);
    r := r || E'\n2 FALLA el barbero apuntó la venta a otro';
  exception when others then r := r || E'\n2 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero no elige otro vendedor [' || sqlstate || ']'; end;
  begin
    perform public.set_appointment_product_seller(l1, emi_emp);
    r := r || E'\n3 FALLA el barbero cambió el vendedor';
  exception when others then r := r || E'\n3 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero no cambia el vendedor [' || sqlstate || ']'; end;

  -- 4 otro barbero y consulta no agregan
  for sid, k in select * from (values (deya, 'otro barbero'), (lucia, 'consulta')) x(u, e) loop
    perform set_config('request.jwt.claims', json_build_object('sub', sid, 'role', 'authenticated')::text, true);
    begin
      perform public.add_appointment_product(a1, prod, 1);
      r := r || E'\n4 FALLA ' || k || ' agregó';
    exception when others then r := r || E'\n4 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' ' || k || ' no agrega [' || sqlstate || ']'; end;
  end loop;

  -- 5 recepción agrega sin elegir: el vendedor por omisión es el barbero de la cita (se junta con su línea)
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  v := public.add_appointment_product(a1, prod, 1);
  r := r || E'\n5 ' || case when (v ->> 'id')::uuid = l1 and (v ->> 'seller_employee_id')::uuid = dani_emp and (v ->> 'quantity')::int = 2
      then 'OK' else 'FALLA' end || ' recepción sin elegir -> vendedor = barbero de la cita, cantidad ' || (v ->> 'quantity');
  -- 6 recepción se la apunta a sí misma: línea aparte, capturó y vendió Emi
  v := public.add_appointment_product(a1, prod, 2, emi_emp);
  l2 := (v ->> 'id')::uuid;
  r := r || E'\n6 ' || case when l2 <> l1 and (v ->> 'seller_employee_id')::uuid = emi_emp and (v ->> 'added_by')::uuid = emi and v ->> 'seller_name' = 'Emi'
      then 'OK' else 'FALLA' end || ' recepción se apunta la venta (línea aparte)';
  -- 7 cambiar vendedor: a alguien que ya tiene línea del mismo producto -> conflicto; a Dago -> bien, con bitácora
  begin
    perform public.set_appointment_product_seller(l2, dani_emp);
    r := r || E'\n7 FALLA juntó dos líneas al cambiar el vendedor';
  exception when others then r := r || E'\n7 ' || case when sqlstate = '23505' then 'OK' else 'FALLA' end || ' cambio a un vendedor con línea igual rechazado [' || sqlstate || ']'; end;
  v := public.set_appointment_product_seller(l1, dago_emp);
  select count(*) into n from public.audit_log where entity_id = l1::text and action = 'appointment_product_seller_changed'
    and (before_data ->> 'seller_employee_id')::uuid = dani_emp and (after_data ->> 'seller_employee_id')::uuid = dago_emp
    and (after_data ->> 'changed_by')::uuid = emi and (after_data ->> 'added_by')::uuid = dani;
  r := r || E'\n8 ' || case when (v ->> 'seller_employee_id')::uuid = dago_emp and n = 1 then 'OK' else 'FALLA' end || ' cambio de vendedor con bitácora (antes, después, quién)';
  v := public.set_appointment_product_seller(l1, dani_emp);

  -- 9 vendedor inválido, producto inactivo o de otro negocio, cantidades fuera de rango
  begin perform public.add_appointment_product(a1, prod, 1, gen_random_uuid()); r := r || E'\n9 FALLA vendedor inexistente';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '23503' then 'OK' else 'FALLA' end || ' vendedor inexistente [' || sqlstate || ']'; end;
  update public.employees set is_active = false where id = dago_emp;
  begin perform public.add_appointment_product(a1, prod, 1, dago_emp); r := r || E'\n9 FALLA vendedor inactivo';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '23503' then 'OK' else 'FALLA' end || ' vendedor inactivo [' || sqlstate || ']'; end;
  update public.employees set is_active = true where id = dago_emp;
  begin perform public.add_appointment_product(a1, prod_off, 1); r := r || E'\n9 FALLA producto inactivo';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '23503' then 'OK' else 'FALLA' end || ' producto inactivo [' || sqlstate || ']'; end;
  begin perform public.add_appointment_product(a1, gen_random_uuid(), 1); r := r || E'\n9 FALLA producto ajeno';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '23503' then 'OK' else 'FALLA' end || ' producto inexistente [' || sqlstate || ']'; end;
  begin perform public.add_appointment_product(a1, prod, 0); r := r || E'\n9 FALLA cantidad 0';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' cantidad 0 [' || sqlstate || ']'; end;
  begin perform public.add_appointment_product(a1, prod, 49); r := r || E'\n9 FALLA línea de más de 50';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' línea de más de 50 [' || sqlstate || ']'; end;

  -- 10 agregar no mueve inventario
  select quantity_on_hand into stock from public.branch_inventory where product_id = prod and branch_id = b;
  select count(*) into n from public.inventory_movements where product_id = prod;
  r := r || E'\n10 ' || case when stock = 10 and n = 0 then 'OK' else 'FALLA' end || ' agregar no descuenta inventario (' || stock || ', movimientos ' || n || ')';

  -- 11 lectura: recepción ve barbero y su propio nombre (para "Deya" / "Dago"); el barbero no se ve a sí mismo dos veces
  v := public.appointment_products_read(b, array[a1]) -> a1::text;
  r := r || E'\n11 ' || case when jsonb_array_length(v -> 'lines') = 2 and v -> 'barber' ->> 'name' = 'Dani' and v -> 'session_employee' ->> 'name' = 'Emi'
      and (v -> 'session_employee' ->> 'id')::uuid = emi_emp and (v ->> 'can_choose_seller')::boolean and (v ->> 'can_edit')::boolean and (v ->> 'open')::boolean
      then 'OK' else 'FALLA' end || ' lectura de recepción -> ' || (v - 'lines')::text;
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  v := public.appointment_products_read(b, array[a1]) -> a1::text;
  r := r || E'\n12 ' || case when v -> 'session_employee' = 'null'::jsonb and not (v ->> 'can_choose_seller')::boolean and (v ->> 'can_edit')::boolean
      then 'OK' else 'FALLA' end || ' lectura del barbero (sin elegir vendedor)';
  perform set_config('request.jwt.claims', json_build_object('sub', deya, 'role', 'authenticated')::text, true);
  v := public.appointment_products_read(b, array[a1]) -> a1::text;
  r := r || E'\n13 ' || case when not (v ->> 'can_edit')::boolean and jsonb_array_length(v -> 'lines') = 2 then 'OK' else 'FALLA' end || ' otro barbero lee pero no edita';
  begin perform public.product_seller_options(b); r := r || E'\n14 FALLA un barbero pidió la lista de vendedores';
  exception when others then r := r || E'\n14 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' lista de vendedores solo para recepción/gerencia [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', sonia, 'role', 'authenticated')::text, true);
  v := public.product_seller_options(b);
  select count(*) into n from jsonb_array_elements(v) x where (x ->> 'id')::uuid in (dani_emp, emi_emp, dago_emp);
  r := r || E'\n15 ' || case when n = 3 then 'OK' else 'FALLA' end || ' gerencia ve empleados activos como vendedores (' || jsonb_array_length(v) || ')';

  -- 16 quitar: el barbero no quita la línea de Emi; recepción quita 1 pieza y luego la línea (nada se borra)
  perform set_config('request.jwt.claims', json_build_object('sub', dani, 'role', 'authenticated')::text, true);
  begin perform public.remove_appointment_product(l2); r := r || E'\n16 FALLA el barbero quitó la línea de otro vendedor';
  exception when others then r := r || E'\n16 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero no quita la venta de otro [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  v := public.remove_appointment_product(l1, 1);
  r := r || E'\n17 ' || case when (v ->> 'quantity')::int = 1 and v ->> 'removed_at' is null then 'OK' else 'FALLA' end || ' quitar 1 pieza';
  v := public.remove_appointment_product(l1);
  select count(*) into n from public.appointment_products where id = l1 and removed_at is not null and removed_by = emi;
  r := r || E'\n18 ' || case when n = 1 then 'OK' else 'FALLA' end || ' quitar la línea la marca (no la borra)';
  select count(*) into n from public.audit_log where entity_type = 'appointment_product' and created_at >= t0
    and action in ('appointment_product_added', 'appointment_product_quantity_changed', 'appointment_product_removed', 'appointment_product_seller_changed');
  r := r || E'\n19 ' || case when n = 7 then 'OK' else 'FALLA' end || ' bitácora de capturas, cantidades, vendedor y quitas (' || n || ')';

  -- Cobro de la cita: servicio de Dani + 2 piezas vendidas por Emi (lo que precarga el cobro).
  wk := (now() at time zone tz)::date - extract(dow from (now() at time zone tz))::int;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  pre_dani := (public.preview_commission_settlement(b, dani_emp, wk, wk + 6) ->> 'gross_commission')::numeric;
  pre_emi := (public.preview_commission_settlement(b, emi_emp, wk, wk + 6) ->> 'gross_commission')::numeric;
  items := jsonb_build_array(
    jsonb_build_object('item_type', 'service', 'catalog_id', svc, 'employee_id', dani_emp, 'quantity', 1),
    jsonb_build_object('item_type', 'product', 'catalog_id', prod, 'quantity', 2, 'commission_employee_ids', jsonb_build_array(emi_emp)));
  pays := jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', price + 300));

  -- 20 variante Y (para comparar Finanzas): el mismo cobro con el producto apuntado a Dani; se deshace
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
    perform public.confirm_sale(b, 'prueba-prod-y-' || gen_random_uuid(),
      jsonb_set(items, '{1,commission_employee_ids}', jsonb_build_array(dani_emp)), pays, null, null, null, '[]'::jsonb, null, a1);
    kpi_y := private.profit_kpis(biz, b, date_trunc('day', now()) - interval '1 day', now() + interval '1 hour');
    raise exception '__deshacer__';
  exception when others then if sqlerrm <> '__deshacer__' then r := r || E'\n20 FALLA [' || sqlstate || '] ' || sqlerrm; end if; end;

  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  v := public.confirm_sale(b, 'prueba-prod-x-' || gen_random_uuid(), items, pays, null, null, null, '[]'::jsonb, null, a1);
  sale := (v ->> 'sale_id')::uuid;
  kpi_x := private.profit_kpis(biz, b, date_trunc('day', now()) - interval '1 day', now() + interval '1 hour');
  select quantity_on_hand into stock from public.branch_inventory where product_id = prod and branch_id = b;
  select count(*) into n from public.inventory_movements where product_id = prod and reference = sale::text and quantity_delta = -2;
  r := r || E'\n21 ' || case when stock = 8 and n = 1 and (select count(*) from public.inventory_movements where product_id = prod) = 1
      then 'OK' else 'FALLA' end || ' inventario descontado UNA vez al cobrar (' || stock || ')';
  select ce.commission_amount into c_svc from public.commission_entries ce join public.sale_items si on si.id = ce.sale_item_id
   where ce.sale_id = sale and si.item_type = 'service' and ce.employee_id = dani_emp and ce.status = 'generated';
  select ce.commission_amount into c_prod from public.commission_entries ce join public.sale_items si on si.id = ce.sale_item_id
   where ce.sale_id = sale and si.item_type = 'product' and ce.employee_id = emi_emp and ce.status = 'generated';
  select count(*) into n from public.commission_entries where sale_id = sale;
  r := r || E'\n22 ' || case when c_svc > 0 and c_prod = round(300 * (select product_commission_pct from public.businesses where id = biz) / 100, 2) and n = 2
      and not exists (select 1 from public.commission_holds where sale_id = sale)
      then 'OK' else 'FALLA' end || ' comisión de servicio a Dani (' || c_svc || ') y de producto a Emi (' || c_prod || ' = 20 % de 300), sin duplicar';
  select count(*) into n from public.appointments where id = a1 and status = 'completed';
  r := r || E'\n23 ' || case when n = 1 and (select appointment_id from public.sales where id = sale) = a1 and v ->> 'appointment_link' = 'explicit'
      then 'OK' else 'FALLA' end || ' la cita queda completada y ligada';
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  post_dani := (public.preview_commission_settlement(b, dani_emp, wk, wk + 6) ->> 'gross_commission')::numeric;
  post_emi := (public.preview_commission_settlement(b, emi_emp, wk, wk + 6) ->> 'gross_commission')::numeric;
  r := r || E'\n24 ' || case when post_dani - pre_dani = c_svc and post_emi - pre_emi = c_prod then 'OK' else 'FALLA' end
      || ' pago semanal: Dani +' || (post_dani - pre_dani) || ', Emi +' || (post_emi - pre_emi);
  r := r || E'\n25 ' || case when kpi_x ->> 'revenue' = kpi_y ->> 'revenue' and kpi_x ->> 'commissions' = kpi_y ->> 'commissions'
      and kpi_x ->> 'net' = kpi_y ->> 'net' and kpi_x ->> 'product_cost' = kpi_y ->> 'product_cost' then 'OK' else 'FALLA' end
      || ' Finanzas igual si el producto lo vende Emi o Dani (ingreso ' || (kpi_x ->> 'revenue') || ', comisiones ' || (kpi_x ->> 'commissions') || ', utilidad ' || (kpi_x ->> 'net') || ')';

  -- 26 las líneas quedan como historial y ya no se cambian
  select count(*) into n from public.appointment_products where appointment_id = a1 and removed_at is null;
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  begin perform public.add_appointment_product(a1, prod, 1); r := r || E'\n26 FALLA agregó a una cita cobrada';
  exception when others then r := r || E'\n26 ' || case when sqlstate = '55000' and n = 1 then 'OK' else 'FALLA' end || ' cita cobrada: líneas como historial (' || n || '), sin cambios [' || sqlstate || ']'; end;
  v := public.appointment_products_read(b, array[a1]) -> a1::text;
  r := r || E'\n27 ' || case when not (v ->> 'open')::boolean and jsonb_array_length(v -> 'lines') = 1 then 'OK' else 'FALLA' end || ' lectura: cita cerrada, historial visible';

  -- 28 Cuadre: la cita cobrada con producto no genera diferencias
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  v := public.agenda_reconciliation(b, (now() at time zone tz)::date, (now() at time zone tz)::date);
  select count(*) into n from jsonb_array_elements(v -> 'issues') i where i ->> 'appointment_id' = a1::text or i ->> 'sale_id' = sale::text;
  r := r || E'\n28 ' || case when n = 0 then 'OK' else 'FALLA' end || ' Cuadre sin diferencias por la cita con producto (' || n || ')';

  -- 29 anulación con PIN: revierte ambas comisiones y regresa el inventario
  sid := gen_random_uuid();
  insert into auth.sessions (id, user_id, created_at, updated_at) values (sid, owner, now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated', 'session_id', sid)::text, true);
  perform public.reverse_sale_confirmed(sale, 'Prueba de anulación con producto');
  select count(*) into n from public.commission_entries where sale_id = sale and status = 'reversed';
  select quantity_on_hand into stock from public.branch_inventory where product_id = prod and branch_id = b;
  r := r || E'\n29 ' || case when n = 2 and not exists (select 1 from public.commission_entries where sale_id = sale and status = 'generated')
      then 'OK' else 'FALLA' end || ' anulación revierte las 2 comisiones (' || n || '); inventario después: ' || stock;

  -- 30 el cobro quitó el producto antes de confirmar: solo servicio -> sin movimiento ni comisión de producto
  insert into public.appointments (business_id, branch_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
  values (biz, b, dani_emp, 'Prueba Productos Dos', slot, slot + interval '30 minutes', 'checked_in', 'walk_in') returning id into a2;
  perform set_config('request.jwt.claims', json_build_object('sub', emi, 'role', 'authenticated')::text, true);
  perform public.add_appointment_product(a2, prod, 1);
  select count(*) into k from public.inventory_movements where product_id = prod;
  v := public.confirm_sale(b, 'prueba-prod-z-' || gen_random_uuid(), jsonb_build_array(items -> 0),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', price)), null, null, null, '[]'::jsonb, null, a2);
  select count(*) into n from public.inventory_movements where product_id = prod;
  r := r || E'\n30 ' || case when n::text = k and not exists (select 1 from public.sale_items where sale_id = (v ->> 'sale_id')::uuid and item_type = 'product')
      then 'OK' else 'FALLA' end || ' producto quitado en el cobro: sin inventario ni comisión de producto';

  -- 31 venta normal sin cita ni vendedor explícito: igual que antes (producto sin beneficiario queda en espera)
  v := public.confirm_sale(b, 'prueba-prod-n-' || gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('item_type', 'product', 'catalog_id', prod, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 150)));
  select count(*) into n from public.commission_holds where sale_id = (v ->> 'sale_id')::uuid and reason = 'beneficiary_missing';
  r := r || E'\n31 ' || case when n = 1 and not exists (select 1 from public.commission_entries where sale_id = (v ->> 'sale_id')::uuid)
      then 'OK' else 'FALLA' end || ' venta sin vendedor: comisión en espera, como antes';

  -- 32 cita cancelada: sus líneas quedan, sin efecto, y ya no se cambian
  insert into public.appointments (business_id, branch_id, assigned_employee_id, customer_name, scheduled_start_at, scheduled_end_at, status, source)
  values (biz, b, dani_emp, 'Prueba Productos Tres', slot + interval '1 day', slot + interval '1 day 30 minutes', 'scheduled', 'walk_in') returning id into a2;
  perform public.add_appointment_product(a2, prod, 1);
  perform public.change_appointment_status(a2, 'cancelled', 'Prueba: el cliente canceló');
  begin perform public.add_appointment_product(a2, prod, 1); r := r || E'\n32 FALLA agregó a una cita cancelada';
  exception when others then r := r || E'\n32 ' || case when sqlstate = '55000' and (select count(*) from public.appointment_products where appointment_id = a2 and removed_at is null) = 1
      then 'OK' else 'FALLA' end || ' cita cancelada: línea como historial, sin cambios [' || sqlstate || ']'; end;

  -- 33 nadie escribe directo en la tabla; permisos de ejecución
  begin
    execute 'set local role authenticated';
    update public.appointment_products set quantity = 5 where appointment_id = a1;
    execute 'reset role';
    r := r || E'\n33 FALLA UPDATE directo';
  exception when others then execute 'reset role'; r := r || E'\n33 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' UPDATE directo rechazado [' || sqlstate || ']'; end;
  r := r || E'\n34 ' || case when not has_function_privilege('anon', 'public.add_appointment_product(uuid,uuid,integer,uuid)', 'execute')
      and not has_function_privilege('anon', 'public.appointment_products_read(uuid,uuid[])', 'execute')
      and not has_table_privilege('authenticated', 'public.appointment_products', 'insert')
      and not has_function_privilege('authenticated', 'private.appointment_products_guard(uuid)', 'execute') then 'OK' else 'FALLA' end || ' permisos';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
