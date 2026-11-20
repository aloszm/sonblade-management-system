import { BUSINESS_FALLBACK } from '@/lib/booking-ui/business';
import { CLIENT_NAME } from '@/lib/brand';

/**
 * Contenido de la página pública, en un solo lugar. Los campos OPCIONALES (redes, fotos) vacíos no se
 * dibujan: para publicarlos basta llenarlos aquí. No inventar datos: si no existe, se deja vacío.
 */
export interface DayHours {
    /** Texto para mostrar: "Domingo y lunes". */
    label: string;
    /** Días de la semana (0 = domingo) para los datos estructurados. */
    days: readonly number[];
    open: string;
    close: string;
}

export interface SitePhoto { src: string; alt: string }

export const SITE_CONTENT = {
    name: CLIENT_NAME,
    fullName: `${CLIENT_NAME} · Barber Shop`,
    foundedYear: 2000,
    /** Mismo domicilio y teléfono que usa la reserva en línea (lib/booking-ui/business.ts). */
    address: BUSINESS_FALLBACK.address,
    street: 'Efeso 2, Lomas Estrella 2da Sección',
    locality: 'Iztapalapa',
    region: 'CDMX',
    postalCode: '09890',
    phone: BUSINESS_FALLBACK.phone,
    /** Mensaje que se prellena al agendar por WhatsApp. */
    whatsappMessage: 'Hola, quiero agendar una cita en Gallo 4:20.',
    /**
     * Horario de atención del local. Es la misma información del aviso de privacidad (sección 1) y de la
     * agenda; la reserva en línea no lo expone, así que esta constante es la única fuente de la página.
     */
    hours: [
        { label: 'Domingo y lunes', days: [0, 1], open: '10:00', close: '19:00' },
        { label: 'Martes a sábado', days: [2, 3, 4, 5, 6], open: '12:30', close: '20:00' },
    ] as readonly DayHours[],

    // ── Opcionales: vacíos = no se muestran ──────────────────────────────────────────────────────────
    /** Direcciones completas (https://…) de las redes de la barbería. */
    instagramUrl: '',
    facebookUrl: '',
    tiktokUrl: '',
    /** Enlace propio de Google Maps (si existe la ficha del negocio); si está vacío se arma con la dirección. */
    mapsUrl: '',
    /** Fotos del local y del trabajo: { src: '/fotos/local-1.jpg', alt: 'Descripción' }. Sin fotos, no hay galería. */
    photos: [] as readonly SitePhoto[],
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function dayNames(days: readonly number[]): string[] {
    return days.map((d) => DAY_NAMES[d]);
}

/** Redes configuradas (solo las que tienen dirección). */
export function socialLinks(content: Pick<typeof SITE_CONTENT, 'instagramUrl' | 'facebookUrl' | 'tiktokUrl'> = SITE_CONTENT): Array<{ label: string; href: string }> {
    return [
        { label: 'Instagram', href: content.instagramUrl },
        { label: 'Facebook', href: content.facebookUrl },
        { label: 'TikTok', href: content.tiktokUrl },
    ].filter((l) => /^https:\/\//.test(l.href));
}
