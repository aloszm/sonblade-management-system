// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/account/pin: después de cambiar el PIN la persona debe seguir dentro. Supabase Auth cierra las demás sesiones
// al cambiar la contraseña (también la del navegador, porque el cambio se hace con una sesión aparte); antes la app
// la sacaba sin aviso justo después de elegir su PIN.
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return { ...real, requireAuthContext: async () => ({ userId: 'u1', email: 'dani@gallo-420.barberos.invalid', displayName: 'Dani', employeeId: 'e1', businessId: 'biz', branchId: 'br1', role: 'barber' }) };
});

const order: string[] = [];
const browserSignIn = vi.fn();
const browserRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    getPublicConfig: () => ({ url: 'http://localhost:54321', key: 'sb_publishable_x' }),
    createSupabaseServerClient: async () => ({
        auth: { signInWithPassword: (...a: unknown[]) => { order.push('renueva la sesión del navegador'); return browserSignIn(...a); } },
        rpc: (...a: unknown[]) => { order.push(`rpc ${String(a[0])}`); return browserRpc(...a); },
    }),
}));

const adminRpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({ rpc: (...a: unknown[]) => adminRpc(...a) }) }));
vi.mock('@/lib/auth/pin-hash', () => ({
    MISSING_PIN_PEPPER: 'El acceso no está configurado en el servidor.',
    pinPepperConfigured: async () => true,
    pinPassword: async (loginId: string, pin: string) => `hmac(${loginId}:${pin})`,
}));

const verifierSignIn = vi.fn();
const verifierUpdate = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        auth: {
            signInWithPassword: (...a: unknown[]) => { order.push('verifica el PIN actual'); return verifierSignIn(...a); },
            updateUser: (...a: unknown[]) => { order.push('guarda el PIN nuevo'); return verifierUpdate(...a); },
            signOut: async () => ({ error: null }),
        },
    }),
}));

import { POST } from './route';

const post = (body: Record<string, unknown>) => POST(new NextRequest(new URL('/api/account/pin', 'http://localhost'), { method: 'POST', body: JSON.stringify(body) }));
const valid = { current: '482917', next: '739154', confirm: '739154' };

beforeEach(() => {
    order.length = 0;
    for (const m of [browserSignIn, browserRpc, adminRpc, verifierSignIn, verifierUpdate]) m.mockReset();
    adminRpc.mockResolvedValue({ data: 0, error: null });
    verifierSignIn.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    verifierUpdate.mockResolvedValue({ error: null });
    browserSignIn.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    browserRpc.mockResolvedValue({ data: true, error: null });
});

describe('POST /api/account/pin · la persona sigue dentro después de cambiar su PIN', () => {
    it('tras guardar el PIN nuevo, renueva la sesión del navegador con ese PIN y hasta entonces avisa a la base', async () => {
        const res = await post(valid);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        expect(order).toEqual(['verifica el PIN actual', 'guarda el PIN nuevo', 'renueva la sesión del navegador', 'rpc pin_changed']);
        // La sesión nueva se abre con el PIN NUEVO (la contraseña derivada, nunca el PIN en claro).
        expect(browserSignIn).toHaveBeenCalledWith({ email: 'dani@gallo-420.barberos.invalid', password: 'hmac(dani@gallo-420.barberos.invalid:739154)' });
    });

    it('si la sesión no se pudo renovar, el PIN sí cambió: responde éxito y pide volver a entrar', async () => {
        browserSignIn.mockResolvedValue({ data: { user: null }, error: { status: 500, message: 'fallo' } });
        browserRpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
        const res = await post(valid);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, relogin: true });
    });

    it('PIN actual incorrecto: no cambia nada, no renueva la sesión y cuenta el intento', async () => {
        verifierSignIn.mockResolvedValue({ data: { user: null }, error: { status: 400, message: 'Invalid login credentials' } });
        const res = await post(valid);
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ error: 'Tu PIN actual no es correcto.' });
        expect(verifierUpdate).not.toHaveBeenCalled();
        expect(browserSignIn).not.toHaveBeenCalled();
        expect(adminRpc).toHaveBeenCalledWith('login_attempt_failed', { p_login_id: 'dani@gallo-420.barberos.invalid' });
    });

    it('PIN nuevo fácil de adivinar o que no coincide: rechazado antes de tocar nada', async () => {
        expect((await post({ current: '482917', next: '123456', confirm: '123456' })).status).toBe(400);
        expect((await post({ current: '482917', next: '739154', confirm: '739155' })).status).toBe(400);
        expect(verifierSignIn).not.toHaveBeenCalled();
    });
});
