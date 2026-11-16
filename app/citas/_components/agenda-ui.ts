import type { AppointmentStatus } from '@/types';

// Un color discreto por barbero para distinguirlos en el calendario.
// Al menos 3:1 sobre la superficie en modo claro y oscuro (WCAG 1.4.11). Solo se usa en bordes y puntos:
// el texto de las tarjetas va siempre en --bos-text / --bos-muted sobre --bos-raised (contraste AA).
export const BARBER_COLORS = ['#A97A2F', '#4F86E0', '#2A9680', '#CC5F7C', '#7F6FD6', '#CC6A30'];
export const NO_BARBER_COLOR = 'var(--bos-muted)';
/** Alto de un bloque de 30 minutos. Con 48 px una cita de 30 min muestra dos líneas (cliente y hora) sin recortarse. */
export const SLOT_PX = 48;
// Rayado para los horarios bloqueados por una ausencia o fuera del horario.
export const HATCH = 'repeating-linear-gradient(135deg, transparent 0 7px, var(--bos-border) 7px 9px)';
export const WEEK_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const STATUS_STYLE: Record<AppointmentStatus, string> = {
    scheduled: 'bg-bos-raised text-bos-text',
    confirmed: 'bg-bos-accent-soft text-bos-accent-text',
    checked_in: 'bg-bos-success-soft text-bos-success',
    in_progress: 'bg-bos-success-soft text-bos-success',
    completed: 'bg-bos-success-soft text-bos-success',
    cancelled: 'bg-bos-raised text-bos-danger',
    no_show: 'bg-bos-raised text-bos-muted',
};

export const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
