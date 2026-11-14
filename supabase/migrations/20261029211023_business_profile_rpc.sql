BEGIN;

ALTER TABLE public.businesses ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_settings_object_check CHECK (jsonb_typeof(settings) = 'object');

CREATE OR REPLACE FUNCTION private.update_business_profile_impl(
  p_business_id uuid, p_branch_id uuid, p_name text, p_currency text, p_timezone text,
  p_address text, p_phone text, p_settings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_business_id IS NULL OR p_branch_id IS NULL OR length(trim(COALESCE(p_name, ''))) < 2
     OR length(p_name) > 160 OR p_currency NOT IN ('MXN','USD','EUR','COP','PEN')
     OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone)
     OR jsonb_typeof(COALESCE(p_settings, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Business profile is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT private.has_business_role(p_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(p_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Business profile permission denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.businesses SET name = trim(p_name), currency = p_currency, timezone = p_timezone,
    settings = p_settings, updated_at = now() WHERE id = p_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.branches SET address = NULLIF(trim(COALESCE(p_address, '')), ''),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''), timezone = p_timezone, updated_at = now()
  WHERE business_id = p_business_id AND id = p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.audit_log (business_id, branch_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (p_business_id, p_branch_id, auth.uid(), 'business', p_business_id::text, 'business_profile_updated',
    jsonb_build_object('name', trim(p_name), 'currency', p_currency, 'timezone', p_timezone));
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION private.update_business_profile_impl(uuid, uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.update_business_profile_impl(uuid, uuid, text, text, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_business_profile(
  p_business_id uuid, p_branch_id uuid, p_name text, p_currency text, p_timezone text,
  p_address text, p_phone text, p_settings jsonb
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.update_business_profile_impl($1,$2,$3,$4,$5,$6,$7,$8) $$;

REVOKE ALL ON FUNCTION public.update_business_profile(uuid, uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_business_profile(uuid, uuid, text, text, text, text, text, jsonb) TO authenticated;

COMMIT;
