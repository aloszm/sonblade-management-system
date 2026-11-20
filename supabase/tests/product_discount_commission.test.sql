-- Pruebas de 20261120110000_product_commission_list_price.sql: con descuento, la comisión de PRODUCTO se calcula sobre el
-- precio de lista (como la de servicio). Simulacro: begin; <migración>; <este archivo>; rollback; — el DO termina con RAISE.
-- Arma su propio estado: un servicio de $200 y un producto de $180 (costo $45) de prueba, tasas 50 % / 20 %, puestos
-- y caja abierta. Cobra con public.confirm_sale como el dueño (que puede autorizar su propio descuento).
-- Para Finanzas y el pago semanal, las ventas se mueven a semanas lejanas (marzo de 2032, sin datos) dentro del simulacro.
create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $$;
-- Cobra como el dueño y devuelve la venta. items: [{tipo, id, precio de lista, descuento, empleado}]
create or replace function pg_temp.sell(b uuid, items jsonb, total numeric, reason text) returns uuid language plpgsql as $$
declare v jsonb;
begin
  v := public.confirm_sale(p_branch_id => b, p_idempotency_key => 'prueba-desc-prod-' || gen_random_uuid(), p_items => items,
    p_payments => jsonb_build_array(jsonb_build_object('method', 'card', 'amount', total)), p_discount_reason => reason);
  return (v ->> 'sale_id')::uuid;
end $$;
create or replace function pg_temp.comm(s uuid, t text) returns text language sql as $$
  select string_agg(ce.commission_amount::text || '/' || ce.basis_amount::text || '/' || ce.basis::text || '/' || ce.status::text, ' ' order by ce.id)
  from public.commission_entries ce join public.sale_items si on si.id = ce.sale_item_id
  where ce.sale_id = s and si.item_type::text = t $$;

do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  biz uuid := 'e9ee2431-110b-4105-96bc-63f362c84c09';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';   -- barbero (servicio)
  dago_e uuid := '67db0358-6563-4879-a9c6-340420ad846d';   -- vendió el producto
  tz text; svc uuid; prod uuid;
  sa uuid; sb uuid; sc uuid; sd uuid; se uuid; si_ uuid; so uuid; oi uuid := gen_random_uuid();
  t1 timestamptz; t2 timestamptz; w1s timestamptz; w1e timestamptz; w2s timestamptz; w2e timestamptz;
  fin1 jsonb; fin2 jsonb; m jsonb; fr jsonb; br jsonb; pv jsonb; v jsonb; n int; x text;
  p_item jsonb; s_item jsonb;
