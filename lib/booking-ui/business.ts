// Datos de respaldo de la barbería por si la configuración pública no responde.
export const BUSINESS_FALLBACK = {
    name: 'Gallo 4:20',
    address: 'Efeso 2, Lomas Estrella 2da Sección, Iztapalapa, 09890, CDMX',
    phone: '55 3309 8072',
} as const;

/** '55 3309 8072' a '5533098072' para el enlace tel:. */
export const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export const mapsUrl = (address: string) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
