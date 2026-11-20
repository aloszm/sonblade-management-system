-- Reservas en línea: sube el tope de consultas de disponibilidad de 20 a 60 por minuto por huella de red.
-- Motivo: varios clientes en el mismo Wi-Fi (el de la barbería) comparten dirección y con 20 se topaban
-- con el límite al cambiar de día u hora. Los topes de RESERVAS no cambian (5 por hora por teléfono y por
-- huella, 40 por hora en total). Solo cambia el número; el resto de la función es idéntico.
create or replace function private.booking_rules(p_settings jsonb)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', coalesce((p_settings->'booking'->>'enabled')::boolean, false),
    'lead_minutes', coalesce((p_settings->'booking'->>'lead_minutes')::integer, 60),
    'max_days_ahead', coalesce((p_settings->'booking'->>'max_days_ahead')::integer, 30),
    'cancel_hours', coalesce((p_settings->'booking'->>'cancel_hours')::integer, 2),
    'max_active_per_phone', coalesce((p_settings->'booking'->>'max_active_per_phone')::integer, 2),
    -- Tope de reservas EN LÍNEA activas por negocio y día (las del mostrador no cuentan).
    'max_online_per_day', coalesce((p_settings->'booking'->>'max_online_per_day')::integer, 30),
    'privacy_version', coalesce(p_settings->'booking'->>'privacy_version', '2026-11-17'),
    -- Límite de intentos (fijos): reservas por hora por teléfono y por huella; consultas por minuto por huella;
    -- tope global de reservas en línea por hora para el negocio.
    'book_per_hour', 5,
    'lookups_per_minute', 60,
    'global_book_per_hour', 40)
$$;
