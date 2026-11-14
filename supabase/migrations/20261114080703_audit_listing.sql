-- Listado de auditoria con el nombre de quien hizo cada cambio. Solo dueño y administrador.
CREATE OR REPLACE FUNCTION private.list_audit_log_impl(
  p_branch_id uuid, p_role text DEFAULT NULL, p_action text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL, p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_business_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Audit request is invalid' USING ERRCODE = '22023';
  END IF;
  SELECT b.business_id INTO v_business_id FROM public.branches b WHERE b.id = p_branch_id AND b.is_active;
  IF v_business_id IS NULL
     OR NOT private.has_business_role(v_business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(v_business_id, p_branch_id) THEN
    RAISE EXCEPTION 'Audit permission denied' USING ERRCODE = '42501';
  END IF;

  WITH entries AS (
    SELECT a.id, a.created_at, a.action, a.entity_type AS entity, a.entity_id,
           a.actor_user_id AS user_id,
           COALESCE(p.full_name, CASE WHEN a.actor_user_id IS NULL THEN 'Sistema' ELSE 'Usuario' END) AS user_name,
           CASE WHEN a.actor_user_id IS NULL THEN 'system'
                WHEN m.role IN ('owner', 'admin') THEN 'admin'
                WHEN m.role IN ('receptionist', 'cashier') THEN 'recepcion'
                WHEN m.role = 'barber' THEN 'barbero'
                ELSE 'system' END AS role,
           jsonb_strip_nulls(jsonb_build_object('before', a.before_data, 'after', a.after_data, 'reason', a.reason)) AS details
    FROM public.audit_log a
    LEFT JOIN public.profiles p ON p.user_id = a.actor_user_id
    LEFT JOIN public.business_memberships m ON m.business_id = a.business_id AND m.user_id = a.actor_user_id
    WHERE a.business_id = v_business_id AND (a.branch_id IS NULL OR a.branch_id = p_branch_id)
      AND (p_action IS NULL OR a.action = p_action)
      AND (p_from IS NULL OR a.created_at >= p_from)
      AND (p_to IS NULL OR a.created_at < p_to)
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC, e.id DESC), '[]'::jsonb) INTO v_result
  FROM (SELECT * FROM entries WHERE p_role IS NULL OR role = p_role
        ORDER BY created_at DESC, id DESC LIMIT least(greatest(COALESCE(p_limit, 100), 1), 500)) e;
  RETURN v_result;
END $fn$;

REVOKE ALL ON FUNCTION private.list_audit_log_impl(uuid, text, text, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.list_audit_log_impl(uuid, text, text, timestamptz, timestamptz, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_audit_log(
  p_branch_id uuid, p_role text DEFAULT NULL, p_action text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL, p_limit integer DEFAULT 100
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.list_audit_log_impl($1, $2, $3, $4, $5, $6) $fn$;
REVOKE ALL ON FUNCTION public.list_audit_log(uuid, text, text, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_audit_log(uuid, text, text, timestamptz, timestamptz, integer) TO authenticated;
