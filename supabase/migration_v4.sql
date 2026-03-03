-- Migracion de Autenticación y PINs
ALTER TABLE barbers ADD COLUMN IF NOT EXISTS pin TEXT;
-- Set a default PIN for existing barbers so they aren't locked out immediately (e.g., '1234')
UPDATE barbers SET pin = '1234' WHERE pin IS NULL;
