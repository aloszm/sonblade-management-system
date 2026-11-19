import { PRACTICE_BANNER_TEXT, isPracticeMode } from '@/lib/app-mode';

/**
 * Franja fija de la versión de práctica, en todas las pantallas. Su alto lo reserva `--bos-banner-h`
 * (ver globals.css) para que no tape contenido, la barra inferior ni el menú. No hace nada en producción.
 */
export default function PracticeBanner() {
    if (!isPracticeMode()) return null;
    return (
        <div role="status" data-testid="practice-banner"
            className="fixed inset-x-0 top-0 z-[100] flex h-[var(--bos-banner-h)] items-center justify-center bg-bos-warn px-4 text-center text-xs font-bold uppercase leading-tight tracking-wide text-bos-on-warn sm:text-sm">
            {PRACTICE_BANNER_TEXT}
        </div>
    );
}
