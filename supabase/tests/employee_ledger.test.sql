-- Pruebas de B7 (20261120050000_employee_ledger, 20261120051000_bonus_goals, 20261120052000_settlement_with_ledger).
-- Correr en simulacro: begin; <las tres migraciones>; <esta prueba>; rollback;
-- Todo ocurre dentro de un DO que termina con RAISE: nada se guarda. Usa una sucursal de prueba con su propia caja
-- (la caja real no se toca) y semanas de agosto de 2026 (sin datos reales).
-- Semanas (domingo): W1 2026-08-02, W2 08-09, W3 08-16, W4 08-23, W5 08-30, W6 09-06, W7 09-13.
-- Son anteriores a la transición del 15 nov 2026 (20261121100000_pay_period_thu_wed): siguen probando la regla vieja
-- (domingo a sábado, corte 8:00 p. m.), que rige esas fechas. La regla nueva se prueba en pay_period_thu_wed.test.sql.
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
  dani_e uuid := 'c7494a6f-baa9-426a-a313-a1c98824857a';
  deya_e uuid := '265d3ef7-22ce-41d3-82e4-5de43f3a8dd3';
  biz uuid; tz text; b2 uuid; env uuid; sess uuid; svc uuid; v jsonb; p jsonb; n int; m int; x numeric; y numeric;
  adv_env uuid; adv_cash uuid; adv_bank uuid; ded uuid; loan_a uuid; loan_b uuid; st1 uuid; goal uuid; e1 uuid; f jsonb;
  w1 date := '2026-08-02'; w2 date := '2026-08-09'; w3 date := '2026-08-16'; w4 date := '2026-08-23';
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

  -- Ayudas temporales (se revierten): identidad con o sin PIN y venta de un servicio con su comisión del 50 %.
  execute $f$create function pg_temp.b7_as(u uuid, pin boolean) returns void language plpgsql as $b$
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
  execute $f$create function pg_temp.b7_sale(p_biz uuid, p_branch uuid, p_emp uuid, p_svc uuid, p_by uuid, p_at timestamptz,
                                              p_price numeric, p_tip numeric, p_folio text) returns uuid language plpgsql as $b$
    declare s uuid := gen_random_uuid(); i uuid := gen_random_uuid();
    begin
      insert into public.sales (id, business_id, branch_id, status, subtotal_amount, discount_amount, total_amount, created_by, paid_at, created_at, folio)
      values (s, p_biz, p_branch, 'paid', p_price, 0, p_price, p_by, p_at, p_at, p_folio);
      insert into public.sale_items (id, business_id, branch_id, sale_id, item_type, service_id, employee_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total)
      values (i, p_biz, p_branch, s, 'service', p_svc, p_emp, 'Corte prueba B7', 1, p_price, 0, p_price);
      insert into public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, calculation_type, basis, basis_amount, percentage_snapshot, commission_amount, status, generated_at)
      values (p_biz, p_branch, s, i, p_emp, 'percentage', 'price_before_discount', p_price, 50, round(p_price * 0.5, 2), 'generated', p_at);
      if p_tip > 0 then
        insert into public.sale_tips (business_id, branch_id, sale_id, employee_id, amount, method, status, created_by, created_at)
        values (p_biz, p_branch, s, p_emp, p_tip, 'cash', 'generated', p_by, p_at);
      end if;
      return s;
    end $b$$f$;

  -- Sucursal de prueba con caja abierta ($500) y sobre con $1,000.
  insert into public.branches (business_id, name) values (biz, 'Sucursal de prueba B7 (se revierte)') returning id into b2;
  insert into public.user_branch_access (business_id, branch_id, user_id) select biz, b2, u from unnest(array[dani, deya, emi]) u;
  perform pg_temp.b7_as(owner, false);
  v := public.open_cash_session(b2, 500, 'Prueba del libro del empleado');
  select id into sess from public.cash_sessions where branch_id = b2 and status = 'open';
  env := private.default_envelope_id(b2);
  insert into public.envelope_movements (business_id, branch_id, envelope_id, direction, amount, source, reason, created_by)
  values (biz, b2, env, 'in', 1000, 'adjustment', 'Saldo de prueba B7', owner);

  -- 1 adelanto desde el sobre (gerencia con PIN)
  perform pg_temp.b7_as(sonia, true);
  v := public.record_employee_ledger_entry(b2, dani_e, 'advance', 300, 'Adelanto de prueba (sobre)', 'envelope', null, null, null, null, 'b7-prueba-adv-0001');
  adv_env := (v ->> 'entry_id')::uuid;
  r := r || E'\n1 ' || case when private.envelope_balance_of(env) = 700 and (v ->> 'receipt_effect')::numeric = -300
    and exists (select 1 from public.envelope_movements em where em.id = (v ->> 'envelope_movement_id')::uuid and em.source = 'staff_payout' and em.direction = 'out' and em.amount = 300)
    then 'OK' else 'FALLA' end || ' adelanto $300 del sobre -> sobre 700, salida staff_payout ' || v::text;

  -- 2 mismo envío (misma clave) no duplica aunque el PIN ya se usó
  v := public.record_employee_ledger_entry(b2, dani_e, 'advance', 300, 'Adelanto de prueba (sobre)', 'envelope', null, null, null, null, 'b7-prueba-adv-0001');
  select count(*) into n from public.employee_ledger where employee_id = dani_e and branch_id = b2;
  r := r || E'\n2 ' || case when (v ->> 'replayed')::boolean and n = 1 and private.envelope_balance_of(env) = 700 then 'OK' else 'FALLA' end || ' doble envío no duplica';

  -- 3 candado del sobre: no se entrega más de lo que hay
  perform pg_temp.b7_as(sonia, true);
  begin
    perform public.record_employee_ledger_entry(b2, dani_e, 'advance', 800, 'Adelanto mayor al sobre', 'envelope');
    r := r || E'\n3 FALLA entregó más que el saldo del sobre';
  exception when others then r := r || E'\n3 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' sobre sin saldo [' || sqlstate || '] ' || sqlerrm; end;

  -- 4 adelanto desde la caja del día con candado de cash_available
  v := public.record_employee_ledger_entry(b2, dani_e, 'advance', 200, 'Adelanto de prueba (caja)', 'cash_drawer');
  adv_cash := (v ->> 'entry_id')::uuid;
  r := r || E'\n4 ' || case when private.cash_available(sess) = 300 and (v ->> 'cash_available')::numeric = 300
    and exists (select 1 from public.cash_movements cm where cm.id = (v ->> 'cash_movement_id')::uuid and cm.movement_type = 'withdrawal' and cm.direction = 'out' and cm.amount = 200)
    then 'OK' else 'FALLA' end || ' adelanto $200 de la caja -> disponible 300';
  perform pg_temp.b7_as(sonia, true);
  begin
    perform public.record_employee_ledger_entry(b2, dani_e, 'advance', 400, 'Adelanto mayor a la caja', 'cash_drawer');
    r := r || E'\n5 FALLA sacó más efectivo del que hay';
  exception when others then r := r || E'\n5 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' caja sin efectivo suficiente [' || sqlstate || '] ' || sqlerrm; end;

  -- 6 cancelar ANTES de incluirse: adelanto de caja -> regresa a la caja abierta; adelanto de banco -> solo se marca
  v := public.record_employee_ledger_entry(b2, dani_e, 'advance', 100, 'Adelanto que se cancela', 'cash_drawer');
  e1 := (v ->> 'entry_id')::uuid;
  perform pg_temp.b7_as(sonia, true);
  v := public.cancel_employee_ledger_entry(e1, 'Se registró por error');
  r := r || E'\n6 ' || case when v ->> 'returned_to' = 'cash_drawer' and private.cash_available(sess) = 300
    and exists (select 1 from public.employee_ledger l where l.reverses_entry_id = e1 and l.entry_type = 'reversal')
    then 'OK' else 'FALLA' end || ' cancelar adelanto de caja antes del recibo: regresa a la caja (disponible 300)';
  perform pg_temp.b7_as(sonia, true);
  v := public.record_employee_ledger_entry(b2, dani_e, 'advance', 100, 'Adelanto por transferencia', 'bank', 'transfer');
  adv_bank := (v ->> 'entry_id')::uuid;
  perform pg_temp.b7_as(sonia, true);
  v := public.cancel_employee_ledger_entry(adv_bank, 'Ya no lo necesitó');
  perform pg_temp.b7_as(sonia, true);
  begin
    perform public.cancel_employee_ledger_entry(adv_bank, 'Cancelar dos veces');
    r := r || E'\n7 FALLA canceló dos veces';
  exception when others then r := r || E'\n7 ' || case when sqlstate = '55000' and v ->> 'returned_to' = 'none' then 'OK' else 'FALLA' end || ' banco: solo se marca; segunda cancelación rechazada [' || sqlstate || ']'; end;

  -- 8 descuento (producto que se llevó): no mueve dinero
  perform pg_temp.b7_as(sonia, true);
  v := public.record_employee_ledger_entry(b2, dani_e, 'deduction', 50, 'Se llevó una cera', null);
  ded := (v ->> 'entry_id')::uuid;
  r := r || E'\n8 ' || case when (v ->> 'receipt_effect')::numeric = -50 and v ->> 'paid_from' is null and private.cash_available(sess) = 300 and private.envelope_balance_of(env) = 700
    then 'OK' else 'FALLA' end || ' descuento $50 sin mover dinero';

  -- 9 semana 1: comisión $1,000 + propina $100 − adelantos $500 − descuento $50 = $550; sin metas -> nada de bonos
  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w1 + time '13:00') at time zone tz, 2000, 100, 'V2632-9701');
  perform pg_temp.b7_as(sonia, false);
  p := public.preview_commission_settlement(b2, dani_e, w1, w1 + 6);
  r := r || E'\n9 ' || case when (p ->> 'total_amount')::numeric = 550 and (p ->> 'advances')::numeric = 500 and (p ->> 'staff_deductions')::numeric = 50
    and (p ->> 'gross_commission')::numeric = 1000 and (p ->> 'tips')::numeric = 100 and (p ->> 'bonuses')::numeric = 0
    and not (p ->> 'bonus_goals_enabled')::boolean and jsonb_array_length(p -> 'ledger_lines') = 3 and (p ->> 'can_settle')::boolean
    then 'OK' else 'FALLA' end || ' vista previa W1: ' || p::text;

  -- 10 recibo W1 pagado $300 efectivo + $250 transferencia: descuenta los adelantos y sella los asientos
  v := public.settle_commissions(b2, dani_e, w1, w1 + 6, '[{"method":"cash","amount":300},{"method":"transfer","amount":250}]'::jsonb);
  st1 := (v ->> 'settlement_id')::uuid;
  select count(*) into n from public.employee_ledger where settlement_id = st1;
  r := r || E'\n10 ' || case when (v ->> 'total_amount')::numeric = 550 and n = 3 and private.cash_available(sess) = 0
    and exists (select 1 from public.commission_settlements s where s.id = st1 and s.advance_amount = 500 and s.deduction_amount = 50 and s.bonus_amount = 0 and s.carryover_out_amount = 0)
    then 'OK' else 'FALLA' end || ' recibo W1 $550 (3 asientos sellados; caja 500 − 200 adelanto − 300 recibo = 0) ' || v::text;

  -- 11 recibo con desglose
  v := public.get_settlement_receipt(st1);
  r := r || E'\n11 ' || case when (v ->> 'advances')::numeric = 500 and (v ->> 'staff_deductions')::numeric = 50 and (v ->> 'net_amount')::numeric = 550
    and jsonb_array_length(v -> 'ledger_lines') = 3 and (v ->> 'total_amount')::numeric = 550 and (v ->> 'gross_commission')::numeric = 1000
    then 'OK' else 'FALLA' end || ' recibo con adelantos y descuento';

  -- 12 liquidar dos veces la misma semana no duplica
  v := public.settle_commissions(b2, dani_e, w1, w1 + 6, '[{"method":"transfer","amount":550}]'::jsonb);
  select count(*) into n from public.employee_ledger where employee_id = dani_e and branch_id = b2;
  select count(*) into m from public.commission_settlements where branch_id = b2 and employee_id = dani_e;
  r := r || E'\n12 ' || case when (v ->> 'idempotent_replay')::boolean and n = 7 and m = 1 then 'OK' else 'FALLA' end || ' segunda liquidación: replay, sin asientos nuevos (' || n || ')';

  -- 13 cancelar DESPUÉS de incluirse en un recibo: rechazado
  perform pg_temp.b7_as(sonia, true);
  begin
    perform public.cancel_employee_ledger_entry(adv_env, 'Cancelar ya pagado');
    r := r || E'\n13 FALLA canceló un asiento ya incluido';
  exception when others then r := r || E'\n13 ' || case when sqlstate = '55000' and sqlerrm like '%recibo%' then 'OK' else 'FALLA' end || ' asiento en recibo no se cancela [' || sqlstate || '] ' || sqlerrm; end;

  -- 14 préstamo A a Dani: $300 en 3 abonos de $100 (banco)
  perform pg_temp.b7_as(sonia, true);
  v := public.record_employee_ledger_entry(b2, dani_e, 'loan', 300, 'Préstamo de prueba', 'bank', 'transfer', null, null, 100);
  loan_a := (v ->> 'loan_id')::uuid;
  -- préstamo B a Deya: $400 a $100 por semana, del sobre
  perform pg_temp.b7_as(sonia, true);
  v := public.record_employee_ledger_entry(b2, deya_e, 'loan', 400, 'Préstamo de prueba Deya', 'envelope', null, null, null, 100);
  loan_b := (v ->> 'loan_id')::uuid;
  r := r || E'\n14 ' || case when private.loan_outstanding(loan_a) = 300 and private.loan_outstanding(loan_b) = 400 and private.envelope_balance_of(env) = 300
    then 'OK' else 'FALLA' end || ' préstamos registrados (sobre 700 − 400 = ' || private.envelope_balance_of(env) || ')';

  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w2 + time '13:00') at time zone tz, 1000, 0, 'V2632-9702');
  perform pg_temp.b7_sale(biz, b2, deya_e, svc, owner, (w2 + time '14:00') at time zone tz, 1000, 0, 'V2632-9703');
  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w3 + time '13:00') at time zone tz, 1000, 0, 'V2633-9704');
  perform pg_temp.b7_sale(biz, b2, deya_e, svc, owner, (w3 + time '14:00') at time zone tz, 1000, 0, 'V2633-9705');
  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w4 + time '13:00') at time zone tz, 1000, 0, 'V2634-9706');
  perform pg_temp.b7_as(sonia, false);
  v := public.settle_commissions(b2, dani_e, w2, w2 + 6, '[{"method":"transfer","amount":400}]'::jsonb);
  x := private.loan_outstanding(loan_a);
  v := public.settle_commissions(b2, dani_e, w3, w3 + 6, '[{"method":"transfer","amount":400}]'::jsonb);
  v := public.settle_commissions(b2, dani_e, w4, w4 + 6, '[{"method":"transfer","amount":400}]'::jsonb);
  select count(*) into n from public.employee_ledger where loan_id = loan_a and entry_type = 'loan_payment' and generated_by_settlement;
  r := r || E'\n15 ' || case when x = 200 and n = 3 and private.loan_outstanding(loan_a) = 0
    and (select loan_payment_amount from public.commission_settlements where id = (v ->> 'settlement_id')::uuid) = 100
    then 'OK' else 'FALLA' end || ' préstamo A en 3 abonos (W2, W3, W4: $500 − $100 = $400 cada recibo), saldo 0';
  -- 16 ya pagado: la semana siguiente no genera abono
  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w6 + time '12:00') at time zone tz, 200, 0, 'V2636-9799');
  p := public.preview_commission_settlement(b2, dani_e, w6, w6 + 6);
  r := r || E'\n16 ' || case when (p ->> 'loan_payments')::numeric = 0 then 'OK' else 'FALLA' end || ' préstamo pagado: sin más abonos';

  -- 17 préstamo B: abono W2 y liquidación anticipada en efectivo a la caja
  v := public.settle_commissions(b2, deya_e, w2, w2 + 6, '[{"method":"transfer","amount":400}]'::jsonb);
  perform pg_temp.b7_as(sonia, true);
  v := public.record_employee_ledger_entry(b2, deya_e, 'loan_payment', 300, 'Liquidación anticipada del préstamo', 'cash_drawer', null, null, loan_b);
  r := r || E'\n17 ' || case when private.loan_outstanding(loan_b) = 0 and private.cash_available(sess) = 300 and (v ->> 'receipt_effect')::numeric = 0
    then 'OK' else 'FALLA' end || ' liquidación anticipada $300 a la caja: saldo 0, caja 300';
  perform pg_temp.b7_as(sonia, false);
  p := public.preview_commission_settlement(b2, deya_e, w3, w3 + 6);
  r := r || E'\n18 ' || case when (p ->> 'loan_payments')::numeric = 0 and (p ->> 'total_amount')::numeric = 500 then 'OK' else 'FALLA' end || ' después de liquidar: W3 sin abono ($500)';
  perform pg_temp.b7_as(sonia, true);
  begin
    perform public.record_employee_ledger_entry(b2, deya_e, 'loan_payment', 10, 'Abono de más', 'bank', 'transfer', null, loan_b);
    r := r || E'\n19 FALLA aceptó abonar más que el saldo';
  exception when others then r := r || E'\n19 ' || case when sqlstate = '55000' then 'OK' else 'FALLA' end || ' abono mayor al saldo rechazado [' || sqlstate || ']'; end;

  -- 20 neto negativo: W5 comisión $100 − descuento $250 = −150 -> recibo $0 y arrastre de $150 a W6
  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w5 + time '13:00') at time zone tz, 200, 0, 'V2635-9707');
  perform pg_temp.b7_as(sonia, true);
  v := public.record_employee_ledger_entry(b2, dani_e, 'deduction', 250, 'Daño a una máquina', null);
  perform pg_temp.b7_as(sonia, false);
  p := public.preview_commission_settlement(b2, dani_e, w5, w5 + 6);
  v := public.settle_commissions(b2, dani_e, w5, w5 + 6, '[]'::jsonb);
  r := r || E'\n20 ' || case when (p ->> 'total_amount')::numeric = 0 and (p ->> 'carryover_out')::numeric = 150 and (p ->> 'net_amount')::numeric = -150
    and (v ->> 'total_amount')::numeric = 0 and (v ->> 'carryover_out')::numeric = 150
    and exists (select 1 from public.employee_ledger l where l.origin_settlement_id = (v ->> 'settlement_id')::uuid and l.entry_type = 'carryover'
                and l.amount = 150 and l.week_start = w6 and l.settlement_id is null)
    and not exists (select 1 from public.cash_movements cm where cm.commission_settlement_id = (v ->> 'settlement_id')::uuid)
    then 'OK' else 'FALLA' end || ' neto −150 -> recibo $0, arrastre 150 a W6, sin movimiento de caja';
  -- 21 W6: comisión $100 − arrastre $150 = −50 -> otra vez $0 y arrastra 50; agrego venta para que alcance
  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w6 + time '15:00') at time zone tz, 400, 0, 'V2636-9708');
  p := public.preview_commission_settlement(b2, dani_e, w6, w6 + 6);
  v := public.settle_commissions(b2, dani_e, w6, w6 + 6, '[{"method":"transfer","amount":150}]'::jsonb);
  r := r || E'\n21 ' || case when (p ->> 'carryover_in')::numeric = 150 and (v ->> 'total_amount')::numeric = 150 and (v ->> 'carryover_in')::numeric = 150
    and not exists (select 1 from public.employee_ledger l where l.employee_id = dani_e and l.branch_id = b2 and l.settlement_id is null and l.receipt_effect <> 0
                    and not exists (select 1 from public.employee_ledger q where q.reverses_entry_id = l.id))
    then 'OK' else 'FALLA' end || ' W6: $300 − arrastre $150 = $150; ya no queda nada pendiente';

  -- 22 bonos: la cuenta principal crea una meta (2 servicios por semana, $200, todos los barberos)
  perform pg_temp.b7_as(sonia, false);
  begin
    perform public.save_bonus_goal(b2, null, 'Meta de prueba', 'services_count', 2, 200, 'all_barbers', null, '2026-09-01');
    r := r || E'\n22 FALLA gerencia creó una meta';
  exception when others then r := r || E'\n22 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' gerencia no configura metas [' || sqlstate || ']'; end;
  perform pg_temp.b7_as(owner, false);
  v := public.save_bonus_goal(b2, null, 'Meta de prueba', 'services_count', 2, 200, 'all_barbers', null, '2026-09-01');
  goal := (v ->> 'id')::uuid;
  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w7 + time '11:00') at time zone tz, 300, 0, 'V2637-9709');
  perform pg_temp.b7_sale(biz, b2, dani_e, svc, owner, (w7 + time '12:00') at time zone tz, 300, 0, 'V2637-9710');
  perform pg_temp.b7_sale(biz, b2, deya_e, svc, owner, (w7 + time '12:00') at time zone tz, 300, 0, 'V2637-9711');
  -- 23 avance de la semana: Dani ve solo lo suyo (cumplida), Deya solo lo suyo (le falta 1)
  perform pg_temp.b7_as(dani, false);
  v := public.bonus_goal_progress(b2, deya_e, w7);
  perform pg_temp.b7_as(deya, false);
  p := public.bonus_goal_progress(b2, null, w7);
  r := r || E'\n23 ' || case when (v ->> 'enabled')::boolean and jsonb_array_length(v -> 'people') = 1 and v #>> '{people,0,employee_id}' = dani_e::text
    and (v #>> '{people,0,goals,0,achieved}')::boolean and jsonb_array_length(p -> 'people') = 1 and p #>> '{people,0,employee_id}' = deya_e::text
    and (p #>> '{people,0,goals,0,remaining}')::numeric = 1
    then 'OK' else 'FALLA' end || ' avance: cada barbero ve solo lo suyo ' || v::text;
  perform pg_temp.b7_as(emi, false);
  begin
    v := public.bonus_goal_progress(b2, null, w7);
    r := r || E'\n24 ' || case when jsonb_array_length(v -> 'people') = 0 then 'OK' else 'FALLA' end || ' recepción no ve el avance de otros (' || jsonb_array_length(v -> 'people') || ')';
  exception when others then r := r || E'\n24 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' recepción no ve el avance de otros [' || sqlstate || ']'; end;
  -- 25 bono que se cumple (Dani, 2 servicios) y bono que no (Deya, 1)
  perform pg_temp.b7_as(sonia, false);
  v := public.settle_commissions(b2, dani_e, w7, w7 + 6, '[{"method":"transfer","amount":500}]'::jsonb);
  p := public.settle_commissions(b2, deya_e, w7, w7 + 6, '[{"method":"transfer","amount":150}]'::jsonb);
  r := r || E'\n25 ' || case when (v ->> 'bonuses')::numeric = 200 and (v ->> 'total_amount')::numeric = 500
    and exists (select 1 from public.employee_ledger l where l.entry_type = 'bonus' and l.bonus_goal_id = goal and l.employee_id = dani_e
                and l.settlement_id = (v ->> 'settlement_id')::uuid and l.week_start = w7)
    and (p ->> 'bonuses')::numeric = 0 and not exists (select 1 from public.employee_ledger l where l.entry_type = 'bonus' and l.employee_id = deya_e)
    then 'OK' else 'FALLA' end || ' bono: Dani $300 + $200 = $500; Deya sin bono ($150)';
  -- 26 el bono es costo en la utilidad (Finanzas)
  f := private.report_financial_period(biz, b2, (w7::timestamp) at time zone tz, ((w7 + 7)::timestamp) at time zone tz, true);
  r := r || E'\n26 ' || case when (f -> 'bonuses' ->> 'total')::numeric = 200
    and (f ->> 'profit')::numeric = (f -> 'revenue' ->> 'total')::numeric - (f -> 'commissions' ->> 'total')::numeric - 200
                                    - (f -> 'product_cost' ->> 'total')::numeric - (f -> 'expenses' ->> 'total')::numeric
    and (f ->> 'profit')::numeric = 900 - 450 - 200
    then 'OK' else 'FALLA' end || ' utilidad W7 = 900 − 450 − 200 = ' || (f ->> 'profit');
  -- 27 meta desactivada -> nada de bonos en la vista previa
  perform pg_temp.b7_as(owner, false);
  v := public.save_bonus_goal(b2, goal, null, null, null, null, null, null, null, null, false);
  v := public.bonus_goal_progress(b2, null, w7 + 7);
  r := r || E'\n27 ' || case when not (v ->> 'enabled')::boolean and jsonb_array_length(v -> 'people') = 0 then 'OK' else 'FALLA' end || ' meta apagada: enabled false';

  -- 28-30 lectura por RLS
  perform pg_temp.b7_as(dani, false);
  execute 'set local role authenticated';
  select count(*) filter (where employee_id <> dani_e), count(*) filter (where employee_id = dani_e) into n, m from public.employee_ledger;
  select count(*) into x from public.employee_loans where employee_id <> dani_e;
  select count(*) into y from public.employee_ledger_list(b2, null);
  execute 'reset role';
  r := r || E'\n28 ' || case when n = 0 and m > 0 and x = 0 and y = m then 'OK' else 'FALLA' end || ' barbero ve solo su libro (' || m || ' suyos, ' || n || ' ajenos)';
  perform pg_temp.b7_as(emi, false);
  execute 'set local role authenticated';
  -- (solo cuentan los asientos de OTROS: si en desarrollo Emi tuviera asientos propios, verlos es correcto)
  select count(*) into n from public.employee_ledger l where not exists (select 1 from public.employees e where e.id = l.employee_id and e.user_id = emi);
  select count(*) into m from public.employee_loans l where not exists (select 1 from public.employees e where e.id = l.employee_id and e.user_id = emi);
  execute 'reset role';
  r := r || E'\n29 ' || case when n = 0 and m = 0 then 'OK' else 'FALLA' end || ' recepción no ve el libro de otros';
  perform pg_temp.b7_as(lucia, false);
  execute 'set local role authenticated';
  select count(*) into n from public.employee_ledger where branch_id = b2;
  select count(*) into m from public.employee_loans_with_balance(b2, null);
  execute 'reset role';
  r := r || E'\n30 ' || case when n > 10 and m = 2 then 'OK' else 'FALLA' end || ' consulta ve todo (' || n || ' asientos, ' || m || ' préstamos)';

  -- 31-34 nadie actualiza ni borra el libro
  perform pg_temp.b7_as(owner, false);
  begin
    execute 'set local role authenticated';
    update public.employee_ledger set amount = 1 where id = ded;
    execute 'reset role';
    r := r || E'\n31 FALLA authenticated actualizó';
  exception when others then r := r || E'\n31 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' UPDATE como usuario rechazado [' || sqlstate || ']'; end;
  execute 'reset role';
  begin
    update public.employee_ledger set amount = 1 where id = ded;
    r := r || E'\n32 FALLA el dueño de la base actualizó';
  exception when others then r := r || E'\n32 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' UPDATE aun como dueño de la base rechazado [' || sqlstate || ']'; end;
  begin
    update public.employee_ledger set settlement_id = null where id = ded;
    r := r || E'\n33 FALLA se quitó el sello del recibo';
  exception when others then r := r || E'\n33 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' quitar el sello del recibo rechazado [' || sqlstate || ']'; end;
  begin
    delete from public.employee_ledger where id = ded;
    r := r || E'\n34 FALLA se borró un asiento';
  exception when others then r := r || E'\n34 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' DELETE rechazado [' || sqlstate || ']'; end;
  begin
    delete from public.employee_loans where id = loan_a;
    r := r || E'\n35 FALLA se borró un préstamo';
  exception when others then r := r || E'\n35 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' préstamo no se borra [' || sqlstate || ']'; end;

  -- 36-39 permisos para registrar
  foreach e1 in array array[dani, lucia, emi] loop
    perform pg_temp.b7_as(e1, true);
    begin
      perform public.record_employee_ledger_entry(b2, dani_e, 'deduction', 10, 'Intento sin permiso', null);
      r := r || E'\n36-38 FALLA ' || e1 || ' registró';
    exception when others then r := r || E'\n36-38 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin permiso para registrar [' || sqlstate || ']'; end;
  end loop;
  perform pg_temp.b7_as(sonia, false);
  begin
    perform public.record_employee_ledger_entry(b2, dani_e, 'deduction', 10, 'Descuento sin PIN', null);
    r := r || E'\n39 FALLA aceptó sin PIN';
  exception when others then r := r || E'\n39 ' || case when sqlstate = '42501' then 'OK' else 'FALLA' end || ' sin PIN rechazado [' || sqlstate || ']'; end;

  -- 40 bitácora con PIN
  select count(*) into n from public.audit_log a where a.action = 'pin_confirmed_action' and a.after_data ->> 'action' like 'employee_ledger_%' and a.branch_id = b2;
  r := r || E'\n40 ' || case when n >= 9 then 'OK' else 'FALLA' end || ' bitácora con PIN (' || n || ')';

  -- 41 sin permiso de ejecución para anon/public
  select count(*) into n from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('record_employee_ledger_entry', 'cancel_employee_ledger_entry', 'employee_ledger_list',
         'employee_loans_with_balance', 'save_bonus_goal', 'bonus_goal_progress') and grantee in ('anon', 'PUBLIC');
  select count(*) + n into n from information_schema.routine_privileges
   where routine_schema = 'private' and routine_name in ('settlement_ledger_breakdown', 'loan_outstanding', 'bonus_goal_evaluation', 'business_full_report_base')
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  r := r || E'\n41 ' || case when n = 0 then 'OK' else 'FALLA' end || ' sin permiso para anon/public; funciones internas cerradas';

  -- 42 reporte completo, versión contador: pagos al personal sin datos de inicio de sesión
  perform pg_temp.b7_as(owner, false);
  execute 'set local role authenticated';
  v := public.business_full_report(b2, current_date - 2, current_date + 1, 'contador');
  execute 'reset role';
  r := r || E'\n42 ' || case when jsonb_array_length(v -> 'payouts' -> 'staff_ledger') > 10 and (v -> 'payouts' -> 'staff_totals' ->> 'bonuses')::numeric = 200
    and jsonb_array_length(v -> 'payouts' -> 'settlements') = 9 and (v -> 'payouts' -> 'settlements' -> 0) ? 'advances'
    and position('login_name' in v::text) = 0 and position('@gallo-420.barberos.invalid' in v::text) = 0
    then 'OK' else 'FALLA' end || ' reporte contador con pagos al personal (' || jsonb_array_length(v -> 'payouts' -> 'staff_ledger') || ' asientos)';

  raise exception 'RESULTADOS (todo se revierte):%', r;
end
$t$;
