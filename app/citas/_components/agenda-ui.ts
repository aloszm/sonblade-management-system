import type { AppointmentStatus } from '@/types';
import { formatMoney } from '@/lib/utils/money';

// Un color discreto por barbero para distinguirlos en el calendario.
// Al menos 3:1 sobre la superficie en modo claro y oscuro (WCAG 1.4.11). El color solo se usa en barras, puntos,
// anillos y como TINTE DE FONDO (tintOf): el texto de las tarjetas va siempre en --bos-text / --bos-muted, nunca de color.
// El contraste del texto sobre cada tinte se mide en agenda-ui.test.ts.
export const BARBER_COLORS = ['#A97A2F', '#4F86E0', '#2A9680', '#CC5F7C', '#7F6FD6', '#CC6A30'];
export const NO_BARBER_COLOR = 'var(--bos-muted)';
/** Alto de un bloque de 30 minutos en la vista de día. Con 48 px una cita de 30 min muestra dos líneas sin recortarse. */
export const SLOT_PX = 48;
/** Alto de un bloque de 30 minutos en la cuadrícula semanal (más compacto: caben 7 días y 14 horas). */
export const WEEK_SLOT_PX = 40;

/** Porcentaje del color del barbero que se mezcla con la superficie para el fondo de una tarjeta (y en hover). */
export const TINT_PCT = 14;
export const TINT_HOVER_PCT = 22;
/** Fondo tintado de una tarjeta: el color del barbero diluido en la superficie. El texto encima usa los tokens de texto. */
export const tintOf = (color: string, pct: number = TINT_PCT) => `color-mix(in srgb, ${color} ${pct}%, var(--bos-surface))`;
/** Fondo sutil para lo que está cerrado o no disponible: el color del texto muy diluido (no es texto, es un fondo). */
export const SUBTLE_BG = 'color-mix(in srgb, var(--bos-text) 5%, transparent)';
export const SUBTLE_BG_STRONG = 'color-mix(in srgb, var(--bos-text) 8%, var(--bos-surface))';

export const WEEK_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Letra del avatar de un nombre. */
export const initialOf = (name: string) => (name.trim()[0] ?? '?').toLocaleUpperCase('es-MX');

export const STATUS_STYLE: Record<AppointmentStatus, string> = {
    scheduled: 'bg-bos-raised text-bos-text',
    confirmed: 'bg-bos-accent-soft text-bos-accent-text',
    checked_in: 'bg-bos-success-soft text-bos-success',
    in_progress: 'bg-bos-success-soft text-bos-success',
    completed: 'bg-bos-success-soft text-bos-success',
    cancelled: 'bg-bos-danger-soft text-bos-danger',
    no_show: 'bg-bos-raised text-bos-muted',
};

/** Color del punto de estado de una tarjeta (no es texto: es un indicador gráfico). */
export const STATUS_DOT: Record<AppointmentStatus, string> = {
    scheduled: 'border-2 border-bos-control bg-transparent',
    confirmed: 'bg-bos-accent',
    checked_in: 'bg-bos-success',
    in_progress: 'bg-bos-success',
    completed: 'bg-bos-success',
    cancelled: 'bg-bos-danger',
    no_show: 'bg-bos-muted',
};

export const money = (n: number) => formatMoney(n);

/** "Lunes 16 de noviembre": el título legible de un día 'YYYY-MM-DD'. */
export function longDayTitle(key: string): string {
    const d = new Date(`${key}T12:00:00`);
    const weekday = d.toLocaleDateString('es-MX', { weekday: 'long' });
    const month = d.toLocaleDateString('es-MX', { month: 'long' });
    return `${weekday.charAt(0).toLocaleUpperCase('es-MX')}${weekday.slice(1)} ${d.getDate()} de ${month}`;
}
