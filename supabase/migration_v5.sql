-- ==========================================
-- MIGRATION V5: Enterprise Security & Audit
-- ==========================================

-- 1. Enable RLS on all tables
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE barber_payments ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing permissive policies (if any)
-- (Assuming public access was previously granted, we drop them. 
-- If they don't exist, this might throw a warning, which is fine in Supabase SQL editor)
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END
$$;

-- 3. Create Restrictive Policies
-- We will only allow operations if the user is authenticated via Supabase Auth (Service Role for our API)
-- Our Next.js backend uses the Service Role key, which Bypasses RLS by default.
-- However, creating these policies explicitly blocks anon/public connections from the browser.

CREATE POLICY "Disallow public access to barbers" ON barbers FOR ALL USING (false);
CREATE POLICY "Disallow public access to services" ON services FOR ALL USING (false);
CREATE POLICY "Disallow public access to products" ON products FOR ALL USING (false);
CREATE POLICY "Disallow public access to sales" ON sales FOR ALL USING (false);
CREATE POLICY "Disallow public access to sale_items" ON sale_items FOR ALL USING (false);
CREATE POLICY "Disallow public access to cash_sessions" ON cash_sessions FOR ALL USING (false);
CREATE POLICY "Disallow public access to cash_movements" ON cash_movements FOR ALL USING (false);
CREATE POLICY "Disallow public access to barber_payments" ON barber_payments FOR ALL USING (false);

-- 4. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT timezone('America/Mexico_City', now())
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Disallow public access to audit_logs" ON audit_logs FOR ALL USING (false);

-- 5. Create Trigger Function for Auditing
CREATE OR REPLACE FUNCTION audit_record_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::JSONB);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Attach Triggers to Critical Tables
DROP TRIGGER IF EXISTS audit_sales_trigger ON sales;
CREATE TRIGGER audit_sales_trigger
AFTER UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION audit_record_changes();

DROP TRIGGER IF EXISTS audit_products_trigger ON products;
CREATE TRIGGER audit_products_trigger
AFTER UPDATE OR DELETE ON products
FOR EACH ROW EXECUTE FUNCTION audit_record_changes();

DROP TRIGGER IF EXISTS audit_cash_sessions_trigger ON cash_sessions;
CREATE TRIGGER audit_cash_sessions_trigger
AFTER UPDATE OR DELETE ON cash_sessions
FOR EACH ROW EXECUTE FUNCTION audit_record_changes();

DROP TRIGGER IF EXISTS audit_cash_movements_trigger ON cash_movements;
CREATE TRIGGER audit_cash_movements_trigger
AFTER UPDATE OR DELETE ON cash_movements
FOR EACH ROW EXECUTE FUNCTION audit_record_changes();

-- Output success
SELECT 'Migration V5 Complete. Database is now secured and auditing is enabled.' as status;
