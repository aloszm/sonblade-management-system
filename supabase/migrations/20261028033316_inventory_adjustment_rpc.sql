BEGIN;

CREATE OR REPLACE FUNCTION private.adjust_inventory_stock_impl(
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity_delta integer,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_stock integer;
  v_cost numeric(12,2);
  v_movement_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_quantity_delta = 0 OR length(trim(COALESCE(p_notes, ''))) < 3
     OR length(p_notes) > 500 THEN
    RAISE EXCEPTION 'Inventory adjustment is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT b.business_id INTO v_business_id
  FROM public.branches b
  JOIN public.products p ON p.business_id = b.business_id AND p.id = p_product_id
  WHERE b.id = p_branch_id AND b.is_active AND p.is_active AND p.tracks_inventory;
  IF v_business_id IS NULL
     OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Inventory permission denied' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_branch_id::text || ':' || p_product_id::text || ':inventory', 0));
  SELECT bi.quantity_on_hand, p.cost_price INTO v_stock, v_cost
  FROM public.branch_inventory bi
  JOIN public.products p ON p.business_id = bi.business_id AND p.id = bi.product_id
  WHERE bi.business_id = v_business_id AND bi.branch_id = p_branch_id AND bi.product_id = p_product_id
  FOR UPDATE OF bi;
  IF NOT FOUND OR v_stock + p_quantity_delta < 0 THEN
    RAISE EXCEPTION 'Inventory adjustment would make stock negative or item is missing' USING ERRCODE = '23514';
  END IF;

  UPDATE public.branch_inventory
  SET quantity_on_hand = quantity_on_hand + p_quantity_delta, updated_at = now()
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND product_id = p_product_id;
  INSERT INTO public.inventory_movements (
    business_id, branch_id, product_id, movement_type, quantity_delta,
    unit_cost_snapshot, created_by, notes
  ) VALUES (
    v_business_id, p_branch_id, p_product_id, 'adjustment', p_quantity_delta,
    v_cost, auth.uid(), trim(p_notes)
  ) RETURNING id INTO v_movement_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'inventory', v_movement_id::text, 'inventory_adjusted',
          jsonb_build_object('product_id', p_product_id, 'quantity_delta', p_quantity_delta, 'quantity_after', v_stock + p_quantity_delta, 'notes', trim(p_notes)));
  RETURN jsonb_build_object('movement_id', v_movement_id, 'quantity_on_hand', v_stock + p_quantity_delta);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity_delta integer,
  p_notes text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.adjust_inventory_stock_impl($1, $2, $3, $4) $$;

REVOKE ALL ON FUNCTION private.adjust_inventory_stock_impl(uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.adjust_inventory_stock_impl(uuid, uuid, integer, text) TO authenticated;
REVOKE ALL ON FUNCTION public.adjust_inventory_stock(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, uuid, integer, text) TO authenticated;

COMMIT;

