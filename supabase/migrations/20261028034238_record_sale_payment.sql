BEGIN;

CREATE OR REPLACE FUNCTION private.generate_sale_commissions_impl(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_item public.sale_items%ROWTYPE;
  v_rule public.commission_rules%ROWTYPE;
  v_basis numeric(12,2);
  v_commission numeric(12,2);
  v_employee_id uuid;
  v_hold_reason text;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
  IF NOT FOUND OR v_sale.status <> 'paid'
     OR NOT private.has_business_role(v_sale.business_id, ARRAY['owner','admin','cashier']::public.business_role[])
     OR NOT private.can_access_branch(v_sale.business_id, v_sale.branch_id) THEN
    RAISE EXCEPTION 'Sale commission permission denied' USING ERRCODE = '42501';
  END IF;

  FOR v_item IN SELECT * FROM public.sale_items WHERE business_id = v_sale.business_id AND sale_id = p_sale_id ORDER BY id LOOP
    IF EXISTS (SELECT 1 FROM public.commission_entries WHERE sale_item_id = v_item.id)
       OR EXISTS (SELECT 1 FROM public.commission_holds WHERE sale_item_id = v_item.id) THEN
      CONTINUE;
    END IF;

    IF v_item.item_type = 'service' THEN
      v_employee_id := v_item.employee_id;
      SELECT * INTO v_rule FROM public.commission_rules r
      WHERE r.business_id = v_sale.business_id AND r.target_type = 'service' AND r.service_id = v_item.service_id
        AND r.is_active AND r.effective_from <= CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
        AND (r.employee_id IS NULL OR r.employee_id = v_employee_id)
      ORDER BY (r.employee_id IS NOT NULL) DESC, r.priority DESC, r.effective_from DESC LIMIT 1;
      IF NOT FOUND THEN
        INSERT INTO public.commission_holds (business_id, branch_id, sale_id, sale_item_id, reason, employee_candidate_ids)
        VALUES (v_sale.business_id, v_sale.branch_id, p_sale_id, v_item.id, 'commission_rule_missing', ARRAY[v_employee_id]);
        CONTINUE;
      END IF;
      v_basis := CASE WHEN v_rule.basis = 'price_after_discount' THEN v_item.line_total
                      ELSE round(v_item.unit_price * v_item.quantity, 2) END;
    ELSE
      v_employee_id := v_item.commission_employee_id;
      IF v_item.discount_amount > 0 THEN
        v_hold_reason := 'product_discount_rule_pending';
      ELSIF v_employee_id IS NULL THEN
        v_hold_reason := 'beneficiary_missing';
      ELSE
        SELECT * INTO v_rule FROM public.commission_rules r
        WHERE r.business_id = v_sale.business_id AND r.target_type = 'product' AND r.product_id = v_item.product_id
          AND r.is_active AND r.effective_from <= CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
          AND (r.employee_id IS NULL OR r.employee_id = v_employee_id)
        ORDER BY (r.employee_id IS NOT NULL) DESC, r.priority DESC, r.effective_from DESC LIMIT 1;
        IF NOT FOUND THEN v_hold_reason := 'commission_rule_missing'; END IF;
      END IF;
      IF v_hold_reason IS NOT NULL THEN
        INSERT INTO public.commission_holds (business_id, branch_id, sale_id, sale_item_id, reason, employee_candidate_ids)
        VALUES (v_sale.business_id, v_sale.branch_id, p_sale_id, v_item.id, v_hold_reason,
          CASE WHEN v_employee_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[v_employee_id] END);
        v_hold_reason := NULL;
        CONTINUE;
      END IF;
      v_basis := CASE WHEN v_rule.basis = 'price_after_discount' THEN v_item.line_total
                      ELSE round(v_item.unit_price * v_item.quantity, 2) END;
    END IF;

    v_commission := CASE WHEN v_rule.calculation_type = 'percentage'
      THEN round(v_basis * v_rule.percentage / 100, 2)
      ELSE round(v_rule.fixed_amount * v_item.quantity, 2) END;
    INSERT INTO public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, commission_rule_id,
      calculation_type, basis, basis_amount, percentage_snapshot, fixed_amount_snapshot, commission_amount, rule_snapshot)
    VALUES (v_sale.business_id, v_sale.branch_id, p_sale_id, v_item.id, v_employee_id, v_rule.id,
      v_rule.calculation_type, v_rule.basis, v_basis,
      CASE WHEN v_rule.calculation_type = 'percentage' THEN v_rule.percentage ELSE NULL END,
      CASE WHEN v_rule.calculation_type = 'fixed_amount' THEN v_rule.fixed_amount ELSE NULL END,
      v_commission, jsonb_build_object('rule_id', v_rule.id, 'name', v_rule.name, 'basis', v_rule.basis,
        'percentage', v_rule.percentage, 'fixed_amount', v_rule.fixed_amount));
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.record_sale_payment_impl(
  p_sale_id uuid,
  p_idempotency_key text,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_sale public.sales%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_cash_session_id uuid;
  v_payment_id uuid;
  v_paid numeric(12,2);
  v_new_paid numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR p_sale_id IS NULL OR length(trim(COALESCE(p_idempotency_key, ''))) < 12
     OR length(p_idempotency_key) > 128 OR p_amount IS NULL OR p_amount <= 0
     OR p_amount > 10000000 OR p_amount <> round(p_amount, 2) OR p_method IS NULL THEN
    RAISE EXCEPTION 'Payment request is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT s.business_id INTO v_business_id FROM public.sales s WHERE s.id = p_sale_id;
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin','cashier']::public.business_role[])
     OR NOT EXISTS (SELECT 1 FROM public.sales s WHERE s.id = p_sale_id AND private.can_access_branch(s.business_id, s.branch_id)) THEN
    RAISE EXCEPTION 'Payment permission denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || p_idempotency_key, 0));

  SELECT * INTO v_existing FROM public.payments WHERE business_id = v_business_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.sale_id <> p_sale_id THEN RAISE EXCEPTION 'Idempotency key belongs to another sale' USING ERRCODE = '22023'; END IF;
    SELECT COALESCE(sum(amount), 0) INTO v_paid FROM public.payments WHERE sale_id = p_sale_id AND status = 'confirmed';
    SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id;
    RETURN jsonb_build_object('sale_id', p_sale_id, 'payment_id', v_existing.id, 'paid_amount', v_paid,
      'status', v_sale.status, 'idempotent_replay', true);
  END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF v_sale.status NOT IN ('open','partially_paid') THEN
    RAISE EXCEPTION 'Sale cannot accept another payment' USING ERRCODE = '55000';
  END IF;
  SELECT id INTO v_cash_session_id FROM public.cash_sessions
  WHERE business_id = v_sale.business_id AND branch_id = v_sale.branch_id AND status = 'open' FOR UPDATE;
  IF v_cash_session_id IS NULL THEN RAISE EXCEPTION 'Open the branch cash session before collecting a payment' USING ERRCODE = '55000'; END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_paid FROM public.payments WHERE sale_id = p_sale_id AND status = 'confirmed';
  IF p_amount > v_sale.total_amount - v_paid THEN RAISE EXCEPTION 'Payment exceeds the remaining balance' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.payments (business_id, branch_id, sale_id, processed_by, amount, method, status, idempotency_key, reference)
  VALUES (v_sale.business_id, v_sale.branch_id, p_sale_id, auth.uid(), p_amount, p_method, 'confirmed', p_idempotency_key,
    NULLIF(trim(COALESCE(p_reference, '')), '')) RETURNING id INTO v_payment_id;
  INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method, movement_type, direction, payment_id, sale_id, description)
  VALUES (v_sale.business_id, v_sale.branch_id, v_cash_session_id, auth.uid(), p_amount, p_method, 'sale_payment', 'in', v_payment_id, p_sale_id, 'Abono a venta');
  v_new_paid := v_paid + p_amount;

  IF v_new_paid = v_sale.total_amount THEN
    UPDATE public.sales SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = p_sale_id;
    PERFORM private.generate_sale_commissions_impl(p_sale_id);
  ELSE
    UPDATE public.sales SET status = 'partially_paid', updated_at = now() WHERE id = p_sale_id;
  END IF;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_sale.business_id, v_sale.branch_id, auth.uid(), 'sale', p_sale_id::text, 'sale_payment_recorded',
    jsonb_build_object('payment_id', v_payment_id, 'amount', p_amount, 'paid_amount', v_new_paid,
      'total_amount', v_sale.total_amount, 'status', CASE WHEN v_new_paid = v_sale.total_amount THEN 'paid' ELSE 'partially_paid' END));
  RETURN jsonb_build_object('sale_id', p_sale_id, 'payment_id', v_payment_id, 'paid_amount', v_new_paid,
    'remaining_amount', v_sale.total_amount - v_new_paid,
    'status', CASE WHEN v_new_paid = v_sale.total_amount THEN 'paid' ELSE 'partially_paid' END,
    'idempotent_replay', false);
END;
$$;

REVOKE ALL ON FUNCTION private.generate_sale_commissions_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.record_sale_payment_impl(uuid, text, numeric, public.payment_method, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_sale_payment_impl(uuid, text, numeric, public.payment_method, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_sale_payment(
  p_sale_id uuid,
  p_idempotency_key text,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.record_sale_payment_impl($1, $2, $3, $4, $5) $$;

REVOKE ALL ON FUNCTION public.record_sale_payment(uuid, text, numeric, public.payment_method, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sale_payment(uuid, text, numeric, public.payment_method, text) TO authenticated;

COMMIT;
