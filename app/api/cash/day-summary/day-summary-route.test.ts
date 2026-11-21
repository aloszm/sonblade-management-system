// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessRole } from '@/lib/auth/context';

const BASE = { userId: 'u', email: 'x@gallo-420.barberos.invalid', displayName: 'X', employeeId: null, businessId: 'biz', branchId: 'br1' };
let role: BusinessRole = 'receptionist';
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new real.AuthorizationError();
            return { ...BASE, role };
        },
    };
});

vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'Gallo 4:20', timezone: 'America/Mexico_City' }, error: null }) }) }) }),
    }),
}));

const load = vi.fn();
vi.mock('@/lib/cash/day-summary-load', () => ({ loadDaySummary: (...a: unknown[]) => load(...a) }));

import { GET } from './route';

const get = (date: string | null) => GET(new NextRequest(new URL(`/api/cash/day-summary${date === null ? '' : `?date=${date}`}`, 'http://localhost')));

beforeEach(() => {
    // 21 nov 2026, 12:00 en Ciudad de México.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T18:00:00Z'));
    load.mockReset();
    load.mockResolvedValue({ summary: { sales: { paidCount: 0 } }, cash: { sessions: [] } });
});
afterEach(() => vi.useRealTimers());

describe('GET /api/cash/day-summary: quién ve qué día', () => {
    it.each<BusinessRole>(['owner', 'admin', 'viewer'])('%s ve cualquier día (hoy, ayer y una fecha antigua)', async (r) => {
        role = r;
        for (const d of ['2026-11-21', '2026-11-20', '2026-10-01']) expect((await get(d)).status).toBe(200);
    });

    it.each<BusinessRole>(['receptionist', 'cashier'])('%s ve hoy y ayer; otras fechas no', async (r) => {
        role = r;
        expect((await get('2026-11-21')).status).toBe(200);
        expect((await get('2026-11-20')).status).toBe(200);
        const old = await get('2026-11-19');
        expect(old.status).toBe(403);
        expect((await old.json()).error).toMatch(/hoy y de ayer/);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it.each<[BusinessRole, boolean]>([['owner', true], ['admin', true], ['viewer', true], ['receptionist', false], ['cashier', false]])(
        '%s: «quién registró» y los gastos del sobre o del banco se piden solo si es %s',
        async (r, management) => {
            role = r;
            await get('2026-11-21');
            expect(load.mock.calls[0][4]).toBe(management);
        });

    it('el barbero no entra (403) y no se lee nada', async () => {
        role = 'barber';
        expect((await get('2026-11-21')).status).toBe(403);
        expect(load).not.toHaveBeenCalled();
    });

    it('«hoy» es el día de la barbería, no el de UTC (11 pm del 21 en México ya es el 22 en UTC)', async () => {
        vi.setSystemTime(new Date('2026-11-22T05:30:00Z'));
        role = 'receptionist';
        expect((await get('2026-11-21')).status).toBe(200);
        expect((await get('2026-11-20')).status).toBe(200); // ayer = 20, hoy = 21
        expect((await get('2026-11-19')).status).toBe(403);
    });
});

describe('GET /api/cash/day-summary: validación', () => {
    beforeEach(() => { role = 'owner'; });
    it.each([null, '', '2026-13-01', '2026-02-30', '21-11-2026', '2019-12-31', 'hoy'])('rechaza la fecha %s con 400', async (d) => {
        expect((await get(d)).status).toBe(400);
        expect(load).not.toHaveBeenCalled();
    });
    it('un día futuro es 400', async () => {
        const res = await get('2026-11-22');
        expect(res.status).toBe(400);
        expect(load).not.toHaveBeenCalled();
    });
    it('entrega el día, la zona, el nombre y el primer día permitido (recepción: ayer)', async () => {
        const owner = await (await get('2026-11-20')).json();
        expect(owner).toMatchObject({ date: '2026-11-20', timezone: 'America/Mexico_City', businessName: 'Gallo 4:20', today: '2026-11-21', minDay: null });
        role = 'receptionist';
        expect((await (await get('2026-11-21')).json()).minDay).toBe('2026-11-20');
        expect(load.mock.calls[0][2]).toBe('2026-11-20');
        expect(load.mock.calls[0][3]).toBe('America/Mexico_City');
    });
    it('no se guarda en caché', async () => {
        expect((await get('2026-11-21')).headers.get('cache-control')).toBe('no-store');
    });
});
