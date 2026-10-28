BEGIN;

CREATE TABLE public.commission_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  branch_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  sale_item_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('product_discount_rule_pending', 'multiple_beneficiaries', 'commission_rule_missing', 'beneficiary_missing')),
  employee_candidate_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolution_note text,
  CONSTRAINT commission_holds_sale_fk FOREIGN KEY (business_id, branch_id, sale_id)
    REFERENCES public.sales(business_id, branch_id, id),
  CONSTRAINT commission_holds_item_fk FOREIGN KEY (business_id, branch_id, sale_item_id)
    REFERENCES public.sale_items(business_id, branch_id, id),
  CONSTRAINT commission_holds_sale_item_unique UNIQUE (sale_item_id),
  CONSTRAINT commission_holds_resolution_check CHECK (
    (resolved_at IS NULL AND resolved_by IS NULL AND resolution_note IS NULL)
    OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND length(trim(COALESCE(resolution_note, ''))) > 0)
  )
);
ALTER TABLE public.commission_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY commission_holds_select_admin ON public.commission_holds
  FOR SELECT TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
REVOKE ALL PRIVILEGES ON public.commission_holds FROM anon, authenticated;
GRANT SELECT ON public.commission_holds TO authenticated;
CREATE INDEX commission_holds_pending_idx ON public.commission_holds (business_id, branch_id, created_at)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_catalog_product(
  p_branch_id uuid,
  p_name text,
  p_sku text,
  p_description text,
  p_sale_price numeric,
  p_cost_price numeric,
  p_initial_stock integer,
  p_minimum_quantity integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_product_id uuid;
BEGIN
  SELECT b.business_id INTO v_business_id FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active;
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Branch access denied' USING ERRCODE = '42501';
  END IF;
  IF length(trim(COALESCE(p_name, ''))) < 2 OR p_sale_price < 0 OR p_initial_stock < 0 OR p_minimum_quantity < 0
     OR (p_cost_price IS NOT NULL AND p_cost_price < 0) THEN
    RAISE EXCEPTION 'Product details are invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.products (business_id, name, sku, description, sale_price, cost_price, tracks_inventory, is_active)
  VALUES (v_business_id, trim(p_name), NULLIF(trim(COALESCE(p_sku, '')), ''), NULLIF(trim(COALESCE(p_description, '')), ''),
          p_sale_price, p_cost_price, true, true)
  RETURNING id INTO v_product_id;
  INSERT INTO public.branch_inventory (business_id, branch_id, product_id, quantity_on_hand, minimum_quantity)
  VALUES (v_business_id, p_branch_id, v_product_id, p_initial_stock, p_minimum_quantity);
  IF p_initial_stock > 0 THEN
    INSERT INTO public.inventory_movements (business_id, branch_id, product_id, movement_type, quantity_delta, unit_cost_snapshot, created_by, notes)
    VALUES (v_business_id, p_branch_id, v_product_id, 'initial', p_initial_stock, p_cost_price, auth.uid(), 'Existencia inicial');
  END IF;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'product', v_product_id::text, 'product_created',
          jsonb_build_object('name', trim(p_name), 'initial_stock', p_initial_stock));
  RETURN jsonb_build_object('product_id', v_product_id, 'business_id', v_business_id, 'branch_id', p_branch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_session(p_branch_id uuid, p_opening_cash numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_session_id uuid;
BEGIN
  SELECT b.business_id INTO v_business_id FROM public.branches b WHERE b.id = p_branch_id AND b.is_active;
  IF v_business_id IS NULL OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin','cashier']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Cash permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_opening_cash < 0 THEN RAISE EXCEPTION 'Opening cash cannot be negative' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_branch_id::text || ':cash-open', 0));
  IF EXISTS (SELECT 1 FROM public.cash_sessions WHERE branch_id = p_branch_id AND status = 'open') THEN
    RAISE EXCEPTION 'A cash session is already open for this branch' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.cash_sessions (business_id, branch_id, opened_by, opening_cash, status)
  VALUES (v_business_id, p_branch_id, auth.uid(), p_opening_cash, 'open') RETURNING id INTO v_session_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'cash_session', v_session_id::text, 'cash_opened', jsonb_build_object('opening_cash', p_opening_cash));
  RETURN jsonb_build_object('cash_session_id', v_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session(p_cash_session_id uuid, p_counted_cash numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_expected numeric(12,2);
  v_difference numeric(12,2);
BEGIN
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_cash_session_id FOR UPDATE;
  IF NOT FOUND OR NOT private.has_business_role(v_session.business_id, ARRAY['owner','admin','cashier']::public.business_role[])
     OR NOT private.can_access_branch(v_session.business_id, v_session.branch_id) THEN
    RAISE EXCEPTION 'Cash permission denied' USING ERRCODE = '42501';
  END IF;
  IF v_session.status <> 'open' OR p_counted_cash < 0 THEN RAISE EXCEPTION 'Cash session is not open or count is invalid' USING ERRCODE = '22023'; END IF;
  SELECT v_session.opening_cash + COALESCE(sum(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
  INTO v_expected FROM public.cash_movements
  WHERE cash_session_id = p_cash_session_id AND method = 'cash';
  v_difference := p_counted_cash - v_expected;
  UPDATE public.cash_sessions SET status = 'closed', closed_at = now(), closed_by = auth.uid(),
    expected_cash = v_expected, counted_cash = p_counted_cash, difference_amount = v_difference
  WHERE id = p_cash_session_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_session.business_id, v_session.branch_id, auth.uid(), 'cash_session', p_cash_session_id::text, 'cash_closed',
          jsonb_build_object('expected_cash', v_expected, 'counted_cash', p_counted_cash, 'difference', v_difference));
  RETURN jsonb_build_object('cash_session_id', p_cash_session_id, 'expected_cash', v_expected, 'counted_cash', p_counted_cash, 'difference_amount', v_difference);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cash_movement(
  p_cash_session_id uuid,
  p_movement_type public.cash_movement_type,
  p_method public.payment_method,
  p_amount numeric,
  p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_direction public.cash_direction;
  v_expense_id uuid;
  v_movement_id uuid;
BEGIN
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = p_cash_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'open'
     OR NOT private.has_business_role(v_session.business_id, ARRAY['owner','admin','cashier']::public.business_role[])
     OR NOT private.can_access_branch(v_session.business_id, v_session.branch_id) THEN
    RAISE EXCEPTION 'Cash permission denied or session closed' USING ERRCODE = '42501';
  END IF;
  IF p_amount <= 0 OR length(trim(COALESCE(p_description, ''))) < 2
     OR p_movement_type NOT IN ('expense','withdrawal','deposit') THEN
    RAISE EXCEPTION 'Cash movement details are invalid' USING ERRCODE = '22023';
  END IF;
  v_direction := CASE WHEN p_movement_type = 'deposit' THEN 'in'::public.cash_direction ELSE 'out'::public.cash_direction END;
  IF p_movement_type = 'expense' THEN
    INSERT INTO public.expenses (business_id, branch_id, cash_session_id, created_by, amount, category, description, method, status)
    VALUES (v_session.business_id, v_session.branch_id, p_cash_session_id, auth.uid(), p_amount, 'General', trim(p_description), p_method, 'posted')
    RETURNING id INTO v_expense_id;
  END IF;
  INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method, movement_type, direction, expense_id, description)
  VALUES (v_session.business_id, v_session.branch_id, p_cash_session_id, auth.uid(), p_amount, p_method, p_movement_type, v_direction, v_expense_id, trim(p_description))
  RETURNING id INTO v_movement_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_session.business_id, v_session.branch_id, auth.uid(), 'cash_movement', v_movement_id::text, 'cash_movement_recorded',
          jsonb_build_object('type', p_movement_type, 'method', p_method, 'amount', p_amount));
  RETURN jsonb_build_object('movement_id', v_movement_id, 'expense_id', v_expense_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_sale(
  p_branch_id uuid,
  p_idempotency_key text,
  p_items jsonb,
  p_payments jsonb,
  p_client_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_discount_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_existing_id uuid;
  v_sale_id uuid;
  v_cash_session_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_item_id uuid;
  v_item_type public.sale_item_type;
  v_catalog_id uuid;
  v_name text;
  v_unit_price numeric(12,2);
  v_quantity integer;
  v_discount numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount_total numeric(12,2) := 0;
  v_total numeric(12,2);
  v_paid numeric(12,2) := 0;
  v_amount numeric(12,2);
  v_method public.payment_method;
  v_payment_id uuid;
  v_employee_id uuid;
  v_candidates uuid[];
  v_rule public.commission_rules%ROWTYPE;
  v_commission numeric(12,2);
  v_hold_reason text;
  v_stock integer;
  v_role public.business_role;
  v_index integer := 0;
  v_payment_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR length(trim(COALESCE(p_idempotency_key, ''))) < 12 OR length(p_idempotency_key) > 128
     OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1
     OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) < 1 THEN
    RAISE EXCEPTION 'Sale request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b WHERE b.id = p_branch_id AND b.is_active;
  SELECT m.role INTO v_role FROM public.business_memberships m WHERE m.business_id = v_business_id AND m.user_id = auth.uid() AND m.is_active;
  IF v_business_id IS NULL OR v_role NOT IN ('owner','admin','cashier') OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Sale permission denied' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i WHERE COALESCE((i->>'discount_amount')::numeric, 0) > 0)
     AND v_role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'Only an owner or admin may approve discounts' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i WHERE i->>'item_type' NOT IN ('service','product')) THEN
    RAISE EXCEPTION 'Unknown sale line type' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || p_idempotency_key, 0));
  SELECT id INTO v_existing_id FROM public.sales WHERE business_id = v_business_id AND idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN RETURN jsonb_build_object('sale_id', v_existing_id, 'idempotent_replay', true); END IF;
  IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE business_id = v_business_id AND id = p_client_id) THEN
    RAISE EXCEPTION 'Client does not belong to this business' USING ERRCODE = '23503';
  END IF;
  SELECT id INTO v_cash_session_id FROM public.cash_sessions
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND status = 'open' FOR UPDATE;
  IF v_cash_session_id IS NULL THEN RAISE EXCEPTION 'Open the branch cash session before collecting a sale' USING ERRCODE = '55000'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_item_type := (v_item->>'item_type')::public.sale_item_type;
    v_catalog_id := (v_item->>'catalog_id')::uuid;
    v_quantity := COALESCE((v_item->>'quantity')::integer, 1);
    v_discount := COALESCE((v_item->>'discount_amount')::numeric, 0);
    IF v_quantity < 1 OR v_quantity > 1000 OR v_discount < 0 THEN RAISE EXCEPTION 'Sale line quantity or discount is invalid' USING ERRCODE = '22023'; END IF;

    IF v_item_type = 'service' THEN
      SELECT name, price INTO v_name, v_unit_price FROM public.services
      WHERE business_id = v_business_id AND id = v_catalog_id AND is_active;
    ELSE
      SELECT name, sale_price INTO v_name, v_unit_price FROM public.products
      WHERE business_id = v_business_id AND id = v_catalog_id AND is_active;
    END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'Catalog item is missing or inactive' USING ERRCODE = '23503'; END IF;
    v_line_total := round(v_unit_price * v_quantity, 2) - v_discount;
    IF v_line_total < 0 THEN RAISE EXCEPTION 'Discount exceeds line value' USING ERRCODE = '22023'; END IF;
    v_subtotal := v_subtotal + round(v_unit_price * v_quantity, 2);
    v_discount_total := v_discount_total + v_discount;
  END LOOP;
  IF v_discount_total > 0 AND length(trim(COALESCE(p_discount_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'A reason is required for discounts' USING ERRCODE = '22023';
  END IF;
  v_total := v_subtotal - v_discount_total;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Sale total must be greater than zero' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.sales (business_id, branch_id, client_id, created_by, idempotency_key, subtotal_amount, discount_amount, tax_amount, total_amount, status, notes)
  VALUES (v_business_id, p_branch_id, p_client_id, auth.uid(), p_idempotency_key, v_subtotal, v_discount_total, 0, v_total,
          'open', NULLIF(trim(COALESCE(p_notes, '')), '')) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_item_type := (v_item->>'item_type')::public.sale_item_type;
    v_catalog_id := (v_item->>'catalog_id')::uuid;
    v_quantity := COALESCE((v_item->>'quantity')::integer, 1);
    v_discount := COALESCE((v_item->>'discount_amount')::numeric, 0);
    v_employee_id := NULLIF(v_item->>'employee_id', '')::uuid;
    v_candidates := ARRAY(SELECT candidate.value::uuid FROM jsonb_array_elements_text(COALESCE(v_item->'commission_employee_ids', '[]'::jsonb)) AS candidate(value));
    IF v_item_type = 'service' THEN
      SELECT name, price INTO v_name, v_unit_price FROM public.services WHERE business_id = v_business_id AND id = v_catalog_id AND is_active;
      IF v_employee_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.employees WHERE business_id = v_business_id AND id = v_employee_id AND is_active) THEN
        RAISE EXCEPTION 'Every service line needs an active responsible employee' USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT name, sale_price INTO v_name, v_unit_price FROM public.products WHERE business_id = v_business_id AND id = v_catalog_id AND is_active;
      IF (SELECT tracks_inventory FROM public.products WHERE business_id = v_business_id AND id = v_catalog_id) THEN
        SELECT quantity_on_hand INTO v_stock FROM public.branch_inventory WHERE business_id = v_business_id AND branch_id = p_branch_id AND product_id = v_catalog_id FOR UPDATE;
        IF v_stock IS NULL OR v_stock < v_quantity THEN RAISE EXCEPTION 'Insufficient product stock' USING ERRCODE = '23514'; END IF;
        UPDATE public.branch_inventory SET quantity_on_hand = quantity_on_hand - v_quantity, updated_at = now()
        WHERE business_id = v_business_id AND branch_id = p_branch_id AND product_id = v_catalog_id AND quantity_on_hand >= v_quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient product stock' USING ERRCODE = '23514'; END IF;
        INSERT INTO public.inventory_movements (business_id, branch_id, product_id, movement_type, quantity_delta, created_by, reference, notes)
        VALUES (v_business_id, p_branch_id, v_catalog_id, 'sale', -v_quantity, auth.uid(), v_sale_id::text, 'Venta');
      END IF;
      v_employee_id := CASE WHEN cardinality(v_candidates) = 1 THEN v_candidates[1] ELSE NULL END;
    END IF;

    INSERT INTO public.sale_items (business_id, branch_id, sale_id, item_type, service_id, product_id, employee_id, commission_employee_id,
      item_name_snapshot, unit_price, quantity, discount_amount, line_total)
    VALUES (v_business_id, p_branch_id, v_sale_id, v_item_type,
      CASE WHEN v_item_type = 'service' THEN v_catalog_id ELSE NULL END,
      CASE WHEN v_item_type = 'product' THEN v_catalog_id ELSE NULL END,
      CASE WHEN v_item_type = 'service' THEN v_employee_id ELSE NULL END,
      CASE WHEN v_item_type = 'product' THEN v_employee_id ELSE NULL END,
      v_name, v_unit_price, v_quantity, v_discount, round(v_unit_price * v_quantity, 2) - v_discount)
    RETURNING id INTO v_item_id;

    IF v_item_type = 'product' THEN
      v_hold_reason := CASE
        WHEN v_discount > 0 THEN 'product_discount_rule_pending'
        WHEN cardinality(v_candidates) > 1 THEN 'multiple_beneficiaries'
        WHEN cardinality(v_candidates) = 0 THEN 'beneficiary_missing'
        ELSE NULL END;
      IF v_hold_reason IS NOT NULL THEN
        INSERT INTO public.commission_holds (business_id, branch_id, sale_id, sale_item_id, reason, employee_candidate_ids)
        VALUES (v_business_id, p_branch_id, v_sale_id, v_item_id, v_hold_reason, v_candidates);
      END IF;
    END IF;
  END LOOP;

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
    v_index := v_index + 1;
    v_amount := (v_payment->>'amount')::numeric;
    v_method := (v_payment->>'method')::public.payment_method;
    IF v_amount <= 0 THEN RAISE EXCEPTION 'Payment amounts must be positive' USING ERRCODE = '22023'; END IF;
    v_paid := v_paid + v_amount;
    IF v_paid > v_total THEN RAISE EXCEPTION 'Payment total exceeds sale total' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.payments (business_id, branch_id, sale_id, processed_by, amount, method, status, idempotency_key, reference)
    VALUES (v_business_id, p_branch_id, v_sale_id, auth.uid(), v_amount, v_method, 'confirmed', p_idempotency_key || ':' || v_index, NULLIF(v_payment->>'reference', ''))
    RETURNING id INTO v_payment_id;
    INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method, movement_type, direction, payment_id, sale_id, description)
    VALUES (v_business_id, p_branch_id, v_cash_session_id, auth.uid(), v_amount, v_method, 'sale_payment', 'in', v_payment_id, v_sale_id, 'Cobro de venta');
    v_payment_count := v_payment_count + 1;
  END LOOP;
  IF v_payment_count = 0 THEN RAISE EXCEPTION 'At least one payment is required' USING ERRCODE = '22023'; END IF;

  IF v_paid = v_total THEN
    UPDATE public.sales SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = v_sale_id;
    FOR v_item IN SELECT si.id, si.item_type, si.service_id, si.product_id, si.employee_id, si.commission_employee_id,
                         si.unit_price, si.quantity, si.discount_amount
                  FROM public.sale_items si WHERE si.sale_id = v_sale_id LOOP
      IF v_item.item_type = 'service' THEN
        SELECT * INTO v_rule FROM public.commission_rules r WHERE r.business_id = v_business_id AND r.target_type = 'service'
          AND r.service_id = v_item.service_id AND r.is_active AND r.effective_from <= CURRENT_DATE
          AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
          AND (r.employee_id IS NULL OR r.employee_id = v_item.employee_id)
        ORDER BY (r.employee_id IS NOT NULL) DESC, r.priority DESC, r.effective_from DESC LIMIT 1;
        IF NOT FOUND THEN
          INSERT INTO public.commission_holds (business_id, branch_id, sale_id, sale_item_id, reason, employee_candidate_ids)
          VALUES (v_business_id, p_branch_id, v_sale_id, v_item.id, 'commission_rule_missing', ARRAY[v_item.employee_id]);
        ELSE
          v_commission := CASE WHEN v_rule.calculation_type = 'percentage'
            THEN round((v_item.unit_price * v_item.quantity) * v_rule.percentage / 100, 2)
            ELSE round(v_rule.fixed_amount * v_item.quantity, 2) END;
          INSERT INTO public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, commission_rule_id,
            calculation_type, basis, basis_amount, percentage_snapshot, fixed_amount_snapshot, commission_amount, rule_snapshot)
          VALUES (v_business_id, p_branch_id, v_sale_id, v_item.id, v_item.employee_id, v_rule.id, v_rule.calculation_type,
            'price_before_discount', round(v_item.unit_price * v_item.quantity, 2), v_rule.percentage, v_rule.fixed_amount,
            v_commission, jsonb_build_object('rule_id', v_rule.id, 'name', v_rule.name, 'percentage', v_rule.percentage, 'fixed_amount', v_rule.fixed_amount));
        END IF;
      ELSE
        SELECT * INTO v_rule FROM public.commission_rules r WHERE r.business_id = v_business_id AND r.target_type = 'product'
          AND r.product_id = v_item.product_id AND r.is_active AND r.effective_from <= CURRENT_DATE
          AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
          AND (r.employee_id IS NULL OR r.employee_id = v_item.commission_employee_id)
        ORDER BY (r.employee_id IS NOT NULL) DESC, r.priority DESC, r.effective_from DESC LIMIT 1;
        IF FOUND AND v_item.commission_employee_id IS NOT NULL AND NOT EXISTS
          (SELECT 1 FROM public.commission_holds h WHERE h.sale_item_id = v_item.id) THEN
          v_commission := CASE WHEN v_rule.calculation_type = 'percentage'
            THEN round((v_item.unit_price * v_item.quantity) * v_rule.percentage / 100, 2)
            ELSE round(v_rule.fixed_amount * v_item.quantity, 2) END;
          INSERT INTO public.commission_entries (business_id, branch_id, sale_id, sale_item_id, employee_id, commission_rule_id,
            calculation_type, basis, basis_amount, percentage_snapshot, fixed_amount_snapshot, commission_amount, rule_snapshot)
          VALUES (v_business_id, p_branch_id, v_sale_id, v_item.id, v_item.commission_employee_id, v_rule.id, v_rule.calculation_type,
            'price_after_discount', round(v_item.unit_price * v_item.quantity, 2), v_rule.percentage, v_rule.fixed_amount,
            v_commission, jsonb_build_object('rule_id', v_rule.id, 'name', v_rule.name, 'percentage', v_rule.percentage, 'fixed_amount', v_rule.fixed_amount));
        ELSIF NOT EXISTS (SELECT 1 FROM public.commission_holds h WHERE h.sale_item_id = v_item.id) THEN
          INSERT INTO public.commission_holds (business_id, branch_id, sale_id, sale_item_id, reason, employee_candidate_ids)
          VALUES (v_business_id, p_branch_id, v_sale_id, v_item.id, 'commission_rule_missing', ARRAY[]::uuid[]);
        END IF;
      END IF;
    END LOOP;
  ELSE
    UPDATE public.sales SET status = 'partially_paid', updated_at = now() WHERE id = v_sale_id;
  END IF;

  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'sale', v_sale_id::text, 'sale_confirmed',
          jsonb_build_object('total', v_total, 'paid', v_paid, 'status', CASE WHEN v_paid = v_total THEN 'paid' ELSE 'partially_paid' END,
                             'discount_reason', p_discount_reason));
  RETURN jsonb_build_object('sale_id', v_sale_id, 'total_amount', v_total, 'paid_amount', v_paid,
                            'status', CASE WHEN v_paid = v_total THEN 'paid' ELSE 'partially_paid' END, 'idempotent_replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_catalog_product(uuid, text, text, text, numeric, numeric, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_cash_session(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_cash_movement(uuid, public.cash_movement_type, public.payment_method, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_catalog_product(uuid, text, text, text, numeric, numeric, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_cash_movement(uuid, public.cash_movement_type, public.payment_method, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_sale(uuid, text, jsonb, jsonb, uuid, text, text) TO authenticated;

COMMIT;

