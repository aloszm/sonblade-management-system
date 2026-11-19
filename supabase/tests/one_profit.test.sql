-- Pruebas de B4 "Una sola utilidad" (20261119210000_one_profit.sql).
-- Arma datos mínimos en una semana lejana (marzo de 2031, sin datos reales) y compara la utilidad del Panel
-- (business_metrics), del reporte completo (business_full_report) y del resumen de administración
-- (business_report → kpis.profit) con la de Finanzas (private.report_financial_period).
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda.
--
-- Datos: venta pagada = corte $300 (Dani, comisión $150) + 2 ceras a $100 (costo guardado $40 c/u,
-- vendió Dago, comisión $40) + propina $50 a Dani. Venta anulada de $500 (no cuenta).
-- Gasto A $120 hecho (incurred_at) en el periodo pero capturado después; gasto B $999 capturado en el
-- periodo pero hecho fuera; gasto C $70 cancelado. Esperado: ingresos 500, comisiones 190, costo 80,
-- gastos 120, utilidad 110. Aporte de Dani: 300 − 150 = 150 (sin gastos generales).
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  dago_e uuid := '67db0358-6563-4879-a9c6-340420ad846d';
  biz uuid; tz text; s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid();
  i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); i3 uuid := gen_random_uuid();
  t0 timestamptz; v_start timestamptz; v_end timestamptz;
  svc uuid; prod uuid; m jsonb; md jsonb; fr jsonb; br jsonb; fin jsonb; n int;
