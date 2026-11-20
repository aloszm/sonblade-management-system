import type { MetadataRoute } from 'next';
import { siteOrigin, type Site, type SiteConfig } from '@/lib/hosts';

/**
 * robots.txt y sitemap.xml según el sitio (los usan app/robots.ts y app/sitemap.ts).
 * Solo `public` y `booking` se indexan. `admin` y `all` (práctica, vistas previas, localhost) no.
 */
export function robotsFor(site: Site, config?: SiteConfig): MetadataRoute.Robots {
    if (site !== 'public' && site !== 'booking') return { rules: { userAgent: '*', disallow: '/' } };
    const origin = siteOrigin(site, config);
    return {
        rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/reservar/'] },
        ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
    };
}

export function sitemapFor(site: Site, config?: SiteConfig): MetadataRoute.Sitemap {
    if (site !== 'public' && site !== 'booking') return [];
    const origin = siteOrigin(site, config);
    if (!origin) return [];
    // El aviso de privacidad vive en los dos; las reservas por enlace personal (/reservar/<token>) nunca se listan.
    return [
        { url: `${origin}/`, changeFrequency: 'weekly', priority: 1 },
        { url: `${origin}/privacidad`, changeFrequency: 'yearly', priority: 0.2 },
    ];
}
