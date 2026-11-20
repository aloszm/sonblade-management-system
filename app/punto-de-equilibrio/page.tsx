'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { isPracticeMode } from '@/lib/app-mode';
import { getJson, sendJson } from '@/lib/money/client';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { shiftMonth, type BreakEvenResponse, type Bucket } from '@/lib/break-even/model';
import BreakEvenView, { Header, HonestNote, MonthNav } from './_components/BreakEvenView';
import FixedCostEditor from './_components/FixedCostEditor';

function PageSkeleton() {
    return (
        <div className="space-y-5" data-testid="be-loading" aria-busy="true" aria-label="Cargando el punto de equilibrio">
            <div className="flex flex-col items-center gap-6 rounded-2xl border border-bos-border bg-bos-surface p-6 md:flex-row">
                <Skeleton className="h-44 w-44 rounded-full sm:h-52 sm:w-52" />
                <div className="w-full flex-1 space-y-3">
                    <Skeleton className="h-9 w-3/4" />
                    <Skeleton className="h-5 w-1/2" />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
                </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
        </div>
    );
}

/** Punto de equilibrio: cuánto falta para cubrir los fijos del mes. Lee /api/break-even; edita con las rutas de gastos fijos. */
export default function PuntoDeEquilibrioPage() {
    const toast = useToast();
    const [month, setMonth] = useState<string | null>(null);
    const [currentMonth, setCurrentMonth] = useState<string | null>(null);
    const [data, setData] = useState<BreakEvenResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
    const [editing, setEditing] = useState<Bucket | null | 'new'>(null);
    const practice = isPracticeMode();

    const load = useCallback(async (m: string | null) => {
        setLoading(true);
        setError(null);
        try {
            const body = await getJson<BreakEvenResponse>(`/api/break-even${m ? `?month=${m}` : ''}`);
            setData(body);
            if (!m) setCurrentMonth(body.today.slice(0, 7));
        } catch (e) {
            setError({ message: toUserMessage(e, 'No se pudo calcular el punto de equilibrio.'), offline: isOfflineError(e) });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(month); }, [load, month]);

    const shown = data?.month ?? month ?? currentMonth ?? '';
    const canGoNext = Boolean(currentMonth && shown && shown < currentMonth);
    const go = (delta: -1 | 1) => { if (shown) setMonth(shiftMonth(shown, delta)); };

    const move = async (bucket: Bucket, delta: -1 | 1) => {
        if (!data) return;
        const ids = data.buckets.filter((b) => b.kind === 'template' && b.id).map((b) => b.id as string);
        const i = ids.indexOf(bucket.id as string);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        try {
            await sendJson('/api/recurring-expenses/reorder', 'POST', { ids }, 'No se pudo cambiar el orden.');
            await load(month);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el orden.');
        }
    };

    if (!data) {
        return (
            <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
                <Header practice={practice} nav={shown ? <MonthNav month={shown} onPrev={() => go(-1)} onNext={() => go(1)} canGoNext={canGoNext} disabled={loading} /> : null} />
                {error ? <ErrorState title="No se pudo cargar" message={error.message} offline={error.offline} onRetry={() => void load(month)} /> : <PageSkeleton />}
                <HonestNote />
            </div>
        );
    }

    return (
        <>
            {error && (
                <div className="mx-auto mb-4 max-w-5xl">
                    <ErrorState title="No se pudo actualizar" message={error.message} offline={error.offline} onRetry={() => void load(month)} />
                </div>
            )}
            <div className={loading ? 'opacity-70 transition-opacity' : 'transition-opacity'} aria-busy={loading || undefined}>
                <BreakEvenView key={data.month} data={data} canEdit={data.can_edit} practice={practice} canGoNext={canGoNext}
                    onPrev={() => go(-1)} onNext={() => go(1)}
                    onEdit={(b) => setEditing(b)} onAdd={() => setEditing('new')} onMove={(b, d) => void move(b, d)} />
            </div>
            {editing && (
                <FixedCostEditor bucket={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); void load(month); }} />
            )}
        </>
    );
}
