'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Target } from 'lucide-react';
import { normalizeBreakEven, summaryLine, type BreakEvenData } from '@/lib/break-even/model';

/**
 * Tarjeta de una línea en el Panel: cómo va el punto de equilibrio del mes en curso, con enlace a la pantalla.
 * Si la API no contesta (o el puesto no la ve), no se muestra nada: el Panel sigue igual.
 */
export default function BreakEvenSummary() {
    const [data, setData] = useState<BreakEvenData | null>(null);
    useEffect(() => {
        let alive = true;
        fetch('/api/break-even', { cache: 'no-store' })
            .then(async (res) => {
                if (!res.ok) return;
                const body = await res.json().catch(() => null);
                if (alive && body && typeof body === 'object' && 'fixed' in body && 'derived' in body) setData(normalizeBreakEven(body));
            })
            .catch(() => undefined);
        return () => { alive = false; };
    }, []);
    if (!data) return null;
    const covered = data.derived.covered;
    return (
        <Link href="/punto-de-equilibrio" data-testid="be-summary"
            className="flex min-h-12 items-center gap-3 rounded-xl border border-bos-border bg-bos-surface px-4 py-3 text-sm hover:border-bos-accent">
            <Target aria-hidden="true" className={`h-5 w-5 shrink-0 ${covered ? 'text-bos-success' : 'text-bos-accent-text'}`} />
            <span className="min-w-0 flex-1">
                <span className="font-semibold text-bos-text">Punto de equilibrio: </span>
                <span className="text-bos-muted">{summaryLine(data)}</span>
            </span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-bos-muted" />
        </Link>
    );
}
