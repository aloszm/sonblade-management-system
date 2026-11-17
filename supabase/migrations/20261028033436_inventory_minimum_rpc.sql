BEGIN;

CREATE OR REPLACE FUNCTION private.set_inventory_minimum_impl(p_branch_id uuid, p_product_id uuid, p_minimum_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_previous integer;
BEGIN
  IF auth.uid() IS NULL OR p_minimum_quantity < 0 THEN
    RAISE EXCEPTION 'Minimum stock is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id
  FROM public.branches b JOIN public.products p ON p.business_id = b.business_id AND p.id = p_product_id
  WHERE b.id = p_branch_id AND b.is_active AND p.is_active AND p.tracks_inventory;
  IF v_business_id IS NULL
     OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Inventory permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT minimum_quantity INTO v_previous FROM public.branch_inventory
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.branch_inventory SET minimum_quantity = p_minimum_quantity, updated_at = now()
  WHERE business_id = v_business_id AND branch_id = p_branch_id AND product_id = p_product_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (v_business_id, p_branch_id, auth.uid(), 'inventory_threshold', p_product_id::text, 'inventory_minimum_changed',
          jsonb_build_object('minimum_quantity', v_previous), jsonb_build_object('minimum_quantity', p_minimum_quantity));
  RETURN jsonb_build_object('minimum_quantity', p_minimum_quantity);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_inventory_minimum(p_branch_id uuid, p_product_id uuid, p_minimum_quantity integer)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.set_inventory_minimum_impl($1, $2, $3) $$;

REVOKE ALL ON FUNCTION private.set_inventory_minimum_impl(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_inventory_minimum_impl(uuid, uuid, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.set_inventory_minimum(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_minimum(uuid, uuid, integer) TO authenticated;

COMMIT;

