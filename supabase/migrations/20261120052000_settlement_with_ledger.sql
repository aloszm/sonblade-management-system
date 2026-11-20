-- B7 (3/3) Recibo semanal completo.
-- neto = comisiones − ajustes por anulaciones + propinas + bonos − adelantos − abonos de préstamo − descuentos − arrastre anterior.
-- Si el neto es negativo, el recibo se paga en $0 y el faltante pasa a la semana siguiente como asiento `carryover`
-- (nunca se cobra efectivo al empleado en el recibo). Sin asientos en el libro y sin metas activas el resultado es
-- exactamente el de antes (mismas comisiones, ajustes y propinas; mismo total, pagos, retiro de caja y folio).
-- 1) commission_settlements: columnas de desglose (0 por omisión; los recibos anteriores quedan en 0).
-- 2) private.settlement_ledger_breakdown: el mismo cálculo para la vista previa y para liquidar.
--    - Asientos pendientes: todos los del libro de esa persona y sucursal sin recibo, con efecto ≠ 0 y no cancelados
--      (adelantos, descuentos, abonos a descontar y arrastres). Se descuentan COMPLETOS.
--    - Abono semanal de cada préstamo: min(abono por semana, saldo, lo que alcance). Un abono semanal nunca vuelve
--      negativo el recibo: si no alcanza, ese préstamo espera a la semana siguiente (no se convierte en arrastre).
--    - Bonos: metas activas que aplican y se cumplen en la ventana de esa semana (bonus_goal_evaluation).
-- 3) settle_commissions_impl / preview_commission_settlement_impl / get_settlement_receipt_impl con el desglose
--    (claves anteriores sin cambio; claves nuevas opcionales).
-- 4) Utilidad: los bonos son costo (report_financial_period → profit, by_person.contribution; profit_kpis.bonuses), por
--    la fecha del fin de su semana (sábado 8 pm). Adelantos, préstamos, abonos y descuentos al empleado NO tocan la
--    utilidad: un adelanto es pago anticipado de comisiones ya contadas; un préstamo y su abono no son costo ni ingreso;
--    un descuento al empleado es una recuperación (no es venta) y se muestra aparte en el reporte.
-- 5) Reporte completo (interno y contador): payouts.settlements con desglose, payouts.staff_ledger y payouts.staff_totals.
--    Se envuelve la función vigente (renombrada a business_full_report_base) en vez de reescribirla.

-- ── 1) Columnas de desglose ───────────────────────────────────────────────────────────────────────────
alter table public.commission_settlements
  add column bonus_amount numeric(12,2) not null default 0 check (bonus_amount >= 0),
  add column advance_amount numeric(12,2) not null default 0 check (advance_amount >= 0),
  add column loan_payment_amount numeric(12,2) not null default 0 check (loan_payment_amount >= 0),
  add column deduction_amount numeric(12,2) not null default 0 check (deduction_amount >= 0),
  add column carryover_in_amount numeric(12,2) not null default 0 check (carryover_in_amount >= 0),
  add column carryover_out_amount numeric(12,2) not null default 0 check (carryover_out_amount >= 0);
comment on column public.commission_settlements.deduction_amount is 'Descuentos al empleado del libro (B7). Los ajustes por anulaciones siguen en commission_settlement_lines (adjustment).';
comment on column public.commission_settlements.carryover_out_amount is 'Faltante que pasa a la semana siguiente (neto negativo; el recibo se pagó en $0).';

-- ── 2) Desglose del libro para una semana ─────────────────────────────────────────────────────────────
-- p_base = comisiones − ajustes por anulaciones + propinas (lo que ya calculaba la liquidación).
create or replace function private.settlement_ledger_breakdown(p_business_id uuid, p_branch_id uuid, p_employee_id uuid,
                                                              p_period_start date, p_period_end date, p_base numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_bonus numeric(12,2) := 0;
  v_bonus_lines jsonb := '[]'::jsonb;
  v_goals jsonb;
  v_adv numeric(12,2);
  v_ded numeric(12,2);
  v_extra numeric(12,2);
  v_carry numeric(12,2);
  v_ids jsonb;
  v_lines jsonb;
  v_avail numeric(12,2);
  v_loan record;
  v_pay numeric(12,2);
  v_sched jsonb := '[]'::jsonb;
  v_sched_total numeric(12,2) := 0;
  v_waiting jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('goal_id', g.goal_id, 'name', g.name, 'metric', g.metric, 'threshold', g.threshold,
                    'value', g.value, 'achieved', g.achieved, 'bonus_amount', g.bonus_amount) order by g.name), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('goal_id', g.goal_id, 'name', g.name, 'metric', g.metric, 'threshold', g.threshold,
                    'value', g.value, 'amount', g.bonus_amount) order by g.name) filter (where g.achieved), '[]'::jsonb),
         coalesce(sum(g.bonus_amount) filter (where g.achieved), 0)
    into v_goals, v_bonus_lines, v_bonus
  from private.bonus_goal_evaluation(p_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end) g
  where not exists (select 1 from public.employee_ledger b where b.entry_type = 'bonus' and b.bonus_goal_id = g.goal_id
                      and b.employee_id = p_employee_id and b.week_start = p_period_start);

  select coalesce(sum(l.amount) filter (where l.entry_type = 'advance'), 0),
         coalesce(sum(l.amount) filter (where l.entry_type = 'deduction'), 0),
         coalesce(sum(l.amount) filter (where l.entry_type = 'loan_payment'), 0),
         coalesce(sum(l.amount) filter (where l.entry_type = 'carryover'), 0),
         coalesce(jsonb_agg(to_jsonb(l.id) order by l.created_at, l.id), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('entry_id', l.id, 'entry_type', l.entry_type, 'amount', l.amount,
                    'receipt_effect', l.receipt_effect, 'reason', l.reason, 'paid_from', l.paid_from, 'loan_id', l.loan_id,
                    'week_start', l.week_start, 'created_at', l.created_at) order by l.created_at, l.id), '[]'::jsonb)
    into v_adv, v_ded, v_extra, v_carry, v_ids, v_lines
  from public.employee_ledger l
  where l.business_id = p_business_id and l.branch_id = p_branch_id and l.employee_id = p_employee_id
    and l.settlement_id is null and l.receipt_effect <> 0
    and not exists (select 1 from public.employee_ledger r where r.reverses_entry_id = l.id);

  v_avail := p_base + v_bonus - v_adv - v_ded - v_extra - v_carry;

  for v_loan in
    select l.id, l.weekly_amount, private.loan_outstanding(l.id) as outstanding
    from public.employee_loans l
    where l.business_id = p_business_id and l.branch_id = p_branch_id and l.employee_id = p_employee_id
    order by l.created_at, l.id
  loop
    continue when v_loan.outstanding <= 0;
    v_pay := least(v_loan.weekly_amount, v_loan.outstanding, greatest(v_avail, 0));
    if v_pay > 0 then
      v_sched := v_sched || jsonb_build_object('loan_id', v_loan.id, 'amount', v_pay, 'outstanding_before', v_loan.outstanding,
                                               'outstanding_after', v_loan.outstanding - v_pay);
      v_sched_total := v_sched_total + v_pay;
      v_avail := v_avail - v_pay;
    end if;
    if v_pay < least(v_loan.weekly_amount, v_loan.outstanding) then
      v_waiting := v_waiting || jsonb_build_object('loan_id', v_loan.id, 'scheduled', least(v_loan.weekly_amount, v_loan.outstanding),
                                                   'charged', v_pay, 'outstanding', v_loan.outstanding - v_pay);
    end if;
  end loop;

  return jsonb_build_object(
    'base', p_base,
    'bonus_total', v_bonus, 'bonus_lines', v_bonus_lines, 'bonus_goals', v_goals,
    'advances', v_adv, 'deductions', v_ded,
    'loan_extra', v_extra, 'loan_scheduled', v_sched_total, 'loan_payments', v_extra + v_sched_total,
    'loan_scheduled_lines', v_sched, 'loans_waiting', v_waiting,
    'carryover_in', v_carry,
    'pending_ids', v_ids, 'pending_lines', v_lines,
    'net', v_avail, 'total', greatest(v_avail, 0), 'carryover_out', greatest(-v_avail, 0));
