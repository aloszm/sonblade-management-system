/**
 * Sitios de BarberOS por dominio. Una sola aplicación sirve cuatro "sitios" según el encabezado Host:
 *  - public:  barbergallo420.site y www.   → página pública de inicio
 *  - booking: citas.barbergallo420.site    → reservas en línea (y, más adelante, la cuenta del cliente)
 *  - admin:   admin.barbergallo420.site    → el sistema interno del equipo
 *  - all:     cualquier otro host (practica., *.vercel.app, localhost) y TODO si no hay dominio configurado:
 *             "todo junto", como antes; la raíz es el Panel con sesión.
 *
 * Los nombres salen de variables públicas (se incrustan al compilar). Sin NEXT_PUBLIC_SITE_DOMAIN el
 * resultado es siempre `all`, así que desarrollo, práctica y vistas previas no cambian.
 * Este módulo es puro: solo `siteConfigFromEnv` lee process.env.
 */
export type Site = 'public' | 'booking' | 'admin' | 'all';
export type NamedSite = Exclude<Site, 'all'>;

export interface SiteConfig {
    /** Dominio base sin "www." ni puerto (p. ej. "barbergallo420.site"); null = sin separación por dominio. */
    domain: string | null;
    bookingSubdomain: string;
    adminSubdomain: string;
}

export const DEFAULT_BOOKING_SUBDOMAIN = 'citas';
export const DEFAULT_ADMIN_SUBDOMAIN = 'admin';

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Limpia un dominio escrito a mano: sin esquema, ruta, puerto, "www." ni mayúsculas. Null si no es válido. */
export function cleanDomain(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const value = raw.trim().toLowerCase()
        .replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
    if (!value || !value.includes('.')) return null;
    return value.split('.').every((label) => LABEL_RE.test(label)) ? value : null;
}

function cleanLabel(raw: string | null | undefined, fallback: string): string {
    const value = raw?.trim().toLowerCase() ?? '';
    return LABEL_RE.test(value) ? value : fallback;
}

export function buildSiteConfig(env: { domain?: string | null; booking?: string | null; admin?: string | null }): SiteConfig {
    return {
        domain: cleanDomain(env.domain),
        bookingSubdomain: cleanLabel(env.booking, DEFAULT_BOOKING_SUBDOMAIN),
        adminSubdomain: cleanLabel(env.admin, DEFAULT_ADMIN_SUBDOMAIN),
    };
}

/** Configuración desde las variables de entorno (referencias literales: Next las incrusta al compilar). */
export function siteConfigFromEnv(): SiteConfig {
    return buildSiteConfig({
        domain: process.env.NEXT_PUBLIC_SITE_DOMAIN,
        booking: process.env.NEXT_PUBLIC_BOOKING_SUBDOMAIN,
        admin: process.env.NEXT_PUBLIC_ADMIN_SUBDOMAIN,
    });
}

/** Host sin puerto, en minúsculas y sin punto final. Si trae varios (lista), el primero. */
export function normalizeHost(host: string | null | undefined): string {
    if (!host) return '';
    return host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

/** Qué sitio es este host. Cualquier host que no sea del dominio configurado es `all`. */
export function siteFromHost(host: string | null | undefined, config: SiteConfig = siteConfigFromEnv()): Site {
    const { domain } = config;
    if (!domain) return 'all';
    const h = normalizeHost(host);
    if (h === domain || h === `www.${domain}`) return 'public';
    if (h === `${config.bookingSubdomain}.${domain}`) return 'booking';
    if (h === `${config.adminSubdomain}.${domain}`) return 'admin';
    return 'all';
}

/** Origen (https) de un sitio, o null si no hay dominio configurado. */
export function siteOrigin(site: NamedSite, config: SiteConfig = siteConfigFromEnv()): string | null {
    const { domain } = config;
    if (!domain) return null;
    if (site === 'public') return `https://${domain}`;
    return `https://${site === 'booking' ? config.bookingSubdomain : config.adminSubdomain}.${domain}`;
}

/**
 * Dirección de una página de otro sitio: con dominio configurado, la URL completa en su subdominio;
 * sin él (modo "todo junto") la ruta equivalente en este mismo host (`fallbackPath`).
 */
export function siteUrl(site: NamedSite, path: string, fallbackPath: string, config: SiteConfig = siteConfigFromEnv()): string {
    const origin = siteOrigin(site, config);
    return origin ? `${origin}${path}` : fallbackPath;
}
