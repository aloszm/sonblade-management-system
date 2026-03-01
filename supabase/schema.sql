-- ======================================================
-- SONBLADE MVP - Database Schema
-- Run this in Supabase SQL Editor (app.supabase.com)
-- ======================================================

-- 1. BARBERS (Barberos)
CREATE TABLE IF NOT EXISTS barbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  status TEXT CHECK (status IN ('active', 'busy', 'off')) DEFAULT 'active',
  commission_rate NUMERIC(5,2) DEFAULT 40.00,
  total_cuts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. SERVICES (Servicios)
CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PRODUCTS (Productos / Inventario)
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  cost NUMERIC(10,2) DEFAULT 0,
  price NUMERIC(10,2) DEFAULT 0,
  status TEXT CHECK (status IN ('ok', 'low', 'critical', 'empty')) DEFAULT 'ok',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. SALES (Ventas)
CREATE TABLE IF NOT EXISTS sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barber_id UUID REFERENCES barbers(id),
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  tip NUMERIC(10,2) DEFAULT 0,
  cash_amount NUMERIC(10,2) DEFAULT 0,
  card_amount NUMERIC(10,2) DEFAULT 0,
  transfer_amount NUMERIC(10,2) DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'transfer', 'mixed')) DEFAULT 'cash',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. SALE ITEMS (Detalle de cada venta)
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  item_type TEXT CHECK (item_type IN ('service', 'product')) NOT NULL,
  item_name TEXT NOT NULL,
  item_price NUMERIC(10,2) NOT NULL,
  quantity INTEGER DEFAULT 1,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. CASH SESSIONS (Sesiones de Caja)
CREATE TABLE IF NOT EXISTS cash_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opened_by TEXT NOT NULL DEFAULT 'Admin',
  initial_amount NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  total_sales NUMERIC(10,2) DEFAULT 0,
  total_expenses NUMERIC(10,2) DEFAULT 0,
  total_cash NUMERIC(10,2) DEFAULT 0,
  total_card NUMERIC(10,2) DEFAULT 0,
  total_transfer NUMERIC(10,2) DEFAULT 0,
  physical_count NUMERIC(10,2),
  difference NUMERIC(10,2),
  status TEXT CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- 7. CASH MOVEMENTS (Movimientos de Caja - gastos, retiros, etc.)
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES cash_sessions(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('sale', 'expense', 'withdrawal', 'deposit')) NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. APPOINTMENTS (Citas - opcional para el barber dashboard)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  service_id UUID REFERENCES services(id),
  barber_id UUID REFERENCES barbers(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ======================================================
-- ROW LEVEL SECURITY (Development - Allow all)
-- ======================================================
ALTER TABLE barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Development policies (open access, restrict later for production)
CREATE POLICY "dev_all_barbers" ON barbers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_services" ON services FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_sales" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_sale_items" ON sale_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_cash_sessions" ON cash_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_cash_movements" ON cash_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_appointments" ON appointments FOR ALL USING (true) WITH CHECK (true);

-- ======================================================
-- FUNCTIONS: Auto-update product status based on stock
-- ======================================================
CREATE OR REPLACE FUNCTION update_product_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock <= 0 THEN
    NEW.status := 'empty';
  ELSIF NEW.stock <= NEW.min_stock THEN
    NEW.status := CASE WHEN NEW.stock <= (NEW.min_stock / 2) THEN 'critical' ELSE 'low' END;
  ELSE
    NEW.status := 'ok';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_product_status
BEFORE UPDATE OF stock ON products
FOR EACH ROW
EXECUTE FUNCTION update_product_status();

-- ======================================================
-- NOTA: Los datos reales se insertan desde seed.sql
-- ======================================================