end;
$function$;
revoke all on function private.settlement_ledger_breakdown(uuid, uuid, uuid, date, date, numeric) from public, anon, authenticated;

-- ── 3a) Liquidar ──────────────────────────────────────────────────────────────────────────────────────
create or replace function private.settle_commissions_impl(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date, p_payments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_business_id uuid;
  v_window record;
  v_existing public.commission_settlements%ROWTYPE;
  v_settlement_id uuid;
  v_entry record;
  v_adjustment record;
  v_payment jsonb;
  v_gross numeric(12,2);
  v_deduction_budget numeric(12,2);
  v_deduction numeric(12,2);
  v_total numeric(12,2);
  v_pay_sum numeric(12,2) := 0;
  v_cash numeric(12,2) := 0;
  v_methods text[] := ARRAY[]::text[];
  v_method public.payment_method;
  v_amount numeric(12,2);
  v_ref text;
  v_cash_session_id uuid;
  v_receipt text;
  v_tips numeric(12,2) := 0;
  v_led jsonb;
  v_line jsonb;
  v_carry_out numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
     OR extract(dow from p_period_start) <> 0 OR p_period_end <> p_period_start + 6
     OR p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'Settlement must use a Sunday-to-Saturday week' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = b.business_id AND e.id = p_employee_id);
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Settlement permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_window FROM private.settlement_window(v_business_id, p_period_start, p_period_end);

  PERFORM private.employee_pay_lock(v_business_id, p_branch_id, p_employee_id);
  SELECT * INTO v_existing FROM public.commission_settlements
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND employee_id = p_employee_id
    AND period_start = p_period_start AND period_end = p_period_end;
  IF FOUND THEN
    RETURN jsonb_build_object('settlement_id', v_existing.id, 'receipt_number', v_existing.receipt_number,
      'total_amount', v_existing.total_amount, 'idempotent_replay', true);
  END IF;
  IF now() < v_window.end_ts THEN
    RAISE EXCEPTION 'The week closes on Saturday at 8:00 pm and cannot be settled yet' USING ERRCODE = '55000';
  END IF;

  PERFORM 1 FROM public.commission_entries ce
  WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id
    AND ce.status = 'generated' AND ce.generated_at > v_window.start_ts AND ce.generated_at <= v_window.end_ts
    AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id)
  FOR UPDATE;
  SELECT COALESCE(sum(ce.commission_amount), 0) INTO v_gross FROM public.commission_entries ce
  WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id
    AND ce.status = 'generated' AND ce.generated_at > v_window.start_ts AND ce.generated_at <= v_window.end_ts
    AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id);
  PERFORM 1 FROM public.sale_tips t
    WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id
      AND t.status = 'generated' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts
  FOR UPDATE;
  SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t
    WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id
      AND t.status = 'generated' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts;
  IF v_gross + v_tips <= 0 THEN RAISE EXCEPTION 'There are no payable commissions or tips for this week' USING ERRCODE = '55000'; END IF;

  PERFORM 1 FROM public.commission_adjustments ca
  WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
    AND ca.status = 'approved' AND ca.remaining_amount > 0 FOR UPDATE;
  SELECT LEAST(v_gross, COALESCE(sum(ca.remaining_amount), 0)) INTO v_deduction_budget
  FROM public.commission_adjustments ca
  WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
    AND ca.status = 'approved' AND ca.remaining_amount > 0;

  -- B7: libro del empleado (adelantos, préstamos, descuentos, arrastre) y bonos.
  PERFORM 1 FROM public.employee_ledger l
  WHERE l.business_id = v_business_id AND l.branch_id = p_branch_id AND l.employee_id = p_employee_id
    AND l.settlement_id IS NULL AND l.receipt_effect <> 0
  FOR UPDATE;
  v_led := private.settlement_ledger_breakdown(v_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end,
                                               v_gross - v_deduction_budget + v_tips);
  v_total := (v_led ->> 'total')::numeric;
  v_carry_out := (v_led ->> 'carryover_out')::numeric;

  -- Los pagos deben sumar exactamente el total, un solo renglon por metodo
  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_method := (v_payment->>'method')::public.payment_method;
    v_amount := (v_payment->>'amount')::numeric;
    v_ref := NULLIF(trim(COALESCE(v_payment->>'reference', '')), '');
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> round(v_amount, 2)
       OR v_method::text = ANY(v_methods) OR length(COALESCE(v_ref, '')) > 200 THEN
      RAISE EXCEPTION 'Settlement payments are invalid' USING ERRCODE = '22023';
    END IF;
    v_methods := v_methods || v_method::text;
    v_pay_sum := v_pay_sum + v_amount;
    IF v_method = 'cash' THEN v_cash := v_cash + v_amount; END IF;
  END LOOP;
  IF v_pay_sum <> v_total THEN
    RAISE EXCEPTION 'Payments must add up to the settlement total' USING ERRCODE = '22023';
  END IF;
  IF v_cash > 0 THEN
    SELECT id INTO v_cash_session_id FROM public.cash_sessions
    WHERE business_id = v_business_id AND branch_id = p_branch_id AND status = 'open' FOR UPDATE;
    IF v_cash_session_id IS NULL THEN
      RAISE EXCEPTION 'Open the branch cash session before paying commissions in cash' USING ERRCODE = '55000';
    END IF;
    IF v_cash > private.cash_available(v_cash_session_id) THEN
      RAISE EXCEPTION 'No hay suficiente efectivo en caja: hay $%, se intentan pagar $%. Paga la diferencia por transferencia.', private.cash_available(v_cash_session_id), v_cash USING ERRCODE = '55000';
    END IF;
  END IF;

  -- Folio P + año y semana ISO del sábado final + consecutivo de la semana (ver private.next_payment_receipt).
  v_receipt := private.next_payment_receipt(v_business_id, p_period_end);

  INSERT INTO public.commission_settlements (business_id, branch_id, employee_id, period_start, period_end, total_amount,
    status, paid_via, paid_at, paid_by, created_by, receipt_number, window_start, window_end,
    bonus_amount, advance_amount, loan_payment_amount, deduction_amount, carryover_in_amount, carryover_out_amount)
  VALUES (v_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end, v_total, 'paid',
    CASE WHEN cardinality(v_methods) = 1 THEN v_methods[1]::public.payment_method END,
    now(), auth.uid(), auth.uid(), v_receipt, v_window.start_ts, v_window.end_ts,
    (v_led ->> 'bonus_total')::numeric, (v_led ->> 'advances')::numeric, (v_led ->> 'loan_payments')::numeric,
    (v_led ->> 'deductions')::numeric, (v_led ->> 'carryover_in')::numeric, v_carry_out)
  RETURNING id INTO v_settlement_id;

  UPDATE public.sale_tips t SET settlement_id = v_settlement_id
    WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id
      AND t.status = 'generated' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    INSERT INTO public.commission_settlement_payments (business_id, branch_id, employee_id, settlement_id, method, amount, reference)
    VALUES (v_business_id, p_branch_id, p_employee_id, v_settlement_id, (v_payment->>'method')::public.payment_method,
      (v_payment->>'amount')::numeric, NULLIF(trim(COALESCE(v_payment->>'reference', '')), ''));
  END LOOP;
  IF v_cash > 0 THEN
    INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method,
      movement_type, direction, commission_settlement_id, description)
    VALUES (v_business_id, p_branch_id, v_cash_session_id, auth.uid(), v_cash, 'cash',
      'withdrawal', 'out', v_settlement_id, 'Pago de comisiones · ' || v_receipt);
  END IF;

  FOR v_entry IN SELECT ce.id, ce.commission_amount FROM public.commission_entries ce
    WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id
      AND ce.status = 'generated' AND ce.generated_at > v_window.start_ts AND ce.generated_at <= v_window.end_ts
      AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id)
    ORDER BY ce.generated_at, ce.id
  LOOP
    INSERT INTO public.commission_settlement_lines (business_id, branch_id, employee_id, settlement_id, commission_entry_id, amount, line_type)
    VALUES (v_business_id, p_branch_id, p_employee_id, v_settlement_id, v_entry.id, v_entry.commission_amount, 'commission');
  END LOOP;

  FOR v_adjustment IN SELECT ca.id, ca.remaining_amount FROM public.commission_adjustments ca
    WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
      AND ca.status = 'approved' AND ca.remaining_amount > 0 ORDER BY ca.created_at, ca.id FOR UPDATE
  LOOP
    EXIT WHEN v_deduction_budget <= 0;
    v_deduction := LEAST(v_adjustment.remaining_amount, v_deduction_budget);
    INSERT INTO public.commission_settlement_lines (business_id, branch_id, employee_id, settlement_id, commission_adjustment_id, amount, line_type)
    VALUES (v_business_id, p_branch_id, p_employee_id, v_settlement_id, v_adjustment.id, v_deduction, 'adjustment');
    UPDATE public.commission_adjustments SET remaining_amount = remaining_amount - v_deduction,
      status = CASE WHEN remaining_amount - v_deduction = 0 THEN 'settled' ELSE 'approved' END
    WHERE id = v_adjustment.id;
    v_deduction_budget := v_deduction_budget - v_deduction;
  END LOOP;

  -- B7: sellar los asientos pendientes incluidos y registrar bonos, abonos semanales y arrastre.
  UPDATE public.employee_ledger l SET settlement_id = v_settlement_id
  WHERE l.id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(v_led -> 'pending_ids') x);
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_led -> 'bonus_lines') LOOP
    INSERT INTO public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, bonus_goal_id, settlement_id,
      generated_by_settlement, week_start, effective_at, details, created_by)
    VALUES (v_business_id, p_branch_id, p_employee_id, 'bonus', (v_line ->> 'amount')::numeric,
      left('Bono por meta: ' || (v_line ->> 'name') || ' (' || (v_line ->> 'value') || ' de ' || (v_line ->> 'threshold') || ')', 300),
      (v_line ->> 'goal_id')::uuid, v_settlement_id, true, p_period_start, v_window.end_ts,
      jsonb_build_object('metric', v_line ->> 'metric', 'value', (v_line ->> 'value')::numeric, 'threshold', (v_line ->> 'threshold')::numeric),
      auth.uid());
  END LOOP;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_led -> 'loan_scheduled_lines') LOOP
    INSERT INTO public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, loan_id, settlement_id,
      generated_by_settlement, week_start, details, created_by)
    VALUES (v_business_id, p_branch_id, p_employee_id, 'loan_payment', (v_line ->> 'amount')::numeric,
      'Abono semanal del préstamo · recibo ' || v_receipt, (v_line ->> 'loan_id')::uuid, v_settlement_id, true, p_period_start,
      jsonb_build_object('outstanding_before', (v_line ->> 'outstanding_before')::numeric, 'outstanding_after', (v_line ->> 'outstanding_after')::numeric),
      auth.uid());
  END LOOP;
  IF v_carry_out > 0 THEN
    INSERT INTO public.employee_ledger (business_id, branch_id, employee_id, entry_type, amount, reason, origin_settlement_id,
      generated_by_settlement, week_start, created_by)
    VALUES (v_business_id, p_branch_id, p_employee_id, 'carryover', v_carry_out,
      'Saldo en contra del recibo ' || v_receipt || ' (se pagó en $0); se descuenta en el siguiente recibo',
      v_settlement_id, true, p_period_start + 7, auth.uid());
  END IF;

  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'commission_settlement', v_settlement_id::text, 'commission_settlement_paid',
    jsonb_build_object('receipt_number', v_receipt, 'employee_id', p_employee_id,
      'period_start', p_period_start, 'period_end', p_period_end,
      'gross_commission', v_gross, 'deductions', v_gross - (v_led ->> 'base')::numeric + v_tips, 'tips', v_tips, 'paid_amount', v_total,
      'bonuses', (v_led ->> 'bonus_total')::numeric, 'advances', (v_led ->> 'advances')::numeric,
      'loan_payments', (v_led ->> 'loan_payments')::numeric, 'staff_deductions', (v_led ->> 'deductions')::numeric,
      'carryover_in', (v_led ->> 'carryover_in')::numeric, 'carryover_out', v_carry_out,
      'payments', p_payments));
  RETURN jsonb_build_object('settlement_id', v_settlement_id, 'receipt_number', v_receipt, 'total_amount', v_total,
    'gross_commission', v_gross, 'deductions', v_gross - (v_led ->> 'base')::numeric + v_tips, 'tips', v_tips, 'idempotent_replay', false,
    'bonuses', (v_led ->> 'bonus_total')::numeric, 'advances', (v_led ->> 'advances')::numeric,
    'loan_payments', (v_led ->> 'loan_payments')::numeric, 'staff_deductions', (v_led ->> 'deductions')::numeric,
    'carryover_in', (v_led ->> 'carryover_in')::numeric, 'carryover_out', v_carry_out, 'net_amount', (v_led ->> 'net')::numeric);
