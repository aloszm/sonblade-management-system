// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

const DOMAIN = 'barbergallo420.site';

// Sin variables de Supabase la lógica interna responde sola: rutas públicas pasan y el resto va a /login.
beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_DOMAIN', DOMAIN);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
});
afterEach(() => vi.unstubAllEnvs());


async function run(host: string, path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
    const request = new NextRequest(`https://${host}${path}`, { method: init.method, headers: { host, ...(init.headers ?? {}) } });
    const response = await middleware(request);
    const rewrite = response.headers.get('x-middleware-rewrite');
    const location = response.headers.get('location');
    const outcome: string = location ? `redirect ${response.status} ${location}`
        : rewrite ? `rewrite ${rewrite.replace(`https://${host}`, '')}${response.status === 404 ? ' (404)' : ''}`
        : response.headers.get('x-middleware-next') ? 'next' : `status ${response.status}`;
    return { response, outcome };
}

const PUBLIC = DOMAIN, WWW = `www.${DOMAIN}`, BOOKING = `citas.${DOMAIN}`, ADMIN = `admin.${DOMAIN}`;

// [host, ruta, resultado esperado]
const TABLE: Array<[string, string, string]> = [
    // público
    [PUBLIC, '/', 'rewrite /inicio'],
    [WWW, '/', 'rewrite /inicio'],
    [PUBLIC, '/privacidad', 'next'],
    [PUBLIC, '/login', `redirect 308 https://${ADMIN}/login`],
    [PUBLIC, '/pos', `redirect 308 https://${ADMIN}/pos`],
    [PUBLIC, '/caja?x=1', `redirect 308 https://${ADMIN}/caja?x=1`],
    [PUBLIC, '/reservar', `redirect 308 https://${BOOKING}/`],
    [PUBLIC, '/reservar/tok123', `redirect 308 https://${BOOKING}/reservar/tok123`],
    [PUBLIC, '/api/health', 'next'],
    [PUBLIC, '/api/public/booking/config', 'next'],
    [PUBLIC, '/api/auth/login', 'rewrite /_sitio-no-encontrado (404)'],
    [PUBLIC, '/api/sales', 'rewrite /_sitio-no-encontrado (404)'],
    [PUBLIC, '/nada', 'rewrite /_sitio-no-encontrado (404)'],
    [PUBLIC, '/robots.txt', 'next'],
    // citas
    [BOOKING, '/', 'rewrite /reservar'],
    [BOOKING, '/deya', 'rewrite /reservar?barbero=deya'],
    [BOOKING, '/reservar/tok123', 'next'],
    [BOOKING, '/privacidad', 'next'],
    [BOOKING, '/login', `redirect 308 https://${ADMIN}/login`],
    [BOOKING, '/inicio', `redirect 308 https://${PUBLIC}/`],
    [BOOKING, '/api/public/booking/days', 'next'],
    [BOOKING, '/api/equipo', 'rewrite /_sitio-no-encontrado (404)'],
    [BOOKING, '/a/b', 'rewrite /_sitio-no-encontrado (404)'],
    // admin: comportamiento actual (sin sesión configurada: públicas pasan, el resto a /login)
    [ADMIN, '/login', 'next'],
    [ADMIN, '/privacidad', 'next'],
    [ADMIN, '/', `redirect 307 https://${ADMIN}/login?configuration=missing`],
    [ADMIN, '/pos', `redirect 307 https://${ADMIN}/login?configuration=missing`],
    [ADMIN, '/inicio', `redirect 308 https://${PUBLIC}/`],
    [ADMIN, '/reservar', `redirect 308 https://${BOOKING}/`],
    [ADMIN, '/reservar/tok123', `redirect 308 https://${BOOKING}/reservar/tok123`],
    [ADMIN, '/robots.txt', 'next'],
    // todo junto (práctica, vistas previas, localhost)
    ['practica.barbergallo420.site', '/', `redirect 307 https://practica.barbergallo420.site/login?configuration=missing`],
    ['practica.barbergallo420.site', '/inicio', 'next'],
    ['practica.barbergallo420.site', '/reservar', 'next'],
    ['practica.barbergallo420.site', '/login', 'next'],
    ['localhost:3000', '/inicio', 'next'],
    ['sonblade-git-x.vercel.app', '/login', 'next'],
];

describe('middleware por sitio (host × ruta)', () => {
    it.each(TABLE)('%s %s → %s', async (host, path, expected) => {
        const { outcome } = await run(host, path);
        expect(outcome).toBe(expected);
    });

    it('sin NEXT_PUBLIC_SITE_DOMAIN todo es "todo junto": nada se reescribe ni se redirige a otro dominio', async () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_DOMAIN', '');
        for (const host of [PUBLIC, BOOKING, ADMIN, 'localhost:3000']) {
            expect((await run(host, '/login')).outcome).toBe('next');
            expect((await run(host, '/')).outcome).toMatch(/^redirect 307 .*\/login\?configuration=missing$/);
            expect((await run(host, '/inicio')).outcome).toBe('next');
        }
    });

    it('admin no se indexa (X-Robots-Tag) y los demás sitios sí', async () => {
        expect((await run(ADMIN, '/login')).response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
        expect((await run(ADMIN, '/inicio')).response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
        expect((await run(PUBLIC, '/')).response.headers.get('x-robots-tag')).toBeNull();
        expect((await run(BOOKING, '/')).response.headers.get('x-robots-tag')).toBeNull();
    });

    it('la protección contra escrituras desde otro sitio sigue vigente en todos los sitios', async () => {
        for (const host of [PUBLIC, BOOKING, ADMIN, 'localhost:3000']) {
            const { response } = await run(host, '/api/public/booking', { method: 'POST', headers: { origin: 'https://evil.example' } });
            expect(response.status).toBe(403);
        }
    });

    it('el 404 de los sitios público y citas tiene estado 404', async () => {
        expect((await run(PUBLIC, '/nada')).response.status).toBe(404);
        expect((await run(BOOKING, '/api/sales')).response.status).toBe(404);
    });
});
