import { useEffect, useState } from 'react';

/** Sube de 0 al valor en unos 700 ms. Respeta "reducir movimiento" y entonces muestra el valor directo. */
export function useCountUp(target: number, active: boolean): number {
    const [value, setValue] = useState(0);

    useEffect(() => {
        if (!active) { setValue(0); return; }
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setValue(target); return; }
        let frame = 0;
        const start = performance.now();
        const step = (now: number) => {
            const t = Math.min((now - start) / 700, 1);
            setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
            if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [target, active]);

    return value;
}