END $function$;

-- ── 3b) Vista previa ──────────────────────────────────────────────────────────────────────────────────
create or replace function private.preview_commission_settlement_impl(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_business_id uuid;
  v_window record;
  v_existing public.commission_settlements%ROWTYPE;
  v_gross numeric(12,2);
  v_count integer;
  v_deductions numeric(12,2);
  v_reason text;
  v_tips numeric(12,2) := 0;
  v_led jsonb;
  v_extra jsonb;
  v_total numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
     OR extract(dow from p_period_start) <> 0 OR p_period_end <> p_period_start + 6 THEN
    RAISE EXCEPTION 'Settlement must use a Sunday-to-Saturday week' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active
    AND EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = b.business_id AND e.id = p_employee_id);
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin','viewer']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Settlement permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_window FROM private.settlement_window(v_business_id, p_period_start, p_period_end);

  SELECT * INTO v_existing FROM public.commission_settlements
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND employee_id = p_employee_id
    AND period_start = p_period_start AND period_end = p_period_end;

  SELECT COALESCE(sum(ce.commission_amount), 0), count(*) INTO v_gross, v_count
  FROM public.commission_entries ce
  WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id
    AND ce.status = 'generated' AND ce.generated_at > v_window.start_ts AND ce.generated_at <= v_window.end_ts
    AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id);

  SELECT LEAST(v_gross, COALESCE(sum(ca.remaining_amount), 0)) INTO v_deductions
  FROM public.commission_adjustments ca
  WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
    AND ca.status = 'approved' AND ca.remaining_amount > 0;

  SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t
  WHERE t.business_id = v_business_id AND t.branch_id = p_branch_id AND t.employee_id = p_employee_id
    AND t.status = 'generated' AND t.settlement_id IS NULL AND t.created_at > v_window.start_ts AND t.created_at <= v_window.end_ts;

  IF v_existing.id IS NOT NULL THEN
    SELECT COALESCE(sum(t.amount), 0) INTO v_tips FROM public.sale_tips t WHERE t.settlement_id = v_existing.id;
    SELECT COALESCE(sum(sl.amount) FILTER (WHERE sl.line_type = 'commission'), 0),
           COALESCE(sum(sl.amount) FILTER (WHERE sl.line_type = 'adjustment'), 0),
           count(*) FILTER (WHERE sl.line_type = 'commission')
      INTO v_gross, v_deductions, v_count
      FROM public.commission_settlement_lines sl WHERE sl.settlement_id = v_existing.id;
    v_total := v_existing.total_amount;
    v_extra := jsonb_build_object(
      'bonuses', v_existing.bonus_amount, 'advances', v_existing.advance_amount, 'loan_payments', v_existing.loan_payment_amount,
      'staff_deductions', v_existing.deduction_amount, 'carryover_in', v_existing.carryover_in_amount,
      'carryover_out', v_existing.carryover_out_amount,
      'net_amount', v_existing.total_amount - v_existing.carryover_out_amount,
      'ledger_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('entry_id', l.id, 'entry_type', l.entry_type, 'amount', l.amount,
                         'receipt_effect', l.receipt_effect, 'reason', l.reason, 'loan_id', l.loan_id, 'bonus_goal_id', l.bonus_goal_id)
                         ORDER BY l.created_at, l.id)
                       FROM public.employee_ledger l WHERE l.settlement_id = v_existing.id), '[]'::jsonb),
      'bonus_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('goal_id', l.bonus_goal_id, 'name', g.name, 'metric', g.metric,
                         'threshold', l.details -> 'threshold', 'value', l.details -> 'value', 'amount', l.amount) ORDER BY g.name)
                       FROM public.employee_ledger l JOIN public.bonus_goals g ON g.id = l.bonus_goal_id
                       WHERE l.settlement_id = v_existing.id AND l.entry_type = 'bonus'), '[]'::jsonb),
      'bonus_goals_enabled', EXISTS (SELECT 1 FROM public.employee_ledger l WHERE l.settlement_id = v_existing.id AND l.entry_type = 'bonus'));
  ELSE
    v_led := private.settlement_ledger_breakdown(v_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end,
                                                 v_gross - v_deductions + v_tips);
    v_total := (v_led ->> 'total')::numeric;
    v_extra := jsonb_build_object(
      'bonuses', (v_led ->> 'bonus_total')::numeric, 'advances', (v_led ->> 'advances')::numeric,
      'loan_payments', (v_led ->> 'loan_payments')::numeric, 'staff_deductions', (v_led ->> 'deductions')::numeric,
      'carryover_in', (v_led ->> 'carryover_in')::numeric, 'carryover_out', (v_led ->> 'carryover_out')::numeric,
      'net_amount', (v_led ->> 'net')::numeric,
      'ledger_lines', v_led -> 'pending_lines', 'loan_scheduled_lines', v_led -> 'loan_scheduled_lines',
      'loans_waiting', v_led -> 'loans_waiting', 'bonus_lines', v_led -> 'bonus_lines',
      'bonus_goals_enabled', jsonb_array_length(v_led -> 'bonus_goals') > 0, 'bonus_goals', v_led -> 'bonus_goals');
  END IF;
  v_reason := CASE
    WHEN v_existing.id IS NOT NULL THEN 'already_settled'
    WHEN now() < v_window.end_ts THEN 'week_not_closed'
    WHEN v_gross + v_tips <= 0 THEN 'nothing_to_pay'
    ELSE NULL END;

  RETURN jsonb_build_object(
    'period_start', p_period_start, 'period_end', p_period_end,
    'window_start', v_window.start_ts, 'window_end', v_window.end_ts,
    'gross_commission', v_gross, 'deductions', v_deductions, 'tips', v_tips, 'total_amount', v_total,
    'entry_count', v_count, 'can_settle', v_reason IS NULL, 'reason', v_reason,
    'settlement_id', v_existing.id, 'receipt_number', v_existing.receipt_number) || v_extra;
