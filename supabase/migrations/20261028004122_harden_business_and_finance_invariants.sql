-- Tighten ownership/role mutation and enforce closed-cash / commission reversal invariants.
BEGIN;

CREATE OR REPLACE FUNCTION private.can_access_branch(
  p_business_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships AS m
    JOIN public.branches AS b ON b.business_id = m.business_id
    WHERE m.business_id = p_business_id
      AND b.id = p_branch_id
      AND m.user_id = (SELECT auth.uid())
      AND m.is_active = true
      AND (
        m.role IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1
          FROM public.user_branch_access AS uba
          WHERE uba.business_id = p_business_id
            AND uba.branch_id = p_branch_id
            AND uba.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

DROP POLICY businesses_update_admin ON public.businesses;
CREATE POLICY businesses_update_owner ON public.businesses
  FOR UPDATE TO authenticated
  USING (private.has_business_role(id, ARRAY['owner']::public.business_role[]))
  WITH CHECK (private.has_business_role(id, ARRAY['owner']::public.business_role[]));

CREATE OR REPLACE FUNCTION private.prevent_business_owner_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    RAISE EXCEPTION 'Changing the business owner requires a dedicated ownership-transfer workflow';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_business_owner_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_business_owner_change ON public.businesses;
CREATE TRIGGER prevent_business_owner_change
  BEFORE UPDATE OF owner_user_id ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION private.prevent_business_owner_change();

DROP POLICY business_memberships_insert_owner_bootstrap_or_admin ON public.business_memberships;
CREATE POLICY business_memberships_insert_owner_bootstrap_or_admin ON public.business_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = (SELECT auth.uid())
      AND role = 'owner'
      AND EXISTS (
        SELECT 1 FROM public.businesses AS b
        WHERE b.id = business_id AND b.owner_user_id = (SELECT auth.uid())
      )
    )
    OR private.has_business_role(business_id, ARRAY['owner']::public.business_role[])
    OR (
      role <> 'owner'
      AND private.has_business_role(business_id, ARRAY['admin']::public.business_role[])
    )
  );

DROP POLICY business_memberships_update_admin ON public.business_memberships;
CREATE POLICY business_memberships_update_owner_or_admin ON public.business_memberships
  FOR UPDATE TO authenticated
  USING (
    private.has_business_role(business_id, ARRAY['owner']::public.business_role[])
    OR (
      role <> 'owner'
      AND private.has_business_role(business_id, ARRAY['admin']::public.business_role[])
    )
  )
  WITH CHECK (
    private.has_business_role(business_id, ARRAY['owner']::public.business_role[])
    OR (
      role <> 'owner'
      AND private.has_business_role(business_id, ARRAY['admin']::public.business_role[])
    )
  );

ALTER TABLE public.cash_sessions
  ADD CONSTRAINT cash_sessions_closed_amounts_check CHECK (
    (
      status = 'open'
      AND expected_cash IS NULL
      AND counted_cash IS NULL
      AND difference_amount IS NULL
    )
    OR (
      status = 'closed'
      AND expected_cash IS NOT NULL
      AND counted_cash IS NOT NULL
      AND difference_amount IS NOT NULL
      AND difference_amount = counted_cash - expected_cash
    )
  );

ALTER TABLE public.commission_entries
  ADD CONSTRAINT commission_entries_reversal_reason_check CHECK (
    (
      status = 'generated'
      AND reversed_at IS NULL
      AND reversal_reason IS NULL
    )
    OR (
      status = 'reversed'
      AND reversed_at IS NOT NULL
      AND length(trim(COALESCE(reversal_reason, ''))) > 0
    )
  );

COMMIT;
