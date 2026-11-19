import { beforeEach, describe, expect, it, vi } from 'vitest';

let role = 'owner';
vi.mock('@/lib/auth/context', async () => {
    class AuthorizationError extends Error { constructor(message = 'No tienes permiso para esta operación.', public status = 403) { super(message); } }
    return {
        AuthorizationError,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new AuthorizationError();
            return { businessId: 'b1', role };
        },
        authErrorResponse: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    };
});
let settings: unknown = { booking: { enabled: true } };
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { settings }, error: null }) }) }) }) }),
}));
vi.mock('@/lib/system/health', () => ({ checkAdminKey: async () => ({ configured: true, works: true, code: 'ok' }) }));
vi.mock('@/lib/system/migrations', () => ({ latestBundledMigration: () => '20261117180507_cash_reasons_and_pin_confirmation' }));

import { GET } from './route';

beforeEach(() => {
    role = 'owner'; settings = { booking: { enabled: true } };
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abcdef1234567890');
    vi.stubEnv('VERCEL_ENV', 'production');
});

describe('GET /api/system-status', () => {
    it.each(['admin', 'viewer', 'receptionist', 'cashier', 'barber'])('%s recibe 403', async (r) => {
        role = r;
        expect((await GET()).status).toBe(403);
    });
    it('el dueño recibe el estado', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            mode: 'production', commit: 'abcdef1', environment: 'production', lastMigration: '20261117180507_cash_reasons_and_pin_confirmation',
            adminKey: { configured: true, works: true, cause: null }, onlineBookingEnabled: true,
        });
    });
    it('informa el modo práctica', async () => {
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'practice');
        expect((await (await GET()).json()).mode).toBe('practice');
    });
    it('reservas apagadas si el ajuste no existe', async () => {
        settings = {};
        expect((await (await GET()).json()).onlineBookingEnabled).toBe(false);
    });
});
