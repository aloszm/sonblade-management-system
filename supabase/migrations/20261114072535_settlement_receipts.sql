-- Liquidacion semanal con corte el sabado a las 8:00 pm (zona horaria del negocio),
-- pago mixto (efectivo / transferencia / otros), folio de recibo y datos del recibo.
-- Reemplaza settle_commissions (un solo metodo de pago, semana ya terminada por fecha).

-- 1) Folios por negocio, sin huecos (se incrementan dentro de la misma transaccion)
CREATE TABLE private.receipt_counters (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE RESTRICT,
  last_number integer NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

-- 2) La liquidacion guarda su folio y la ventana de tiempo exacta que cubrio
ALTER TABLE public.commission_settlements
  ADD COLUMN receipt_number text NOT NULL,
  ADD COLUMN window_start timestamptz NOT NULL,
  ADD COLUMN window_end timestamptz NOT NULL,
  ADD CONSTRAINT commission_settlements_receipt_unique UNIQUE (business_id, receipt_number);

-- paid_via pasa a ser un resumen (NULL si se pago con varios metodos);
-- el detalle real vive en commission_settlement_payments.
ALTER TABLE public.commission_settlements DROP CONSTRAINT commission_settlements_check1;
ALTER TABLE public.commission_settlements ADD CONSTRAINT commission_settlements_paid_check
  CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND paid_by IS NOT NULL));

-- 3) Pagos de la liquidacion (uno por metodo)
CREATE TABLE public.commission_settlement_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  settlement_id uuid NOT NULL,
  method public.payment_method NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reference text CHECK (reference IS NULL OR length(reference) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (settlement_id, method),
  FOREIGN KEY (business_id, branch_id, employee_id, settlement_id)
    REFERENCES public.commission_settlements(business_id, branch_id, employee_id, id) ON DELETE RESTRICT
);
CREATE INDEX commission_settlement_payments_settlement_idx ON public.commission_settlement_payments (settlement_id);
ALTER TABLE public.commission_settlement_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY commission_settlement_payments_select_admin_or_own ON public.commission_settlement_payments
  FOR SELECT TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[])
         OR private.owns_employee(business_id, employee_id)));
REVOKE ALL PRIVILEGES ON public.commission_settlement_payments FROM anon, authenticated;
GRANT SELECT ON public.commission_settlement_payments TO authenticated;
CREATE TRIGGER no_row_delete BEFORE DELETE ON public.commission_settlement_payments
  FOR EACH ROW EXECUTE FUNCTION private.forbid_row_delete();
CREATE TRIGGER no_truncate BEFORE TRUNCATE ON public.commission_settlement_payments
  FOR EACH STATEMENT EXECUTE FUNCTION private.forbid_row_delete();

-- 4) Se retira el mecanismo anterior (un metodo, trigger de efectivo)
DROP TRIGGER commission_settlement_cash_movement ON public.commission_settlements;
DROP FUNCTION private.record_commission_settlement_cash_movement();
DROP FUNCTION public.settle_commissions(uuid, uuid, date, date, public.payment_method, text);
DROP FUNCTION private.settle_commissions_impl(uuid, uuid, date, date, public.payment_method, text);

-- 5) Ventana de la semana: (sabado anterior 8 pm, sabado 8 pm] en la zona horaria del negocio
CREATE OR REPLACE FUNCTION private.settlement_window(p_business_id uuid, p_period_start date, p_period_end date)
RETURNS TABLE (start_ts timestamptz, end_ts timestamptz)
LANGUAGE sql STABLE SET search_path = ''
AS $fn$
  SELECT ((p_period_start - 1) + time '20:00') AT TIME ZONE b.timezone,
         (p_period_end + time '20:00') AT TIME ZONE b.timezone
  FROM public.businesses b WHERE b.id = p_business_id
