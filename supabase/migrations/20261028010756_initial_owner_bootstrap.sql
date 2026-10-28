BEGIN;

CREATE OR REPLACE FUNCTION public.bootstrap_first_owner(
  p_owner_user_id uuid,
  p_owner_name text,
  p_business_name text,
  p_business_slug text,
  p_branch_name text,
  p_timezone text DEFAULT 'America/Mexico_City'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_business_id uuid;
  v_branch_id uuid;
BEGIN
  IF COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' THEN
    RAISE EXCEPTION 'Bootstrap may only be called by the server provisioning identity' USING ERRCODE = '42501';
  END IF;
  IF p_owner_user_id IS NULL
     OR length(trim(COALESCE(p_owner_name, ''))) < 2
     OR length(trim(COALESCE(p_business_name, ''))) < 2
     OR length(trim(COALESCE(p_business_slug, ''))) < 2
     OR length(trim(COALESCE(p_branch_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Owner, business and branch details are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('sonblade:first-owner-bootstrap', 0));
  IF EXISTS (SELECT 1 FROM public.businesses) THEN
    RAISE EXCEPTION 'Initial owner bootstrap has already been completed' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_owner_user_id) THEN
    RAISE EXCEPTION 'The requested Supabase Auth user does not exist' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (p_owner_user_id, trim(p_owner_name));

  INSERT INTO public.businesses (owner_user_id, name, slug, timezone)
  VALUES (p_owner_user_id, trim(p_business_name), lower(trim(p_business_slug)), p_timezone)
  RETURNING id INTO v_business_id;

  INSERT INTO public.business_memberships (business_id, user_id, role, is_active)
  VALUES (v_business_id, p_owner_user_id, 'owner', true);

  INSERT INTO public.branches (business_id, name, timezone)
  VALUES (v_business_id, trim(p_branch_name), p_timezone)
  RETURNING id INTO v_branch_id;

  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, action, after_data)
  VALUES (v_business_id, v_branch_id, p_owner_user_id, 'business', 'initial_owner_bootstrap',
          jsonb_build_object('business_id', v_business_id, 'branch_id', v_branch_id));

  RETURN jsonb_build_object('business_id', v_business_id, 'branch_id', v_branch_id, 'owner_user_id', p_owner_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_first_owner(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_owner(uuid, text, text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.create_initial_haircut_service(
  p_business_id uuid,
  p_branch_id uuid,
  p_name text,
  p_price numeric,
  p_duration_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_service_id uuid;
  v_rule_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_business_role(p_business_id, ARRAY['owner','admin']::public.business_role[]) THEN
    RAISE EXCEPTION 'Only an owner or admin may configure the initial haircut rule' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = p_branch_id AND business_id = p_business_id AND is_active) THEN
    RAISE EXCEPTION 'Branch is not part of this business' USING ERRCODE = '23503';
  END IF;
  IF length(trim(COALESCE(p_name, ''))) < 2 OR p_price <= 0 OR p_duration_minutes < 1 THEN
    RAISE EXCEPTION 'Haircut service details are invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.services WHERE business_id = p_business_id AND lower(name) = lower(trim(p_name))) THEN
    RAISE EXCEPTION 'A service with this name already exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.services (business_id, name, price, duration_minutes, is_active)
  VALUES (p_business_id, trim(p_name), p_price, p_duration_minutes, true)
  RETURNING id INTO v_service_id;
  INSERT INTO public.commission_rules (business_id, target_type, service_id, name, calculation_type, basis, percentage, effective_from, is_active)
  VALUES (p_business_id, 'service', v_service_id, 'Comisión inicial de corte', 'percentage', 'price_before_discount', 50, CURRENT_DATE, true)
  RETURNING id INTO v_rule_id;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_business_id, p_branch_id, auth.uid(), 'service', v_service_id::text, 'initial_haircut_commission_configured',
          jsonb_build_object('service_id', v_service_id, 'commission_rule_id', v_rule_id, 'percentage', 50, 'basis', 'price_before_discount'));
  RETURN jsonb_build_object('service_id', v_service_id, 'commission_rule_id', v_rule_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_initial_haircut_service(uuid, uuid, text, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_initial_haircut_service(uuid, uuid, text, numeric, integer) TO authenticated;

COMMIT;