END $function$;

-- ── 3c) Recibo ────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.get_settlement_receipt_impl(p_settlement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_s public.commission_settlements%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_settlement_id IS NULL THEN
    RAISE EXCEPTION 'Receipt request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_s FROM public.commission_settlements WHERE id = p_settlement_id;
  IF NOT FOUND
     OR NOT private.can_access_branch(v_s.business_id, v_s.branch_id)
     OR NOT (private.has_business_role(v_s.business_id, ARRAY['owner','admin','viewer']::public.business_role[])
             OR private.owns_employee(v_s.business_id, v_s.employee_id)) THEN
    RAISE EXCEPTION 'Receipt permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'receipt_number', v_s.receipt_number,
    'status', v_s.status,
    'business', jsonb_build_object('name', b.name, 'currency', b.currency, 'timezone', b.timezone),
    'branch', jsonb_build_object('name', br.name, 'address', br.address, 'phone', br.phone),
    'employee', jsonb_build_object('id', e.id, 'display_name', e.display_name),
    'period_start', v_s.period_start, 'period_end', v_s.period_end,
    'window_start', v_s.window_start, 'window_end', v_s.window_end,
    'paid_at', v_s.paid_at,
    'paid_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.user_id = v_s.paid_by),
    'total_amount', v_s.total_amount,
    'gross_commission', COALESCE((SELECT sum(sl.amount) FROM public.commission_settlement_lines sl
                                  WHERE sl.settlement_id = v_s.id AND sl.line_type = 'commission'), 0),
    'deductions', COALESCE((SELECT sum(sl.amount) FROM public.commission_settlement_lines sl
                            WHERE sl.settlement_id = v_s.id AND sl.line_type = 'adjustment'), 0),
    'tips_total', COALESCE((SELECT sum(t.amount) FROM public.sale_tips t WHERE t.settlement_id = v_s.id), 0),
    'tip_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('sale_id', t.sale_id, 'received_at', t.created_at,
          'method', t.method, 'amount', t.amount) ORDER BY t.created_at, t.id)
        FROM public.sale_tips t WHERE t.settlement_id = v_s.id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('method', sp.method, 'amount', sp.amount, 'reference', sp.reference)
                                           ORDER BY sp.method) FROM public.commission_settlement_payments sp
                          WHERE sp.settlement_id = v_s.id), '[]'::jsonb),
    'commission_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'sale_id', ce.sale_id, 'sold_at', ce.generated_at, 'item', si.item_name_snapshot, 'item_type', si.item_type,
          'basis_amount', ce.basis_amount, 'percentage', ce.percentage_snapshot,
          'fixed_amount', ce.fixed_amount_snapshot, 'commission_amount', sl.amount) ORDER BY ce.generated_at, ce.id)
        FROM public.commission_settlement_lines sl
        JOIN public.commission_entries ce ON ce.id = sl.commission_entry_id
        JOIN public.sale_items si ON si.id = ce.sale_item_id
        WHERE sl.settlement_id = v_s.id AND sl.line_type = 'commission'), '[]'::jsonb),
    'adjustment_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', ca.reason, 'amount', sl.amount) ORDER BY ca.created_at)
        FROM public.commission_settlement_lines sl
        JOIN public.commission_adjustments ca ON ca.id = sl.commission_adjustment_id
        WHERE sl.settlement_id = v_s.id AND sl.line_type = 'adjustment'), '[]'::jsonb),
    -- B7: desglose del libro del empleado (claves nuevas; las anteriores no cambian).
    'bonuses', v_s.bonus_amount,
    'advances', v_s.advance_amount,
    'loan_payments', v_s.loan_payment_amount,
    'staff_deductions', v_s.deduction_amount,
    'carryover_in', v_s.carryover_in_amount,
    'carryover_out', v_s.carryover_out_amount,
    'net_amount', v_s.total_amount - v_s.carryover_out_amount,
    'ledger_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('entry_id', l.id, 'entry_type', l.entry_type, 'amount', l.amount,
          'receipt_effect', l.receipt_effect, 'reason', l.reason, 'created_at', l.created_at, 'paid_from', l.paid_from,
          'loan_id', l.loan_id, 'bonus_goal_id', l.bonus_goal_id, 'goal_name', g.name, 'details', l.details)
          ORDER BY CASE l.entry_type WHEN 'bonus' THEN 0 WHEN 'carryover' THEN 1 WHEN 'advance' THEN 2 WHEN 'loan_payment' THEN 3 ELSE 4 END,
                   l.created_at, l.id)
        FROM public.employee_ledger l LEFT JOIN public.bonus_goals g ON g.id = l.bonus_goal_id
        WHERE l.settlement_id = v_s.id), '[]'::jsonb),
    'carryover_next', (SELECT jsonb_build_object('entry_id', l.id, 'amount', l.amount, 'week_start', l.week_start, 'reason', l.reason)
        FROM public.employee_ledger l WHERE l.origin_settlement_id = v_s.id AND l.entry_type = 'carryover')
  ) INTO v_result
  FROM public.businesses b
  JOIN public.branches br ON br.id = v_s.branch_id
  JOIN public.employees e ON e.id = v_s.employee_id
  WHERE b.id = v_s.business_id;
  RETURN v_result;
