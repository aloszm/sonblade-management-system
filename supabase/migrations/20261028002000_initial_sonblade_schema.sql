-- Sonblade initial schema foundation.
-- Empty development project only. No business/customer rows are seeded here.
-- Money uses NUMERIC; all business data is scoped by business_id and branch_id.
-- Financial write flows must later be implemented through authorized, atomic server operations.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TYPE public.business_role AS ENUM ('owner', 'admin', 'cashier', 'receptionist', 'barber');
CREATE TYPE public.appointment_source AS ENUM ('appointment', 'walk_in');
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.sale_status AS ENUM ('open', 'partially_paid', 'paid', 'cancelled', 'partially_refunded', 'refunded');
CREATE TYPE public.sale_item_type AS ENUM ('service', 'product');
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'transfer', 'other');
CREATE TYPE public.payment_status AS ENUM ('confirmed', 'reversed');
CREATE TYPE public.cash_session_status AS ENUM ('open', 'closed');
CREATE TYPE public.cash_movement_type AS ENUM ('sale_payment', 'expense', 'withdrawal', 'deposit', 'refund', 'adjustment');
CREATE TYPE public.cash_direction AS ENUM ('in', 'out');
CREATE TYPE public.commission_target_type AS ENUM ('service', 'product');
CREATE TYPE public.commission_calculation_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE public.commission_basis AS ENUM ('price_before_discount', 'price_after_discount');
CREATE TYPE public.commission_entry_status AS ENUM ('generated', 'reversed');
CREATE TYPE public.settlement_status AS ENUM ('draft', 'paid', 'cancelled');
CREATE TYPE public.stock_movement_type AS ENUM ('purchase', 'sale', 'adjustment', 'waste', 'return_in', 'return_out', 'initial');
CREATE TYPE public.expense_status AS ENUM ('posted', 'cancelled');

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  slug text NOT NULL UNIQUE CHECK (length(trim(slug)) > 0),
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  currency char(3) NOT NULL DEFAULT 'MXN',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_user_id)
);

CREATE TABLE public.business_memberships (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role public.business_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  address text,
  phone text,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, name)
);

CREATE TABLE public.user_branch_access (
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, branch_id, user_id),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, user_id) REFERENCES public.business_memberships(business_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid,
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, user_id),
  FOREIGN KEY (business_id, user_id) REFERENCES public.business_memberships(business_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
  phone text,
  email text,
  notes text,
  preferences text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, name)
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  sku text,
  description text,
  sale_price numeric(12,2) NOT NULL CHECK (sale_price >= 0),
  cost_price numeric(12,2) CHECK (cost_price IS NULL OR cost_price >= 0),
  tracks_inventory boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, name),
  UNIQUE (business_id, sku)
);

CREATE TABLE public.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  target_type public.commission_target_type NOT NULL,
  service_id uuid,
  product_id uuid,
  employee_id uuid,
  calculation_type public.commission_calculation_type NOT NULL,
  basis public.commission_basis NOT NULL,
  percentage numeric(7,4),
  fixed_amount numeric(12,2),
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, service_id) REFERENCES public.services(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, employee_id) REFERENCES public.employees(business_id, id) ON DELETE RESTRICT,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (
    (target_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL)
    OR (target_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
  ),
  CHECK (
    (calculation_type = 'percentage' AND percentage IS NOT NULL AND percentage >= 0 AND percentage <= 100 AND fixed_amount IS NULL)
    OR (calculation_type = 'fixed_amount' AND fixed_amount IS NOT NULL AND fixed_amount >= 0 AND percentage IS NULL)
  )
);

CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  client_id uuid,
  source public.appointment_source NOT NULL DEFAULT 'appointment',
  status public.appointment_status NOT NULL DEFAULT 'scheduled',
  customer_name text NOT NULL CHECK (length(trim(customer_name)) > 0),
  customer_phone text,
  assigned_employee_id uuid,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, branch_id, id),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, client_id) REFERENCES public.clients(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, assigned_employee_id) REFERENCES public.employees(business_id, id) ON DELETE RESTRICT,
  CHECK (source = 'walk_in' OR (scheduled_start_at IS NOT NULL AND scheduled_end_at IS NOT NULL AND scheduled_end_at > scheduled_start_at))
);

