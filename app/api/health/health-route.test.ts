import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let configured = true;
let probe: () => Promise<{ error: unknown; status: number }>;
vi.mock('@/lib/supabase/admin', () => ({
    adminKeyConfigured: () => configured,
    createSupabaseAdminClient: () => ({ from: () => ({ select: () => ({ limit: () => probe() }) }) }),
}));

import { GET } from './route';

beforeEach(() => {
    configured = true;
    probe = async () => ({ error: null, status: 200 });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghij.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_x');
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('GET /api/health', () => {
    it('todo bien: 200, sin caché y sin causa', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.json()).toEqual({ ok: true, mode: 'production', publicConfig: true, adminKeyConfigured: true, adminKeyWorks: true });
    });
    it('informa el modo: práctica con la variable, producción sin ella', async () => {
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'practice');
        expect((await (await GET()).json()).mode).toBe('practice');
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', '');
        expect((await (await GET()).json()).mode).toBe('production');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        expect((await (await GET()).json()).mode).toBe('production');
    });
    it('sin la llave secreta: 503 con causa legible', async () => {
        configured = false;
        const res = await GET();
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body).toMatchObject({ ok: false, adminKeyConfigured: false, adminKeyWorks: false });
        expect(body.cause).toContain('SUPABASE_SECRET_KEY');
    });
    it('llave de otro proyecto (401): 503 y no filtra mensajes del proveedor ni el proyecto', async () => {
        probe = async () => ({ error: { message: 'Invalid API key for project abcdefghij', code: 'PGRST301' }, status: 401 });
        const res = await GET();
        expect(res.status).toBe(503);
        const text = JSON.stringify(await res.json());
        expect(text).toContain('otro proyecto');
        expect(text).not.toContain('abcdefghij');
        expect(text).not.toContain('PGRST');
        expect(text).not.toContain('Invalid API key');
    });
    it('la base falla por otra causa: 503 genérico', async () => {
        probe = async () => ({ error: { message: 'boom' }, status: 500 });
        const res = await GET();
        expect(res.status).toBe(503);
        expect((await res.json()).adminKeyConfigured).toBe(true);
    });
    it('la consulta lanza una excepción: 503', async () => {
        probe = async () => { throw new Error('red caída'); };
        expect((await GET()).status).toBe(503);
    });
    it('sin configuración pública: 503', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        const res = await GET();
        expect(res.status).toBe(503);
        expect((await res.json()).publicConfig).toBe(false);
    });
    it('la base no responde a tiempo: 503', async () => {
        vi.useFakeTimers();
        probe = () => new Promise(() => {});
        const pending = GET();
        await vi.advanceTimersByTimeAsync(4500);
        expect((await pending).status).toBe(503);
    });
});
