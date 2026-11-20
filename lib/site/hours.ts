import { slotLabel } from '@/lib/booking/rules';
import { BUSINESS_TIME_ZONE } from '@/lib/utils/dates';
import { SITE_CONTENT, type DayHours } from '@/lib/site/content';
import type { BusinessHours, Catalog } from '@/lib/site/catalog';

/**
 * "¿Está abierto hoy?" para la página pública, con el reloj de la barbería (no el del servidor, que
 * en Vercel está en UTC, ni el del teléfono de quien visita).
 */

export const DAY_NAMES_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Día de la semana (0 = domingo) y minutos desde la medianoche en la zona de la barbería. */
export function businessClock(now: Date, timeZone: string = BUSINESS_TIME_ZONE): { day: number; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return { day: WEEKDAY_INDEX[get('weekday')] ?? 0, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};

/** "a las 12:30 p. m." pero "a la 1:00 p. m.". */
export function atTime(hhmm: string): string {
    const h12 = Number(hhmm.split(':')[0]) % 12;
    return `${h12 === 1 ? 'a la' : 'a las'} ${slotLabel(hhmm)}`;
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('es-MX') + s.slice(1);

/** "Domingo", "Domingo y lunes", "Martes a sábado", "Lunes, miércoles y viernes". */
export function daysLabel(days: readonly number[]): string {
    const names = days.map((d) => DAY_NAMES_ES[d]);
    const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    if (names.length >= 3 && contiguous) return capitalize(`${names[0]} a ${names[names.length - 1]}`);
    if (names.length === 1) return capitalize(names[0]);
    return capitalize(`${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`);
}

/**
 * Horario de la base (un registro por día: "0" = domingo) agrupado en bloques de días con la misma hora,
 * en orden de la semana. Los días sin registro quedan cerrados.
 */
export function blocksFromBusinessHours(hours: BusinessHours): DayHours[] {
    const blocks: DayHours[] = [];
    for (let day = 0; day < 7; day++) {
        const h = hours[String(day)];
        if (!h || !/^\d{2}:\d{2}$/.test(h.open) || !/^\d{2}:\d{2}$/.test(h.close)) continue;
        const same = blocks.find((b) => b.open === h.open && b.close === h.close);
        if (same) (same.days as number[]).push(day);
        else blocks.push({ label: '', days: [day], open: h.open, close: h.close });
    }
    return blocks.map((b) => ({ ...b, label: daysLabel(b.days) }));
}

export function hoursForDay(day: number, hours: readonly DayHours[] = SITE_CONTENT.hours): DayHours | null {
    return hours.find((h) => h.days.includes(day)) ?? null;
}

export type OpenState = 'before' | 'open' | 'after' | 'closed';

export interface TodayStatus {
    /** Día de hoy en la barbería (0 = domingo). */
    day: number;
    /** Bloque de horario de hoy (null si hoy no se abre). */
    block: DayHours | null;
    state: OpenState;
    /** Frase corta: "Abierto ahora", "Aún no abrimos"… */
    label: string;
    /** Frase completa: "Abierto hoy de 12:30 p. m. a 8:00 p. m." */
    text: string;
}

/** Próxima apertura después de hoy: "mañana" o "el martes", con su hora. */
function nextOpening(day: number, hours: readonly DayHours[]): string | null {
    for (let i = 1; i <= 7; i++) {
        const block = hoursForDay((day + i) % 7, hours);
        if (block) return `${i === 1 ? 'Mañana' : `El ${DAY_NAMES_ES[(day + i) % 7]}`} abrimos ${atTime(block.open)}`;
    }
    return null;
}

/**
 * Horario de la página: el de la base (catalog.hours, en su zona catalog.timezone) cuando llega; si no
 * (base caída o sin horario cargado), el de lib/site/content.ts. Devuelve los bloques para la tabla y el
 * estado de hoy para la franja; el bloque de hoy coincide con hoursToday() de lib/site/catalog.ts.
 */
export function pageHours(catalog: Catalog, now: Date): { blocks: readonly DayHours[]; status: TodayStatus; fromDatabase: boolean } {
    const fromDb = catalog.state === 'on' && catalog.hours ? blocksFromBusinessHours(catalog.hours) : [];
    const fromDatabase = fromDb.length > 0;
    const blocks = fromDatabase ? fromDb : SITE_CONTENT.hours;
    const timeZone = (catalog.state === 'on' && catalog.timezone) || BUSINESS_TIME_ZONE;
    return { blocks, status: todayStatus(now, blocks, timeZone), fromDatabase };
}

export function todayStatus(now: Date, hours: readonly DayHours[] = SITE_CONTENT.hours, timeZone: string = BUSINESS_TIME_ZONE): TodayStatus {
    const { day, minutes } = businessClock(now, timeZone);
    const block = hoursForDay(day, hours);
    if (!block) {
        const next = nextOpening(day, hours);
        return { day, block, state: 'closed', label: 'Hoy no abrimos', text: next ? `Hoy no abrimos. ${next}` : 'Hoy no abrimos.' };
    }
    const range = `de ${slotLabel(block.open)} a ${slotLabel(block.close)}`;
    if (minutes < toMinutes(block.open)) {
        return { day, block, state: 'before', label: 'Aún no abrimos', text: `Hoy abrimos ${atTime(block.open)} y cerramos ${atTime(block.close)}` };
    }
    if (minutes < toMinutes(block.close)) {
        // slotLabel ya termina en punto ("8:00 p. m."): no se agrega otro.
        return { day, block, state: 'open', label: 'Abierto ahora', text: `Abierto hoy ${range}` };
    }
    const next = nextOpening(day, hours);
    return { day, block, state: 'after', label: 'Ya cerramos por hoy', text: next ? `Hoy ya cerramos. ${next}` : 'Hoy ya cerramos.' };
}
