import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSiteConfig, cleanDomain, normalizeHost, siteConfigFromEnv, siteFromHost, siteOrigin, siteUrl } from './hosts';

const cfg = buildSiteConfig({ domain: 'barbergallo420.site' });

afterEach(() => vi.unstubAllEnvs());

describe('cleanDomain', () => {
    it('limpia esquema, www, puerto, ruta y mayúsculas', () => {
        expect(cleanDomain('https://WWW.BarberGallo420.site:443/inicio')).toBe('barbergallo420.site');
        expect(cleanDomain(' barbergallo420.site. ')).toBe('barbergallo420.site');
    });
    it('rechaza vacío, sin punto o con caracteres raros', () => {
        for (const bad of [undefined, null, '', '  ', 'localhost', 'a b.com', 'bad_domain.com', '-x.com']) expect(cleanDomain(bad)).toBeNull();
    });
});

describe('siteFromHost', () => {
    it.each([
        ['barbergallo420.site', 'public'],
        ['www.barbergallo420.site', 'public'],
        ['BARBERGALLO420.SITE', 'public'],
        ['barbergallo420.site:443', 'public'],
        ['citas.barbergallo420.site', 'booking'],
        ['admin.barbergallo420.site', 'admin'],
        ['admin.barbergallo420.site.', 'admin'],
        ['practica.barbergallo420.site', 'all'],
        ['sonblade-abc123.vercel.app', 'all'],
        ['localhost:3000', 'all'],
        ['127.0.0.1:3400', 'all'],
        ['otro.barbergallo420.site', 'all'],
        ['evil-barbergallo420.site', 'all'],
        ['barbergallo420.site.evil.com', 'all'],
        ['citas.www.barbergallo420.site', 'all'],
        ['', 'all'],
        [null, 'all'],
    ] as const)('%s → %s', (host, site) => {
        expect(siteFromHost(host, cfg)).toBe(site);
    });

    it('sin dominio configurado todo es "all" (nada cambia en desarrollo, práctica ni vistas previas)', () => {
        const none = buildSiteConfig({});
        for (const h of ['barbergallo420.site', 'citas.barbergallo420.site', 'admin.barbergallo420.site', 'localhost:3000']) expect(siteFromHost(h, none)).toBe('all');
    });

    it('los subdominios se pueden cambiar y uno inválido vuelve al valor por omisión', () => {
        const custom = buildSiteConfig({ domain: 'ejemplo.mx', booking: 'reservas', admin: 'Equipo' });
        expect(siteFromHost('reservas.ejemplo.mx', custom)).toBe('booking');
        expect(siteFromHost('equipo.ejemplo.mx', custom)).toBe('admin');
        expect(siteFromHost('citas.ejemplo.mx', custom)).toBe('all');
        expect(buildSiteConfig({ domain: 'ejemplo.mx', booking: 'no válido!' }).bookingSubdomain).toBe('citas');
    });
});

describe('variables de entorno', () => {
    it('sin NEXT_PUBLIC_SITE_DOMAIN: all', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_DOMAIN', '');
        expect(siteConfigFromEnv().domain).toBeNull();
        expect(siteFromHost('admin.barbergallo420.site')).toBe('all');
    });
    it('con NEXT_PUBLIC_SITE_DOMAIN se leen los tres sitios', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_DOMAIN', 'barbergallo420.site');
        expect(siteFromHost('barbergallo420.site')).toBe('public');
        expect(siteFromHost('citas.barbergallo420.site')).toBe('booking');
        expect(siteFromHost('admin.barbergallo420.site')).toBe('admin');
    });
});

describe('normalizeHost / siteOrigin / siteUrl', () => {
    it('normaliza el host', () => {
        expect(normalizeHost('Citas.Barbergallo420.site:8080')).toBe('citas.barbergallo420.site');
        expect(normalizeHost('a.com, b.com')).toBe('a.com');
    });
    it('arma los orígenes https', () => {
        expect(siteOrigin('public', cfg)).toBe('https://barbergallo420.site');
        expect(siteOrigin('booking', cfg)).toBe('https://citas.barbergallo420.site');
        expect(siteOrigin('admin', cfg)).toBe('https://admin.barbergallo420.site');
        expect(siteOrigin('admin', buildSiteConfig({}))).toBeNull();
    });
    it('siteUrl cae a la ruta local sin dominio', () => {
        expect(siteUrl('booking', '/ana', '/reservar?barbero=ana', cfg)).toBe('https://citas.barbergallo420.site/ana');
        expect(siteUrl('booking', '/ana', '/reservar?barbero=ana', buildSiteConfig({}))).toBe('/reservar?barbero=ana');
    });
});