begin
  update public.business_memberships set must_change_pin = false;
  select b2.business_id, bs.timezone into biz, tz from public.branches b2 join public.businesses bs on bs.id = b2.business_id where b2.id = b;
  select id into svc from public.services where business_id = biz order by name limit 1;
  select id into prod from public.products where business_id = biz order by name limit 1;
  t0 := ('2031-03-05 13:00')::timestamp at time zone tz;
  v_start := ('2031-03-02')::timestamp at time zone tz;
  v_end := ('2031-03-09')::timestamp at time zone tz;

  insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, created_at, folio)
  values (s1, biz, b, 'paid', 500, 0, 500, owner, t0, t0, 'V3103-9901'),
         (s2, biz, b, 'refunded', 500, 0, 500, owner, t0, t0, 'V3103-9902');
  insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, service_id, product_id, employee_id, commission_employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, unit_cost_snapshot)
  values (i1, biz, b, s1, 'service', svc, null, dani_e, null, 'Corte prueba', 1, 300, 0, 300, null),
         (i2, biz, b, s1, 'product', null, prod, null, dago_e, 'Cera prueba', 2, 100, 0, 200, 40),
         (i3, biz, b, s2, 'service', svc, null, dani_e, null, 'Corte anulado', 1, 500, 0, 500, null);
  insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, calculation_type, basis, basis_amount, percentage_snapshot, commission_amount, status, generated_at, reversed_at, reversal_reason)
  values (biz, b, s1, i1, dani_e, 'percentage', 'price_after_discount', 300, 50, 150, 'generated', t0, null, null),
         (biz, b, s1, i2, dago_e, 'percentage', 'price_after_discount', 200, 20, 40, 'generated', t0, null, null),
         (biz, b, s2, i3, dani_e, 'percentage', 'price_after_discount', 500, 50, 250, 'reversed', t0, t0, 'Venta anulada de prueba');
  insert into public.sale_tips (business_id, branch_id, sale_id, employee_id, amount, method, status, created_by, created_at)
  values (biz, b, s1, dani_e, 50, 'cash', 'generated', owner, t0);
  insert into public.expenses (business_id, branch_id, status, category, description, amount, method, incurred_at, created_by, created_at)
  values (biz, b, 'posted', 'Prueba', 'Gasto A hecho en el periodo', 120, 'cash', t0, owner, t0 + interval '30 days'),
         (biz, b, 'posted', 'Prueba', 'Gasto B hecho fuera del periodo', 999, 'cash', t0 - interval '30 days', owner, t0),
         (biz, b, 'cancelled', 'Prueba', 'Gasto C cancelado', 70, 'cash', t0, owner, t0);

  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  fin := private.report_financial_period(biz, b, v_start, v_end, false);
  m := public.business_metrics(b, '2031-03-02', '2031-03-08', null);
  md := public.business_metrics(b, '2031-03-02', '2031-03-08', dani_e);
  fr := public.business_full_report(b, '2031-03-02', '2031-03-08', 'interno');
  br := public.business_report(b, 'week', null, v_start, v_end);

  r := r || E'\n1 ' || case when (fin ->> 'profit')::numeric = 110 then 'OK' else 'FALLA' end || ' Finanzas: utilidad 110 = ' || (fin ->> 'profit');
  r := r || E'\n2 ' || case when (m -> 'kpis' ->> 'net')::numeric = 110 and m -> 'kpis' ->> 'net_kind' = 'profit' then 'OK' else 'FALLA' end
         || ' Panel sin filtro: net = ' || (m -> 'kpis' ->> 'net');
  r := r || E'\n3 ' || case when (m -> 'kpis' ->> 'product_cost')::numeric = 80 and (m -> 'kpis' ->> 'expenses')::numeric = 120
                              and (m -> 'kpis' ->> 'commissions')::numeric = 190 and (m -> 'kpis' ->> 'revenue')::numeric = 500 then 'OK' else 'FALLA' end
         || ' Panel: ingresos 500, comisiones 190, costo 80, gastos 120 (incurred_at) ' || (m -> 'kpis')::text;
  r := r || E'\n4 ' || case when (fr -> 'summary' -> 'kpis' ->> 'net')::numeric = (fr -> 'financial' -> 'current' ->> 'profit')::numeric
                              and (fr -> 'summary' -> 'kpis' ->> 'net')::numeric = 110 then 'OK' else 'FALLA' end
         || ' Reporte completo: resumen = financiero = ' || (fr -> 'summary' -> 'kpis' ->> 'net');
  r := r || E'\n5 ' || case when (fr -> 'summary' -> 'kpis' ->> 'expenses')::numeric = 120 and (fr -> 'summary' -> 'kpis' ->> 'product_cost')::numeric = 80 then 'OK' else 'FALLA' end
         || ' Reporte completo: gastos 120 y costo 80';
  select count(*) into n from jsonb_array_elements(fr -> 'expenses') x where x ->> 'concept' like 'Gasto A%';
  r := r || E'\n6 ' || case when n = 1 and not exists (select 1 from jsonb_array_elements(fr -> 'expenses') x where x ->> 'concept' like 'Gasto B%') then 'OK' else 'FALLA' end
         || ' Reporte completo: la lista de gastos usa incurred_at (A sí, B no)';
  r := r || E'\n7 ' || case when (br -> 'kpis' -> 'profit' ->> 'net')::numeric = 110 and (br -> 'kpis' -> 'profit' ->> 'product_cost')::numeric = 80 then 'OK' else 'FALLA' end
         || ' business_report: kpis.profit.net = ' || coalesce(br -> 'kpis' -> 'profit' ->> 'net', 'null');
  r := r || E'\n8 ' || case when md -> 'kpis' ->> 'net_kind' = 'contribution' and (md -> 'kpis' ->> 'net')::numeric = 150
                              and (md -> 'kpis' ->> 'expenses')::numeric = 0 and (md -> 'kpis' ->> 'commissions')::numeric = 150
                              and (md -> 'kpis' ->> 'revenue')::numeric = 300 then 'OK' else 'FALLA' end
         || ' Panel con Dani: aporte 150 sin gastos ' || (md -> 'kpis')::text;
  r := r || E'\n9 ' || case when (md -> 'kpis' ->> 'tips')::numeric = 50 and (m -> 'kpis' ->> 'tips')::numeric = 50 then 'OK' else 'FALLA' end
         || ' propinas 50 aparte (no entran a la utilidad)';
  r := r || E'\n10 ' || case when (m -> 'previous' ->> 'net')::numeric = 0 and m -> 'previous' ->> 'net_kind' = 'profit' then 'OK' else 'FALLA' end
         || ' periodo anterior vacío: net 0';
  select count(*) into n from jsonb_array_elements(m -> 'barbers') x where x ->> 'id' = dani_e::text and (x ->> 'commission')::numeric = 150;
  r := r || E'\n11 ' || case when n = 1 then 'OK' else 'FALLA' end || ' por barbero: comisión de Dani 150 (sin la anulada)';

  -- 12 barbero no puede leer métricas
  perform set_config('request.jwt.claims', json_build_object('sub', 'bfae5380-f99c-4c62-ae7d-17130f832cf4', 'role', 'authenticated')::text, true);
  begin
    perform public.business_metrics(b, '2031-03-02', '2031-03-08', null);
    r := r || E'\n12 FALLA barbero leyó métricas';
  exception when others then r := r || E'\n12 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero rechazado [' || sqlstate || ']'; end;

  -- 13 la función auxiliar no se puede llamar desde la API
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'private' and routine_name = 'profit_kpis' and grantee in ('anon', 'authenticated', 'PUBLIC');
  r := r || E'\n13 ' || case when n = 0 then 'OK' else 'FALLA' end || ' private.profit_kpis sin permiso para anon/authenticated';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