END $function$;

-- ── 4) Utilidad: los bonos son costo ──────────────────────────────────────────────────────────────────
create or replace function private.report_financial_period(p_business uuid, p_branch_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_detail boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with sales_in as (
    -- Ventas cobradas en el periodo; las anuladas solo se cuentan para decir cuántas se excluyeron.
    select s.id, s.status from public.sales s
    where s.business_id = p_business and s.branch_id = p_branch_id
      and s.status in ('paid', 'refunded', 'partially_refunded')
      and s.paid_at >= p_start and s.paid_at < p_end
  ),
  paid as (select si.id from sales_in si where si.status = 'paid'),
  items as (
    select si.id, si.sale_id, si.item_type, si.product_id, si.item_name_snapshot, si.quantity, si.discount_amount, si.line_total,
           coalesce(si.employee_id, si.commission_employee_id) as emp,
           pr.name as product_name,
           -- COSTO UNITARIO. Hoy es el costo actual del catálogo (products.cost_price). Cuando sale_items
           -- guarde el costo de cada venta, basta con cambiar esta línea, p. ej.:
           --   case when si.item_type = 'product' then coalesce(si.<costo_guardado>, pr.cost_price) end as unit_cost
           case when si.item_type = 'product' then coalesce(si.unit_cost_snapshot, pr.cost_price) end as unit_cost
    from public.sale_items si
    join paid on paid.id = si.sale_id
    left join public.products pr on pr.id = si.product_id and pr.business_id = p_business
    where si.business_id = p_business and si.branch_id = p_branch_id
  ),
  costed as (
    select i.*,
           i.item_type = 'product' and i.unit_cost is null as no_cost,
           case when i.item_type = 'product' and i.unit_cost is not null then round(i.quantity * i.unit_cost, 2) else 0 end as cost
    from items i
  ),
  comm as (
    -- Solo comisiones vigentes de las ventas incluidas; el tipo (servicio o producto) es el del renglón.
    select c.employee_id, c.commission_amount, i.item_type, i.emp as item_emp
    from public.commission_entries c join items i on i.id = c.sale_item_id
    where c.business_id = p_business and c.branch_id = p_branch_id and c.status = 'generated'
  ),
  tips as (
    -- Propinas: 100 % del barbero. No entran a los ingresos ni se restan de la utilidad.
    select t.employee_id, t.amount, t.method::text as method
    from public.sale_tips t join paid on paid.id = t.sale_id
    where t.business_id = p_business and t.branch_id = p_branch_id and t.status = 'generated'
  ),
  bonuses as (
    -- B7: bonos por metas = costo, como las comisiones; fecha = fin de su semana (sábado 8 pm).
    select l.employee_id, l.amount
    from public.employee_ledger l
    where l.business_id = p_business and l.branch_id = p_branch_id and l.entry_type = 'bonus'
      and l.effective_at >= p_start and l.effective_at < p_end
      and not exists (select 1 from public.employee_ledger r where r.reverses_entry_id = l.id)
  ),
  exps as (
    select coalesce(nullif(btrim(x.category), ''), 'General') as category, x.amount, x.method::text as method
    from public.expenses x
    where x.business_id = p_business and x.branch_id = p_branch_id and x.status = 'posted'
      and x.incurred_at >= p_start and x.incurred_at < p_end
  ),
  it as (
    select
      coalesce(sum(c.line_total) filter (where c.item_type = 'service'), 0) as rev_s,
      coalesce(sum(c.line_total) filter (where c.item_type = 'product'), 0) as rev_p,
      coalesce(sum(c.discount_amount), 0) as disc,
      coalesce(sum(c.quantity) filter (where c.item_type = 'service'), 0) as units_s,
      coalesce(sum(c.quantity) filter (where c.item_type = 'product'), 0) as units_p,
      coalesce(sum(c.cost), 0) as cogs,
      coalesce(sum(c.quantity) filter (where c.no_cost), 0) as units_no_cost
    from costed c
  ),
  ct as (
    select coalesce(sum(m.commission_amount) filter (where m.item_type = 'product'), 0) as cp,
           coalesce(sum(m.commission_amount) filter (where m.item_type <> 'product'), 0) as cs
    from comm m
  ),
  tt as (select coalesce(sum(t.amount), 0) as total, count(*)::integer as cnt from tips t),
  bt as (select coalesce(sum(b.amount), 0) as total, count(*)::integer as cnt from bonuses b),
  xt as (select coalesce(sum(x.amount), 0) as total from exps x),
  res as (
    select it.*, ct.cs, ct.cp, tt.total as tips_total, tt.cnt as tips_count, xt.total as exp_total,
           bt.total as bonus_total, bt.cnt as bonus_count,
           it.rev_s + it.rev_p as revenue,
           it.rev_s + it.rev_p - ct.cs - ct.cp - bt.total - it.cogs - xt.total as profit
    from it, ct, tt, xt, bt
  ),
  people as (
    select distinct i.emp as id from items i
    union select m.employee_id from comm m
    union select t.employee_id from tips t
    union select b.employee_id from bonuses b
  )
  select jsonb_build_object(
    'revenue', jsonb_build_object('services', r.rev_s, 'products', r.rev_p, 'total', r.revenue, 'discounts', r.disc),
    'commissions', jsonb_build_object('services', r.cs, 'products', r.cp, 'total', r.cs + r.cp),
    'bonuses', jsonb_build_object('total', r.bonus_total, 'count', r.bonus_count),
    'product_cost', jsonb_build_object(
      'total', r.cogs,
      'source', 'sale',
      'units_without_cost', r.units_no_cost,
      'missing', (select coalesce(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'name', mm.name, 'units', mm.units)
                    order by mm.units desc, mm.name), '[]'::jsonb)
                  from (select c.product_id, coalesce(c.product_name, c.item_name_snapshot) as name, sum(c.quantity) as units
                        from costed c where c.no_cost
                        group by c.product_id, coalesce(c.product_name, c.item_name_snapshot)) mm)),
    'expenses', jsonb_build_object(
      'total', r.exp_total,
      'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', g.category, 'total', g.total, 'count', g.cnt)
                        order by g.total desc, g.category), '[]'::jsonb)
                      from (select x.category, sum(x.amount) as total, count(*)::integer as cnt from exps x group by x.category) g),
      'by_method', (select jsonb_build_object(
                      'cash', coalesce(sum(x.amount) filter (where x.method = 'cash'), 0),
                      'card', coalesce(sum(x.amount) filter (where x.method = 'card'), 0),
                      'transfer', coalesce(sum(x.amount) filter (where x.method = 'transfer'), 0),
                      'other', coalesce(sum(x.amount) filter (where x.method not in ('cash', 'card', 'transfer')), 0)) from exps x)),
    'tips', jsonb_build_object(
      'total', r.tips_total,
      'count', r.tips_count,
      'by_method', (select jsonb_build_object(
                      'cash', coalesce(sum(t.amount) filter (where t.method = 'cash'), 0),
                      'card', coalesce(sum(t.amount) filter (where t.method = 'card'), 0),
                      'transfer', coalesce(sum(t.amount) filter (where t.method = 'transfer'), 0),
                      'other', coalesce(sum(t.amount) filter (where t.method not in ('cash', 'card', 'transfer')), 0)) from tips t)),
    'profit', r.profit,
    'margin_pct', case when r.revenue > 0 then round(r.profit / r.revenue * 100, 1) end,
    'counts', jsonb_build_object('sales', (select count(*) from paid)::integer,
                                 'voided_excluded', (select count(*) from sales_in s where s.status <> 'paid')::integer,
                                 'service_units', r.units_s, 'product_units', r.units_p),
    'by_person', case when p_detail then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', b.id, 'name', b.name, 'is_barber', b.is_barber,
               'services', b.services, 'products', b.products, 'revenue', b.services + b.products,
               'service_count', b.service_count, 'product_count', b.product_count,
               'commission', b.commission, 'tips', b.tips, 'tip_count', b.tip_count,
               'product_cost', b.product_cost, 'sales_commissions', b.sales_commissions, 'bonus', b.bonus,
               'contribution', b.services + b.products - b.sales_commissions - b.product_cost - b.bonus)
             order by b.services + b.products desc, b.tips desc, b.name), '[]'::jsonb)
      from (
        select p.id, coalesce(e.display_name, 'Sin asignar') as name, coalesce(e.is_barber, false) as is_barber,
          coalesce((select sum(i.line_total) from items i where i.emp is not distinct from p.id and i.item_type = 'service'), 0) as services,
          coalesce((select sum(i.line_total) from items i where i.emp is not distinct from p.id and i.item_type = 'product'), 0) as products,
          coalesce((select sum(i.quantity) from items i where i.emp is not distinct from p.id and i.item_type = 'service'), 0) as service_count,
          coalesce((select sum(i.quantity) from items i where i.emp is not distinct from p.id and i.item_type = 'product'), 0) as product_count,
          coalesce((select sum(m.commission_amount) from comm m where m.employee_id = p.id), 0) as commission,
          coalesce((select sum(m.commission_amount) from comm m where m.item_emp is not distinct from p.id), 0) as sales_commissions,
          coalesce((select sum(t.amount) from tips t where t.employee_id = p.id), 0) as tips,
          (select count(*) from tips t where t.employee_id = p.id)::integer as tip_count,
          coalesce((select sum(c.cost) from costed c where c.emp is not distinct from p.id), 0) as product_cost,
          coalesce((select sum(bb.amount) from bonuses bb where bb.employee_id = p.id), 0) as bonus
        from people p left join public.employees e on e.id = p.id and e.business_id = p_business
      ) b) end)
  from res r
