'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import DaySummaryView from '@/components/cash/DaySummaryView';

/**
 * Resumen del día: enlace directo y hoja para imprimir. Es el mismo componente que la ventana «Resumen del día» de
 * Caja y del Panel (components/cash/DaySummaryView.tsx), con la misma ruta de datos. Acepta ?fecha=AAAA-MM-DD
 * (el selector la valida y el servidor decide si el puesto puede ver ese día) y ?imprimir=1.
 */
export default function ResumenCajaPage() {
    const [params, setParams] = useState<{ day?: string; print: boolean } | null>(null);
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const fecha = q.get('fecha') ?? '';
        setParams({ day: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined, print: q.get('imprimir') === '1' });
    }, []);
    if (!params) return null;
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Link href="/caja" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-bos-muted hover:text-bos-text print:hidden">
                <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Volver a Caja
            </Link>
            <DaySummaryView headingAs="h1" initialDay={params.day} autoPrint={params.print} />
        </div>
    );
}
