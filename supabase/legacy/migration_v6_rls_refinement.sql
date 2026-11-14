-- ======================================================
-- MIGRATION V6 - Refinement of RLS Policies
-- ======================================================

-- Drop the development policies that allowed full anon access
DROP POLICY IF EXISTS "dev_all_barbers" ON barbers;
DROP POLICY IF EXISTS "dev_all_services" ON services;
DROP POLICY IF EXISTS "dev_all_products" ON products;
DROP POLICY IF EXISTS "dev_all_sales" ON sales;
DROP POLICY IF EXISTS "dev_all_sale_items" ON sale_items;
DROP POLICY IF EXISTS "dev_all_cash_sessions" ON cash_sessions;
DROP POLICY IF EXISTS "dev_all_cash_movements" ON cash_movements;
DROP POLICY IF EXISTS "dev_all_appointments" ON appointments;

-- Enable SELECT access for realtime and basic fetching 
-- Mutations are fully restricted and must run through the Service Role Key (API Routes)
CREATE POLICY "Allow public read-only access for barbers" ON barbers FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access for services" ON services FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access for products" ON products FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access for sales" ON sales FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access for sale_items" ON sale_items FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access for cash_sessions" ON cash_sessions FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access for cash_movements" ON cash_movements FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access for appointments" ON appointments FOR SELECT USING (true);
