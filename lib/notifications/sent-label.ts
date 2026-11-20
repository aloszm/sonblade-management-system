import { BUSINESS_TIME_ZONE, formatDate, formatTime } from '@/lib/utils/dates';

/** Día 'YYYY-MM-DD' de un instante en la zona de la barbería. */
function dayKey(when: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(when);
}

/**
 * "Enviado por Dago, hoy 3:15 p. m." / "ayer 3:15 p. m." / "mar 17 nov, 3:15 p. m.".
 * "Enviado" quiere decir que se abrió el enlace de WhatsApp con el mensaje listo: el sistema no puede saber si
 * la persona lo mandó ni si llegó (la pantalla lo explica junto a los botones).
 */
export function sentLabel(summary: { at: string; by_name: string | null }, now: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): string {
    const when = new Date(summary.at);
    const today = dayKey(now, timeZone);
    const yesterday = dayKey(new Date(now.getTime() - 86_400_000), timeZone);
    const day = dayKey(when, timeZone);
    const time = formatTime(when, timeZone);
    const label = day === today ? `hoy ${time}` : day === yesterday ? `ayer ${time}` : `${formatDate(when, timeZone, { year: false })}, ${time}`;
    return `Enviado${summary.by_name ? ` por ${summary.by_name}` : ''}, ${label}`;
}
