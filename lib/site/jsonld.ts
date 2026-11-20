import { SITE_CONTENT, dayNames, socialLinks } from '@/lib/site/content';
import { directionsUrl } from '@/lib/site/links';
import { normalizePhone } from '@/lib/booking/rules';

/**
 * Datos estructurados (schema.org HairSalon, subtipo de LocalBusiness) de la página pública.
 * Solo lleva lo que existe: nombre, dirección, teléfono, horario, fundación, mapa y, si hay reservas en
 * línea, la acción de reservar. Sin reseñas, calificaciones ni precios inventados.
 */
export function buildLocalBusinessJsonLd(opts: { origin: string | null; bookingUrl: string | null }): Record<string, unknown> {
    const { origin, bookingUrl } = opts;
    const phone = normalizePhone(SITE_CONTENT.phone);
    const data: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'HairSalon',
        name: SITE_CONTENT.fullName,
        ...(origin ? { url: origin, '@id': `${origin}/#negocio`, logo: `${origin}/logo-light.png`, image: `${origin}/logo-light.png` } : {}),
        ...(phone ? { telephone: `+52${phone}` } : {}),
        foundingDate: String(SITE_CONTENT.foundedYear),
        address: {
            '@type': 'PostalAddress',
            streetAddress: SITE_CONTENT.street,
            addressLocality: SITE_CONTENT.locality,
            addressRegion: SITE_CONTENT.region,
            postalCode: SITE_CONTENT.postalCode,
            addressCountry: 'MX',
        },
        hasMap: directionsUrl(),
        openingHoursSpecification: SITE_CONTENT.hours.map((h) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: dayNames(h.days),
            opens: h.open,
            closes: h.close,
        })),
    };
    const sameAs = socialLinks().map((l) => l.href);
    if (sameAs.length) data.sameAs = sameAs;
    if (bookingUrl) {
        data.potentialAction = {
            '@type': 'ReserveAction',
            name: 'Reservar cita',
            target: { '@type': 'EntryPoint', urlTemplate: bookingUrl, actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'] },
        };
    }
    return data;
}

/** JSON seguro para incrustar en <script>: escapa "<" para que nada cierre la etiqueta. */
export function jsonLdScript(data: Record<string, unknown>): string {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}
