-- ============================================================
-- MIGRATION v10: Receptionist Role + Client Profile + Appointments
-- Run in Supabase SQL Editor
-- ============================================================

-- A. Tabla receptionists (mismo patrón que barbers)
CREATE TABLE IF NOT EXISTS receptionists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    pin        TEXT NOT NULL,          -- bcrypt hash ($2b$)
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: solo service_role puede acceder
ALTER TABLE receptionists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON receptionists USING (FALSE);

-- B. Campos de perfil de cliente (definidos en types/index.ts pero sin columna en DB)
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS hair_type          TEXT,
    ADD COLUMN IF NOT EXISTS preferred_cut      TEXT,
    ADD COLUMN IF NOT EXISTS style_notes        TEXT,
    ADD COLUMN IF NOT EXISTS internal_notes     TEXT,
    ADD COLUMN IF NOT EXISTS favorite_barber_id UUID REFERENCES barbers(id) ON DELETE SET NULL;

-- C. Tabla appointments (citas / agenda)
CREATE TABLE IF NOT EXISTS appointments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
    barber_id    UUID REFERENCES barbers(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    service_note TEXT,
    status       TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'confirmed', 'done', 'cancelled')),
    created_at   TIMESTAMPTZ DEFAULT now()
);

-- Index para búsquedas por fecha
CREATE INDEX IF NOT EXISTS appointments_scheduled_at_idx ON appointments (scheduled_at);

-- RLS: solo service_role
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON appointments USING (FALSE);
