/**
 * Regla del bloqueo por intentos fallidos. La base la aplica de verdad
 * (private.login_attempt_failed_impl en la migración 20261117062221); aquí está la misma
 * cuenta como función pura para probarla y para explicarla en pantalla.
 *
 * Por qué: un PIN de 6 dígitos son 1,000,000 de combinaciones. Con 5 intentos cada 15 minutos
 * (y bloqueos que se duplican si reincide) adivinar un PIN al azar tomaría años.
 */
export const MAX_FAILED_ATTEMPTS = 5;
export const BASE_LOCK_MINUTES = 15;
export const MAX_LOCK_MINUTES = 24 * 60;

/** Minutos de bloqueo para el nivel dado: 1 → 15, 2 → 30, 3 → 60... con tope de 24 h. */
export function lockMinutes(level: number): number {
    const safe = Math.max(1, Math.floor(level));
    return Math.min(MAX_LOCK_MINUTES, BASE_LOCK_MINUTES * 2 ** (safe - 1));
}

export type LockState = { failedCount: number; lockLevel: number; lockedUntil: number | null };

/** Estado después de un intento fallido (en milisegundos desde la época). */
export function afterFailedAttempt(state: LockState, now: number): LockState {
    const failedCount = state.failedCount + 1;
    if (failedCount >= MAX_FAILED_ATTEMPTS && failedCount % MAX_FAILED_ATTEMPTS === 0) {
        const lockLevel = state.lockLevel + 1;
        return { failedCount, lockLevel, lockedUntil: now + lockMinutes(lockLevel) * 60_000 };
    }
    return { ...state, failedCount };
}

/** Segundos que faltan de bloqueo (0 = puede intentar). */
export function secondsLocked(state: LockState, now: number): number {
    if (!state.lockedUntil || state.lockedUntil <= now) return 0;
    return Math.ceil((state.lockedUntil - now) / 1000);
}

/** Texto para la persona: "15 minutos", "1 hora"... */
export function waitText(seconds: number): string {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    if (minutes < 60) return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
    const hours = Math.ceil(minutes / 60);
    return hours === 1 ? '1 hora' : `${hours} horas`;
}
