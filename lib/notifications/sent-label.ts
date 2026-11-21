import { BUSINESS_TIME_ZONE, formatDate, formatTime } from '@/lib/utils/dates';

/** Día 'YYYY-MM-DD' de un instante en la zona de la barbería. */
function dayKey(when: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(when);
}

/**
 * "Abrió WhatsApp: Dago, hoy 3:15 p. m." / "ayer 3:15 p. m." / "mar 17 nov, 3:15 p. m.".
 * El sistema solo sabe que alguien abrió el enlace de WhatsApp con el mensaje listo: no puede saber si la persona
 * lo mandó ni si llegó. Por eso NO dice «Enviado» (auditoría del 21 nov 2026: decía «Enviado por Dago» aun cuando
 * el navegador había bloqueado la ventana).
 */
export function sentLabel(summary: { at: string; by_name: string | null }, now: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): string {
    const when = new Date(summary.at);
    const today = dayKey(now, timeZone);
    const yesterday = dayKey(new Date(now.getTime() - 86_400_000), timeZone);
    const day = dayKey(when, timeZone);
    const time = formatTime(when, timeZone);
    const label = day === today ? `hoy ${time}` : day === yesterday ? `ayer ${time}` : `${formatDate(when, timeZone, { year: false })}, ${time}`;
    return summary.by_name ? `Abrió WhatsApp: ${summary.by_name}, ${label}` : `Se abrió WhatsApp, ${label}`;
}