CREATE TABLE public.appointment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  service_id uuid NOT NULL,
  employee_id uuid,
  price_snapshot numeric(12,2) NOT NULL CHECK (price_snapshot >= 0),
  duration_snapshot_minutes integer NOT NULL CHECK (duration_snapshot_minutes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, branch_id, id),
  FOREIGN KEY (business_id, branch_id, appointment_id) REFERENCES public.appointments(business_id, branch_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, service_id) REFERENCES public.services(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, employee_id) REFERENCES public.employees(business_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  appointment_id uuid,
  client_id uuid,
  status public.sale_status NOT NULL DEFAULT 'open',
  subtotal_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes text,
  idempotency_key text,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, branch_id, id),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id, appointment_id) REFERENCES public.appointments(business_id, branch_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, client_id) REFERENCES public.clients(business_id, id) ON DELETE RESTRICT,
  CHECK (discount_amount <= subtotal_amount),
  CHECK (total_amount = subtotal_amount - discount_amount + tax_amount)
);

CREATE UNIQUE INDEX sales_idempotency_key_unique
  ON public.sales (business_id, branch_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  item_type public.sale_item_type NOT NULL,
  service_id uuid,
  product_id uuid,
  employee_id uuid,
  commission_employee_id uuid,
  item_name_snapshot text NOT NULL CHECK (length(trim(item_name_snapshot)) > 0),
  quantity numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, branch_id, id),
  FOREIGN KEY (business_id, branch_id, sale_id) REFERENCES public.sales(business_id, branch_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, service_id) REFERENCES public.services(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, employee_id) REFERENCES public.employees(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, commission_employee_id) REFERENCES public.employees(business_id, id) ON DELETE RESTRICT,
  CHECK (discount_amount <= quantity * unit_price),
  CHECK (line_total = quantity * unit_price - discount_amount),
  CHECK (
    (item_type = 'service' AND service_id IS NOT NULL AND product_id IS NULL AND employee_id IS NOT NULL)
    OR (item_type = 'product' AND product_id IS NOT NULL AND service_id IS NULL)
  )
);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  method public.payment_method NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'confirmed',
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reference text,
  idempotency_key text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, branch_id, id),
  FOREIGN KEY (business_id, branch_id, sale_id) REFERENCES public.sales(business_id, branch_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX payments_idempotency_key_unique
  ON public.payments (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  status public.cash_session_status NOT NULL DEFAULT 'open',
  opening_cash numeric(12,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  expected_cash numeric(12,2),
  counted_cash numeric(12,2) CHECK (counted_cash IS NULL OR counted_cash >= 0),
  difference_amount numeric(12,2),
  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  UNIQUE (business_id, branch_id, id),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'open' AND closed_at IS NULL AND closed_by IS NULL) OR (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL))
);

CREATE UNIQUE INDEX cash_sessions_one_open_per_branch
  ON public.cash_sessions (branch_id)
  WHERE status = 'open';

CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  cash_session_id uuid NOT NULL,
  movement_type public.cash_movement_type NOT NULL,
  direction public.cash_direction NOT NULL,
  method public.payment_method NOT NULL DEFAULT 'cash',
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_id uuid,
  sale_id uuid,
  expense_id uuid,
  description text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, branch_id, cash_session_id) REFERENCES public.cash_sessions(business_id, branch_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id, payment_id) REFERENCES public.payments(business_id, branch_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id, sale_id) REFERENCES public.sales(business_id, branch_id, id) ON DELETE RESTRICT,
  UNIQUE (payment_id)
);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  cash_session_id uuid,
  status public.expense_status NOT NULL DEFAULT 'posted',
  category text NOT NULL CHECK (length(trim(category)) > 0),
  description text NOT NULL CHECK (length(trim(description)) > 0),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  method public.payment_method NOT NULL,
  incurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, branch_id, id),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id, cash_session_id) REFERENCES public.cash_sessions(business_id, branch_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_expense_fk
  FOREIGN KEY (business_id, branch_id, expense_id)
  REFERENCES public.expenses(business_id, branch_id, id)
  ON DELETE RESTRICT;

CREATE TABLE public.branch_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity_on_hand numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  minimum_quantity numeric(12,3) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, branch_id, product_id),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL,
  movement_type public.stock_movement_type NOT NULL,
  quantity_delta numeric(12,3) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost_snapshot numeric(12,2) CHECK (unit_cost_snapshot IS NULL OR unit_cost_snapshot >= 0),
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, product_id) REFERENCES public.products(business_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.commission_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  sale_item_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  commission_rule_id uuid,
  calculation_type public.commission_calculation_type NOT NULL,
  basis public.commission_basis NOT NULL,
  basis_amount numeric(12,2) NOT NULL CHECK (basis_amount >= 0),
  percentage_snapshot numeric(7,4) CHECK (percentage_snapshot IS NULL OR (percentage_snapshot >= 0 AND percentage_snapshot <= 100)),
  fixed_amount_snapshot numeric(12,2) CHECK (fixed_amount_snapshot IS NULL OR fixed_amount_snapshot >= 0),
  commission_amount numeric(12,2) NOT NULL CHECK (commission_amount >= 0),
  rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.commission_entry_status NOT NULL DEFAULT 'generated',
  generated_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversal_reason text,
  UNIQUE (sale_item_id),
  UNIQUE (business_id, branch_id, employee_id, id),
  FOREIGN KEY (business_id, branch_id, sale_id) REFERENCES public.sales(business_id, branch_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id, sale_item_id) REFERENCES public.sale_items(business_id, branch_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, employee_id) REFERENCES public.employees(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, commission_rule_id) REFERENCES public.commission_rules(business_id, id) ON DELETE RESTRICT,
  CHECK (
    (calculation_type = 'percentage' AND percentage_snapshot IS NOT NULL AND fixed_amount_snapshot IS NULL)
    OR (calculation_type = 'fixed_amount' AND fixed_amount_snapshot IS NOT NULL AND percentage_snapshot IS NULL)
  ),
  CHECK ((status = 'generated' AND reversed_at IS NULL) OR (status = 'reversed' AND reversed_at IS NOT NULL))
);

