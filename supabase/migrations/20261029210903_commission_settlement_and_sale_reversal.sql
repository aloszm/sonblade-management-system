BEGIN;

CREATE TABLE public.commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  commission_entry_id uuid NOT NULL UNIQUE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  remaining_amount numeric(12,2) NOT NULL CHECK (remaining_amount >= 0 AND remaining_amount <= amount),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','settled')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text,
  CONSTRAINT commission_adjustments_branch_fk FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  CONSTRAINT commission_adjustments_employee_fk FOREIGN KEY (business_id, employee_id) REFERENCES public.employees(business_id, id) ON DELETE RESTRICT,
  CONSTRAINT commission_adjustments_entry_fk FOREIGN KEY (business_id, branch_id, employee_id, commission_entry_id)
    REFERENCES public.commission_entries(business_id, branch_id, employee_id, id) ON DELETE RESTRICT,
  CONSTRAINT commission_adjustments_review_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
ALTER TABLE public.commission_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY commission_adjustments_select_admin ON public.commission_adjustments FOR SELECT TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[])
    AND private.can_access_branch(business_id, branch_id));
REVOKE ALL PRIVILEGES ON public.commission_adjustments FROM anon, authenticated;
GRANT SELECT ON public.commission_adjustments TO authenticated;
CREATE INDEX commission_adjustments_pending_idx ON public.commission_adjustments (business_id, branch_id, employee_id, created_at)
  WHERE status = 'approved' AND remaining_amount > 0;

ALTER TABLE public.commission_settlement_lines ALTER COLUMN commission_entry_id DROP NOT NULL;
ALTER TABLE public.commission_settlement_lines ADD COLUMN commission_adjustment_id uuid;
ALTER TABLE public.commission_settlement_lines ADD COLUMN line_type text NOT NULL DEFAULT 'commission';
ALTER TABLE public.commission_settlement_lines ADD CONSTRAINT commission_settlement_lines_type_check CHECK (
  (line_type = 'commission' AND commission_entry_id IS NOT NULL AND commission_adjustment_id IS NULL)
  OR (line_type = 'adjustment' AND commission_entry_id IS NULL AND commission_adjustment_id IS NOT NULL)
);
ALTER TABLE public.commission_settlement_lines ADD CONSTRAINT commission_settlement_lines_adjustment_fk
  FOREIGN KEY (commission_adjustment_id) REFERENCES public.commission_adjustments(id) ON DELETE RESTRICT;
CREATE INDEX commission_settlement_lines_adjustment_idx ON public.commission_settlement_lines (commission_adjustment_id)
  WHERE commission_adjustment_id IS NOT NULL;

CREATE TABLE public.sale_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  sale_id uuid NOT NULL UNIQUE,
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_reversals_sale_fk FOREIGN KEY (business_id, branch_id, sale_id)
    REFERENCES public.sales(business_id, branch_id, id) ON DELETE RESTRICT
);
ALTER TABLE public.sale_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY sale_reversals_select_admin ON public.sale_reversals FOR SELECT TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[])
    AND private.can_access_branch(business_id, branch_id));
REVOKE ALL PRIVILEGES ON public.sale_reversals FROM anon, authenticated;
GRANT SELECT ON public.sale_reversals TO authenticated;

