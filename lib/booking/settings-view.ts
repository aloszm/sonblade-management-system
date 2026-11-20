/**
 * D1 — Forma estable de las reglas de reservas en línea para la pantalla (lo que devuelve
 * public.get_booking_settings / set_booking_settings). Los topes fijos contra abuso no se envían.
 */
export type BookingRules = Record<string, unknown>;

export function toBookingSettings(raw: BookingRules | null) {
    const r = raw ?? {};
    const n = (v: unknown) => Number(v ?? 0);
    return {
        enabled: Boolean(r.enabled),
        lead_minutes: n(r.lead_minutes),
        max_days_ahead: n(r.max_days_ahead),
        cancel_hours: n(r.cancel_hours),
        max_online_per_day: n(r.max_online_per_day),
        max_active_per_phone: n(r.max_active_per_phone),
        privacy_version: typeof r.privacy_version === 'string' ? r.privacy_version : null,
        last_changed_at: typeof r.last_changed_at === 'string' ? r.last_changed_at : null,
        last_changed_by: typeof r.last_changed_by === 'string' ? r.last_changed_by : null,
    };
}


export type BookingSettingsView = ReturnType<typeof toBookingSettings>;
