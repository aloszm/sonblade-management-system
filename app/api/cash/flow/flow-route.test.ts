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
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { timezone: 'America/Mexico_City' }, error: null }) }) }) }),
    }),
}));

const loadRow = vi.fn();
const loadFlows = vi.fn();
const loadOther = vi.fn();
vi.mock('@/lib/cash/cash-flow-load', () => ({
    loadSessionRow: (...a: unknown[]) => loadRow(...a),
    loadCashFlows: (...a: unknown[]) => loadFlows(...a),
    loadOtherExpenses: (...a: unknown[]) => loadOther(...a),
}));

import { GET } from './route';

const ID = '3f1c2b0e-7a41-4b6e-9d52-0c1f6a8e4b11';
const get = (id: string | null = ID) => GET(new NextRequest(new URL(`/api/cash/flow${id === null ? '' : `?session_id=${id}`}`, 'http://localhost')));
const row = (over: Record<string, unknown> = {}) => ({ id: ID, status: 'closed', opened_at: '2026-11-20T16:00:00Z', ...over });

beforeEach(() => {
    // 21 nov 2026, 12:00 en Ciudad de México.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T18:00:00Z'));
    loadRow.mockReset(); loadFlows.mockReset(); loadOther.mockReset();
    loadRow.mockResolvedValue(row());
    loadFlows.mockResolvedValue([{ id: ID }]);
    loadOther.mockResolvedValue({ envelopeCents: 100, bankCents: 200, count: 2 });
});
afterEach(() => vi.useRealTimers());

describe('GET /api/cash/flow', () => {
    it('pide una caja válida y existente', async () => {
        role = 'owner';
        expect((await get(null)).status).toBe(400);
        expect((await get('no-es-uuid')).status).toBe(400);
        loadRow.mockResolvedValue(null);
        expect((await get()).status).toBe(404);
        expect(loadFlows).not.toHaveBeenCalled();
    });

    it('el barbero no entra (403) y no se lee nada', async () => {
        role = 'barber';
        expect((await get()).status).toBe(403);
        expect(loadRow).not.toHaveBeenCalled();
    });

    it.each<BusinessRole>(['owner', 'admin', 'viewer'])('%s recibe quién registró y los gastos del sobre o del banco; cualquier día', async (r) => {
        role = r;
        loadRow.mockResolvedValue(row({ opened_at: '2026-10-01T16:00:00Z' }));
        const res = await get();
        expect(res.status).toBe(200);
        expect(loadFlows.mock.calls[0][3]).toEqual({ showAuthors: true });
        expect(await res.json()).toMatchObject({ flow: { id: ID }, day: '2026-10-01', timezone: 'America/Mexico_City', otherExpenses: { envelopeCents: 100, bankCents: 200, count: 2 } });
        expect(loadOther).toHaveBeenCalledWith(expect.anything(), expect.anything(), '2026-10-01', 'America/Mexico_City');
    });

    it('recepción: sin autores ni gastos del sobre o del banco', async () => {
        role = 'receptionist';
        const res = await get();
        expect(res.status).toBe(200);
        expect(loadFlows.mock.calls[0][3]).toEqual({ showAuthors: false });
        expect(loadOther).not.toHaveBeenCalled();
        expect((await res.json()).otherExpenses).toBeNull();
    });

    it('recepción: una caja cerrada de hoy o ayer sí; de antes no (403) y no se leen movimientos', async () => {
        role = 'receptionist';
        loadRow.mockResolvedValue(row({ opened_at: '2026-11-20T16:00:00Z' }));
        expect((await get()).status).toBe(200);
        loadFlows.mockClear();
        loadRow.mockResolvedValue(row({ opened_at: '2026-11-19T16:00:00Z' }));
        const old = await get();
        expect(old.status).toBe(403);
        expect((await old.json()).error).toMatch(/hoy y de ayer/);
        expect(loadFlows).not.toHaveBeenCalled();
    });

    it('recepción: la caja ABIERTA siempre se ve, aunque se haya quedado abierta desde antes', async () => {
        role = 'receptionist';
        loadRow.mockResolvedValue(row({ status: 'open', opened_at: '2026-11-17T16:00:00Z' }));
        expect((await get()).status).toBe(200);
    });

    it('no se guarda en caché', async () => {
        role = 'owner';
        expect((await get()).headers.get('cache-control')).toBe('no-store');
    });
});
