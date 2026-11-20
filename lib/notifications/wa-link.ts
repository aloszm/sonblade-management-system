import { normalizeBookingPhone } from '@/lib/booking/phone';
import { BUSINESS_TIME_ZONE, formatDate, formatTime } from '@/lib/utils/dates';

/**
 * D3 — WhatsApp de un clic (sin API de Meta, sin costo). Funciones puras: arman el texto y el enlace
 * https://wa.me/52XXXXXXXXXX?text=... que recepción abre y envía con su propio WhatsApp.
 * El sistema NO envía nada ni sabe si el mensaje llegó; solo registra que se abrió el enlace.
 *
 * El enlace para ver o cancelar una reserva en línea NO se incluye: el token solo se guarda como huella
 * (sha256 en private.public_bookings.token_hash) y no se puede reconstruir.
 */
export type WaMessageKind = 'confirmacion' | 'recordatorio';

/** Tipo de mensaje de la base ('confirmation' | 'reminder') ↔ plantilla. */
export const KIND_TO_DB: Record<WaMessageKind, 'confirmation' | 'reminder'> = { confirmacion: 'confirmation', recordatorio: 'reminder' };

export interface WaBusinessInfo {
    name: string;
    address: string;
    phone: string;
}

export interface WaAppointmentInfo {
    clientName: string;
    services: string[];
    startsAt: string;
    barberName: string | null;
}

/** Teléfono mexicano de 10 dígitos (con o sin +52/521 y separadores) a '52XXXXXXXXXX'; null si no es válido. */
export function waPhone(raw: unknown): string | null {
    const digits = normalizeBookingPhone(raw);
    return digits ? `52${digits}` : null;
}

function serviceText(services: string[]): string | null {
    const names = services.map((s) => s.trim()).filter(Boolean);
    return names.length > 0 ? names.join(' + ') : null;
}

function firstLine(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/** Texto del mensaje, en español, con día y hora en la zona de la barbería (formato del sistema). */
export function waMessage(kind: WaMessageKind, appointment: WaAppointmentInfo, business: WaBusinessInfo, timeZone: string = BUSINESS_TIME_ZONE): string {
    const name = firstLine(appointment.clientName) || 'cliente';
    const day = formatDate(appointment.startsAt, timeZone, { year: false });
    const time = formatTime(appointment.startsAt, timeZone);
    const services = serviceText(appointment.services);
    const opening = kind === 'confirmacion'
        ? `Hola, ${name}. Te confirmamos tu cita en ${business.name}:`
        : `Hola, ${name}. Te recordamos tu cita en ${business.name}:`;
    const lines = [
        opening,
        services ? `• Servicio: ${services}` : null,
        `• Día: ${day}`,
        `• Hora: ${time}`,
        appointment.barberName ? `• Barbero: ${firstLine(appointment.barberName)}` : null,
        `• Dirección: ${business.address}`,
        '',
        kind === 'confirmacion'
            ? `Si necesitas cambiarla o cancelarla, escríbenos aquí o llámanos al ${business.phone}.`
            : `Si no puedes venir, avísanos por aquí o al ${business.phone}. ¡Te esperamos!`,
    ];
    return lines.filter((l): l is string => l !== null).join('\n');
}

/** Enlace listo para abrir; null si el teléfono del cliente no es un número mexicano de 10 dígitos. */
export function waLink(phone: unknown, message: string): string | null {
    const to = waPhone(phone);
    return to ? `https://wa.me/${to}?text=${encodeURIComponent(message)}` : null;
}

/** Mensaje y enlace juntos; null si no hay teléfono válido. */
export function buildWaNotification(kind: WaMessageKind, phone: unknown, appointment: WaAppointmentInfo, business: WaBusinessInfo, timeZone?: string): { url: string; message: string } | null {
    const message = waMessage(kind, appointment, business, timeZone);
    const url = waLink(phone, message);
    return url ? { url, message } : null;
}