CREATE OR REPLACE FUNCTION private.reverse_sale_impl(p_sale_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_existing public.sale_reversals%ROWTYPE;
  v_cash_session_id uuid;
  v_payment record;
  v_stock record;
  v_entry record;
  v_reversal_id uuid;
  v_refunded numeric(12,2) := 0;
BEGIN
  IF auth.uid() IS NULL OR p_sale_id IS NULL OR length(trim(COALESCE(p_reason, ''))) < 3 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Sale reversal request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR NOT private.has_business_role(v_sale.business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_sale.business_id, v_sale.branch_id) THEN
    RAISE EXCEPTION 'Sale reversal permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_existing FROM public.sale_reversals WHERE sale_id = p_sale_id;
  IF FOUND THEN
    RETURN jsonb_build_object('sale_id', p_sale_id, 'reversal_id', v_existing.id, 'status', 'refunded', 'idempotent_replay', true);
  END IF;
  IF v_sale.status NOT IN ('open','partially_paid','paid') THEN
    RAISE EXCEPTION 'Sale is not eligible for reversal' USING ERRCODE = '55000';
  END IF;
  SELECT id INTO v_cash_session_id FROM public.cash_sessions
  WHERE business_id = v_sale.business_id AND branch_id = v_sale.branch_id AND status = 'open' FOR UPDATE;
  IF v_cash_session_id IS NULL THEN RAISE EXCEPTION 'Open the branch cash session before reversing a sale' USING ERRCODE = '55000'; END IF;

  FOR v_payment IN SELECT id, amount, method FROM public.payments WHERE sale_id = p_sale_id AND status = 'confirmed' ORDER BY id FOR UPDATE LOOP
    UPDATE public.payments SET status = 'reversed' WHERE id = v_payment.id;
    INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method, movement_type, direction, payment_id, sale_id, description)
    VALUES (v_sale.business_id, v_sale.branch_id, v_cash_session_id, auth.uid(), v_payment.amount, v_payment.method,
      'refund', 'out', v_payment.id, p_sale_id, 'Reembolso de venta');
    v_refunded := v_refunded + v_payment.amount;
  END LOOP;

  FOR v_stock IN
    SELECT si.product_id, sum(si.quantity)::numeric AS quantity, max(p.cost_price) AS cost_price
    FROM public.sale_items si JOIN public.products p ON p.business_id = si.business_id AND p.id = si.product_id
    WHERE si.business_id = v_sale.business_id AND si.sale_id = p_sale_id AND si.item_type = 'product' AND p.tracks_inventory
    GROUP BY si.product_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_sale.branch_id::text || ':' || v_stock.product_id::text || ':inventory', 0));
    UPDATE public.branch_inventory SET quantity_on_hand = quantity_on_hand + v_stock.quantity, updated_at = now()
    WHERE business_id = v_sale.business_id AND branch_id = v_sale.branch_id AND product_id = v_stock.product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product inventory row is missing during sale reversal' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.inventory_movements (business_id, branch_id, product_id, movement_type, quantity_delta, unit_cost_snapshot, created_by, reference, notes)
    VALUES (v_sale.business_id, v_sale.branch_id, v_stock.product_id, 'return_in', v_stock.quantity, v_stock.cost_price,
      auth.uid(), p_sale_id::text, trim(p_reason));
  END LOOP;

  FOR v_entry IN
    SELECT ce.id, ce.employee_id, ce.commission_amount
    FROM public.commission_entries ce WHERE ce.sale_id = p_sale_id AND ce.status = 'generated' FOR UPDATE
  LOOP
    IF EXISTS (SELECT 1 FROM public.commission_settlement_lines sl JOIN public.commission_settlements cs
      ON cs.id = sl.settlement_id WHERE sl.commission_entry_id = v_entry.id AND cs.status = 'paid') THEN
      INSERT INTO public.commission_adjustments (business_id, branch_id, employee_id, commission_entry_id, amount,
        remaining_amount, reason, created_by)
      VALUES (v_sale.business_id, v_sale.branch_id, v_entry.employee_id, v_entry.id, v_entry.commission_amount,
        v_entry.commission_amount, trim(p_reason), auth.uid())
      ON CONFLICT (commission_entry_id) DO NOTHING;
    END IF;
    UPDATE public.commission_entries SET status = 'reversed', reversed_at = now(), reversal_reason = trim(p_reason)
    WHERE id = v_entry.id;
  END LOOP;

  UPDATE public.sales SET status = 'refunded', updated_at = now() WHERE id = p_sale_id;
  INSERT INTO public.sale_reversals (business_id, branch_id, sale_id, reason, created_by)
  VALUES (v_sale.business_id, v_sale.branch_id, p_sale_id, trim(p_reason), auth.uid()) RETURNING id INTO v_reversal_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data, reason)
  VALUES (v_sale.business_id, v_sale.branch_id, auth.uid(), 'sale', p_sale_id, 'sale_reversed',
    jsonb_build_object('status', v_sale.status), jsonb_build_object('status', 'refunded', 'refunded_amount', v_refunded), trim(p_reason));
  RETURN jsonb_build_object('sale_id', p_sale_id, 'reversal_id', v_reversal_id, 'refunded_amount', v_refunded,
    'status', 'refunded', 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION private.review_commission_adjustment_impl(p_adjustment_id uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_adjustment public.commission_adjustments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_adjustment_id IS NULL OR length(trim(COALESCE(p_note, ''))) < 3 OR length(p_note) > 500 THEN
    RAISE EXCEPTION 'Adjustment review request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_adjustment FROM public.commission_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND OR NOT private.has_business_role(v_adjustment.business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_adjustment.business_id, v_adjustment.branch_id) THEN
    RAISE EXCEPTION 'Adjustment review permission denied' USING ERRCODE = '42501';
  END IF;
  IF v_adjustment.status <> 'pending' THEN RAISE EXCEPTION 'Adjustment was already reviewed' USING ERRCODE = '55000'; END IF;
  UPDATE public.commission_adjustments SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(p_note) WHERE id = p_adjustment_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data, reason)
  VALUES (v_adjustment.business_id, v_adjustment.branch_id, auth.uid(), 'commission_adjustment', p_adjustment_id::text,
    CASE WHEN p_approve THEN 'commission_adjustment_approved' ELSE 'commission_adjustment_rejected' END,
    jsonb_build_object('amount', v_adjustment.remaining_amount), trim(p_note));
  RETURN jsonb_build_object('adjustment_id', p_adjustment_id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END);
END;
$$;

CREATE OR REPLACE FUNCTION private.settle_commissions_impl(
  p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date,
  p_paid_via public.payment_method, p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_existing public.commission_settlements%ROWTYPE;
  v_settlement_id uuid;
  v_entry record;
  v_adjustment record;
  v_gross numeric(12,2);
  v_deduction_budget numeric(12,2);
  v_deduction numeric(12,2);
  v_total numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end
     OR extract(dow from p_period_start) <> 0 OR p_period_end <> p_period_start + 6
     OR p_period_end >= (now() AT TIME ZONE 'America/Mexico_City')::date OR p_paid_via IS NULL
     OR length(COALESCE(p_reference, '')) > 200 THEN
    RAISE EXCEPTION 'Settlement must use a completed Sunday-to-Saturday week' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active AND EXISTS (SELECT 1 FROM public.employees e WHERE e.business_id = b.business_id AND e.id = p_employee_id);
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Settlement permission denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || p_branch_id::text || ':' || p_employee_id::text || ':settlement', 0));
  SELECT * INTO v_existing FROM public.commission_settlements WHERE business_id = v_business_id AND branch_id = p_branch_id
    AND employee_id = p_employee_id AND period_start = p_period_start AND period_end = p_period_end;
  IF FOUND THEN
    IF v_existing.status = 'paid' THEN RETURN jsonb_build_object('settlement_id', v_existing.id, 'total_amount', v_existing.total_amount, 'idempotent_replay', true); END IF;
    RAISE EXCEPTION 'A settlement already exists for this employee and week' USING ERRCODE = '23505';
  END IF;

  PERFORM 1 FROM public.commission_entries ce WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id
    AND ce.employee_id = p_employee_id AND ce.status = 'generated'
    AND (ce.generated_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_period_start AND p_period_end
    AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id)
    FOR UPDATE;
  SELECT COALESCE(sum(ce.commission_amount), 0) INTO v_gross FROM public.commission_entries ce
  WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id AND ce.status = 'generated'
    AND (ce.generated_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_period_start AND p_period_end
    AND NOT EXISTS (SELECT 1 FROM public.commission_settlement_lines sl WHERE sl.commission_entry_id = ce.id);
  IF v_gross <= 0 THEN RAISE EXCEPTION 'There are no payable commissions for this week' USING ERRCODE = '55000'; END IF;

  PERFORM 1 FROM public.commission_adjustments ca WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id
    AND ca.employee_id = p_employee_id AND ca.status = 'approved' AND ca.remaining_amount > 0 FOR UPDATE;
  SELECT LEAST(v_gross, COALESCE(sum(ca.remaining_amount), 0)) INTO v_deduction_budget
  FROM public.commission_adjustments ca WHERE ca.business_id = v_business_id AND ca.branch_id = p_branch_id
    AND ca.employee_id = p_employee_id AND ca.status = 'approved' AND ca.remaining_amount > 0;
  v_total := v_gross - v_deduction_budget;

  INSERT INTO public.commission_settlements (business_id, branch_id, employee_id, period_start, period_end, total_amount,
    status, paid_via, paid_at, paid_by, reference, created_by)
  VALUES (v_business_id, p_branch_id, p_employee_id, p_period_start, p_period_end, v_total, 'paid', p_paid_via,
    now(), auth.uid(), NULLIF(trim(COALESCE(p_reference, '')), ''), auth.uid()) RETURNING id INTO v_settlement_id;

  FOR v_entry IN SELECT ce.id, ce.commission_amount FROM public.commission_entries ce
    WHERE ce.business_id = v_business_id AND ce.branch_id = p_branch_id AND ce.employee_id = p_employee_id AND ce.status = 'generated'
      AND (ce.generated_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_period_start AND p_period_end
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
    jsonb_build_object('employee_id', p_employee_id, 'period_start', p_period_start, 'period_end', p_period_end,
      'gross_commission', v_gross, 'deductions', v_gross - v_total, 'paid_amount', v_total));
  RETURN jsonb_build_object('settlement_id', v_settlement_id, 'total_amount', v_total,
    'gross_commission', v_gross, 'deductions', v_gross - v_total, 'idempotent_replay', false);
END;
$$;

REVOKE ALL ON FUNCTION private.reverse_sale_impl(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.review_commission_adjustment_impl(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.settle_commissions_impl(uuid, uuid, date, date, public.payment_method, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reverse_sale_impl(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.review_commission_adjustment_impl(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.settle_commissions_impl(uuid, uuid, date, date, public.payment_method, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_sale(p_sale_id uuid, p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.reverse_sale_impl($1, $2) $$;
CREATE OR REPLACE FUNCTION public.review_commission_adjustment(p_adjustment_id uuid, p_approve boolean, p_note text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.review_commission_adjustment_impl($1, $2, $3) $$;
CREATE OR REPLACE FUNCTION public.settle_commissions(p_branch_id uuid, p_employee_id uuid, p_period_start date, p_period_end date,
  p_paid_via public.payment_method, p_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.settle_commissions_impl($1, $2, $3, $4, $5, $6) $$;

REVOKE ALL ON FUNCTION public.reverse_sale(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_commission_adjustment(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_commissions(uuid, uuid, date, date, public.payment_method, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_sale(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_commission_adjustment(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_commissions(uuid, uuid, date, date, public.payment_method, text) TO authenticated;

COMMIT;
