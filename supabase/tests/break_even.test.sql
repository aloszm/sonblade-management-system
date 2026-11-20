-- Pruebas del punto de equilibrio (20261120140000_break_even).
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;  (la prueba termina con RAISE: nada se guarda)
-- Usa una sucursal de prueba creada aquí (la real solo se LEE en el caso 1) y meses ya cerrados de 2026:
--   junio (sin ventas ni historia), julio (10 días con venta), agosto (16 días), septiembre (cubre el mes el día 9),
--   octubre (sin ventas, con historia), y el mes en curso para sueldos.
-- Venta de prueba: un corte $500 con comisión $250 (margen $250) + en julio y agosto una cera $100, costo $40,
-- comisión $20 (margen $40). Septiembre: un corte $2,000, comisión $1,000 (margen $1,000) por día.
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  dago_e uuid := '67db0358-6563-4879-a9c6-340420ad846d';
  biz uuid; tz text; b2 uuid; svc uuid; prod uuid; v jsonb; w jsonb; f jsonb; n int; m int; x numeric; y numeric;
  renta uuid; luz uuid; internet uuid; agua uuid; today date; mstart date; mend date; chg date; absent_day date;
  c_audit bigint; c_rec bigint; c_exp bigint; c_sales bigint; c_items bigint; c_comm bigint;
  d date; k int := 0;
