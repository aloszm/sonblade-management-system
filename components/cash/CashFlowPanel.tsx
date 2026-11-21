'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import CashFlowView from '@/components/cash/CashFlowView';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import type { CashFlowPayload } from '@/lib/cash/cash-flow';
import { HttpError, isOfflineError, toUserMessage } from '@/lib/utils/errors';

/**
 * El camino del efectivo de UNA caja, pedido a /api/cash/flow (la misma función que el Resumen del día).
 * `refreshKey`: cuando cambia (llegó un movimiento) se vuelve a pedir sin parpadear.
 */
export default function CashFlowPanel({ sessionId, refreshKey = '' }: { sessionId: string; refreshKey?: string | number }) {
    const [data, setData] = useState<CashFlowPayload | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);
    const seq = useRef(0);

    const load = useCallback(async () => {
        const mine = ++seq.current;
        setLoading(true);
        try {
            const res = await fetch(`/api/cash/flow?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new HttpError(res.status, typeof body?.error === 'string' ? body.error : undefined);
            if (mine === seq.current) { setData(body as CashFlowPayload); setError(null); }
        } catch (e) {
            if (mine === seq.current) { setData(null); setError(e); }
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => { void load(); }, [load, refreshKey]);

    if (error != null && !loading) {
        return <ErrorState title="No se pudo cargar el efectivo" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={load} />;
    }
    if (!data) {
        return (
            <div aria-busy="true" aria-label="Cargando el efectivo" className="space-y-2">
                <Skeleton className="h-6 w-2/3" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-1/2" />
            </div>
        );
    }
    return (
        <div aria-busy={loading} className={loading ? 'opacity-70' : ''}>
            <CashFlowView flow={data.flow} timezone={data.timezone} otherExpenses={data.otherExpenses} idPrefix="panel" />
        </div>
    );
}
