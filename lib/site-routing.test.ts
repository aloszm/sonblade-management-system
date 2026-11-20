import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTERNAL_PREFIXES, PUBLIC_SEGMENTS, barberSlug, routeForSite, type RouteDecision } from './site-routing';
import type { Site } from './hosts';

const PASS: RouteDecision = { kind: 'pass' };
const OPEN: RouteDecision = { kind: 'open' };
const NOT_FOUND: RouteDecision = { kind: 'notFound' };
const rewrite = (pathname: string, search?: string): RouteDecision => ({ kind: 'rewrite', pathname, ...(search !== undefined ? { search } : {}) });
const redirect = (site: 'public' | 'booking' | 'admin', pathname: string, search = ''): RouteDecision => ({ kind: 'redirect', site, pathname, search });

// host (sitio) × ruta → decisión
const CASES: Array<[Site, string, RouteDecision]> = [
    // ── public ──
    ['public', '/', rewrite('/inicio')],
    ['public', '/inicio', redirect('public', '/')],
    ['public', '/privacidad', OPEN],
    ['public', '/login', redirect('admin', '/login')],
    ['public', '/pos', redirect('admin', '/pos')],
    ['public', '/caja', redirect('admin', '/caja')],
    ['public', '/citas', redirect('admin', '/citas')],
    ['public', '/clientes/123', redirect('admin', '/clientes/123')],
    ['public', '/auth/callback', redirect('admin', '/auth/callback')],
    ['public', '/sobres', redirect('admin', '/sobres')],
    ['public', '/reservar', redirect('booking', '/')],
    ['public', '/reservar/tok123', redirect('booking', '/reservar/tok123')],
    ['public', '/api/public/booking/config', OPEN],
    ['public', '/api/health', OPEN],
    ['public', '/api/auth/login', NOT_FOUND],
    ['public', '/api/sales', NOT_FOUND],
    ['public', '/api', NOT_FOUND],
    ['public', '/_next/static/chunk.js', OPEN],
    ['public', '/logo-dark.png', OPEN],
    ['public', '/icons/icon-192.png', OPEN],
    ['public', '/robots.txt', OPEN],
    ['public', '/sitemap.xml', OPEN],
    ['public', '/cualquier-cosa', NOT_FOUND],
    ['public', '/a/b', NOT_FOUND],
    // ── booking ──
    ['booking', '/', rewrite('/reservar', '')],
    ['booking', '/reservar', OPEN],
    ['booking', '/reservar/tok123', OPEN],
    ['booking', '/privacidad', OPEN],
    ['booking', '/deya', rewrite('/reservar', '?barbero=deya')],
    ['booking', '/Deya', rewrite('/reservar', '?barbero=Deya')],
    ['booking', '/deya/', rewrite('/reservar', '?barbero=deya')],
    ['booking', '/%C3%81ngel', rewrite('/reservar', '?barbero=%C3%81ngel')],
    ['booking', '/inicio', redirect('public', '/')],
    ['booking', '/login', redirect('admin', '/login')],
    ['booking', '/pos', redirect('admin', '/pos')],
    ['booking', '/citas', redirect('admin', '/citas')],
    ['booking', '/api/public/booking/days', OPEN],
    ['booking', '/api/health', OPEN],
    ['booking', '/api/auth/login', NOT_FOUND],
    ['booking', '/api/equipo', NOT_FOUND],
    ['booking', '/_next/static/x.css', OPEN],
    ['booking', '/robots.txt', OPEN],
    ['booking', '/favicon.ico', OPEN],
    ['booking', '/a/b', NOT_FOUND],
    ['booking', '/con.punto', NOT_FOUND],
    ['booking', '/%E0%A4%A', NOT_FOUND], // codificación rota
    // ── admin ──
    ['admin', '/', PASS],
    ['admin', '/login', PASS],
    ['admin', '/pos', PASS],
    ['admin', '/api/sales', PASS],
    ['admin', '/api/public/booking/config', PASS],
    ['admin', '/privacidad', PASS],
    ['admin', '/inicio', redirect('public', '/')],
    ['admin', '/reservar', redirect('booking', '/')],
    ['admin', '/reservar/tok123', redirect('booking', '/reservar/tok123')],
    ['admin', '/robots.txt', OPEN],
    ['admin', '/sitemap.xml', OPEN],
    // ── all ──
    ['all', '/', PASS],
    ['all', '/login', PASS],
    ['all', '/pos', PASS],
    ['all', '/api/sales', PASS],
    ['all', '/reservar', PASS],
    ['all', '/reservar/tok123', PASS],
    ['all', '/privacidad', PASS],
    ['all', '/inicio', OPEN],
    ['all', '/robots.txt', OPEN],
    ['all', '/sitemap.xml', OPEN],
    ['all', '/cualquier-cosa', PASS],
];

describe('routeForSite: sitio × ruta', () => {
    it.each(CASES)('%s %s', (site, pathname, expected) => {
        expect(routeForSite(site, pathname)).toEqual(expected);
    });

    it('las redirecciones conservan la consulta', () => {
        expect(routeForSite('public', '/login', '?next=%2Fpos')).toEqual(redirect('admin', '/login', '?next=%2Fpos'));
        expect(routeForSite('admin', '/reservar', '?barbero=deya')).toEqual(redirect('booking', '/', '?barbero=deya'));
    });

    it('la raíz de citas es /reservar y el enlace corto solo toma el nombre', () => {
        expect(routeForSite('booking', '/', '?utm=x')).toEqual(rewrite('/reservar', '?utm=x'));
        expect(routeForSite('booking', '/deya', '?utm=x')).toEqual(rewrite('/reservar', '?barbero=deya'));
    });

    it('el sitio "all" nunca redirige ni niega nada salvo servir /inicio sin sesión', () => {
        for (const p of ['/', '/login', '/pos', '/api/x', '/reservar', '/zzz']) expect(routeForSite('all', p).kind).toBe('pass');
    });
});

describe('barberSlug', () => {
    it('acepta un solo segmento de letras, números, guion', () => {
        expect(barberSlug('/deya')).toBe('deya');
        expect(barberSlug('/%C3%81ngel-2')).toBe('Ángel-2');
    });
    it('rechaza lo demás', () => {
        for (const p of ['/', '/a/b', '/con.punto', '/<script>', '/' + 'x'.repeat(41), '/%E0%A4%A']) expect(barberSlug(p)).toBeNull();
    });
});

describe('cobertura de rutas de app/', () => {
    it('cada carpeta de app/ está clasificada como interna o pública (una pantalla nueva no queda sin decidir)', () => {
        const appDir = path.resolve(__dirname, '..', 'app');
        const folders = readdirSync(appDir).filter((name) => statSync(path.join(appDir, name)).isDirectory() && !name.startsWith('_') && !name.startsWith('('));
        const known = new Set<string>([...INTERNAL_PREFIXES, ...PUBLIC_SEGMENTS]);
        expect(folders.filter((f) => !known.has(f))).toEqual([]);
    });
    it('las pantallas internas no se sirven en public ni booking', () => {
        for (const prefix of INTERNAL_PREFIXES) {
            expect(routeForSite('public', `/${prefix}`).kind).toBe('redirect');
            expect(routeForSite('booking', `/${prefix}/x`).kind).toBe('redirect');
        }
    });
});