$function$;

create or replace function private.profit_kpis(p_business uuid, p_branch_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  f jsonb;
  p jsonb;
begin
  if p_employee_id is null then
    f := private.report_financial_period(p_business, p_branch_id, p_start, p_end, false);
    return jsonb_build_object(
      'revenue', (f -> 'revenue' ->> 'total')::numeric,
      'commissions', (f -> 'commissions' ->> 'total')::numeric,
      'bonuses', (f -> 'bonuses' ->> 'total')::numeric,
      'product_cost', (f -> 'product_cost' ->> 'total')::numeric,
      'expenses', (f -> 'expenses' ->> 'total')::numeric,
      'net', (f ->> 'profit')::numeric,
      'net_kind', 'profit',
      'units_without_cost', (f -> 'product_cost' ->> 'units_without_cost')::numeric);
  end if;
  f := private.report_financial_period(p_business, p_branch_id, p_start, p_end, true);
  select x into p from jsonb_array_elements(f -> 'by_person') x where x ->> 'id' = p_employee_id::text;
  return jsonb_build_object(
    'revenue', coalesce((p ->> 'revenue')::numeric, 0),
    'commissions', coalesce((p ->> 'commission')::numeric, 0),
    'bonuses', coalesce((p ->> 'bonus')::numeric, 0),
    'sales_commissions', coalesce((p ->> 'sales_commissions')::numeric, 0),
    'product_cost', coalesce((p ->> 'product_cost')::numeric, 0),
    'expenses', 0,
    'net', coalesce((p ->> 'contribution')::numeric, 0),
    'net_kind', 'contribution',
    'units_without_cost', null);
end;
$function$;

-- ── 5) Reporte completo: pagos al personal ────────────────────────────────────────────────────────────
alter function private.business_full_report_impl(uuid, date, date, text) rename to business_full_report_base;
revoke all on function private.business_full_report_base(uuid, date, date, text) from public, anon, authenticated;

