import 'server-only';

import { createHmac } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Lo que se guarda como contraseña en Supabase Auth NO es el PIN: es
 * HMAC-SHA256(pepper, loginId + ':' + pin) en hexadecimal (64 caracteres).
 *
 * Por qué: con el PIN como contraseña, cualquiera podía probar PIN llamando directo a Supabase
 * Auth con la llave publicable, sin pasar por el bloqueo por intentos de la app. Sin el pepper
 * nadie puede calcular la contraseña a partir de un PIN, así que la única forma de probar PIN es
 * /api/auth/login, que sí bloquea.
 *
 * De dónde sale el pepper: se genera DENTRO de la base (tabla private.app_secrets, migración
 * pin_pepper_in_database) y solo lo puede leer la llave secreta del servidor con la función
 * public.server_pin_pepper(). Así nadie tiene que copiarlo a mano entre sistemas y cada base
 * (desarrollo y producción) tiene el suyo. PIN_PEPPER en el entorno solo existe para pruebas y
 * NO debe configurarse en Vercel: si no coincide con el de la base, ningún PIN funcionaría.
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

let cachedPepper: string | null = null;

/** Solo para pruebas: olvida el pepper leído de la base. */
export function resetPinPepperCache(): void {
    cachedPepper = null;
}

async function loadPepper(): Promise<string> {
    const fromEnv = process.env.PIN_PEPPER?.trim() ?? '';
    if (PEPPER_PATTERN.test(fromEnv)) return fromEnv;
    if (cachedPepper) return cachedPepper;
    const admin = createSupabaseAdminClient();
    if (!admin) throw new PinPepperMissingError();
    const { data, error } = await (admin.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>)('server_pin_pepper');
    if (error || typeof data !== 'string' || !PEPPER_PATTERN.test(data)) throw new PinPepperMissingError();
    cachedPepper = data;
    return data;
}

export async function pinPepperConfigured(): Promise<boolean> {
    try {
        await loadPepper();
        return true;
    } catch {
        return false;
    }
}

/** Cálculo puro (sin red): la contraseña que corresponde a ese pepper, usuario y PIN. */
export function derivePinPassword(pepper: string, loginId: string, pin: string): string {
    if (!PEPPER_PATTERN.test(pepper)) throw new PinPepperMissingError();
    return createHmac('sha256', Buffer.from(pepper, 'hex')).update(`${loginId.trim().toLowerCase()}:${pin}`, 'utf8').digest('hex');
}

/** Contraseña de Supabase Auth para ese usuario (correo sintético) y PIN. Falla cerrado sin pepper. */
export async function pinPassword(loginId: string, pin: string): Promise<string> {
    return derivePinPassword(await loadPepper(), loginId, pin);
}
