BEGIN;

ALTER TABLE public.cash_movements
  ADD COLUMN commission_settlement_id uuid UNIQUE,
  ADD CONSTRAINT cash_movements_commission_settlement_fk
    FOREIGN KEY (commission_settlement_id) REFERENCES public.commission_settlements(id) ON DELETE RESTRICT,
  ADD CONSTRAINT cash_movements_commission_settlement_check CHECK (
    commission_settlement_id IS NULL OR
    (movement_type = 'withdrawal' AND direction = 'out' AND method = 'cash'
      AND payment_id IS NULL AND sale_id IS NULL AND expense_id IS NULL)
  );

CREATE OR REPLACE FUNCTION private.record_commission_settlement_cash_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cash_session_id uuid;
BEGIN
  IF NEW.status <> 'paid' OR NEW.paid_via IS DISTINCT FROM 'cash' OR NEW.total_amount = 0 THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.paid_by IS DISTINCT FROM auth.uid()
     OR NOT private.has_business_role(NEW.business_id, ARRAY['owner','admin']::public.business_role[])
     OR NOT private.can_access_branch(NEW.business_id, NEW.branch_id) THEN
    RAISE EXCEPTION 'Cash commission settlement permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_cash_session_id
  FROM public.cash_sessions
  WHERE business_id = NEW.business_id AND branch_id = NEW.branch_id AND status = 'open'
  FOR UPDATE;

  IF v_cash_session_id IS NULL THEN
    RAISE EXCEPTION 'Open the branch cash session before paying commissions in cash' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.cash_movements (
    business_id, branch_id, cash_session_id, created_by, amount, method,
    movement_type, direction, commission_settlement_id, description
  ) VALUES (
    NEW.business_id, NEW.branch_id, v_cash_session_id, NEW.paid_by, NEW.total_amount, 'cash',
    'withdrawal', 'out', NEW.id, 'Pago de comisiones · liquidación ' || NEW.id::text
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_commission_settlement_cash_movement() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER commission_settlement_cash_movement
AFTER INSERT ON public.commission_settlements
FOR EACH ROW EXECUTE FUNCTION private.record_commission_settlement_cash_movement();

COMMIT;