create or replace function private.business_full_report_impl(p_branch_id uuid, p_from date, p_to date, p_audience text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v jsonb;
  v_business uuid;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_settlements jsonb;
  v_ledger jsonb;
  v_totals jsonb;
begin
  -- Permisos, fechas y audiencia los valida la función base (misma regla de siempre).
  v := private.business_full_report_base(p_branch_id, p_from, p_to, p_audience);
  select b.business_id, bs.timezone into v_business, v_tz
  from public.branches b join public.businesses bs on bs.id = b.business_id where b.id = p_branch_id;
  v_start := p_from::timestamp at time zone v_tz;
  v_end := (p_to + 1)::timestamp at time zone v_tz;

  -- Recibos del periodo con su desglose (mismas filas y claves que antes, más el desglose de B7).
  select coalesce(jsonb_agg(jsonb_build_object(
      'receipt', st.receipt_number, 'employee', e.display_name, 'period_start', st.period_start, 'period_end', st.period_end,
      'total', st.total_amount, 'cash', coalesce(pp.cash, 0), 'transfer', coalesce(pp.transfer, 0), 'other', coalesce(pp.other, 0),
      'paid_at', st.paid_at, 'paid_by', private.report_user_name(v_business, st.paid_by), 'reference', st.reference,
      'commissions', coalesce(ll.commissions, 0), 'adjustments', coalesce(ll.adjustments, 0), 'tips', coalesce(tt.tips, 0),
      'bonuses', st.bonus_amount, 'advances', st.advance_amount, 'loan_payments', st.loan_payment_amount,
      'staff_deductions', st.deduction_amount, 'carryover_in', st.carryover_in_amount, 'carryover_out', st.carryover_out_amount)
      order by st.paid_at, st.receipt_number), '[]'::jsonb)
  into v_settlements
  from public.commission_settlements st
  left join public.employees e on e.id = st.employee_id
  left join lateral (
    select sum(sp.amount) filter (where sp.method = 'cash') as cash,
           sum(sp.amount) filter (where sp.method = 'transfer') as transfer,
           sum(sp.amount) filter (where sp.method not in ('cash', 'transfer')) as other
    from public.commission_settlement_payments sp where sp.settlement_id = st.id) pp on true
  left join lateral (
    select sum(sl.amount) filter (where sl.line_type = 'commission') as commissions,
           sum(sl.amount) filter (where sl.line_type = 'adjustment') as adjustments
    from public.commission_settlement_lines sl where sl.settlement_id = st.id) ll on true
  left join lateral (select sum(t.amount) as tips from public.sale_tips t where t.settlement_id = st.id) tt on true
  where st.business_id = v_business and st.branch_id = p_branch_id and st.status = 'paid'
    and st.paid_at >= v_start and st.paid_at < v_end;

  -- Libro del personal del periodo (por la fecha del asiento). Sin datos de clientes ni de inicio de sesión:
  -- nombre visible de la persona y de quien registró.
  select coalesce(jsonb_agg(jsonb_build_object(
      'at', l.created_at, 'effective_at', l.effective_at, 'employee', e.display_name, 'type', l.entry_type,
      'amount', l.amount, 'receipt_effect', l.receipt_effect, 'reason', l.reason, 'paid_from', l.paid_from, 'method', l.method,
      'receipt', s.receipt_number, 'cancelled', exists (select 1 from public.employee_ledger r where r.reverses_entry_id = l.id),
      'by', private.report_user_name(v_business, l.created_by)) order by l.created_at, l.id), '[]'::jsonb),
    jsonb_build_object(
      'advances', coalesce(sum(l.amount) filter (where l.entry_type = 'advance'), 0),
      'loans', coalesce(sum(l.amount) filter (where l.entry_type = 'loan'), 0),
      'loan_payments', coalesce(sum(l.amount) filter (where l.entry_type = 'loan_payment'), 0),
      'deductions', coalesce(sum(l.amount) filter (where l.entry_type = 'deduction'), 0),
      'bonuses', coalesce(sum(l.amount) filter (where l.entry_type = 'bonus'), 0),
      'carryovers', coalesce(sum(l.amount) filter (where l.entry_type = 'carryover'), 0),
      'reversals', coalesce(sum(l.amount) filter (where l.entry_type = 'reversal'), 0))
  into v_ledger, v_totals
  from public.employee_ledger l
  left join public.employees e on e.id = l.employee_id
  left join public.commission_settlements s on s.id = l.settlement_id
  where l.business_id = v_business and l.branch_id = p_branch_id and l.created_at >= v_start and l.created_at < v_end;

  return jsonb_set(v, '{payouts}', coalesce(v -> 'payouts', '{}'::jsonb)
    || jsonb_build_object('settlements', v_settlements, 'staff_ledger', v_ledger, 'staff_totals', v_totals));
end;
$function$;
revoke all on function private.business_full_report_impl(uuid, date, date, text) from public, anon;
grant execute on function private.business_full_report_impl(uuid, date, date, text) to authenticated;
