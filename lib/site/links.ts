import { barberSlugOf } from '@/lib/booking-ui/barber-slug';
import { mapsUrl as mapsSearchUrl } from '@/lib/booking-ui/business';
import { normalizePhone } from '@/lib/booking/rules';
import { siteUrl, type Site, type SiteConfig } from '@/lib/hosts';
import { SITE_CONTENT } from '@/lib/site/content';

/** Enlace de WhatsApp (México) con el mensaje prellenado; null si el teléfono no es de 10 dígitos. */
export function whatsappUrl(phone: string = SITE_CONTENT.phone, message: string = SITE_CONTENT.whatsappMessage): string | null {
    const digits = normalizePhone(phone);
    return digits ? `https://wa.me/52${digits}?text=${encodeURIComponent(message)}` : null;
}

export const telHref = (phone: string = SITE_CONTENT.phone) => `tel:+52${normalizePhone(phone) ?? phone.replace(/\D/g, '')}`;

/** "Cómo llegar": enlace de Google Maps (propio si hay, o búsqueda con la dirección codificada). Sin iframes. */
export function directionsUrl(): string {
    return SITE_CONTENT.mapsUrl || mapsSearchUrl(SITE_CONTENT.address);
}

export interface PageLinks {
    booking: string;
    barber: (name: string) => string;
    privacy: string;
    team: string;
}

/**
 * Direcciones de la página pública. En el sitio `public` apuntan a los subdominios (citas., admin.); en
 * `all` (práctica, vistas previas, localhost) a las rutas de este mismo host.
 */
export function pageLinks(site: Site, config?: SiteConfig): PageLinks {
    if (site !== 'public') {
        return { booking: '/reservar', barber: (name) => `/reservar?barbero=${encodeURIComponent(barberSlugOf(name))}`, privacy: '/privacidad', team: '/login' };
    }
    return {
        booking: siteUrl('booking', '/', '/reservar', config),
        barber: (name) => siteUrl('booking', `/${encodeURIComponent(barberSlugOf(name))}`, `/reservar?barbero=${encodeURIComponent(barberSlugOf(name))}`, config),
        privacy: '/privacidad',
        team: siteUrl('admin', '/login', '/login', config),
    };
}
