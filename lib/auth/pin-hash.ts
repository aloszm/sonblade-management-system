import 'server-only';

import { createHmac } from 'node:crypto';

/**
 * Lo que se guarda como contraseña en Supabase Auth NO es el PIN: es
 * HMAC-SHA256(PIN_PEPPER, loginId + ':' + pin) en hexadecimal (64 caracteres).
 *
 * Por qué: con el PIN como contraseña, cualquiera podía probar PIN llamando directo a Supabase
 * Auth con la llave publicable, sin pasar por el bloqueo por intentos de la app. Sin el pepper
 * (variable de servidor, nunca NEXT_PUBLIC_) nadie puede calcular la contraseña a partir de un
 * PIN, así que la única forma de probar PIN es /api/auth/login, que sí bloquea.
 *
 * Se usa en: inicio de sesión, cambio de PIN, alta de acceso y restablecimiento.
 */
export const MISSING_PIN_PEPPER = 'El acceso no está configurado en el servidor.';

export class PinPepperMissingError extends Error {
    constructor() {
        super(MISSING_PIN_PEPPER);
        this.name = 'PinPepperMissingError';
    }
}

/** 32 bytes en hexadecimal (64 caracteres). Con menos, el servidor no acepta el valor. */
const PEPPER_PATTERN = /^[0-9a-fA-F]{64,}$/;

export function pinPepperConfigured(): boolean {
    return PEPPER_PATTERN.test(process.env.PIN_PEPPER?.trim() ?? '');
}

/** Contraseña de Supabase Auth para ese usuario (correo sintético) y PIN. Falla cerrado sin pepper. */
export function pinPassword(loginId: string, pin: string): string {
    const pepper = process.env.PIN_PEPPER?.trim() ?? '';
    if (!PEPPER_PATTERN.test(pepper)) throw new PinPepperMissingError();
    return createHmac('sha256', Buffer.from(pepper, 'hex')).update(`${loginId.trim().toLowerCase()}:${pin}`, 'utf8').digest('hex');
}
