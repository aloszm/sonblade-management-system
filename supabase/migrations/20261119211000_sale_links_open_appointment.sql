-- B3 — Cita duplicada al cobrar sin abrir la cita.
-- private.confirm_sale_impl: cuando no llega p_appointment_id, antes de crear la cita walk_in busca la cita
-- abierta de ese barbero que corresponde al cobro y, si la coincidencia es única y segura, la completa y la liga
-- (misma transición que el camino con cita). Regla exacta en el comentario dentro de la función.
-- La respuesta agrega appointment_id y appointment_link ('explicit' | 'auto' | 'walk_in' | null); la bitácora
-- sale_confirmed también guarda appointment_link. Firma sin cambios (la app publicada sigue funcionando).

create or replace function private.confirm_sale_impl(p_branch_id uuid, p_idempotency_key text, p_items jsonb, p_payments jsonb, p_client_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_discount_reason text DEFAULT NULL::text, p_tips jsonb DEFAULT '[]'::jsonb, p_discount_authorized_by uuid DEFAULT NULL::uuid, p_appointment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_business_id uuid;
  v_existing_id uuid;
  v_sale_id uuid;
  v_cash_session_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_row record;
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
  v_tip jsonb;
  v_tip_name text;
  v_authorizer uuid;
  v_appt_status public.appointment_status;
  v_barber uuid;
  v_minutes integer;
  v_walkin uuid;
  v_folio text;
  v_unit_cost numeric(12,2);
  v_tz text;
  v_barbers integer;
  v_match uuid[];
  v_match_status public.appointment_status;
  v_match_client uuid;
  v_appointment uuid := p_appointment_id;
  v_link text := CASE WHEN p_appointment_id IS NOT NULL THEN 'explicit' END;
BEGIN
  IF auth.uid() IS NULL OR length(trim(COALESCE(p_idempotency_key, ''))) < 12 OR length(p_idempotency_key) > 128
     OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1
     OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) < 1 THEN
    RAISE EXCEPTION 'Los datos de la venta no son válidos.' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b WHERE b.id = p_branch_id AND b.is_active;
  SELECT m.role INTO v_role FROM public.business_memberships m WHERE m.business_id = v_business_id AND m.user_id = auth.uid() AND m.is_active;
  IF v_business_id IS NULL OR v_role NOT IN ('owner','admin','cashier','receptionist') OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Sale permission denied' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i WHERE COALESCE((i->>'discount_amount')::numeric, 0) > 0) THEN
    v_authorizer := COALESCE(p_discount_authorized_by, auth.uid());
    -- Autoriza: dueño o gerencia (con acceso activo y PIN propio), o un empleado activo con permiso.
    IF NOT (EXISTS (SELECT 1 FROM public.business_memberships m WHERE m.business_id = v_business_id AND m.user_id = v_authorizer
                     AND m.is_active AND NOT m.must_change_pin AND m.role IN ('owner','admin'))
            OR EXISTS (SELECT 1 FROM public.employees e
                       JOIN public.business_memberships m ON m.business_id = e.business_id AND m.user_id = e.user_id
                       WHERE e.business_id = v_business_id AND e.user_id = v_authorizer
                         AND e.is_active AND e.can_authorize_discounts AND m.is_active)) THEN
      RAISE EXCEPTION 'Esa persona no puede autorizar descuentos: debe ser el dueño, gerencia o alguien con permiso para autorizarlos.' USING ERRCODE = '42501';
    END IF;
    -- Recepción y caja no se autorizan a sí mismas un descuento.
    IF v_role IN ('receptionist','cashier') AND v_authorizer = auth.uid() THEN
      RAISE EXCEPTION 'Un descuento lo debe autorizar otra persona (dueño, gerencia o alguien con permiso), no quien cobra.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i WHERE i->>'item_type' NOT IN ('service','product')) THEN
    RAISE EXCEPTION 'Tipo de renglón desconocido.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':' || p_idempotency_key, 0));
  SELECT id INTO v_existing_id FROM public.sales WHERE business_id = v_business_id AND idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN RETURN jsonb_build_object('sale_id', v_existing_id, 'folio', (SELECT s.folio FROM public.sales s WHERE s.id = v_existing_id), 'idempotent_replay', true); END IF;
  IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE business_id = v_business_id AND id = p_client_id) THEN
    RAISE EXCEPTION 'Ese cliente no pertenece a este negocio.' USING ERRCODE = '23503';
  END IF;
  IF p_appointment_id IS NOT NULL THEN
    SELECT a.status INTO v_appt_status FROM public.appointments a
    WHERE a.id = p_appointment_id AND a.business_id = v_business_id AND a.branch_id = p_branch_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La cita no existe en esta sucursal.' USING ERRCODE = '22023'; END IF;
    IF v_appt_status NOT IN ('scheduled','confirmed','checked_in','in_progress') THEN
      RAISE EXCEPTION 'Esa cita ya fue cerrada o cancelada.' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sales s WHERE s.appointment_id = p_appointment_id AND s.status NOT IN ('refunded','cancelled')) THEN
      RAISE EXCEPTION 'Esa cita ya se cobró.' USING ERRCODE = '55000';
    END IF;
  END IF;
  SELECT id INTO v_cash_session_id FROM public.cash_sessions
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND status = 'open' FOR UPDATE;
  IF v_cash_session_id IS NULL THEN RAISE EXCEPTION 'La caja está cerrada. Ábrela en Caja antes de cobrar.' USING ERRCODE = '55000'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_item_type := (v_item->>'item_type')::public.sale_item_type;
    v_catalog_id := (v_item->>'catalog_id')::uuid;
    v_quantity := COALESCE((v_item->>'quantity')::integer, 1);
    v_discount := COALESCE((v_item->>'discount_amount')::numeric, 0);
    IF v_quantity < 1 OR v_quantity > 1000 OR v_discount < 0 THEN RAISE EXCEPTION 'La cantidad o el descuento no son válidos.' USING ERRCODE = '22023'; END IF;

    IF v_item_type = 'service' THEN
      SELECT name, private.service_line_price(name, price, variable_price, v_item) INTO v_name, v_unit_price FROM public.services
      WHERE business_id = v_business_id AND id = v_catalog_id AND is_active;
    ELSE
      SELECT name, sale_price INTO v_name, v_unit_price FROM public.products
      WHERE business_id = v_business_id AND id = v_catalog_id AND is_active;
    END IF;
    IF v_name IS NULL THEN RAISE EXCEPTION 'Uno de los servicios o productos ya no está activo.' USING ERRCODE = '23503'; END IF;
    v_line_total := round(v_unit_price * v_quantity, 2) - v_discount;
    IF v_line_total < 0 THEN RAISE EXCEPTION 'El descuento es mayor que el precio.' USING ERRCODE = '22023'; END IF;
    v_subtotal := v_subtotal + round(v_unit_price * v_quantity, 2);
    v_discount_total := v_discount_total + v_discount;
  END LOOP;
  IF v_discount_total > 0 AND length(trim(COALESCE(p_discount_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Escribe el motivo del descuento.' USING ERRCODE = '22023';
  END IF;
  v_total := v_subtotal - v_discount_total;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El total de la venta debe ser mayor a cero.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.sales (folio, business_id, branch_id, client_id, created_by, idempotency_key, subtotal_amount, discount_amount, tax_amount, total_amount, status, notes, discount_reason, discount_authorized_by)
  VALUES (private.next_sale_folio(v_business_id, now()), v_business_id, p_branch_id, p_client_id, auth.uid(), p_idempotency_key, v_subtotal, v_discount_total, 0, v_total,
          'open', NULLIF(trim(COALESCE(p_notes, '')), ''),
          CASE WHEN v_discount_total > 0 THEN trim(p_discount_reason) END,
          CASE WHEN v_discount_total > 0 THEN v_authorizer END) RETURNING id, folio INTO v_sale_id, v_folio;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_item_type := (v_item->>'item_type')::public.sale_item_type;
    v_catalog_id := (v_item->>'catalog_id')::uuid;
    v_quantity := COALESCE((v_item->>'quantity')::integer, 1);
    v_discount := COALESCE((v_item->>'discount_amount')::numeric, 0);
    v_employee_id := NULLIF(v_item->>'employee_id', '')::uuid;
    v_unit_cost := NULL;
    v_candidates := ARRAY(SELECT candidate.value::uuid FROM jsonb_array_elements_text(COALESCE(v_item->'commission_employee_ids', '[]'::jsonb)) AS candidate(value));
    IF v_item_type = 'service' THEN
      SELECT name, private.service_line_price(name, price, variable_price, v_item) INTO v_name, v_unit_price FROM public.services WHERE business_id = v_business_id AND id = v_catalog_id AND is_active;
      IF v_employee_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.employees WHERE business_id = v_business_id AND id = v_employee_id AND is_active AND is_barber) THEN
        RAISE EXCEPTION 'Cada servicio necesita al barbero que lo hizo.' USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT name, sale_price, cost_price INTO v_name, v_unit_price, v_unit_cost FROM public.products WHERE business_id = v_business_id AND id = v_catalog_id AND is_active;
      IF (SELECT tracks_inventory FROM public.products WHERE business_id = v_business_id AND id = v_catalog_id) THEN
        SELECT quantity_on_hand INTO v_stock FROM public.branch_inventory WHERE business_id = v_business_id AND branch_id = p_branch_id AND product_id = v_catalog_id FOR UPDATE;
        IF v_stock IS NULL OR v_stock < v_quantity THEN RAISE EXCEPTION 'No hay suficientes existencias de ese producto.' USING ERRCODE = '23514'; END IF;
        UPDATE public.branch_inventory SET quantity_on_hand = quantity_on_hand - v_quantity, updated_at = now()
        WHERE business_id = v_business_id AND branch_id = p_branch_id AND product_id = v_catalog_id AND quantity_on_hand >= v_quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'No hay suficientes existencias de ese producto.' USING ERRCODE = '23514'; END IF;
        INSERT INTO public.inventory_movements (business_id, branch_id, product_id, movement_type, quantity_delta, unit_cost_snapshot, created_by, reference, notes)
        VALUES (v_business_id, p_branch_id, v_catalog_id, 'sale', -v_quantity, v_unit_cost, auth.uid(), v_sale_id::text, 'Venta');
      END IF;
      v_employee_id := CASE WHEN cardinality(v_candidates) = 1 THEN v_candidates[1] ELSE NULL END;
    END IF;

    INSERT INTO public.sale_items (business_id, branch_id, sale_id, item_type, service_id, product_id, employee_id, commission_employee_id,
      item_name_snapshot, unit_price, quantity, discount_amount, line_total, unit_cost_snapshot)
    VALUES (v_business_id, p_branch_id, v_sale_id, v_item_type,
      CASE WHEN v_item_type = 'service' THEN v_catalog_id ELSE NULL END,
      CASE WHEN v_item_type = 'product' THEN v_catalog_id ELSE NULL END,
      CASE WHEN v_item_type = 'service' THEN v_employee_id ELSE NULL END,
      CASE WHEN v_item_type = 'product' THEN v_employee_id ELSE NULL END,
      v_name, v_unit_price, v_quantity, v_discount, round(v_unit_price * v_quantity, 2) - v_discount, v_unit_cost)
    RETURNING id INTO v_item_id;

    IF v_item_type = 'product' THEN
      v_hold_reason := CASE
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
    IF v_amount <= 0 THEN RAISE EXCEPTION 'Los montos de pago deben ser mayores a cero.' USING ERRCODE = '22023'; END IF;
    v_paid := v_paid + v_amount;
    IF v_paid > v_total THEN RAISE EXCEPTION 'Lo pagado es mayor que el total de la venta.' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.payments (business_id, branch_id, sale_id, processed_by, amount, method, status, idempotency_key, reference)
    VALUES (v_business_id, p_branch_id, v_sale_id, auth.uid(), v_amount, v_method, 'confirmed', p_idempotency_key || ':' || v_index, NULLIF(v_payment->>'reference', ''))
    RETURNING id INTO v_payment_id;
    INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method, movement_type, direction, payment_id, sale_id, description)
    VALUES (v_business_id, p_branch_id, v_cash_session_id, auth.uid(), v_amount, v_method, 'sale_payment', 'in', v_payment_id, v_sale_id, 'Cobro de venta');
    v_payment_count := v_payment_count + 1;
  END LOOP;
  IF v_payment_count = 0 THEN RAISE EXCEPTION 'Indica cómo se pagó.' USING ERRCODE = '22023'; END IF;

  IF jsonb_typeof(COALESCE(p_tips, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_tips, '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'Las propinas no son válidas.' USING ERRCODE = '22023';
  END IF;
  FOR v_tip IN SELECT value FROM jsonb_array_elements(COALESCE(p_tips, '[]'::jsonb)) LOOP
    v_amount := (v_tip->>'amount')::numeric;
    v_method := (v_tip->>'method')::public.payment_method;
    v_employee_id := NULLIF(v_tip->>'employee_id', '')::uuid;
    SELECT e.display_name INTO v_tip_name FROM public.employees e WHERE e.business_id = v_business_id AND e.id = v_employee_id AND e.is_active;
    IF v_amount IS NULL OR v_amount <= 0 OR v_amount <> round(v_amount, 2) OR v_amount > 100000 OR v_method IS NULL OR v_tip_name IS NULL THEN
      RAISE EXCEPTION 'Cada propina necesita un monto válido, un método de pago y un barbero activo.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.sale_tips (business_id, branch_id, sale_id, employee_id, amount, method, created_by)
    VALUES (v_business_id, p_branch_id, v_sale_id, v_employee_id, v_amount, v_method, auth.uid());
    INSERT INTO public.cash_movements (business_id, branch_id, cash_session_id, created_by, amount, method, movement_type, direction, sale_id, description)
    VALUES (v_business_id, p_branch_id, v_cash_session_id, auth.uid(), v_amount, v_method, 'deposit', 'in', v_sale_id, 'Propina para ' || v_tip_name);
  END LOOP;

  IF v_paid = v_total THEN
    UPDATE public.sales SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = v_sale_id;
    PERFORM private.generate_sale_commissions_impl(v_sale_id);
  ELSE
    UPDATE public.sales SET status = 'partially_paid', updated_at = now() WHERE id = v_sale_id;
  END IF;

  -- B3: si no llegó cita, se busca la cita abierta que corresponde a este cobro para no duplicarla.
  -- Solo con un barbero en los servicios; la cita debe ser de ese barbero, de esta sucursal, abierta, sin venta
  -- vigente, de hoy (día del negocio) y empezar entre 3 h antes y 1 h después de ahora. Se liga solo si hay
  -- exactamente una y (a) es del mismo cliente, o (b) la venta no trae cliente y la cita ya está en
  -- checked_in / in_progress. Cualquier otro caso: como antes (cita walk_in completada).
  IF v_appointment IS NULL THEN
    SELECT count(DISTINCT si.employee_id), min(si.employee_id::text)::uuid INTO v_barbers, v_barber FROM public.sale_items si
    WHERE si.sale_id = v_sale_id AND si.item_type = 'service' AND si.employee_id IS NOT NULL;
    IF v_barbers = 1 THEN
      SELECT bs.timezone INTO v_tz FROM public.businesses bs WHERE bs.id = v_business_id;
      PERFORM 1 FROM public.appointments a
      WHERE a.business_id = v_business_id AND a.branch_id = p_branch_id AND a.assigned_employee_id = v_barber
        AND a.status IN ('scheduled','confirmed','checked_in','in_progress')
      FOR UPDATE;
      v_match := ARRAY(
        SELECT a.id FROM public.appointments a
        WHERE a.business_id = v_business_id AND a.branch_id = p_branch_id AND a.assigned_employee_id = v_barber
          AND a.status IN ('scheduled','confirmed','checked_in','in_progress')
          AND a.scheduled_start_at >= now() - interval '3 hours' AND a.scheduled_start_at <= now() + interval '1 hour'
          AND (a.scheduled_start_at AT TIME ZONE v_tz)::date = (now() AT TIME ZONE v_tz)::date
          AND NOT EXISTS (SELECT 1 FROM public.sales s WHERE s.appointment_id = a.id AND s.id <> v_sale_id
                            AND s.status NOT IN ('refunded','cancelled')));
      IF cardinality(v_match) = 1 THEN
        SELECT a.status, a.client_id INTO v_match_status, v_match_client FROM public.appointments a WHERE a.id = v_match[1];
        IF (p_client_id IS NOT NULL AND v_match_client = p_client_id)
           OR (p_client_id IS NULL AND v_match_status IN ('checked_in','in_progress')) THEN
          v_appointment := v_match[1];
          v_link := 'auto';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Agenda: la venta queda ligada a su cita, o se registra como servicio sin cita.
  IF v_appointment IS NOT NULL THEN
    UPDATE public.appointments SET status = 'completed', arrived_at = COALESCE(arrived_at, now()), completed_at = now(),
      client_id = COALESCE(client_id, p_client_id), updated_at = now() WHERE id = v_appointment;
    UPDATE public.sales SET appointment_id = v_appointment WHERE id = v_sale_id;
  ELSE
    SELECT si.employee_id INTO v_barber FROM public.sale_items si
    WHERE si.sale_id = v_sale_id AND si.item_type = 'service' AND si.employee_id IS NOT NULL ORDER BY si.id LIMIT 1;
    IF v_barber IS NOT NULL THEN
      v_link := 'walk_in';
      SELECT COALESCE(sum(sv.duration_minutes * si.quantity), 30)::integer INTO v_minutes
      FROM public.sale_items si JOIN public.services sv ON sv.id = si.service_id
      WHERE si.sale_id = v_sale_id AND si.item_type = 'service' AND si.employee_id = v_barber;
      INSERT INTO public.appointments (business_id, branch_id, client_id, assigned_employee_id, customer_name,
        scheduled_start_at, scheduled_end_at, arrived_at, completed_at, status, source, notes, created_by)
      VALUES (v_business_id, p_branch_id, p_client_id, v_barber,
        COALESCE((SELECT c.full_name FROM public.clients c WHERE c.id = p_client_id), 'Cliente sin cita'),
        now() - make_interval(mins => LEAST(GREATEST(v_minutes, 5), 480)), now(), now(), now(), 'completed', 'walk_in',
        (SELECT string_agg(si.item_name_snapshot, ' + ' ORDER BY si.id) FROM public.sale_items si
         WHERE si.sale_id = v_sale_id AND si.item_type = 'service'), auth.uid())
      RETURNING id INTO v_walkin;
      UPDATE public.sales SET appointment_id = v_walkin WHERE id = v_sale_id;
    END IF;
  END IF;

  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'sale', v_sale_id::text, 'sale_confirmed',
          jsonb_build_object('folio', v_folio, 'total', v_total, 'paid', v_paid, 'status', CASE WHEN v_paid = v_total THEN 'paid' ELSE 'partially_paid' END,
                             'discount_reason', p_discount_reason, 'discount_authorized_by', v_authorizer, 'tips', COALESCE(p_tips, '[]'::jsonb), 'appointment_id', (SELECT s.appointment_id FROM public.sales s WHERE s.id = v_sale_id), 'appointment_link', v_link,
    'variable_prices', COALESCE((SELECT jsonb_agg(jsonb_build_object('service', si.item_name_snapshot, 'price', si.unit_price) ORDER BY si.id)
      FROM public.sale_items si JOIN public.services sv ON sv.id = si.service_id
      WHERE si.sale_id = v_sale_id AND sv.variable_price), '[]'::jsonb)));
  RETURN jsonb_build_object('sale_id', v_sale_id, 'folio', v_folio, 'total_amount', v_total, 'paid_amount', v_paid,
                            'status', CASE WHEN v_paid = v_total THEN 'paid' ELSE 'partially_paid' END, 'idempotent_replay', false,
                            'appointment_id', (SELECT s.appointment_id FROM public.sales s WHERE s.id = v_sale_id),
                            'appointment_link', v_link);
END;
$function$;
