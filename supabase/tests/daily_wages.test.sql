-- Pruebas del sueldo por día (20261120090000_daily_wages).
-- Correr en simulacro: begin; <migración>; <esta prueba>; rollback;  (la prueba termina con RAISE: nada se guarda)
-- Usa una sucursal de prueba (la real no se toca) y semanas cerradas de agosto y septiembre de 2026.
-- Para simular la historia, las fichas de sueldo con vigencia pasada se insertan directo (la función pública no deja
-- cambiar el sueldo hacia atrás; eso se prueba en el caso 17).
-- Semanas (domingo): W0 07-26, W1 08-02, W2 08-09, W3 08-16, W4 08-23, W5 08-30, W6 09-06, W7 09-13.
-- Son anteriores a la transición del 15 nov 2026 (20261121100000_pay_period_thu_wed): siguen probando la regla vieja
-- (domingo a sábado, corte 8:00 p. m.), que rige esas fechas. La regla nueva se prueba en pay_period_thu_wed.test.sql.
-- Casos del encargo: (a) 1-3; (b) 4-5; (c) 6; (d) 7; (e) 8-11; (f) 12-13; (g) 14-16; (h) 18-21; (i) 22-25;
-- (j) 26-31; (k) 32. Además: ficha con PIN (17), libro sellado (33), privilegios (34).
do $t$
declare
  r text := '';
  b uuid := 'd40aafce-fe84-4131-86af-03154e73a3b7';
  owner uuid := '76c82fae-6754-4be2-916e-b883890e524f';
  sonia uuid := '0760694d-ea50-462b-8e11-b9478e564607';
  lucia uuid := '6a8d153e-cf8d-4dd7-8029-01bc42481159';
  dani uuid := 'bfae5380-f99c-4c62-ae7d-17130f832cf4';
  dago uuid := 'afe3a615-74ec-4c50-81b8-98c39fa4741a';
  emi uuid := 'a3b429be-3d7b-4c46-90fd-e15722193e27';
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  dago_e uuid := '67db0358-6563-4879-a9c6-340420ad846d';
  emi_e uuid := '1ef32d3d-8cf8-4441-aa6c-7a1674d874e4';
  biz uuid; tz text; b2 uuid; svc uuid; sess uuid; v jsonb; p jsonb; q jsonb; n int; m int; x numeric; y numeric;
  st1 uuid; st2 uuid; ex1 uuid; ex2 uuid; goal uuid; wk date; wk_end date; today date; f jsonb; md jsonb; fr jsonb;
  w0 date := '2026-07-26'; w1 date := '2026-08-02'; w2 date := '2026-08-09'; w3 date := '2026-08-16'; w4 date := '2026-08-23';
  w5 date := '2026-08-30'; w6 date := '2026-09-06'; w7 date := '2026-09-13';
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
  select br.business_id, bz.timezone into biz, tz from public.branches br join public.businesses bz on bz.id = br.business_id where br.id = b;
  select id into svc from public.services where business_id = biz order by name limit 1;
  today := (now() at time zone tz)::date;
  -- Periodo de pago en curso (jueves a miércoles desde 20261121100000; las semanas de agosto y septiembre de 2026 de
  -- esta prueba siguen siendo de domingo a sábado, la regla de entonces).
  wk := private.pay_week_start(biz, now());
  select p.period_end into wk_end from private.pay_period_for_date(biz, wk) p;

  execute $f$create function pg_temp.dw_as(u uuid, pin boolean) returns void language plpgsql as $b$
    declare s uuid;
    begin
      if pin then
        s := gen_random_uuid();
        insert into auth.sessions (id, user_id, created_at, updated_at) values (s, u, now(), now());
        perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'session_id', s)::text, true);
      else
        perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
      end if;
    end $b$$f$;
  execute $f$create function pg_temp.dw_sale(p_biz uuid, p_branch uuid, p_emp uuid, p_svc uuid, p_by uuid, p_at timestamptz,
                                              p_price numeric, p_tip numeric, p_folio text) returns uuid language plpgsql as $b$
    declare s uuid := gen_random_uuid(); i uuid := gen_random_uuid();
    begin
      insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, created_at, folio)
      values (s, p_biz, p_branch, 'paid', p_price, 0, p_price, p_by, p_at, p_at, p_folio);
      insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, service_id, employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total)
      values (i, p_biz, p_branch, s, 'service', p_svc, p_emp, 'Corte prueba sueldo', 1, p_price, 0, p_price);
      insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, calculation_type, basis, basis_amount, percentage_snapshot, commission_amount, status, generated_at)
      values (p_biz, p_branch, s, i, p_emp, 'percentage', 'price_before_discount', p_price, 50, round(p_price * 0.5, 2), 'generated', p_at);
      if p_tip > 0 then
        insert into public.sale_tips (business_id, branch_id, sale_id, employee_id, amount, method, status, created_by, created_at)
        values (p_biz, p_branch, s, p_emp, p_tip, 'cash', 'generated', p_by, p_at);
      end if;
      return s;
    end $b$$f$;
  -- Una ficha con vigencia pasada (historia simulada).
  execute $f$create function pg_temp.dw_rate(p_biz uuid, p_branch uuid, p_emp uuid, p_amount numeric, p_days smallint[], p_from date, p_by uuid)
    returns void language sql as $b$
      insert into public.employee_wage_rates (business_id, branch_id, employee_id, daily_amount, work_days, effective_from, reason, created_by)
      values (p_biz, p_branch, p_emp, p_amount, p_days, p_from, 'Ficha de prueba (se revierte)', p_by) $b$$f$;

  -- Sucursal de prueba con caja abierta ($500).
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba sueldo (se revierte)') returning id into b2;
  insert into public.user_branch_access (business_id, branch_id, user_id) select biz, b2, u from unnest(array[dani, dago, emi]) u;
  perform pg_temp.dw_as(owner, false);
  v := public.open_cash_session(b2, 500, 'Prueba del sueldo por día');
  select id into sess from public.cash_sessions where branch_id = b2 and status = 'open';

  -- Historia: Dago lunes a viernes y Emi sábado y domingo, $320, desde W1.
  perform pg_temp.dw_rate(biz, b2, dago_e, 320, array[1, 2, 3, 4, 5]::smallint[], w1, owner);
  perform pg_temp.dw_rate(biz, b2, emi_e, 320, array[0, 6]::smallint[], w1, owner);

  -- ── (a) sin sueldo configurado: todo igual ──────────────────────────────────────────────────────────
  select count(*) into n from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
  where (ns.nspname, pr.proname, md5(pg_get_functiondef(pr.oid))) in (
    ('public', 'confirm_sale', 'f3cc545e5cf7483897e757c16848f7ad'),
    ('private', 'confirm_sale_impl', '7ba5b5e43bcf8ec2f3aaaad69c9a386b'),
    ('private', 'confirm_sale_with_approval_impl', '18cda0db3486f1d82dedb7453d2e3b13'),
    -- 20261120110000 (base por omisión) y 20261120130000 (cortesía de producto sin comisión) la cambiaron a propósito.
    ('private', 'generate_sale_commissions_impl', 'f2ea3cd2a3c53af142ffdf578c1dc83b'));
  r := r || E'\n1 ' || case when n = 4 then 'OK' else 'FALLA' end || ' huella (md5) de cobro y generación de comisiones sin cambio (' || n || ' de 4)';

  perform pg_temp.dw_sale(biz, b2, dani_e, svc, owner, (w1 + time '13:00') at time zone tz, 1000, 80, 'V2632-9801');
  perform pg_temp.dw_as(sonia, false);
  p := public.preview_commission_settlement(b2, dani_e, w1, w1 + 6);
  r := r || E'\n2 ' || case when (p ->> 'total_amount')::numeric = 580 and (p ->> 'net_amount')::numeric = 580 and (p ->> 'wages')::numeric = 0
    and p -> 'wage' = 'null'::jsonb and (p ->> 'can_settle')::boolean then 'OK' else 'FALLA' end
    || ' Dani (sin sueldo): vista previa 500 + 80 = 580, sueldo 0 ' || p::text;
  v := public.settle_commissions(b2, dani_e, w1, w1 + 6, '[{"method":"transfer","amount":580}]'::jsonb);
  q := public.get_settlement_receipt((v ->> 'settlement_id')::uuid);
  r := r || E'\n3 ' || case when (v ->> 'total_amount')::numeric = 580 and (v ->> 'deductions')::numeric = 0 and (v ->> 'wages')::numeric = 0
    and (q ->> 'wages')::numeric = 0 and q -> 'wage' = 'null'::jsonb and jsonb_array_length(q -> 'ledger_lines') = 0
    and not exists (select 1 from public.employee_ledger l where l.employee_id = dani_e and l.branch_id = b2)
    then 'OK' else 'FALLA' end || ' Dani: recibo $580, sin asiento de sueldo ' || v::text;

  -- ── (b) Dago lunes a viernes sin excepciones: 5 × 320 ───────────────────────────────────────────────
  p := public.preview_commission_settlement(b2, dago_e, w1, w1 + 6);
  r := r || E'\n4 ' || case when (p ->> 'wages')::numeric = 1600 and (p ->> 'total_amount')::numeric = 1600 and (p ->> 'can_settle')::boolean
    and (p -> 'wage' ->> 'paid_days')::int = 5 and p -> 'wage' ->> 'summary' = '5 días × $320 = $1,600'
    and jsonb_array_length(p -> 'wage' -> 'days') = 5 then 'OK' else 'FALLA' end || ' Dago W1: ' || coalesce(p -> 'wage' ->> 'summary', 'null');
  v := public.settle_commissions(b2, dago_e, w1, w1 + 6, '[{"method":"transfer","amount":1600}]'::jsonb);
  st1 := (v ->> 'settlement_id')::uuid;
  q := public.get_settlement_receipt(st1);
  r := r || E'\n5 ' || case when (v ->> 'total_amount')::numeric = (p ->> 'total_amount')::numeric and (v ->> 'wages')::numeric = 1600
    and (q ->> 'wages')::numeric = 1600 and q -> 'wage' ->> 'summary' = '5 días × $320 = $1,600'
    and q -> 'ledger_lines' -> 0 ->> 'entry_type' = 'wage' and (q -> 'ledger_lines' -> 0 ->> 'receipt_effect')::numeric = 1600
    and exists (select 1 from public.commission_settlements s where s.id = st1 and s.wage_amount = 1600)
    then 'OK' else 'FALLA' end || ' Dago W1 pagado = vista previa ($1,600), asiento wage sellado con efecto +1600';

  -- ── (c) una falta: 4 días ───────────────────────────────────────────────────────────────────────────
  perform pg_temp.dw_as(sonia, true);
  v := public.record_attendance_exception(b2, dago_e, w2 + 2, 'absent', 'Faltó por enfermedad');
  ex1 := (v ->> 'id')::uuid;
  perform pg_temp.dw_as(sonia, false);
  p := public.preview_commission_settlement(b2, dago_e, w2, w2 + 6);
  r := r || E'\n6 ' || case when (p ->> 'wages')::numeric = 1280 and (p -> 'wage' ->> 'absent_days')::int = 1 and (p -> 'wage' ->> 'paid_days')::int = 4
    and (v -> 'week' ->> 'amount')::numeric = 1280
    and exists (select 1 from public.audit_log a where a.entity_id = ex1::text and a.action = 'pin_confirmed_action' and a.after_data ->> 'action' = 'attendance_absent')
    then 'OK' else 'FALLA' end || ' Dago W2 con falta el martes: ' || coalesce(p -> 'wage' ->> 'summary', 'null') || ' (en bitácora)';

  -- ── (d) Emi cubre un miércoles; Dago faltó ese miércoles ────────────────────────────────────────────
  perform pg_temp.dw_as(sonia, true);
  v := public.record_attendance_exception(b2, emi_e, w3 + 3, 'extra', 'Cubre a Dago el miércoles');
  perform pg_temp.dw_as(sonia, true);
  v := public.record_attendance_exception(b2, dago_e, w3 + 3, 'absent', 'No vino; lo cubrió Emi');
  perform pg_temp.dw_as(sonia, false);
  p := public.preview_commission_settlement(b2, emi_e, w3, w3 + 6);
  q := public.preview_commission_settlement(b2, dago_e, w3, w3 + 6);
  r := r || E'\n7 ' || case when (p ->> 'wages')::numeric = 960 and (p -> 'wage' ->> 'extra_days')::int = 1
    and (q ->> 'wages')::numeric = 1280 and (q -> 'wage' ->> 'absent_days')::int = 1 then 'OK' else 'FALLA' end
    || ' W3: Emi ' || coalesce(p -> 'wage' ->> 'summary', 'null') || '; Dago ' || coalesce(q -> 'wage' ->> 'summary', 'null');

  -- ── (e) falta repetida, falta en día no fijo, extra en día fijo, otra excepción el mismo día ─────────
  perform pg_temp.dw_as(sonia, true);
  v := public.record_attendance_exception(b2, dago_e, w2 + 2, 'absent', 'Faltó por enfermedad (otra vez)');
  select count(*) into n from public.employee_attendance_exceptions where employee_id = dago_e and branch_id = b2 and work_date = w2 + 2;
  r := r || E'\n8 ' || case when (v ->> 'replayed')::boolean and n = 1 and (v -> 'week' ->> 'amount')::numeric = 1280 then 'OK' else 'FALLA' end
    || ' falta repetida: sin efecto, sin duplicar (' || n || ' fila)';
  begin
    perform public.record_attendance_exception(b2, dago_e, w2 + 6, 'absent', 'Sábado no es su día');
    r := r || E'\n9 FALLA registró falta en día no fijo';
  exception when others then r := r || E'\n9 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' falta en día no fijo rechazada [' || sqlstate || '] ' || sqlerrm; end;
  begin
    perform public.record_attendance_exception(b2, dago_e, w2 + 1, 'extra', 'Lunes ya es fijo');
    r := r || E'\n10 FALLA registró extra en día fijo';
  exception when others then r := r || E'\n10 ' || case when sqlstate = '22023' then 'OK' else 'FALLA' end || ' día extra en día fijo rechazado [' || sqlstate || ']'; end;
  begin
    perform public.record_attendance_exception(b2, dani_e, w2 + 2, 'extra', 'Dani no tiene sueldo');
    r := r || E'\n11 FALLA registró extra sin sueldo';
  exception when others then
    m := 0;
    if sqlstate = '22023' then m := 1; end if;
    begin
      perform pg_temp.dw_as(sonia, true);
      perform public.record_attendance_exception(b2, dago_e, w2 + 2, 'extra', 'Otra excepción el mismo día');
      r := r || E'\n11 FALLA dos excepciones el mismo día';
    exception when others then
      r := r || E'\n11 ' || case when m = 1 and sqlstate = '55000' then 'OK' else 'FALLA' end || ' extra sin sueldo rechazado; otra excepción el mismo día rechazada [' || sqlstate || ']';
    end;
  end;

  -- ── (f) cambio de sueldo a mitad de semana; anular una falta ────────────────────────────────────────
  perform pg_temp.dw_rate(biz, b2, dago_e, 350, array[1, 2, 3, 4, 5]::smallint[], w4 + 3, owner);
  perform pg_temp.dw_as(sonia, false);
  p := public.preview_commission_settlement(b2, dago_e, w4, w4 + 6);
  r := r || E'\n12 ' || case when (p ->> 'wages')::numeric = 1690 and jsonb_array_length(p -> 'wage' -> 'groups') = 2
    and p -> 'wage' ->> 'summary' = '2 días × $320 + 3 días × $350 = $1,690' then 'OK' else 'FALLA' end
    || ' Dago W4 (350 desde el miércoles): ' || coalesce(p -> 'wage' ->> 'summary', 'null');
  perform pg_temp.dw_as(sonia, true);
  v := public.record_attendance_exception(b2, dago_e, w4 + 4, 'absent', 'Permiso del jueves');
  ex2 := (v ->> 'id')::uuid;
  x := (v -> 'week' ->> 'amount')::numeric;
  perform pg_temp.dw_as(sonia, true);
  v := public.void_attendance_exception(ex2, 'Sí vino, fue un error');
  r := r || E'\n13 ' || case when x = 1340 and (v -> 'week' ->> 'amount')::numeric = 1690
    and exists (select 1 from public.employee_attendance_exceptions e where e.id = ex2 and e.voided_at is not null and e.voided_by = sonia)
    then 'OK' else 'FALLA' end || ' falta del jueves ($350) baja a 1340; anulada (sin borrar) regresa a 1690';

  -- ── (g) semana pagada: no se registra ni se anula; volver a liquidar no duplica ─────────────────────
  perform pg_temp.dw_as(sonia, true);
  begin
    perform public.record_attendance_exception(b2, dago_e, w1 + 3, 'absent', 'Falta descubierta tarde');
    r := r || E'\n14 FALLA registró excepción en semana pagada';
  exception when others then r := r || E'\n14 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' semana pagada: excepción rechazada [' || sqlstate || '] ' || sqlerrm; end;
  perform pg_temp.dw_as(sonia, false);
  v := public.settle_commissions(b2, dago_e, w2, w2 + 6, '[{"method":"transfer","amount":1280}]'::jsonb);
  st2 := (v ->> 'settlement_id')::uuid;
  perform pg_temp.dw_as(sonia, true);
  begin
    perform public.void_attendance_exception(ex1, 'Quitar la falta');
    r := r || E'\n15 FALLA anuló excepción de semana pagada';
  exception when others then r := r || E'\n15 ' || case when sqlstate = '55000' and (v ->> 'total_amount')::numeric = 1280 then 'OK' else 'FALLA' end
    || ' W2 pagado ($1,280); anular su falta rechazado [' || sqlstate || ']'; end;
  perform pg_temp.dw_as(sonia, false);
  v := public.settle_commissions(b2, dago_e, w1, w1 + 6, '[{"method":"transfer","amount":1600}]'::jsonb);
  select count(*) into n from public.employee_ledger where employee_id = dago_e and branch_id = b2 and entry_type = 'wage' and week_start = w1;
  begin
    insert into public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, settlement_id, generated_by_settlement, week_start, created_by)
    values (biz, b2, dago_e, 'wage', 1600, 'Sueldo duplicado a mano', st1, true, w1, owner);
    r := r || E'\n16 FALLA se duplicó el sueldo';
  exception when others then
    r := r || E'\n16 ' || case when (v ->> 'idempotent_replay')::boolean and n = 1 and sqlstate = '23505' then 'OK' else 'FALLA' end
      || ' volver a liquidar W1: replay; un solo asiento de sueldo; duplicado rechazado [' || sqlstate || ']';
  end;

  -- ── Ficha de sueldo por la función pública (cuenta principal + PIN; nunca hacia atrás) ──────────────
  m := 0;
  perform pg_temp.dw_as(owner, true);
  begin
    perform public.set_employee_wage(b2, emi_e, 330, array[0, 6], 'Aumento hacia atrás', w1);
  exception when others then if sqlstate = '22023' then m := m + 1; end if; end;
  perform pg_temp.dw_as(owner, false);
  begin
    perform public.set_employee_wage(b2, emi_e, 330, array[0, 6], 'Aumento sin PIN', wk);
  exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  perform pg_temp.dw_as(owner, true);
  v := public.set_employee_wage(b2, emi_e, 330, array[6, 0, 6], 'Aumento a partir de esta semana', null);
  r := r || E'\n17 ' || case when m = 2 and (v ->> 'effective_from')::date = wk and v -> 'work_days' = '[0, 6]'::jsonb and (v ->> 'daily_amount')::numeric = 330
    and (v -> 'previous' ->> 'daily_amount')::numeric = 320
    and exists (select 1 from public.audit_log a where a.entity_id = v ->> 'id' and a.after_data ->> 'action' = 'employee_wage_set')
    then 'OK' else 'FALLA' end || ' ficha: hacia atrás rechazada, sin PIN rechazada, desde el inicio del periodo de pago en curso con bitácora ' || v::text;

  -- ── (h) neto = sueldo + comisiones + propinas + bonos − adelantos − descuentos; efectivo por la caja ──
  perform pg_temp.dw_sale(biz, b2, emi_e, svc, owner, (w5 + 1 + time '12:00') at time zone tz, 400, 50, 'V2636-9802');
  perform pg_temp.dw_as(owner, false);
  v := public.save_bonus_goal(b2, null, 'Meta prueba sueldo', 'services_count', 1, 100, 'employee', emi_e, w5, w5 + 6);
  goal := (v ->> 'id')::uuid;
  perform pg_temp.dw_as(sonia, true);
  perform public.record_employee_ledger_entry(b2, emi_e, 'advance', 300, 'Adelanto de prueba sueldo', 'bank', 'transfer');
  perform pg_temp.dw_as(sonia, true);
  perform public.record_employee_ledger_entry(b2, emi_e, 'deduction', 40, 'Se llevó una cera', null);
  perform pg_temp.dw_as(sonia, false);
  p := public.preview_commission_settlement(b2, emi_e, w5, w5 + 6);
  r := r || E'\n18 ' || case when (p ->> 'wages')::numeric = 640 and (p ->> 'total_amount')::numeric = 650 and (p ->> 'net_amount')::numeric = 650
    and (p ->> 'bonuses')::numeric = 100 and (p ->> 'advances')::numeric = 300 and (p ->> 'staff_deductions')::numeric = 40
    then 'OK' else 'FALLA' end || ' Emi W5: 640 + 200 + 50 + 100 − 300 − 40 = 650 → ' || (p ->> 'total_amount');
  v := public.settle_commissions(b2, emi_e, w5, w5 + 6, '[{"method":"cash","amount":400},{"method":"transfer","amount":250}]'::jsonb);
  r := r || E'\n19 ' || case when (v ->> 'total_amount')::numeric = 650 and private.cash_available(sess) = 100
    and exists (select 1 from public.cash_movements cm where cm.commission_settlement_id = (v ->> 'settlement_id')::uuid and cm.amount = 400 and cm.direction = 'out')
    then 'OK' else 'FALLA' end || ' pagado igual que la vista previa; $400 salen de la caja por el mismo camino (queda 100)';
  -- Freno de efectivo: Dago W5 (5 × 350 = 1750) no se paga en efectivo con 100 en caja.
  begin
    perform public.settle_commissions(b2, dago_e, w5, w5 + 6, '[{"method":"cash","amount":1750}]'::jsonb);
    r := r || E'\n20 FALLA pagó más efectivo del que hay';
  exception when others then r := r || E'\n20 ' || case when sqlstate = '55000' and private.cash_available(sess) = 100 then 'OK' else 'FALLA' end
    || ' freno de efectivo con sueldo [' || sqlstate || '] ' || sqlerrm; end;
  -- Saldo negativo: Emi W6 sueldo 640 − adelanto 1000 = −360 → recibo $0 y 360 pasan a W7 (640 − 360 = 280).
  perform pg_temp.dw_as(sonia, true);
  perform public.record_employee_ledger_entry(b2, emi_e, 'advance', 1000, 'Adelanto grande de prueba', 'bank', 'transfer');
  perform pg_temp.dw_as(sonia, false);
  v := public.settle_commissions(b2, emi_e, w6, w6 + 6, '[]'::jsonb);
  p := public.preview_commission_settlement(b2, emi_e, w7, w7 + 6);
  r := r || E'\n21 ' || case when (v ->> 'total_amount')::numeric = 0 and (v ->> 'carryover_out')::numeric = 360 and (v ->> 'wages')::numeric = 640
    and (p ->> 'carryover_in')::numeric = 360 and (p ->> 'wages')::numeric = 640 and (p ->> 'total_amount')::numeric = 280
    then 'OK' else 'FALLA' end || ' W6 neto −360 → $0 y arrastre; W7 640 − 360 = 280';

  -- ── (i) Finanzas: la utilidad baja exactamente en el sueldo devengado, igual en todas las pantallas ──
  perform pg_temp.dw_as(owner, false);
  f := private.report_financial_period(biz, b2, w1::timestamp at time zone tz, (w1 + 7)::timestamp at time zone tz, true);
  -- W1: venta de Dani 1000 (comisión 500); sueldos Dago 5 × 320 + Emi 2 × 320 = 2240 → utilidad 1000 − 500 − 2240 = −1740.
  r := r || E'\n22 ' || case when (f -> 'wages' ->> 'total')::numeric = 2240 and (f -> 'wages' ->> 'days')::int = 7
    and (f ->> 'profit')::numeric = -1740
    and (f ->> 'profit')::numeric = (f -> 'revenue' ->> 'total')::numeric - (f -> 'commissions' ->> 'total')::numeric - (f -> 'wages' ->> 'total')::numeric
    and exists (select 1 from jsonb_array_elements(f -> 'by_person') bp where bp ->> 'id' = dago_e::text and (bp ->> 'wage')::numeric = 1600 and (bp ->> 'contribution')::numeric = -1600)
    then 'OK' else 'FALLA' end || ' Finanzas W1: sueldos 2240, utilidad −1740 ' || (f -> 'wages')::text;
  execute 'set local role authenticated';
  md := public.business_metrics(b2, w1, w1 + 6, null);
  fr := public.business_full_report(b2, w1, w1 + 6, 'interno');
  select coalesce(sum(s.amount) filter (where s.kind = 'wage'), 0), count(*) into x, n from public.staff_cost_lines(b2, w1::timestamp at time zone tz, (w1 + 7)::timestamp at time zone tz) s;
  execute 'reset role';
  r := r || E'\n23 ' || case when (md -> 'kpis' ->> 'net')::numeric = -1740 and (md -> 'kpis' ->> 'wages')::numeric = 2240
    and (fr -> 'summary' -> 'kpis' ->> 'net')::numeric = -1740 and (fr -> 'financial' -> 'current' ->> 'profit')::numeric = -1740
    and x = 2240 and n = 7 then 'OK' else 'FALLA' end
    || ' Panel (base) = reporte = Finanzas = −1740; staff_cost_lines (Finanzas y Panel en la app) suma 2240 en 7 días';
  -- W2: Dago 4 días (falta del martes) + Emi 2 días = 1920; el recibo pagado de Dago (1280) coincide con su costo devengado.
  f := private.report_financial_period(biz, b2, w2::timestamp at time zone tz, (w2 + 7)::timestamp at time zone tz, true);
  select (bp ->> 'wage')::numeric into y from jsonb_array_elements(f -> 'by_person') bp where bp ->> 'id' = dago_e::text;
  r := r || E'\n24 ' || case when (f -> 'wages' ->> 'total')::numeric = 1920 and y = 1280
    and y = (select s.wage_amount from public.commission_settlements s where s.id = st2) then 'OK' else 'FALLA' end
    || ' W2: devengado 1920; Dago 1280 = lo pagado en su recibo';
  -- Periodo en curso: solo cuentan los días que ya empezaron (Emi 330 sábado y domingo desde el inicio del periodo en curso).
  execute 'set local role authenticated';
  select count(*) filter (where s.cost_date > today), count(*) into m, n
  from public.staff_cost_lines(b2, wk::timestamp at time zone tz, (wk_end + 1)::timestamp at time zone tz) s where s.kind = 'wage';
  execute 'reset role';
  select count(*) into x from generate_series(wk, least(today, wk_end), interval '1 day') d
  where extract(dow from d)::int in (0, 6) or (extract(dow from d)::int between 1 and 5);
  r := r || E'\n25 ' || case when m = 0 and n = x then 'OK' else 'FALLA' end || ' periodo en curso: ' || n || ' días devengados hasta hoy, ninguno futuro';

  -- ── (j) permisos ────────────────────────────────────────────────────────────────────────────────────
  m := 0;
  foreach v in array array['"dago"'::jsonb, '"dani"'::jsonb, '"lucia"'::jsonb] loop
    perform pg_temp.dw_as(case v #>> '{}' when 'dago' then dago when 'dani' then dani else lucia end, true);
    begin
      perform public.record_attendance_exception(b2, dago_e, wk + 1, 'absent', 'Intento sin permiso');
    exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
    perform pg_temp.dw_as(case v #>> '{}' when 'dago' then dago when 'dani' then dani else lucia end, true);
    begin
      perform public.set_employee_wage(b2, dago_e, 999, array[1, 2, 3, 4, 5, 6, 0], 'Intento sin permiso', null);
    exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  end loop;
  r := r || E'\n26 ' || case when m = 6 then 'OK' else 'FALLA' end || ' recepción, barbero y consulta no registran excepciones ni cambian sueldos (' || m || ' de 6 rechazos)';
  perform pg_temp.dw_as(sonia, true);
  begin
    perform public.set_employee_wage(b2, dago_e, 999, array[1, 2, 3, 4, 5], 'Gerencia intenta cambiar sueldo', null);
    r := r || E'\n27 FALLA gerencia cambió el sueldo';
  exception when others then r := r || E'\n27 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' gerencia no cambia sueldos (solo la cuenta principal) [' || sqlstate || ']'; end;
  -- RLS: cada quien ve solo lo suyo.
  perform pg_temp.dw_as(dago, false);
  execute 'set local role authenticated';
  select count(*), count(*) filter (where employee_id <> dago_e) into n, m from public.employee_wage_rates where branch_id = b2;
  select count(*) filter (where employee_id <> dago_e) into x from public.employee_attendance_exceptions where branch_id = b2;
  v := public.employee_wage_week(b2, emi_e, w3);
  execute 'reset role';
  r := r || E'\n28 ' || case when n = 2 and m = 0 and x = 0 and jsonb_array_length(v -> 'people') = 1 and v -> 'people' -> 0 ->> 'employee_id' = dago_e::text
    and (v -> 'people' -> 0 -> 'wage' ->> 'amount')::numeric = 1280 and not (v ->> 'can_edit')::boolean
    then 'OK' else 'FALLA' end || ' Dago ve solo su ficha y sus excepciones; su semana W3 = 1280 aunque pida la de Emi';
  perform pg_temp.dw_as(dani, false);
  execute 'set local role authenticated';
  select count(*) into n from public.employee_wage_rates where branch_id = b2;
  begin
    v := public.employee_wage_week(b2, null, w3);
    m := jsonb_array_length(v -> 'people');
  exception when others then m := -1; end;
  execute 'reset role';
  r := r || E'\n29 ' || case when n = 0 and m = 0 then 'OK' else 'FALLA' end || ' Dani (sin sueldo) no ve fichas ajenas; su semana sin sueldo';
  perform pg_temp.dw_as(dago, false);
  begin
    perform public.staff_cost_lines(b2, w1::timestamp at time zone tz, (w1 + 7)::timestamp at time zone tz);
    r := r || E'\n30 FALLA recepción leyó costos de personal';
  exception when others then
    begin
      perform public.get_settlement_receipt((select s.id from public.commission_settlements s where s.branch_id = b2 and s.employee_id = emi_e and s.period_start = w5));
      r := r || E'\n30 FALLA Dago vio el recibo de Emi';
    exception when others then r := r || E'\n30 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no lee costos de personal ni recibos ajenos'; end;
  end;
  perform pg_temp.dw_as(lucia, false);
  v := public.employee_wage_week(b2, null, w3);
  r := r || E'\n31 ' || case when jsonb_array_length(v -> 'people') = 2 and not (v ->> 'can_edit')::boolean then 'OK' else 'FALLA' end
    || ' consulta (Lucía) ve a las 2 personas con sueldo, sin editar';

  -- ── (k) vigencia: semanas anteriores no generan sueldo ──────────────────────────────────────────────
  perform pg_temp.dw_as(sonia, false);
  p := public.preview_commission_settlement(b2, dago_e, w0, w0 + 6);
  r := r || E'\n32 ' || case when (p ->> 'wages')::numeric = 0 and p -> 'wage' = 'null'::jsonb and p ->> 'reason' = 'nothing_to_pay'
    and not (private.wage_week_summary(biz, b2, dago_e, w0) ->> 'enabled')::boolean then 'OK' else 'FALLA' end
    || ' W0 (antes de la vigencia): sin sueldo, nada que pagar';

  -- ── libro: el sueldo no se cancela ni se modifica ───────────────────────────────────────────────────
  select l.id into ex2 from public.employee_ledger l where l.settlement_id = st1 and l.entry_type = 'wage';
  m := 0;
  perform pg_temp.dw_as(sonia, true);
  begin
    perform public.cancel_employee_ledger_entry(ex2, 'Cancelar el sueldo');
  exception when others then if sqlstate = '55000' then m := m + 1; end if; end;
  begin
    update public.employee_ledger set amount = 1 where id = ex2;
  exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  begin
    update public.employee_wage_rates set daily_amount = 1 where employee_id = dago_e and branch_id = b2;
  exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  begin
    delete from public.employee_attendance_exceptions where id = ex1;
  exception when others then if sqlstate = '42501' then m := m + 1; end if; end;
  r := r || E'\n33 ' || case when m = 4 then 'OK' else 'FALLA' end || ' sueldo, ficha y excepciones no se cancelan, cambian ni borran (' || m || ' de 4)';

  -- ── privilegios ─────────────────────────────────────────────────────────────────────────────────────
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('set_employee_wage', 'record_attendance_exception', 'void_attendance_exception',
         'employee_wage_week', 'staff_cost_lines') and grantee in ('anon', 'PUBLIC');
  select count(*) + n into n from information_schema.routine_privileges
   where routine_schema = 'private' and routine_name in ('wage_days', 'wage_week_summary', 'wage_cost_days', 'attendance_exception_guard')
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  select count(*) + n into n from information_schema.table_privileges
   where table_schema = 'public' and table_name in ('employee_wage_rates', 'employee_attendance_exceptions')
     and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT';
  select count(*) + n into n from information_schema.table_privileges
   where table_schema = 'public' and table_name in ('employee_wage_rates', 'employee_attendance_exceptions') and grantee in ('anon', 'PUBLIC');
  r := r || E'\n34 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin permisos de más (anon/public; escritura directa) [' || n || ']';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
