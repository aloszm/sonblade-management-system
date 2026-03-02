-- ======================================================
-- SONBLADE v2 Migration — New tables for Tasks 3-7
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ======================================================

-- 1. Add status column to cash_movements (for Task 4)
ALTER TABLE cash_movements 
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('confirmed', 'pending')) DEFAULT 'confirmed';

-- 2. AUDIT LOG (Task 6)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'system',
  role TEXT CHECK (role IN ('admin', 'recepcion', 'barbero', 'system')) DEFAULT 'system',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. CASH SESSION ARCHIVES (Task 5)
CREATE TABLE IF NOT EXISTS cash_session_archives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  original_session_id UUID NOT NULL,
  opened_by TEXT NOT NULL,
  initial_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_sales NUMERIC(10,2) DEFAULT 0,
  total_expenses NUMERIC(10,2) DEFAULT 0,
  total_cash NUMERIC(10,2) DEFAULT 0,
  total_card NUMERIC(10,2) DEFAULT 0,
  total_transfer NUMERIC(10,2) DEFAULT 0,
  physical_count NUMERIC(10,2),
  difference NUMERIC(10,2),
  movements JSONB DEFAULT '[]',
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now(),
  archived_by TEXT NOT NULL DEFAULT 'Admin'
);

-- 4. DELETED RECORDS LOG (Task 4/6)
CREATE TABLE IF NOT EXISTS deleted_records_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  record_data JSONB NOT NULL DEFAULT '{}',
  deleted_by TEXT NOT NULL DEFAULT 'system',
  reason TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ DEFAULT now()
);

-- 5. BARBER PAYMENTS (Task 7) — may already exist, use IF NOT EXISTS
CREATE TABLE IF NOT EXISTS barber_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID REFERENCES barbers(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(10,2) DEFAULT 0,
  tips_amount NUMERIC(10,2) DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  note TEXT DEFAULT '',
  status TEXT CHECK (status IN ('paid', 'pending')) DEFAULT 'paid',
  paid_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================================================
-- ROW LEVEL SECURITY (Development — Allow all)
-- ======================================================
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_session_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_records_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE barber_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_all_audit_log" ON audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_cash_session_archives" ON cash_session_archives FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_deleted_records_log" ON deleted_records_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_barber_payments" ON barber_payments FOR ALL USING (true) WITH CHECK (true);

-- ======================================================
-- Enable Realtime for sales table (Task 3)
-- ======================================================
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE cash_movements;
