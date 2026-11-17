import { formatDayLong, parseDay } from '@/lib/ui/date-picker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { BookingService } from './types';

/** 30 -> '30 min', 90 -> '1 h 30 min', 120 -> '2 h'. */
export function formatDuration(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60), r = m % 60;
    if (h === 0) return `${r} min`;
    return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** 150 -> '$150', 150.5 -> '$150.50'; con precio variable, 'Precio según diseño'. */
export function formatPrice(price: number, variable = false): string {
    if (variable) return 'Precio según diseño';
    const whole = Number.isInteger(price);
    return `$${price.toLocaleString('es-MX', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export interface ServiceGroup { category: string; label: string; services: BookingService[] }

/** Agrupa por categoría conservando el orden en que llegan (la API ya los ordena). */
export function groupByCategory(services: BookingService[]): ServiceGroup[] {
    const groups: ServiceGroup[] = [];
    for (const s of services) {
        let g = groups.find((x) => x.category === s.category);
        if (!g) { g = { category: s.category, label: s.category_label, services: [] }; groups.push(g); }
        g.services.push(s);
    }
    return groups;
}

/** 'lunes 16 de noviembre' (con año si no es el actual). El día es texto, no se convierte de zona. */
export function formatDayNice(key: string, thisYear?: string): string {
    const d = parseDay(key);
    if (!d) return key;
    const sameYear = !thisYear || key.startsWith(thisYear);
    const text = format(d, sameYear ? "EEEE d 'de' MMMM" : "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    return text.charAt(0).toLocaleUpperCase('es-MX') + text.slice(1);
}
export { formatDayLong };

/** Un instante ISO (como cancel_until) escrito en hora de la barbería, no del teléfono. */
export function formatInstantInBusiness(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('weekday')} ${get('day')} de ${get('month')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').replace(/\u202f|\u00a0/g, ' ').replace(/^([ap])\.?\s?m\.?$/i, '$1. m.')}`;
}

/** Nombre y primera letra para el avatar. */
export const initialOf = (name: string) => (name.trim()[0] ?? '?').toLocaleUpperCase('es-MX');

/** '5533098072' -> '55 3309 8072'. */
export function formatPhone10(digits: string): string {
    return digits.length === 10 ? `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}` : digits;
}
