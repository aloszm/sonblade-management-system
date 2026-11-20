import { describe, expect, it, vi } from 'vitest';
import { buildSiteConfig } from '@/lib/hosts';
import { barberSlugOf, findBarberBySlug } from '@/lib/booking-ui/barber-slug';
import { loadCatalog } from './catalog';
import { SITE_CONTENT, dayNames, socialLinks } from './content';
import { buildLocalBusinessJsonLd, jsonLdScript } from './jsonld';
import { directionsUrl, pageLinks, telHref, whatsappUrl } from './links';
import { robotsFor, sitemapFor } from './seo';

const cfg = buildSiteConfig({ domain: 'barbergallo420.site' });

describe('loadCatalog', () => {
    it('encendida: servicios y barberos', async () => {
        const services = [{ id: 's1', name: 'Corte' }] as never[];
        const barbers = [{ id: 'b1', name: 'Deya' }];
        expect(await loadCatalog(async () => ({ enabled: true, services, barbers }))).toEqual({ state: 'on', services, barbers });
    });
    it('apagada: estado off', async () => {
        expect(await loadCatalog(async () => ({ enabled: false }))).toEqual({ state: 'off' });
    });
    it('base caída: estado error, sin lanzar', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await loadCatalog(async () => { throw new Error('booking rpc: down'); })).toEqual({ state: 'error' });
        spy.mockRestore();
    });
});

describe('enlaces', () => {
    it('WhatsApp con el teléfono del negocio y el mensaje prellenado', () => {
        const url = whatsappUrl()!;
        expect(url.startsWith('https://wa.me/525533098072?text=')).toBe(true);
        expect(decodeURIComponent(url.split('text=')[1])).toBe(SITE_CONTENT.whatsappMessage);
        expect(whatsappUrl('123')).toBeNull();
    });
    it('teléfono y mapa (enlace de Google Maps con la dirección codificada, sin iframe)', () => {
        expect(telHref()).toBe('tel:+525533098072');
        expect(directionsUrl()).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Efeso 2, Lomas Estrella 2da Sección, Iztapalapa, 09890, CDMX')}`);
    });
    it('en el sitio público apuntan a los subdominios; en "todo junto", a rutas locales', () => {
        const pub = pageLinks('public', cfg);
        expect(pub.booking).toBe('https://citas.barbergallo420.site/');
        expect(pub.barber('Ángel Pérez')).toBe('https://citas.barbergallo420.site/angel-perez');
        expect(pub.team).toBe('https://admin.barbergallo420.site/login');
        const all = pageLinks('all', cfg);
        expect(all.booking).toBe('/reservar');
        expect(all.barber('Deya')).toBe('/reservar?barbero=deya');
        expect(all.team).toBe('/login');
    });
});

describe('enlace corto por barbero', () => {
    it('compara sin mayúsculas ni acentos', () => {
        const barbers = [{ id: '1', name: 'Deya' }, { id: '2', name: 'Ángel' }];
        expect(findBarberBySlug(barbers, 'DEYA')?.id).toBe('1');
        expect(findBarberBySlug(barbers, 'angel')?.id).toBe('2');
        expect(findBarberBySlug(barbers, 'Ángel')?.id).toBe('2');
        expect(findBarberBySlug(barbers, 'nadie')).toBeUndefined();
        expect(findBarberBySlug(barbers, '')).toBeUndefined();
        expect(findBarberBySlug(barbers, undefined)).toBeUndefined();
        expect(barberSlugOf('  José  Luis ')).toBe('jose-luis');
    });
});

describe('contenido opcional', () => {
    it('sin redes configuradas no hay enlaces', () => {
        expect(socialLinks()).toEqual([]);
        expect(socialLinks({ instagramUrl: 'https://instagram.com/x', facebookUrl: 'javascript:alert(1)', tiktokUrl: '' })).toEqual([{ label: 'Instagram', href: 'https://instagram.com/x' }]);
    });
    it('días de la semana de schema.org', () => {
        expect(dayNames([0, 1])).toEqual(['Sunday', 'Monday']);
    });
});

describe('JSON-LD', () => {
    it('HairSalon con nombre, dirección, teléfono, horario y acción de reservar', () => {
        const data = buildLocalBusinessJsonLd({ origin: 'https://barbergallo420.site', bookingUrl: 'https://citas.barbergallo420.site/' }) as Record<string, unknown> & { potentialAction: { target: { urlTemplate: string } } };
        expect(data['@type']).toBe('HairSalon');
        expect(data.name).toBe('Gallo 4:20 · Barber Shop');
        expect(data.telephone).toBe('+525533098072');
        expect(data.address).toMatchObject({ streetAddress: 'Efeso 2, Lomas Estrella 2da Sección', addressLocality: 'Iztapalapa', postalCode: '09890', addressCountry: 'MX' });
        expect(data.openingHoursSpecification).toEqual([
            { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Sunday', 'Monday'], opens: '10:00', closes: '19:00' },
            { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '12:30', closes: '20:00' },
        ]);
        expect(data.potentialAction.target.urlTemplate).toBe('https://citas.barbergallo420.site/');
        expect(data.url).toBe('https://barbergallo420.site');
        expect(data).not.toHaveProperty('aggregateRating');
        expect(data).not.toHaveProperty('sameAs');
    });
    it('sin reservas en línea no hay acción de reservar', () => {
        expect(buildLocalBusinessJsonLd({ origin: null, bookingUrl: null })).not.toHaveProperty('potentialAction');
    });
    it('escapa "<" para no cerrar la etiqueta script', () => {
        expect(jsonLdScript({ a: '</script><b>' })).not.toContain('<');
    });
});

describe('robots y sitemap por sitio', () => {
    it('admin y todo junto: nada se indexa', () => {
        for (const site of ['admin', 'all'] as const) {
            expect(robotsFor(site, cfg)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
            expect(sitemapFor(site, cfg)).toEqual([]);
        }
    });
    it('público y citas: indexables, con su propio sitemap y sin rutas privadas', () => {
        const pub = robotsFor('public', cfg);
        expect(pub).toMatchObject({ rules: { allow: '/' }, sitemap: 'https://barbergallo420.site/sitemap.xml' });
        expect(JSON.stringify(pub)).toContain('/api/');
        expect(robotsFor('booking', cfg)).toMatchObject({ sitemap: 'https://citas.barbergallo420.site/sitemap.xml' });
        expect(sitemapFor('public', cfg).map((e) => e.url)).toEqual(['https://barbergallo420.site/', 'https://barbergallo420.site/privacidad']);
        expect(sitemapFor('booking', cfg).map((e) => e.url)).toContain('https://citas.barbergallo420.site/');
    });
});
