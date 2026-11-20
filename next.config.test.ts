import { afterEach, describe, expect, it, vi } from 'vitest';

async function csp(): Promise<Record<string, string[]>> {
    vi.resetModules();
    const config = (await import('./next.config')).default;
    const rules = await config.headers!();
    const header = rules[0].headers.find((h) => h.key === 'Content-Security-Policy')!;
    return Object.fromEntries(header.value.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [name, ...vals] = d.split(/\s+/); return [name, vals]; }));
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('Política de seguridad (CSP) y el visor de comprobantes', () => {
    it('el visor descarga el archivo con fetch (connect-src al proyecto) y lo muestra como blob: sin abrir img-src a Supabase', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
        const p = await csp();
        expect(p['connect-src']).toContain('https://proj.supabase.co');
        expect(p['img-src']).toContain('blob:');
        expect(p['img-src']).not.toContain('https://proj.supabase.co');
        expect(p['img-src'].join(' ')).not.toMatch(/\*|https:/);
    });

    it('los PDF no se incrustan: object-src sigue en none y no se abre frame-src', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
        const p = await csp();
        expect(p['object-src']).toEqual(["'none'"]);
        expect(p['frame-src']).toBeUndefined();
        expect(p['default-src']).toEqual(["'self'"]);
    });
});
