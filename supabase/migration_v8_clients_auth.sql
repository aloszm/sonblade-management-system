-- migration_v8_clients_auth.sql
-- Add Client Number (SB-XXXX) and PIN (4 digits) to clients

-- Create sequence for client numbers starting at 1000
CREATE SEQUENCE IF NOT EXISTS client_number_seq START 1000;

-- Add new columns to clients table
ALTER TABLE clients
  ADD COLUMN client_number TEXT UNIQUE,
  ADD COLUMN pin VARCHAR(4);

-- Function to generate the client number automatically if not provided
CREATE OR REPLACE FUNCTION generate_client_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_number IS NULL THEN
    NEW.client_number := 'SB-' || nextval('client_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute before insert
DROP TRIGGER IF EXISTS trigger_generate_client_number ON clients;
CREATE TRIGGER trigger_generate_client_number
BEFORE INSERT ON clients
FOR EACH ROW
EXECUTE FUNCTION generate_client_number();

-- Backfill client numbers for any existing clients
UPDATE clients
SET client_number = 'SB-' || nextval('client_number_seq')
WHERE client_number IS NULL;

-- Make it required from now on
ALTER TABLE clients
  ALTER COLUMN client_number SET NOT NULL;
