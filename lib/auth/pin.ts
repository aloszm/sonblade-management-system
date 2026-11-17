/** PIN de 6 dígitos: validación de formato, PIN demasiado fáciles y PIN temporales. */

export const PIN_LENGTH = 6;
export const PIN_PATTERN = /^\d{6}$/;

export function isPinFormat(value: unknown): value is string {
    return typeof value === 'string' && PIN_PATTERN.test(value);
}

/**
 * PIN que cualquiera probaría primero: todos iguales (000000, 111111...), escaleras
 * (123456, 654321, 012345...), patrones repetidos (121212, 123123) y algunos de uso común.
 */
export function isTrivialPin(pin: string): boolean {
    if (!isPinFormat(pin)) return true;
    const digits = pin.split('').map(Number);
    if (digits.every((d) => d === digits[0])) return true;
    const steps = digits.slice(1).map((d, i) => d - digits[i]);
    if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true;
    if (pin.slice(0, 2).repeat(3) === pin || pin.slice(0, 3).repeat(2) === pin) return true;
    return ['112233', '696969', '147258', '159753', '102030', '420420'].includes(pin);
}

export type PinChangeProblem = 'format' | 'mismatch' | 'trivial' | 'same';

/** Revisa el PIN nuevo antes de guardarlo. Devuelve el problema o null si está bien. */
export function checkNewPin(current: string, next: string, confirm: string): PinChangeProblem | null {
    if (!isPinFormat(next)) return 'format';
    if (next !== confirm) return 'mismatch';
    if (next === current) return 'same';
    if (isTrivialPin(next)) return 'trivial';
    return null;
}

export const PIN_PROBLEM_MESSAGES: Record<PinChangeProblem, string> = {
    format: 'El PIN debe tener exactamente 6 números.',
    mismatch: 'Los dos PIN nuevos no coinciden.',
    trivial: 'Ese PIN es muy fácil de adivinar. Elige otro (no 000000, 123456, 111111...).',
    same: 'El PIN nuevo debe ser distinto al actual.',
};

/** PIN temporal aleatorio y no trivial, con generador criptográfico. */
export function generateTemporaryPin(random: (max: number) => number = cryptoRandomInt): string {
    for (;;) {
        const pin = Array.from({ length: PIN_LENGTH }, () => String(random(10))).join('');
        if (!isTrivialPin(pin)) return pin;
    }
}

function cryptoRandomInt(max: number): number {
    const buffer = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max; // evita el sesgo del módulo
    do { globalThis.crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % max;
}