begin
  update public.business_memberships set must_change_pin = false;
  update public.business_memberships set role = 'owner' where business_id = biz and user_id = owner;
  update public.businesses set service_commission_pct = 50, product_commission_pct = 20 where id = biz;
  select timezone into tz from public.businesses where id = biz;
  insert into public.services (business_id, name, price, duration_minutes, is_active) values (biz, 'Prueba corte descuento', 200, 30, true) returning id into svc;
  insert into public.products (business_id, name, sku, sale_price, cost_price, tracks_inventory, is_active)
  values (biz, 'Prueba pomada descuento', 'PRUEBA-DESC-1', 180, 45, true, true) returning id into prod;
  insert into public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity) values (biz, b, prod, 50, 0);

  perform pg_temp.as_user(owner);
  if not exists (select 1 from public.cash_sessions where branch_id = b and status = 'open') then
    perform public.open_cash_session(b, coalesce((select float_left from public.cash_sessions where branch_id = b and status = 'closed' order by closed_at desc limit 1),
      (select cash_float_target from public.branches where id = b)));
  end if;
  p_item := jsonb_build_object('item_type', 'product', 'catalog_id', prod, 'quantity', 1, 'commission_employee_ids', jsonb_build_array(dago_e));
  s_item := jsonb_build_object('item_type', 'service', 'catalog_id', svc, 'quantity', 1, 'employee_id', dani_e);

  -- (a) sin descuento: idéntica a hoy (producto 20 % de 180 = 36; servicio 50 % de 200 = 100)
  sa := pg_temp.sell(b, jsonb_build_array(p_item, s_item), 380, null);
  x := pg_temp.comm(sa, 'product') || ' | ' || pg_temp.comm(sa, 'service');
  r := r || E'\n1 ' || case when x = '36.00/180.00/price_before_discount/generated | 100.00/200.00/price_before_discount/generated' then 'OK' else 'FALLA' end
    || ' (a) sin descuento: ' || x;

  -- (b) producto de $180 con $30 de descuento: 20 % sobre 180 = 36 (antes: 20 % de 150 = 30)
  sb := pg_temp.sell(b, jsonb_build_array(p_item || jsonb_build_object('discount_amount', 30)), 150, 'Cliente frecuente');
  x := pg_temp.comm(sb, 'product');
  r := r || E'\n2 ' || case when x = '36.00/180.00/price_before_discount/generated'
      and (select line_total from public.sale_items where sale_id = sb) = 150 then 'OK' else 'FALLA' end || ' (b) producto con descuento: ' || x;

  -- (c) servicio con descuento: sin cambio (50 % de 200 = 100)
  sc := pg_temp.sell(b, jsonb_build_array(s_item || jsonb_build_object('discount_amount', 50)), 150, 'Promoción');
  x := pg_temp.comm(sc, 'service');
  r := r || E'\n3 ' || case when x = '100.00/200.00/price_before_discount/generated' then 'OK' else 'FALLA' end || ' (c) servicio con descuento: ' || x;

  -- (d) venta mixta con $60 de descuento repartido (40 al servicio, 20 al producto): 100 + 36
  sd := pg_temp.sell(b, jsonb_build_array(s_item || jsonb_build_object('discount_amount', 40), p_item || jsonb_build_object('discount_amount', 20)), 320, 'Paquete');
  x := pg_temp.comm(sd, 'product') || ' | ' || pg_temp.comm(sd, 'service');
  r := r || E'\n4 ' || case when x = '36.00/180.00/price_before_discount/generated | 100.00/200.00/price_before_discount/generated'
      and (select total_amount from public.sales where id = sd) = 320 then 'OK' else 'FALLA' end || ' (d) mixta: ' || x;

  -- (i) descuento del 100 % en el producto (cortesía) junto con un servicio: comisión sobre lista (36), renglón en $0
  si_ := pg_temp.sell(b, jsonb_build_array(s_item, p_item || jsonb_build_object('discount_amount', 180)), 200, 'Cortesía');
  x := pg_temp.comm(si_, 'product');
  r := r || E'\n5 ' || case when x = '36.00/180.00/price_before_discount/generated'
      and (select line_total from public.sale_items where sale_id = si_ and item_type = 'product') = 0 then 'OK' else 'FALLA' end || ' (i1) cortesía: ' || x;
  -- una venta SOLO con el producto en cortesía no se puede cobrar (total $0): regla anterior, sin cambio
  begin
    perform pg_temp.sell(b, jsonb_build_array(p_item || jsonb_build_object('discount_amount', 180)), 0.01, 'Cortesía');
    r := r || E'\n6 FALLA (i2) se cobró una venta de $0';
  exception when others then r := r || E'\n6 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' (i2) venta de $0 rechazada como antes: ' || sqlerrm; end;

  -- (e) anular una venta nueva revierte lo generado (36 al vendedor)
  v := public.reverse_sale(sb, 'Prueba de anulación');
  x := pg_temp.comm(sb, 'product');
  r := r || E'\n7 ' || case when x = '36.00/180.00/price_before_discount/reversed' then 'OK' else 'FALLA' end || ' (e) anulación nueva: ' || x;

  -- (f) comisión de producto generada ANTES de la migración (estado previo: base con descuento, $30)
  so := gen_random_uuid();
  insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, folio, discount_reason, discount_authorized_by)
  values (so, biz, b, 'paid', 180, 30, 150, owner, now(), 'V9999-0110', 'Cliente frecuente', owner);
  insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, product_id, commission_employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, unit_cost_snapshot)
  values (oi, biz, b, so, 'product', prod, dago_e, 'Prueba pomada descuento', 1, 180, 30, 150, 45);
  insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, calculation_type, basis, basis_amount, percentage_snapshot, commission_amount, rule_snapshot)
  values (biz, b, so, oi, dago_e, 'percentage', 'price_after_discount', 150, 20, 30,
          jsonb_build_object('source', 'business_default', 'basis', 'price_after_discount', 'percentage', 20));
  perform private.generate_sale_commissions_impl(so);   -- volver a generar no la recalcula
  x := pg_temp.comm(so, 'product');
  r := r || E'\n8 ' || case when x = '30.00/150.00/price_after_discount/generated' then 'OK' else 'FALLA' end || ' (f1) comisión vieja intacta: ' || x;

  -- (g) Finanzas: la venta nueva (b) en la semana W1 y la vieja en W2, con los mismos números. Se usan sb2 = copia de (b) sin anular.
  sb := pg_temp.sell(b, jsonb_build_array(p_item || jsonb_build_object('discount_amount', 30)), 150, 'Cliente frecuente');
  t1 := ('2032-03-10 13:00')::timestamp at time zone tz;  w1s := ('2032-03-07')::timestamp at time zone tz;  w1e := ('2032-03-14')::timestamp at time zone tz;
  t2 := ('2032-03-17 13:00')::timestamp at time zone tz;  w2s := ('2032-03-14')::timestamp at time zone tz;  w2e := ('2032-03-21')::timestamp at time zone tz;
  update public.sales set paid_at = t1, created_at = t1 where id = sb;
  update public.commission_entries set generated_at = t1 where sale_id = sb;
  update public.sales set paid_at = t2, created_at = t2 where id = so;
  update public.commission_entries set generated_at = t2 where sale_id = so;
  fin1 := private.report_financial_period(biz, b, w1s, w1e, false);
  fin2 := private.report_financial_period(biz, b, w2s, w2e, false);
  m := public.business_metrics(b, '2032-03-07', '2032-03-13', null);
  fr := public.business_full_report(b, '2032-03-07', '2032-03-13', 'interno');
  br := public.business_report(b, 'week', null, w1s, w1e);
  r := r || E'\n9 ' || case when (fin1 ->> 'profit')::numeric = 69 and (fin2 ->> 'profit')::numeric = 75 then 'OK' else 'FALLA' end
    || ' (g1) Finanzas: nueva 150 − 36 − 45 = ' || (fin1 ->> 'profit') || '; vieja 150 − 30 − 45 = ' || (fin2 ->> 'profit') || ' (diferencia 6 = 36 − 30)';
  r := r || E'\n10 ' || case when (m -> 'kpis' ->> 'net')::numeric = 69 and (fr -> 'summary' -> 'kpis' ->> 'net')::numeric = 69
      and (fr -> 'financial' -> 'current' ->> 'profit')::numeric = 69 and (br -> 'kpis' -> 'profit' ->> 'net')::numeric = 69 then 'OK' else 'FALLA' end
    || ' (g2) Panel = reporte completo = business_report = Finanzas: ' || coalesce(m -> 'kpis' ->> 'net', 'null') || ' / ' || coalesce(fr -> 'summary' -> 'kpis' ->> 'net', 'null')
    || ' / ' || coalesce(br -> 'kpis' -> 'profit' ->> 'net', 'null');

  -- (h) pago semanal del vendedor (Dago): W1 refleja 36 y W2 conserva 30
  pv := public.preview_commission_settlement(b, dago_e, '2032-03-07', '2032-03-13');
  v := public.preview_commission_settlement(b, dago_e, '2032-03-14', '2032-03-20');
  r := r || E'\n11 ' || case when (pv ->> 'gross_commission')::numeric = 36 and (v ->> 'gross_commission')::numeric = 30 then 'OK' else 'FALLA' end
    || ' (h) pago semanal: W1 ' || (pv ->> 'gross_commission') || ', W2 ' || (v ->> 'gross_commission');

  -- (f2) anular la venta vieja revierte el monto viejo (30), no el de la regla nueva
  v := public.reverse_sale(so, 'Prueba de anulación de venta vieja');
  x := pg_temp.comm(so, 'product');
  r := r || E'\n12 ' || case when x = '30.00/150.00/price_after_discount/reversed' then 'OK' else 'FALLA' end || ' (f2) anulación vieja: ' || x;

  -- la regla vive en un solo lugar y no se puede llamar desde la API
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'private' and routine_name = 'commission_default_basis' and grantee in ('anon', 'authenticated', 'PUBLIC');
  r := r || E'\n13 ' || case when n = 0 and private.commission_default_basis('product') = 'price_before_discount'
      and private.commission_default_basis('service') = 'price_before_discount' then 'OK' else 'FALLA' end || ' (z) base por omisión en un solo lugar, sin permiso para la API';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
