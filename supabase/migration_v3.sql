-- Migracion de comisiones
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'tiered';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_type TEXT DEFAULT 'tiered';
