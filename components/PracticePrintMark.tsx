import { PRACTICE_PRINT_MARK, isPracticeMode } from '@/lib/app-mode';

/**
 * Marca para tickets y recibos de la versión de práctica: un rótulo arriba del documento y una marca
 * de agua diagonal fija que se repite en cada página impresa. No hace nada en producción.
 */
export default function PracticePrintMark() {
    if (!isPracticeMode()) return null;
    return (
        <>
            <p data-testid="practice-print-mark" className="mb-4 border-2 border-dashed border-black bg-white px-2 py-1.5 text-center text-sm font-extrabold uppercase tracking-widest text-black [print-color-adjust:exact]">
                {PRACTICE_PRINT_MARK}
            </p>
            <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 hidden items-center justify-center overflow-hidden print:flex">
                <span className="-rotate-[30deg] whitespace-nowrap text-6xl font-black uppercase tracking-widest text-black/15 [print-color-adjust:exact]">{PRACTICE_PRINT_MARK}</span>
            </div>
        </>
    );
}
