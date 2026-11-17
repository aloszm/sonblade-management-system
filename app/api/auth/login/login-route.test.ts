import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';


const adminRpc = vi.fn();
let adminAvailable = true;
vi.mock('@/lib/supabase/admin', () => ({
    createSupabaseAdminClient: () => (adminAvailable ? { rpc: (...args: unknown[]) => adminRpc(...args) } : null),
}));
const userRpc = vi.fn();
const signIn = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({ rpc: (...args: unknown[]) => userRpc(...args), auth: { signInWithPassword: (...args: unknown[]) => signIn(...args) } }),
}));

import { POST } from './route';
import { pinPassword } from '@/lib/auth/pin-hash';

const TEST_PEPPER = 'ab'.repeat(32); // valor de prueba
const LOGIN_ID = 'prueba@gallo-420.barberos.invalid';
const req = (body: unknown) => new NextRequest(new URL('/api/auth/login', 'http://localhost'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.stubEnv('PIN_PEPPER', TEST_PEPPER);
    vi.stubEnv('BARBEROS_BUSINESS_SLUG', 'gallo-420');
    adminAvailable = true;
    adminRpc.mockReset(); userRpc.mockReset(); signIn.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function run(body: unknown) {
    const pending = POST(req(body));
    await vi.runAllTimersAsync();
    return pending;
}

describe('POST /api/auth/login', () => {
    it('sin la llave secreta responde 503 y no intenta entrar ni tocar el bloqueo', async () => {
        adminAvailable = false;
        const res = await run({ username: 'prueba', pin: '482913' });
        expect(res.status).toBe(503);
        expect((await res.json()).error).toBe('El acceso no está configurado en el servidor.');
        expect(signIn).not.toHaveBeenCalled();
        expect(adminRpc).not.toHaveBeenCalled();
    });
    it('sin PIN_PEPPER responde 503 igual', async () => {
        vi.stubEnv('PIN_PEPPER', '');
        const res = await run({ username: 'prueba', pin: '482913' });
        expect(res.status).toBe(503);
        expect(signIn).not.toHaveBeenCalled();
    });
    it('consulta y limpia el bloqueo con el cliente de administración y manda el HMAC, no el PIN', async () => {
        adminRpc.mockResolvedValue({ data: 0, error: null });
        signIn.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
        userRpc.mockResolvedValue({ data: { must_change_pin: true }, error: null });
        const res = await run({ username: 'Prueba', pin: '482913' });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, mustChangePin: true });
        expect(adminRpc).toHaveBeenCalledWith('login_attempt_check', { p_login_id: LOGIN_ID });
        expect(adminRpc).toHaveBeenCalledWith('login_attempt_succeeded', { p_login_id: LOGIN_ID });
        const sent = signIn.mock.calls[0][0] as { email: string; password: string };
        expect(sent.email).toBe(LOGIN_ID);
        expect(sent.password).toBe(pinPassword(LOGIN_ID, '482913'));
        expect(sent.password).not.toBe('482913');
        expect(userRpc).not.toHaveBeenCalledWith('login_attempt_succeeded', expect.anything());
    });
    it('un PIN equivocado suma el fallo con el cliente de administración (401) y avisa al bloquear (429)', async () => {
        adminRpc.mockImplementation(async (fn: string) => ({ data: fn === 'login_attempt_failed' ? 0 : 0, error: null }));
        signIn.mockResolvedValue({ data: { user: null }, error: { status: 400, name: 'AuthApiError', code: 'invalid_credentials' } });
        expect((await run({ username: 'prueba', pin: '482913' })).status).toBe(401);
        expect(adminRpc).toHaveBeenCalledWith('login_attempt_failed', { p_login_id: LOGIN_ID });
        adminRpc.mockImplementation(async (fn: string) => ({ data: fn === 'login_attempt_failed' ? 900 : 0, error: null }));
        expect((await run({ username: 'prueba', pin: '482913' })).status).toBe(429);
    });
    it('si el usuario está bloqueado no intenta entrar', async () => {
        adminRpc.mockResolvedValue({ data: 600, error: null });
        const res = await run({ username: 'prueba', pin: '482913' });
        expect(res.status).toBe(429);
        expect(signIn).not.toHaveBeenCalled();
    });
    it('si la base no responde al consultar el bloqueo, falla cerrado (503)', async () => {
        adminRpc.mockResolvedValue({ data: null, error: { message: 'x' } });
        expect((await run({ username: 'prueba', pin: '482913' })).status).toBe(503);
        expect(signIn).not.toHaveBeenCalled();
    });
});