CREATE TABLE public.commission_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status public.settlement_status NOT NULL DEFAULT 'draft',
  paid_via public.payment_method,
  paid_at timestamptz,
  paid_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reference text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, branch_id, employee_id, id),
  UNIQUE (business_id, branch_id, employee_id, period_start, period_end),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, employee_id) REFERENCES public.employees(business_id, id) ON DELETE RESTRICT,
  CHECK (period_end >= period_start),
  CHECK ((status = 'paid' AND paid_at IS NOT NULL AND paid_by IS NOT NULL AND paid_via IS NOT NULL) OR status <> 'paid')
);

CREATE TABLE public.commission_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  settlement_id uuid NOT NULL,
  commission_entry_id uuid NOT NULL UNIQUE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, branch_id, employee_id, settlement_id)
    REFERENCES public.commission_settlements(business_id, branch_id, employee_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, branch_id, employee_id, commission_entry_id)
    REFERENCES public.commission_entries(business_id, branch_id, employee_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  branch_id uuid,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(trim(action)) > 0),
  entity_type text NOT NULL CHECK (length(trim(entity_type)) > 0),
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, branch_id) REFERENCES public.branches(business_id, id) ON DELETE RESTRICT
);

CREATE INDEX business_memberships_user_idx ON public.business_memberships (user_id, is_active);
CREATE INDEX user_branch_access_user_idx ON public.user_branch_access (user_id, branch_id);
CREATE INDEX employees_business_active_idx ON public.employees (business_id, is_active);
CREATE INDEX clients_business_phone_idx ON public.clients (business_id, phone);
CREATE INDEX services_business_active_idx ON public.services (business_id, is_active);
CREATE INDEX products_business_active_idx ON public.products (business_id, is_active);
CREATE INDEX appointments_branch_start_idx ON public.appointments (branch_id, scheduled_start_at);
CREATE INDEX appointments_employee_start_idx ON public.appointments (assigned_employee_id, scheduled_start_at);
CREATE INDEX sales_branch_created_idx ON public.sales (branch_id, created_at DESC);
CREATE INDEX sale_items_employee_idx ON public.sale_items (employee_id, created_at DESC);
CREATE INDEX sale_items_commission_employee_idx ON public.sale_items (commission_employee_id, created_at DESC);
CREATE INDEX payments_sale_idx ON public.payments (sale_id, processed_at);
CREATE INDEX cash_movements_session_idx ON public.cash_movements (cash_session_id, created_at);
CREATE INDEX inventory_movements_branch_product_idx ON public.inventory_movements (branch_id, product_id, created_at DESC);
CREATE INDEX commission_entries_employee_date_idx ON public.commission_entries (employee_id, generated_at DESC);
CREATE INDEX commission_settlements_employee_period_idx ON public.commission_settlements (employee_id, period_start DESC);
CREATE INDEX audit_log_business_date_idx ON public.audit_log (business_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.has_business_access(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships AS m
    WHERE m.business_id = p_business_id
      AND m.user_id = (SELECT auth.uid())
      AND m.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION private.has_business_role(
  p_business_id uuid,
  p_roles public.business_role[]
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
    WHERE m.business_id = p_business_id
      AND m.user_id = (SELECT auth.uid())
      AND m.is_active = true
      AND m.role = ANY (p_roles)
  );
$$;

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
      AND b.is_active = true
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

CREATE OR REPLACE FUNCTION private.owns_employee(
  p_business_id uuid,
  p_employee_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees AS e
    JOIN public.business_memberships AS m
      ON m.business_id = e.business_id
     AND m.user_id = e.user_id
    WHERE e.business_id = p_business_id
      AND e.id = p_employee_id
      AND e.user_id = (SELECT auth.uid())
      AND e.is_active = true
      AND m.is_active = true
  );
$$;

REVOKE ALL ON FUNCTION private.has_business_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_business_role(uuid, public.business_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_access_branch(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.owns_employee(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_business_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_business_role(uuid, public.business_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_branch(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.owns_employee(uuid, uuid) TO authenticated;

-- RLS is enabled for every business table. No anonymous table access is granted.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users can edit operational setup through RLS policies.
-- Financial ledger writes are deliberately denied to direct Data API clients.
-- They will be implemented through server-authorized, atomic operations with idempotency.
GRANT SELECT, INSERT, UPDATE ON public.profiles, public.businesses, public.business_memberships,
  public.branches, public.user_branch_access, public.employees, public.clients, public.services,
  public.products, public.commission_rules, public.appointments, public.appointment_items
TO authenticated;

GRANT SELECT ON public.sales, public.sale_items, public.payments, public.cash_sessions,
  public.cash_movements, public.expenses, public.branch_inventory, public.inventory_movements,
  public.commission_entries, public.commission_settlements, public.commission_settlement_lines,
  public.audit_log
TO authenticated;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY businesses_select_member ON public.businesses
  FOR SELECT TO authenticated USING (owner_user_id = (SELECT auth.uid()) OR private.has_business_access(id));
CREATE POLICY businesses_insert_owner ON public.businesses
  FOR INSERT TO authenticated WITH CHECK (owner_user_id = (SELECT auth.uid()));
CREATE POLICY businesses_update_admin ON public.businesses
  FOR UPDATE TO authenticated
  USING (private.has_business_role(id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (
    private.has_business_role(id, ARRAY['owner']::public.business_role[])
    OR (owner_user_id = (SELECT auth.uid()) AND private.has_business_role(id, ARRAY['admin']::public.business_role[]))
  );

CREATE POLICY business_memberships_select_self_or_admin ON public.business_memberships
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
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
    OR private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[])
  );
CREATE POLICY business_memberships_update_admin ON public.business_memberships
  FOR UPDATE TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (
    private.has_business_role(business_id, ARRAY['owner']::public.business_role[])
    OR (role <> 'owner' AND private.has_business_role(business_id, ARRAY['admin']::public.business_role[]))
  );

CREATE POLICY branches_select_accessible ON public.branches
  FOR SELECT TO authenticated USING (private.can_access_branch(business_id, id));
CREATE POLICY branches_insert_admin ON public.branches
  FOR INSERT TO authenticated WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY branches_update_admin ON public.branches
  FOR UPDATE TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY user_branch_access_select_self_or_admin ON public.user_branch_access
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY user_branch_access_insert_admin ON public.user_branch_access
  FOR INSERT TO authenticated WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY user_branch_access_update_admin ON public.user_branch_access
  FOR UPDATE TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY employees_select_member ON public.employees
  FOR SELECT TO authenticated USING (private.has_business_access(business_id));
CREATE POLICY employees_insert_admin ON public.employees
  FOR INSERT TO authenticated WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY employees_update_admin ON public.employees
  FOR UPDATE TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY clients_select_member ON public.clients
  FOR SELECT TO authenticated USING (private.has_business_access(business_id));
CREATE POLICY clients_insert_member ON public.clients
  FOR INSERT TO authenticated WITH CHECK (private.has_business_access(business_id));
CREATE POLICY clients_update_member ON public.clients
  FOR UPDATE TO authenticated USING (private.has_business_access(business_id))
  WITH CHECK (private.has_business_access(business_id));

CREATE POLICY services_select_member ON public.services
  FOR SELECT TO authenticated USING (private.has_business_access(business_id));
CREATE POLICY services_insert_admin ON public.services
  FOR INSERT TO authenticated WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY services_update_admin ON public.services
  FOR UPDATE TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY products_select_member ON public.products
  FOR SELECT TO authenticated USING (private.has_business_access(business_id));
CREATE POLICY products_insert_admin ON public.products
  FOR INSERT TO authenticated WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY products_update_admin ON public.products
  FOR UPDATE TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY commission_rules_select_member ON public.commission_rules
  FOR SELECT TO authenticated USING (private.has_business_access(business_id));
CREATE POLICY commission_rules_insert_admin ON public.commission_rules
  FOR INSERT TO authenticated WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY commission_rules_update_admin ON public.commission_rules
  FOR UPDATE TO authenticated
  USING (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY appointments_select_branch ON public.appointments
  FOR SELECT TO authenticated USING (private.can_access_branch(business_id, branch_id));
CREATE POLICY appointments_insert_branch ON public.appointments
  FOR INSERT TO authenticated WITH CHECK (private.can_access_branch(business_id, branch_id));
CREATE POLICY appointments_update_branch ON public.appointments
  FOR UPDATE TO authenticated
  USING (private.can_access_branch(business_id, branch_id))
  WITH CHECK (private.can_access_branch(business_id, branch_id));

CREATE POLICY appointment_items_select_branch ON public.appointment_items
  FOR SELECT TO authenticated USING (private.can_access_branch(business_id, branch_id));
CREATE POLICY appointment_items_insert_branch ON public.appointment_items
  FOR INSERT TO authenticated WITH CHECK (private.can_access_branch(business_id, branch_id));
CREATE POLICY appointment_items_update_branch ON public.appointment_items
  FOR UPDATE TO authenticated
  USING (private.can_access_branch(business_id, branch_id))
  WITH CHECK (private.can_access_branch(business_id, branch_id));

CREATE POLICY sales_select_finance ON public.sales
  FOR SELECT TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY sales_insert_finance ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY sales_update_finance ON public.sales
  FOR UPDATE TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]))
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));

CREATE POLICY sale_items_select_finance_or_own ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    private.can_access_branch(business_id, branch_id)
    AND (
      private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[])
      OR private.owns_employee(business_id, employee_id)
      OR private.owns_employee(business_id, commission_employee_id)
    )
  );
CREATE POLICY sale_items_insert_finance ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY sale_items_update_finance ON public.sale_items
  FOR UPDATE TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]))
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));

