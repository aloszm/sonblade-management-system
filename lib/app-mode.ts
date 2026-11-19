/**
 * Modo de la publicación. `NEXT_PUBLIC_APP_MODE=practice` marca la versión de práctica: misma app,
 * conectada a la base de desarrollo (datos simulados), para que el equipo ensaye sin tocar dinero real.
 * Cualquier otro valor, o ausente, es producción normal.
 * Es pública a propósito: Next la incrusta al compilar, así que sirve igual en servidor y navegador.
 */
export type AppMode = 'practice' | 'production';

export const PRACTICE_BANNER_TEXT = 'MODO PRÁCTICA — nada de lo que hagas aquí es real';
export const PRACTICE_LOGIN_NOTE = 'Estás en la versión de práctica. Usa tu PIN de práctica, no el real.';
export const PRACTICE_PRINT_MARK = 'PRÁCTICA — SIN VALOR';
export const PRACTICE_TITLE_PREFIX = 'PRÁCTICA · ';

export function isPracticeMode(): boolean {
    return process.env.NEXT_PUBLIC_APP_MODE === 'practice';
}

export function appMode(): AppMode {
    return isPracticeMode() ? 'practice' : 'production';
}

/** Antepone el aviso al título de la pestaña solo en modo práctica. */
export function withPracticeTitle(title: string): string {
    return isPracticeMode() ? `${PRACTICE_TITLE_PREFIX}${title}` : title;
}
