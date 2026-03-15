/**
 * Notification Service — WhatsApp / SMS / Email
 *
 * Estado actual: STUB listo para conectar.
 * Para activar WhatsApp agrega estas variables en .env.local:
 *   WHATSAPP_API_URL=...
 *   WHATSAPP_API_TOKEN=...
 *   WHATSAPP_FROM_NUMBER=...   (ej. +521XXXXXXXXXX)
 *
 * Proveedores recomendados:
 *   - Meta Cloud API (gratis hasta 1000 conversaciones/mes)
 *   - Twilio WhatsApp Sandbox (desarrollo)
 *   - Vonage / MessageBird
 */

// ─────────────────────────────────────────────
// LOYALTY TIERS — ajusta los umbrales aquí
// ─────────────────────────────────────────────
export const LOYALTY_TIERS = {
    bronze:   { min: 0,   max: 99,       label: 'Bronce',   discount: 0,  emoji: '🥉' },
    silver:   { min: 100, max: 299,      label: 'Plata',    discount: 5,  emoji: '🥈' },
    gold:     { min: 300, max: 599,      label: 'Oro',      discount: 10, emoji: '🥇' },
    platinum: { min: 600, max: Infinity, label: 'Platino',  discount: 15, emoji: '💎' },
} as const;

export type LoyaltyTierKey = keyof typeof LOYALTY_TIERS;

export function getLoyaltyTier(points: number) {
    if (points >= LOYALTY_TIERS.platinum.min) return LOYALTY_TIERS.platinum;
    if (points >= LOYALTY_TIERS.gold.min)     return LOYALTY_TIERS.gold;
    if (points >= LOYALTY_TIERS.silver.min)   return LOYALTY_TIERS.silver;
    return LOYALTY_TIERS.bronze;
}

export function getNextTier(points: number) {
    if (points < LOYALTY_TIERS.silver.min)   return { tier: LOYALTY_TIERS.silver,   needed: LOYALTY_TIERS.silver.min - points };
    if (points < LOYALTY_TIERS.gold.min)     return { tier: LOYALTY_TIERS.gold,     needed: LOYALTY_TIERS.gold.min - points };
    if (points < LOYALTY_TIERS.platinum.min) return { tier: LOYALTY_TIERS.platinum, needed: LOYALTY_TIERS.platinum.min - points };
    return null; // ya está en el tier máximo
}

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
export interface LoyaltyNotificationData {
    clientName: string;
    phone?: string | null;
    points: number;       // puntos ganados en esta visita
    totalPoints: number;  // total acumulado
}

export interface AppointmentNotificationData {
    clientName: string;
    phone?: string | null;
    barberName: string;
    scheduledAt: string;  // ISO string
    serviceNote?: string | null;
}

// ─────────────────────────────────────────────
// CORE — envío de mensaje
// ─────────────────────────────────────────────
/**
 * Envía un mensaje de WhatsApp.
 * Si las variables de entorno no están configuradas, solo loguea (modo desarrollo).
 */
export async function sendWhatsAppMessage(
    to: string,
    message: string
): Promise<{ success: boolean; error?: string }> {
    if (!process.env.WHATSAPP_API_URL || !process.env.WHATSAPP_API_TOKEN) {
        // Modo desarrollo: imprime en consola sin fallar
        console.log(`[WhatsApp → ${to}]: ${message}`);
        return { success: true };
    }

    try {
        // ── TODO: reemplaza este bloque con la llamada real al proveedor ──
        //
        // Ejemplo Meta Cloud API:
        // await fetch(`${process.env.WHATSAPP_API_URL}/messages`, {
        //   method: 'POST',
        //   headers: { Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`, 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
        //     messaging_product: 'whatsapp',
        //     to,
        //     type: 'text',
        //     text: { body: message },
        //   }),
        // });
        //
        // Ejemplo Twilio:
        // const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        // await client.messages.create({ from: `whatsapp:${process.env.WHATSAPP_FROM_NUMBER}`, to: `whatsapp:${to}`, body: message });
        // ─────────────────────────────────────────────────────────────────

        return { success: true };
    } catch (err) {
        console.error('[WhatsApp] Error al enviar:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}

// ─────────────────────────────────────────────
// NOTIFICACIONES DE LEALTAD
// ─────────────────────────────────────────────
export async function notifyLoyaltyPoints(data: LoyaltyNotificationData) {
    if (!data.phone) return;

    const tier = getLoyaltyTier(data.totalPoints);
    const next = getNextTier(data.totalPoints);
    const nextMsg = next ? ` Te faltan ${next.needed} puntos para ${next.tier.emoji} ${next.tier.label}.` : ' ¡Eres nuestro cliente Platino! 💎';

    const message =
        `¡Hola ${data.clientName}! Ganaste ${data.points} punto${data.points !== 1 ? 's' : ''} en tu visita. ` +
        `Total: ${data.totalPoints} pts ${tier.emoji} ${tier.label}.${nextMsg} ¡Gracias por tu preferencia! ✂️`;

    return sendWhatsAppMessage(data.phone, message);
}

// ─────────────────────────────────────────────
// NOTIFICACIONES DE CITAS
// ─────────────────────────────────────────────
export async function notifyAppointmentConfirmed(data: AppointmentNotificationData) {
    if (!data.phone) return;

    const fecha = new Date(data.scheduledAt).toLocaleString('es-MX', {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
    const servicio = data.serviceNote ? ` — ${data.serviceNote}` : '';
    const message =
        `¡Hola ${data.clientName}! Tu cita con ${data.barberName} está confirmada para el ${fecha}${servicio}. ` +
        `¡Te esperamos! ✂️`;

    return sendWhatsAppMessage(data.phone, message);
}

export async function notifyAppointmentReminder(data: AppointmentNotificationData) {
    if (!data.phone) return;

    const hora = new Date(data.scheduledAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const message =
        `¡Hola ${data.clientName}! Te recordamos tu cita hoy a las ${hora} con ${data.barberName}. ` +
        `¡Nos vemos pronto! ✂️`;

    return sendWhatsAppMessage(data.phone, message);
}

export async function notifyAppointmentCancelled(data: AppointmentNotificationData) {
    if (!data.phone) return;

    const message =
        `Hola ${data.clientName}, tu cita con ${data.barberName} ha sido cancelada. ` +
        `Contáctanos para reagendar. ✂️`;

    return sendWhatsAppMessage(data.phone, message);
}