$fn$;
REVOKE ALL ON FUNCTION private.settlement_window(uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.settlement_window(uuid, date, date) TO authenticated;

-- 6) Vista previa: cuanto se debe pagar y si ya se puede liquidar
CREATE OR REPLACE FUNCTION private.preview_commission_settlement_impl(
  p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_business_id uuid;
  v_window record;
  v_existing public.commission_settlements%ROWTYPE;
  v_gross numeric(12,2);
  v_count integer;
  v_deductions numeric(12,2);
  v_reason text;
BEGIN
  IF auth.uid() IS NULL OR p_period_start IS NULL OR p_period_end IS NULL
     OR extract(dow from p_period_start) <> 0 OR p_period_end <> p_period_start + 6 THEN
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

  v_reason := CASE
    WHEN v_existing.id IS NOT NULL THEN 'already_settled'
    WHEN now() < v_window.end_ts THEN 'week_not_closed'
    WHEN v_gross <= 0 THEN 'nothing_to_pay'
    ELSE NULL END;

  RETURN jsonb_build_object(
    'period_start', p_period_start, 'period_end', p_period_end,
    'window_start', v_window.start_ts, 'window_end', v_window.end_ts,
    'gross_commission', v_gross, 'deductions', v_deductions, 'total_amount', v_gross - v_deductions,
    'entry_count', v_count, 'can_settle', v_reason IS NULL, 'reason', v_reason,
    'settlement_id', v_existing.id, 'receipt_number', v_existing.receipt_number);
END $fn$;

-- 7) Liquidar y pagar (efectivo / transferencia / otros, en una sola operacion atomica)
CREATE OR REPLACE FUNCTION private.settle_commissions_impl(
  p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date, p_payments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
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
  v_number integer;
  v_receipt text;
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

  PERFORM pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || p_branch_id::text || ':' || p_employee_id::text || ':settlement', 0));
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
  IF v_gross <= 0 THEN RAISE EXCEPTION 'There are no payable commissions for this week' USING ERRCODE = '55000'; END IF;

  PERFORM 1 FROM public.commission_adjustments ca
  WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
    AND ca.status = 'approved' AND ca.remaining_amount > 0 FOR UPDATE;
  SELECT LEAST(v_gross, COALESCE(sum(ca.remaining_amount), 0)) INTO v_deduction_budget
  FROM public.commission_adjustments ca
  WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id AND ca.employee_id = p_employee_id
    AND ca.status = 'approved' AND ca.remaining_amount > 0;
  v_total := v_gross - v_deduction_budget;

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
  END IF;

  INSERT INTO private.receipt_counters (business_id, last_number) VALUES (v_business_id, 1)
  ON CONFLICT (business_id) DO UPDATE SET last_number = private.receipt_counters.last_number + 1
  RETURNING last_number INTO v_number;
  v_receipt := 'LIQ-' || lpad(v_number::text, 6, '0');

  INSERT INTO public.commission_settlements (business_id, branch_id, employee_id, period_start, period_end, total_amount,
    status, paid_via, paid_at, paid_by, created_by, receipt_number, window_start, window_end)
  VALUES (v_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end, v_total, 'paid',
    CASE WHEN cardinality(v_methods) = 1 THEN v_methods[1]::public.payment_method END,
    now(), auth.uid(), auth.uid(), v_receipt, v_window.start_ts, v_window.end_ts)
  RETURNING id INTO v_settlement_id;

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

  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'commission_settlement', v_settlement_id::text, 'commission_settlement_paid',
    jsonb_build_object('receipt_number', v_receipt, 'employee_id', p_employee_id,
      'period_start', p_period_start, 'period_end', p_period_end,
      'gross_commission', v_gross, 'deductions', v_gross - v_total, 'paid_amount', v_total,
      'payments', p_payments));
  RETURN jsonb_build_object('settlement_id', v_settlement_id, 'receipt_number', v_receipt, 'total_amount', v_total,
    'gross_commission', v_gross, 'deductions', v_gross - v_total, 'idempotent_replay', false);
END $fn$;

-- 8) Datos del recibo (los puede ver el dueno/admin y el propio barbero)
CREATE OR REPLACE FUNCTION private.get_settlement_receipt_impl(p_settlement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
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
     OR NOT (private.has_business_role(v_s.business_id, ARRAY['owner','admin']::public.business_role[])
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
        WHERE sl.settlement_id = v_s.id AND sl.line_type = 'adjustment'), '[]'::jsonb)
  ) INTO v_result
  FROM public.businesses b
  JOIN public.branches br ON br.id = v_s.branch_id
  JOIN public.employees e ON e.id = v_s.employee_id
  WHERE b.id = v_s.business_id;
  RETURN v_result;
END $fn$;

-- 9) Permisos y envoltorios publicos (mismo patron que el resto de funciones financieras)
REVOKE ALL ON FUNCTION private.preview_commission_settlement_impl(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.settle_commissions_impl(uuid, uuid, date, date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_settlement_receipt_impl(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.preview_commission_settlement_impl(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION private.settle_commissions_impl(uuid, uuid, date, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_settlement_receipt_impl(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_commission_settlement(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.preview_commission_settlement_impl($1, $2, $3, $4) $fn$;
CREATE OR REPLACE FUNCTION public.settle_commissions(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date, p_payments jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.settle_commissions_impl($1, $2, $3, $4, $5) $fn$;
CREATE OR REPLACE FUNCTION public.get_settlement_receipt(p_settlement_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.get_settlement_receipt_impl($1) $fn$;

REVOKE ALL ON FUNCTION public.preview_commission_settlement(uuid, uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_commissions(uuid, uuid, date, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_settlement_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_commission_settlement(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_commissions(uuid, uuid, date, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_settlement_receipt(uuid) TO authenticated;
