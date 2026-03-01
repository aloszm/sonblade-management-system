-- ======================================================
-- SONBLADE - Seed Data (Datos Reales del Negocio)
-- Ejecutar en Supabase SQL Editor DESPUÉS del schema.sql
-- ======================================================

-- ======================================================
-- PASO 0: Limpiar datos de ejemplo anteriores
-- ======================================================
DELETE FROM cash_movements;
DELETE FROM cash_sessions;
DELETE FROM sale_items;
DELETE FROM sales;
DELETE FROM appointments;
DELETE FROM products;
DELETE FROM services;
DELETE FROM barbers;

-- ======================================================
-- PASO 1: FIX - Arreglar policy recursiva en tabla users
-- (Este es el bug que impedía consultar la tabla sales)
-- ======================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'users' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END;
$$;

-- Re-crear policy simple (acceso abierto para desarrollo)
CREATE POLICY "dev_all_users" ON public.users
  FOR ALL USING (true) WITH CHECK (true);

-- ======================================================
-- PASO 2: BARBEROS
-- ======================================================
INSERT INTO barbers (name, status, commission_rate, total_cuts) VALUES
  ('Deya', 'active', 40.00, 0),
  ('Sonny', 'active', 40.00, 0),
  ('Abraham', 'active', 40.00, 0);

-- ======================================================
-- PASO 3: SERVICIOS (25 servicios reales)
-- ======================================================
INSERT INTO services (name, price, duration_minutes, is_active) VALUES
  ('Corte', 150.00, 30, true),
  ('Corte y Ceja', 180.00, 35, true),
  ('Corte y Barba Delineada', 250.00, 45, true),
  ('Corte de Niño', 120.00, 20, true),
  ('Barba', 100.00, 20, true),
  ('Corte, Barba y MP', 300.00, 50, true),
  ('Corte y Afeitado Maq', 220.00, 40, true),
  ('Servicio VIP', 420.00, 60, true),
  ('Corte y Ritual Barba', 270.00, 50, true),
  ('Afeitado Completo', 120.00, 25, true),
  ('Corte y Afeitado', 270.00, 45, true),
  ('Corte y Tinte', 250.00, 50, true),
  ('Corte, Barba y Tinte', 350.00, 60, true),
  ('Corte, Cejas y Tinte', 280.00, 50, true),
  ('Corte Dama', 180.00, 35, true),
  ('Brusheado', 250.00, 40, true),
  ('Barba Ritual', 150.00, 30, true),
  ('Barba y Ceja', 130.00, 25, true),
  ('Barba y Tinte', 150.00, 30, true),
  ('Planchado de Ceja', 100.00, 15, true),
  ('Corte y Planchado de Ceja', 250.00, 40, true),
  ('Corte, Barba y Ceja', 280.00, 45, true),
  ('Bigote', 40.00, 10, true),
  ('Corte y MP', 180.00, 35, true),
  ('Afeitado Barba Máquina', 70.00, 15, true);

-- ======================================================
-- PASO 4: PRODUCTOS (inventario real)
-- ======================================================
INSERT INTO products (name, sku, category, stock, min_stock, cost, price, status) VALUES
  ('Pomada B', 'POM-B01', 'Pomadas', 10, 3, 180.00, 250.00, 'ok'),
  ('Pomada A', 'POM-A01', 'Pomadas', 10, 3, 180.00, 250.00, 'ok'),
  ('Pomada R', 'POM-R01', 'Pomadas', 10, 3, 180.00, 250.00, 'ok'),
  ('Polvo T', 'PLV-T01', 'Polvos', 8, 3, 225.00, 300.00, 'ok'),
  ('Bálsamo B', 'BAL-B01', 'Bálsamos', 8, 3, 180.00, 250.00, 'ok'),
  ('Peine T', 'PEI-T01', 'Peines', 15, 5, 80.00, 120.00, 'ok'),
  ('Peine B', 'PEI-B01', 'Peines', 20, 5, 10.00, 25.00, 'ok');

-- ======================================================
-- PASO 5: Sesión de caja inicial
-- ======================================================
INSERT INTO cash_sessions (opened_by, initial_amount, total_sales, total_expenses, total_cash, total_card, total_transfer, status) VALUES
  ('Admin', 500.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'open');

-- ======================================================
-- ¡LISTO! Datos reales de Sonblade insertados.
-- ======================================================
