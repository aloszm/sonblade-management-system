import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sesiones de prueba por puesto (nombres reales del equipo; sin PIN reales).
const BASE = { employeeId: null, businessId: 'biz', branchId: 'br1' };
const PEOPLE = {
    owner: { ...BASE, userId: 'u-alonso', email: 'alonso@gallo-420.barberos.invalid', displayName: 'Alonso', role: 'owner' as const },
    admin: { ...BASE, userId: 'u-sonia', email: 'sonia@gallo-420.barberos.invalid', displayName: 'Sonia', role: 'admin' as const },
    receptionist: { ...BASE, userId: 'u-emi', email: 'emi@gallo-420.barberos.invalid', displayName: 'Emi', role: 'receptionist' as const },
    barber: { ...BASE, userId: 'u-dani', email: 'dani@gallo-420.barberos.invalid', displayName: 'Dani', role: 'barber' as const },
    viewer: { ...BASE, userId: 'u-lucia', email: 'lucia@gallo-420.barberos.invalid', displayName: 'Lucía', role: 'viewer' as const },
};
type Person = (typeof PEOPLE)[keyof typeof PEOPLE];
let current: Person = PEOPLE.owner;
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(current.role)) throw new real.AuthorizationError();
            return current;
        },
    };
});

const sessionRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({ rpc: (...args: unknown[]) => sessionRpc(...args) }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

const pinRpc = vi.fn();
const runWithPinMock = vi.fn();
vi.mock('@/lib/auth/pin-confirm', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/pin-confirm')>();
    return { ...real, runWithPin: (...args: unknown[]) => runWithPinMock(...args) };
});

import { GET, PUT } from './route';

const GOOD_PIN = '482913';
const RULES = {
    enabled: true, lead_minutes: 60, max_days_ahead: 30, cancel_hours: 2, max_online_per_day: 30, max_active_per_phone: 2,
    privacy_version: '2026-11-17', book_per_hour: 5, lookups_per_minute: 60, global_book_per_hour: 40,
    last_changed_at: '2026-11-20T03:00:00Z', last_changed_by: 'Alonso',
};
const put = (body: unknown) => new NextRequest(new URL('/api/booking-settings', 'http://localhost'), {
    method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
});

beforeEach(() => {
    current = PEOPLE.owner;
    sessionRpc.mockReset(); pinRpc.mockReset(); runWithPinMock.mockReset();
    sessionRpc.mockResolvedValue({ data: { ...RULES, can_edit: true }, error: null });
    pinRpc.mockResolvedValue({ data: { ...RULES, enabled: false, changed: true }, error: null });
    runWithPinMock.mockImplementation(async (_identity: unknown, pin: string, action: (client: unknown) => Promise<unknown>) => {
        if (pin !== GOOD_PIN) return { ok: false, status: 400, error: 'El PIN no es correcto.' };
        return { ok: true, value: await action({ rpc: (...args: unknown[]) => pinRpc(...args) }) };
    });
});

describe('GET /api/booking-settings', () => {
    it.each(['owner', 'admin'] as const)('%s lee las reglas vigentes sin los topes fijos', async (who) => {
        current = PEOPLE[who];
        sessionRpc.mockResolvedValue({ data: { ...RULES, can_edit: who === 'owner' }, error: null });
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({
            settings: {
                enabled: true, lead_minutes: 60, max_days_ahead: 30, cancel_hours: 2, max_online_per_day: 30, max_active_per_phone: 2,
                privacy_version: '2026-11-17', last_changed_at: '2026-11-20T03:00:00Z', last_changed_by: 'Alonso',
            },
            can_edit: who === 'owner',
        });
        expect(sessionRpc).toHaveBeenCalledWith('get_booking_settings', { p_business_id: 'biz' });
    });

    it.each(['receptionist', 'barber', 'viewer'] as const)('%s recibe 403', async (who) => {
        current = PEOPLE[who];
        const res = await GET();
        expect(res.status).toBe(403);
        expect(sessionRpc).not.toHaveBeenCalled();
    });
});

describe('PUT /api/booking-settings', () => {
    it('la cuenta principal apaga con su PIN y se manda solo lo que llegó', async () => {
        const res = await PUT(put({ enabled: false, lead_minutes: 120, comment: 'Vacaciones', pin: GOOD_PIN }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.changed).toBe(true);
        expect(body.settings.enabled).toBe(false);
        expect(pinRpc).toHaveBeenCalledWith('set_booking_settings', {
            p_business_id: 'biz', p_enabled: false, p_lead_minutes: 120, p_max_days_ahead: undefined,
            p_cancel_hours: undefined, p_max_online_per_day: undefined, p_comment: 'Vacaciones',
        });
    });

    it('sin PIN pide el PIN (428) y no toca la base', async () => {
        const res = await PUT(put({ enabled: true }));
        expect(res.status).toBe(428);
        expect((await res.json()).needs_pin).toBe(true);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('PIN equivocado: 400 con pin_error', async () => {
        const res = await PUT(put({ enabled: true, pin: '000001' }));
        expect(res.status).toBe(400);
        expect((await res.json()).pin_error).toBe(true);
        expect(pinRpc).not.toHaveBeenCalled();
    });

    it.each([
        [{ enabled: true, lead_minutes: 1441 }, 'anticipación'],
        [{ enabled: true, max_days_ahead: 0 }, 'días'],
        [{ enabled: true, max_days_ahead: 91 }, 'días'],
        [{ enabled: true, cancel_hours: 73 }, 'cancelar'],
        [{ enabled: true, max_online_per_day: 201 }, 'tope'],
        [{ enabled: true, lead_minutes: 1.5 }, 'anticipación'],
        [{ lead_minutes: 60 }, 'encendidas'],
        [{ enabled: true, extra: 1 }, ''],
    ])('rechaza %o con 400', async (body, word) => {
        const res = await PUT(put({ ...body, pin: GOOD_PIN }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain(word);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it.each(['admin', 'receptionist', 'barber', 'viewer'] as const)('%s no puede cambiarlas (403)', async (who) => {
        current = PEOPLE[who];
        const res = await PUT(put({ enabled: true, pin: GOOD_PIN }));
        expect(res.status).toBe(403);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('si la base rechaza (42501) responde 403 con su mensaje', async () => {
        pinRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Solo la cuenta principal puede encender o apagar las reservas en línea.' } });
        const res = await PUT(put({ enabled: true, pin: GOOD_PIN }));
        expect(res.status).toBe(403);
    });
});