CREATE POLICY payments_select_finance ON public.payments
  FOR SELECT TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY payments_insert_finance ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));

CREATE POLICY cash_sessions_select_finance ON public.cash_sessions
  FOR SELECT TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY cash_sessions_insert_finance ON public.cash_sessions
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY cash_sessions_update_finance ON public.cash_sessions
  FOR UPDATE TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]))
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));

CREATE POLICY cash_movements_select_finance ON public.cash_movements
  FOR SELECT TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY cash_movements_insert_finance ON public.cash_movements
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));

CREATE POLICY expenses_select_finance ON public.expenses
  FOR SELECT TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY expenses_insert_finance ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));
CREATE POLICY expenses_update_finance ON public.expenses
  FOR UPDATE TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]))
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));

CREATE POLICY branch_inventory_select_branch ON public.branch_inventory
  FOR SELECT TO authenticated USING (private.can_access_branch(business_id, branch_id));

CREATE POLICY inventory_movements_select_branch ON public.inventory_movements
  FOR SELECT TO authenticated USING (private.can_access_branch(business_id, branch_id));
CREATE POLICY inventory_movements_insert_finance ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[]));

CREATE POLICY commission_entries_select_admin_or_own ON public.commission_entries
  FOR SELECT TO authenticated
  USING (
    private.can_access_branch(business_id, branch_id)
    AND (
      private.has_business_role(business_id, ARRAY['owner','admin','cashier']::public.business_role[])
      OR private.owns_employee(business_id, employee_id)
    )
  );

CREATE POLICY commission_settlements_select_admin_or_own ON public.commission_settlements
  FOR SELECT TO authenticated
  USING (
    private.can_access_branch(business_id, branch_id)
    AND (
      private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[])
      OR private.owns_employee(business_id, employee_id)
    )
  );
CREATE POLICY commission_settlements_insert_admin ON public.commission_settlements
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));
CREATE POLICY commission_settlements_update_admin ON public.commission_settlements
  FOR UPDATE TO authenticated
  USING (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]))
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY commission_settlement_lines_select_admin_or_own ON public.commission_settlement_lines
  FOR SELECT TO authenticated
  USING (
    private.can_access_branch(business_id, branch_id)
    AND (
      private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[])
      OR private.owns_employee(business_id, employee_id)
    )
  );
CREATE POLICY commission_settlement_lines_insert_admin ON public.commission_settlement_lines
  FOR INSERT TO authenticated
  WITH CHECK (private.can_access_branch(business_id, branch_id)
    AND private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[]));

CREATE POLICY audit_log_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    private.has_business_role(business_id, ARRAY['owner','admin']::public.business_role[])
    AND (branch_id IS NULL OR private.can_access_branch(business_id, branch_id))
  );

COMMIT;