begin
  update public.business_memberships set must_change_pin = false;
  -- Puestos que esta prueba supone (FASE_4 §2.4), fijados dentro de la transacción del simulacro.
  update public.business_memberships mm set role = z.role::public.business_role
  from (values ('76c82fae-6754-4be2-916e-b883890e524f'::uuid, 'owner'),          -- Alonso: cuenta principal
               ('0760694d-ea50-462b-8e11-b9478e564607'::uuid, 'admin'),          -- Sonia: gerencia
               ('6a8d153e-cf8d-4dd7-8029-01bc42481159'::uuid, 'viewer'),         -- Lucía: consulta
               ('a3b429be-3d7b-4c46-90fd-e15722193e27'::uuid, 'receptionist'),   -- Emi
               ('afe3a615-74ec-4c50-81b8-98c39fa4741a'::uuid, 'receptionist'),   -- Dago
               ('bfae5380-f99c-4c62-ae7d-17130f832cf4'::uuid, 'barber'),         -- Dani
               ('cb89067a-6cb5-4473-8ff5-ff1fcf83bd12'::uuid, 'barber')) z(u, role)  -- Deya
  where mm.business_id = 'e9ee2431-110b-4105-96bc-63f362c84c09' and mm.user_id = z.u and mm.role::text <> z.role;
  select br.business_id, bz.timezone into biz, tz from public.branches br join public.businesses bz on bz.id = br.business_id where br.id = b;
  select id into svc from public.services where business_id = biz order by name limit 1;
  select id into prod from public.products where business_id = biz order by name limit 1;
  today := (now() at time zone tz)::date;
  mstart := date_trunc('month', today)::date;
  mend := (mstart + interval '1 month - 1 day')::date;

  execute $f$create function pg_temp.be_as(u uuid) returns void language sql as $b$
    select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  -- Venta pagada: un servicio (comisión 50 %) y, si p_prod, una cera $100 con costo $40 (comisión 20 %).
  execute $f$create function pg_temp.be_sale(p_biz uuid, p_branch uuid, p_emp uuid, p_svc uuid, p_prod uuid, p_by uuid, p_at timestamptz,
                                              p_price numeric, p_with_product boolean, p_folio text) returns void language plpgsql as $b$
    declare s uuid := gen_random_uuid(); i uuid := gen_random_uuid(); j uuid := gen_random_uuid(); tot numeric;
    begin
      tot := p_price + case when p_with_product then 100 else 0 end;
      insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, created_at, folio)
      values (s, p_biz, p_branch, 'paid', tot, 0, tot, p_by, p_at, p_at, p_folio);
      insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, service_id, employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total)
      values (i, p_biz, p_branch, s, 'service', p_svc, p_emp, 'Corte prueba equilibrio', 1, p_price, 0, p_price);
      insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, calculation_type, basis, basis_amount, percentage_snapshot, commission_amount, status, generated_at)
      values (p_biz, p_branch, s, i, p_emp, 'percentage', 'price_before_discount', p_price, 50, round(p_price * 0.5, 2), 'generated', p_at);
      if p_with_product then
        insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, product_id, commission_employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, unit_cost_snapshot)
        values (j, p_biz, p_branch, s, 'product', p_prod, p_emp, 'Cera prueba equilibrio', 1, 100, 0, 100, 40);
        insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, calculation_type, basis, basis_amount, percentage_snapshot, commission_amount, status, generated_at)
        values (p_biz, p_branch, s, j, p_emp, 'percentage', 'price_before_discount', 100, 20, 20, 'generated', p_at);
      end if;
    end $b$$f$;

  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba equilibrio (se revierte)') returning id into b2;
  perform pg_temp.be_as(owner);

  -- ── 1) Coincide con report_financial_period (sucursal real, mes en curso) ──────────────────────────
  v := public.break_even_period(b, null);
  f := private.report_financial_period(biz, b, mstart::timestamp at time zone tz, (today + 1)::timestamp at time zone tz, false);
  r := r || E'\n1 ' || case when (v -> 'month_to_date' ->> 'revenue')::numeric = (f -> 'revenue' ->> 'total')::numeric
      and (v -> 'month_to_date' ->> 'commissions')::numeric = (f -> 'commissions' ->> 'total')::numeric
      and (v -> 'month_to_date' ->> 'product_cost')::numeric = (f -> 'product_cost' ->> 'total')::numeric
      and (v -> 'month_to_date' ->> 'margin')::numeric = (f -> 'revenue' ->> 'total')::numeric - (f -> 'commissions' ->> 'total')::numeric - (f -> 'product_cost' ->> 'total')::numeric
      and (v -> 'month_to_date' ->> 'finance_profit')::numeric = (f ->> 'profit')::numeric
      and v ->> 'status' = 'current' then 'OK' else 'FALLA' end
    || ' mes en curso (sucursal real) = report_financial_period: ingreso ' || (f -> 'revenue' ->> 'total') || ', margen ' || (v -> 'month_to_date' ->> 'margin');

  -- ── 2) Sin plantillas y mes sin ventas: estructura válida, ceros, sin dividir entre cero ─────────────
  v := public.break_even_period(b2, '2026-06-15');
  r := r || E'\n2 ' || case when (v ->> 'needs_setup')::boolean and (v -> 'fixed' ->> 'total')::numeric = 0
      and jsonb_array_length(v -> 'buckets') = 0 and v -> 'derived' -> 'progress_pct' = 'null'::jsonb
      and v ->> 'month' = '2026-06' and v ->> 'status' = 'past' and (v ->> 'is_closed')::boolean then 'OK' else 'FALLA' end
    || ' sin plantillas: needs_setup, fijos 0, sin cubetas ' || (v -> 'fixed')::text;
  r := r || E'\n3 ' || case when (v -> 'month_to_date' ->> 'revenue')::numeric = 0 and (v -> 'month_to_date' ->> 'margin')::numeric = 0
      and (v -> 'reference' ->> 'days_with_sales')::int = 0 and not (v -> 'reference' ->> 'enough_data')::boolean
      and v -> 'per_100' = 'null'::jsonb and v -> 'derived' -> 'goal_revenue' = 'null'::jsonb
      and v -> 'derived' -> 'services_goal_approx' = 'null'::jsonb and (v -> 'derived' ->> 'covered') = 'false' then 'OK' else 'FALLA' end
    || ' mes sin ventas ni historia: ceros, sin meta ni reparto';

  -- ── Plantillas: Renta 7,500; Luz 1,000 cada 2 meses; Internet 450; Agua 300 desactivada ─────────────
  w := public.save_recurring_expense(b2, null, 'Renta', (select id from public.expense_categories where business_id = biz and name = 'Renta'),
                                     7500, 1, 'envelope', null, null, null, null, null, true);
  renta := (w ->> 'id')::uuid;
  w := public.save_recurring_expense(b2, null, 'Luz', (select id from public.expense_categories where business_id = biz and name = 'Luz'),
                                     1000, 1, 'envelope', null, null, null, 2, null, true);
  luz := (w ->> 'id')::uuid;
  w := public.save_recurring_expense(b2, null, 'Internet', (select id from public.expense_categories where business_id = biz and name = 'Internet y teléfono'),
                                     450, 1, 'bank', 'transfer', null, null, null, null, null);
  internet := (w ->> 'id')::uuid;
  w := public.save_recurring_expense(b2, null, 'Agua', (select id from public.expense_categories where business_id = biz and name = 'Agua'),
                                     300, 1, 'envelope', null, null, false);
  agua := (w ->> 'id')::uuid;
  select count(*) into n from public.recurring_expenses where branch_id = b2 and sort_order = case name when 'Renta' then 1 when 'Luz' then 2 when 'Internet' then 3 when 'Agua' then 4 end;
  r := r || E'\n4 ' || case when n = 4 and (select is_estimate from public.recurring_expenses where id = renta)
      and not (select is_estimate from public.recurring_expenses where id = internet)
      and (select every_months from public.recurring_expenses where id = luz) = 2
      and exists (select 1 from public.audit_log a where a.entity_id = luz::text and a.action = 'recurring_expense_created' and a.after_data ->> 'every_months' = '2')
      then 'OK' else 'FALLA' end || ' alta: orden 1-4 por omisión, estimado, cada 2 meses y bitácora';

  -- ── 3) Datos: julio 10 días con venta (20-29), agosto 16 (1-16), septiembre 10 grandes (1-10) ─────────
  for d in select g::date from generate_series(date '2026-07-20', date '2026-07-29', interval '1 day') g loop
    k := k + 1;
    perform pg_temp.be_sale(biz, b2, dani_e, svc, prod, owner, (d + time '13:00') at time zone tz, 500, true, 'V2607-96' || lpad(k::text, 2, '0'));
  end loop;
  for d in select g::date from generate_series(date '2026-08-01', date '2026-08-16', interval '1 day') g loop
    k := k + 1;
    perform pg_temp.be_sale(biz, b2, dani_e, svc, prod, owner, (d + time '13:00') at time zone tz, 500, true, 'V2608-96' || lpad(k::text, 2, '0'));
  end loop;
  for d in select g::date from generate_series(date '2026-09-01', date '2026-09-10', interval '1 day') g loop
    k := k + 1;
    perform pg_temp.be_sale(biz, b2, dani_e, svc, prod, owner, (d + time '13:00') at time zone tz, 2000, false, 'V2609-96' || lpad(k::text, 2, '0'));
  end loop;

  -- 5 prorrateo bimestral y desactivada
  v := public.break_even_period(b2, '2026-08-01');
  select (x2 ->> 'amount')::numeric into x from jsonb_array_elements(v -> 'fixed' -> 'items') x2 where x2 ->> 'name' = 'Luz';
  r := r || E'\n5 ' || case when x = 500 and (v -> 'fixed' ->> 'templates_total')::numeric = 8450 and (v -> 'fixed' ->> 'templates_count')::int = 3
      and not (v ->> 'needs_setup')::boolean
      and not exists (select 1 from jsonb_array_elements(v -> 'fixed' -> 'items') x2 where x2 ->> 'name' = 'Agua') then 'OK' else 'FALLA' end
    || ' Luz 1,000 cada 2 meses = 500 al mes; fijos 7,500 + 500 + 450 = 8,450 (Agua desactivada no cuenta) ' || coalesce(x::text, 'null');

  -- 6 agosto = report_financial_period de agosto; margen 16 × (250 + 40) = 4,640
  f := private.report_financial_period(biz, b2, date '2026-08-01'::timestamp at time zone tz, date '2026-09-01'::timestamp at time zone tz, false);
  r := r || E'\n6 ' || case when (v -> 'month_to_date' ->> 'revenue')::numeric = (f -> 'revenue' ->> 'total')::numeric
      and (v -> 'month_to_date' ->> 'revenue')::numeric = 9600 and (v -> 'month_to_date' ->> 'commissions')::numeric = 4320
      and (v -> 'month_to_date' ->> 'product_cost')::numeric = 640 and (v -> 'month_to_date' ->> 'margin')::numeric = 4640
      and (v -> 'month_to_date' ->> 'services')::numeric = 16 and (v -> 'month_to_date' ->> 'days_with_sales')::int = 16
      then 'OK' else 'FALLA' end || ' agosto: ingreso 9,600 − comisiones 4,320 − costo 640 = margen 4,640 ' || (v -> 'month_to_date')::text;

  -- 7 enough_data: agosto con 26 días de referencia (10 de julio + 16 de agosto) sí; julio con 10 no
  r := r || E'\n7 ' || case when (v -> 'reference' ->> 'enough_data')::boolean and (v -> 'reference' ->> 'days_with_sales')::int = 26
      and (v -> 'reference' ->> 'from')::date = date '2026-07-20' and (v -> 'reference' ->> 'to')::date = date '2026-08-31'
      and (v -> 'derived' ->> 'margin_per_100')::numeric = round(290.0 / 600 * 100, 2)
      and (v -> 'derived' ->> 'goal_revenue')::numeric = round(8450 / (7540.0 / 15600), 2)
      and (v -> 'derived' ->> 'avg_margin_per_service')::numeric = 290
      and (v -> 'derived' ->> 'services_goal_approx')::numeric = round(8450 / 290.0)
      and (v -> 'derived' ->> 'progress_pct')::numeric = round(4640 / 8450.0 * 100, 1)
      and (v -> 'derived' ->> 'remaining')::numeric = 8450 - 4640
      and (v -> 'derived' ->> 'services_remaining_approx')::numeric = ceil((8450 - 4640) / 290.0)
      and not (v -> 'derived' ->> 'covered')::boolean
      then 'OK' else 'FALLA' end || ' agosto: referencia 26 días, $48.33 de cada $100, meta $17,482.76, unos 29 servicios ' || (v -> 'derived')::text;
  w := public.break_even_period(b2, '2026-07-01');
  r := r || E'\n8 ' || case when not (w -> 'reference' ->> 'enough_data')::boolean and (w -> 'reference' ->> 'days_with_sales')::int = 10
      and w -> 'derived' -> 'goal_revenue' = 'null'::jsonb and w -> 'derived' -> 'services_goal_approx' = 'null'::jsonb
      and w -> 'derived' -> 'services_remaining_approx' = 'null'::jsonb
      and (w -> 'derived' ->> 'progress_pct')::numeric = round(2900 / 8450.0 * 100, 1)
      and w -> 'per_100' ->> 'source' = 'month' and not (w -> 'per_100' ->> 'approximate')::boolean
      then 'OK' else 'FALLA' end || ' julio: 10 días con venta → enough_data falso, sin meta ni servicios; avance sí (34.3 %)';

  -- 9 cubetas en orden: con 4,640 de margen, Renta (7,500, la primera) queda al 61.9 % y Luz sigue vacía
  r := r || E'\n9 ' || case when v -> 'buckets' -> 0 ->> 'name' = 'Renta' and (v -> 'buckets' -> 0 ->> 'filled')::numeric = 4640
      and (v -> 'buckets' -> 0 ->> 'pct')::numeric = 61.9 and not (v -> 'buckets' -> 0 ->> 'complete')::boolean
      and v -> 'buckets' -> 1 ->> 'name' = 'Luz' and (v -> 'buckets' -> 1 ->> 'filled')::numeric = 0
      and (v -> 'buckets' -> 0 ->> 'is_estimate')::boolean then 'OK' else 'FALLA' end || ' cubetas en orden: Renta 61.9 %, Luz 0 %';

  -- 10 reparto de cada $100 (agosto, mes cerrado): equipo 45, producto 6.7, renta 78.1, luz 5.2, internet 4.7, queda el resto
  r := r || E'\n10 ' || case when v -> 'per_100' ->> 'source' = 'month' and (v -> 'per_100' -> 'items' -> 0 ->> 'amount')::numeric = 45.0
      and (v -> 'per_100' -> 'items' -> 1 ->> 'amount')::numeric = 6.7
      and (v -> 'per_100' -> 'items' -> 2 ->> 'amount')::numeric = round(7500 / 9600.0 * 100, 1)
      and (v -> 'per_100' ->> 'left')::numeric = round(100 - 45.0 - 6.7 - round(7500 / 9600.0 * 100, 1) - round(500 / 9600.0 * 100, 1) - round(450 / 9600.0 * 100, 1), 1)
      then 'OK' else 'FALLA' end || ' de cada $100: ' || (v -> 'per_100')::text;

  -- 11 mes ya cubierto: septiembre, $1,000 de margen diario → 8,450 se cubre el día 9; ganancia por encima 1,550
  v := public.break_even_period(b2, '2026-09-01');
  r := r || E'\n11 ' || case when (v -> 'derived' ->> 'covered')::boolean and (v -> 'derived' ->> 'covered_on')::date = date '2026-09-09'
      and (v -> 'derived' ->> 'covered_day')::int = 9 and (v -> 'derived' ->> 'profit_above')::numeric = 1550
      and (v -> 'derived' ->> 'remaining')::numeric = 0 and (v -> 'derived' ->> 'services_remaining_approx')::numeric = 0
      and (select bool_and((bk ->> 'complete')::boolean) from jsonb_array_elements(v -> 'buckets') bk)
      and (v -> 'derived' ->> 'progress_pct')::numeric = round(10000 / 8450.0 * 100, 1)
      then 'OK' else 'FALLA' end || ' septiembre cubierto el día 9, ganancia 1,550, cubetas llenas ' || (v -> 'derived')::text;

  -- 12 mes sin ventas con historia: octubre en la sucursal de prueba
  v := public.break_even_period(b2, '2026-10-01');
  r := r || E'\n12 ' || case when (v -> 'month_to_date' ->> 'revenue')::numeric = 0 and (v -> 'derived' ->> 'progress_pct')::numeric = 0
      and not (v -> 'derived' ->> 'covered')::boolean and (v -> 'derived' ->> 'covered_amount')::numeric = 0
      and v -> 'derived' -> 'profit_above' = 'null'::jsonb and v -> 'per_100' = 'null'::jsonb
      and (select bool_and((bk ->> 'filled')::numeric = 0) from jsonb_array_elements(v -> 'buckets') bk)
      then 'OK' else 'FALLA' end || ' octubre sin ventas: avance 0, cubetas vacías, sin reparto';

  -- 13 desactivar una plantilla la saca de los fijos
  perform public.save_recurring_expense(b2, internet, null, null, null, null, null, null, null, false);
  v := public.break_even_period(b2, '2026-08-01');
  r := r || E'\n13 ' || case when (v -> 'fixed' ->> 'total')::numeric = 8000 and (v -> 'fixed' ->> 'templates_count')::int = 2 then 'OK' else 'FALLA' end
    || ' Internet desactivado: fijos 8,000';
  perform public.save_recurring_expense(b2, internet, null, null, null, null, null, null, null, true);

  -- 14 sueldos a mitad de mes con cambio de tarifa ya capturado: Dago L-V $320 desde el día 1, $400 desde hoy + 2;
  --    una falta en el primer día fijo ya pasado. Esperado calculado aparte (días fijos × tarifa de ese día).
  chg := today + 2;
  insert into public.employee_wage_rates (business_id, branch_id, employee_id, daily_amount, work_days, effective_from, reason, created_by)
  values (biz, b2, dago_e, 320, array[1, 2, 3, 4, 5]::smallint[], mstart, 'Ficha de prueba (se revierte)', owner),
         (biz, b2, dago_e, 400, array[1, 2, 3, 4, 5]::smallint[], chg, 'Cambio de prueba (se revierte)', owner);
  select min(g::date) into absent_day from generate_series(mstart, today - 1, interval '1 day') g where extract(dow from g) between 1 and 5;
  if absent_day is not null then
    insert into public.employee_attendance_exceptions (business_id, branch_id, employee_id, work_date, kind, reason, created_by)
    values (biz, b2, dago_e, absent_day, 'absent', 'Falta de prueba (se revierte)', owner);
  end if;
  select coalesce(sum(case when g::date >= chg then 400 else 320 end), 0),
         coalesce(sum(case when g::date >= chg then 400 else 320 end) filter (where g::date <= today), 0)
    into x, y
  from generate_series(mstart, mend, interval '1 day') g
  where extract(dow from g) between 1 and 5 and g::date is distinct from absent_day;
  v := public.break_even_period(b2, null);
  r := r || E'\n14 ' || case when (v -> 'fixed' -> 'wages' ->> 'total')::numeric = x and (v -> 'fixed' -> 'wages' ->> 'to_date')::numeric = y
      and (v -> 'fixed' -> 'wages' ->> 'projected')::numeric = x - y
      and (v -> 'fixed' ->> 'total')::numeric = 8450 + x
      and (select (it ->> 'amount')::numeric from jsonb_array_elements(v -> 'fixed' -> 'items') it where it ->> 'key' = 'wages') = x
      and v -> 'buckets' -> -1 ->> 'name' = 'Sueldos'
      then 'OK' else 'FALLA' end || ' sueldos del mes: esperado ' || x || ' (hasta hoy ' || y || ', con falta y tarifa nueva desde ' || chg || ') = '
      || coalesce(v -> 'fixed' -> 'wages' ->> 'total', 'null');
  -- 15 los sueldos hasta hoy son los mismos que resta la utilidad (private.wage_cost_days)
  select coalesce(sum(wc.amount), 0) into x from private.wage_cost_days(biz, b2, mstart::timestamp at time zone tz, (mend + 1)::timestamp at time zone tz) wc;
  r := r || E'\n15 ' || case when (v -> 'fixed' -> 'wages' ->> 'to_date')::numeric = x then 'OK' else 'FALLA' end
    || ' sueldos hasta hoy = wage_cost_days de la utilidad (' || x || ')';

  -- 16 mes en curso sin ventas en la sucursal de prueba: ritmo y proyección sin dividir entre cero
  r := r || E'\n16 ' || case when v ->> 'status' = 'current' and (v -> 'days_left')::int = mend - today + 1
      and v -> 'derived' -> 'projected_cover_date' = 'null'::jsonb and not (v -> 'derived' ->> 'projected_within_month')::boolean
      and (v -> 'derived' ->> 'services_per_day_recent')::numeric = 0 then 'OK' else 'FALLA' end
    || ' mes en curso sin ventas: sin día estimado, ritmo 0';

  -- 17 reordenar: Internet, Renta, Luz (Agua al final) con bitácora; y every_months fuera de rango rechazado
  w := public.reorder_recurring_expenses(b2, array[internet, renta, luz]);
  select count(*) into n from public.recurring_expenses where branch_id = b2
    and sort_order = case id when internet then 1 when renta then 2 when luz then 3 when agua then 4 end;
  v := public.break_even_period(b2, '2026-08-01');
  r := r || E'\n17 ' || case when n = 4 and v -> 'buckets' -> 0 ->> 'name' = 'Internet' and v -> 'buckets' -> 1 ->> 'name' = 'Renta'
      and exists (select 1 from public.audit_log a where a.entity_id = b2::text and a.action = 'recurring_expense_reordered')
      then 'OK' else 'FALLA' end || ' reordenar: Internet primero, en bitácora';
  begin
    perform public.save_recurring_expense(b2, luz, null, null, null, null, null, null, null, null, 13);
    r := r || E'\n18 FALLA aceptó cada 13 meses';
  exception when others then r := r || E'\n18 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' cada 13 meses rechazado [' || sqlstate || ']'; end;

  -- 19 al cambiar el monto deja de ser estimado; cambiar solo el nombre no
  perform public.save_recurring_expense(b2, renta, 'Renta del local');
  m := (select is_estimate::int from public.recurring_expenses where id = renta);
  perform public.save_recurring_expense(b2, renta, null, null, 8000);
  r := r || E'\n19 ' || case when m = 1 and not (select is_estimate from public.recurring_expenses where id = renta) then 'OK' else 'FALLA' end
    || ' estimado: se conserva al renombrar, se apaga al cambiar el monto';

  -- 20 pendientes del mes: Luz bimestral pagada el mes pasado no se propone; Renta sí
  insert into public.expenses (business_id, branch_id, status, category, description, amount, method, incurred_at, created_by, created_at,
                               paid_from, recurring_expense_id)
  values (biz, b2, 'posted', 'Luz', 'Luz bimestral de prueba', 1000, 'transfer', ((mstart - 10) + time '12:00') at time zone tz, owner, now(), 'bank', luz);
  select count(*) filter (where pr.id = luz), count(*) filter (where pr.id = renta) into n, m from public.pending_recurring_expenses(b2, mstart) pr;
  r := r || E'\n20 ' || case when n = 0 and m = 1 then 'OK' else 'FALLA' end || ' pendientes: Luz (cada 2 meses, pagada el mes pasado) no; Renta sí';

  -- 21-24 permisos: gerencia y consulta leen; recepción y barbero no
  c_audit := (select count(*) from public.audit_log); c_rec := (select count(*) from public.recurring_expenses);
  c_exp := (select count(*) from public.expenses); c_sales := (select count(*) from public.sales);
  c_items := (select count(*) from public.sale_items); c_comm := (select count(*) from public.commission_entries);
  perform pg_temp.be_as(sonia);
  v := public.break_even_period(b2, '2026-08-01');
  r := r || E'\n21 ' || case when (v -> 'month_to_date' ->> 'margin')::numeric = 4640 then 'OK' else 'FALLA' end || ' gerencia lee';
  perform pg_temp.be_as(lucia);
  v := public.break_even_period(b2, '2026-09-01');
  r := r || E'\n22 ' || case when (v -> 'derived' ->> 'covered')::boolean then 'OK' else 'FALLA' end || ' consulta lee';
  perform pg_temp.be_as(dago);
  begin
    perform public.break_even_period(b, null);
    r := r || E'\n23 FALLA recepción leyó el punto de equilibrio';
  exception when others then r := r || E'\n23 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción rechazada [' || sqlstate || ']'; end;
  perform pg_temp.be_as(dani);
  begin
    perform public.break_even_period(b, null);
    r := r || E'\n24 FALLA barbero leyó el punto de equilibrio';
  exception when others then r := r || E'\n24 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' barbero rechazado [' || sqlstate || ']'; end;
  perform set_config('request.jwt.claims', '', true);
  begin
    perform public.break_even_period(b, null);
    r := r || E'\n25 FALLA sin sesión leyó';
  exception when others then r := r || E'\n25 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin sesión rechazado [' || sqlstate || ']'; end;
  perform pg_temp.be_as(sonia);
  begin
    perform public.break_even_period(b, '2040-01-01');
    r := r || E'\n26 FALLA aceptó un mes lejano';
  exception when others then r := r || E'\n26 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' mes fuera de rango rechazado [' || sqlstate || ']'; end;

  -- 27 no escribe nada; función estable; la de cálculo no se llama directo desde la API sin pasar por el permiso
  r := r || E'\n27 ' || case when c_audit = (select count(*) from public.audit_log) and c_rec = (select count(*) from public.recurring_expenses)
      and c_exp = (select count(*) from public.expenses) and c_sales = (select count(*) from public.sales)
      and c_items = (select count(*) from public.sale_items) and c_comm = (select count(*) from public.commission_entries)
      and (select provolatile from pg_proc where oid = 'public.break_even_period(uuid, date)'::regprocedure) = 's'
      and (select provolatile from pg_proc where oid = 'private.break_even_period_impl(uuid, date)'::regprocedure) = 's'
      then 'OK' else 'FALLA' end || ' leer no escribe (bitácora, plantillas, gastos, ventas, renglones y comisiones iguales) y es STABLE';
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('break_even_period', 'reorder_recurring_expenses', 'save_recurring_expense') and grantee in ('anon', 'PUBLIC');
  r := r || E'\n28 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin permiso para anon';

  -- 29 la app publicada sigue llamando save_recurring_expense con sus 10 parámetros (por nombre)
  perform pg_temp.be_as(owner);
  w := public.save_recurring_expense(p_branch_id => b2, p_id => null, p_name => 'Limpieza', p_category_id =>
         (select id from public.expense_categories where business_id = biz and name = 'Insumos y limpieza'),
         p_suggested_amount => 200, p_day_of_month => 5, p_paid_from => 'envelope', p_method => null, p_vendor => null, p_is_active => true);
  r := r || E'\n29 ' || case when (w ->> 'every_months')::int = 1 and not (w ->> 'is_estimate')::boolean and (w ->> 'sort_order')::int = 5 then 'OK' else 'FALLA' end
    || ' llamada de la app anterior: mensual, no estimado, al final del orden';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
