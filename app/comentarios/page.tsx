'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import FeedbackComposer from '@/components/feedback/FeedbackComposer';
import { useNavUser } from '@/hooks/useNavUser';
import { refreshFeedbackCounters } from '@/hooks/useFeedbackCounters';
import { getJson, sendJson } from '@/lib/money/client';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import {
    KIND_LABELS, STATUS_LABELS, buildCopyText, deviceFromWidth,
    type FeedbackItem, type FeedbackKind, type FeedbackSummary, type ReviewStatus,
} from '@/lib/feedback/model';
import MyFeedbackList from './_components/MyFeedbackList';
import AllFeedbackView, { type Order, type StatusFilter } from './_components/AllFeedbackView';

type Tab = 'mine' | 'all';

function ListSkeleton() {
    return (
        <div className="space-y-3" aria-busy="true" aria-label="Cargando comentarios">
            <Skeleton className="h-32 rounded-xl" /><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-32 rounded-xl" />
        </div>
    );
}

/**
 * Comentarios y sugerencias. Todos ven "Mis comentarios"; la cuenta principal además "Todos". Lo que cada quien puede
 * leer lo decide la base (RLS); esta pantalla solo elige qué pedir.
 */
export default function ComentariosPage() {
    const toast = useToast();
    const user = useNavUser();
    const isOwner = Boolean(user?.isOwner);
    const [tab, setTab] = useState<Tab>('mine');
    const [writing, setWriting] = useState(false);

    const [mine, setMine] = useState<FeedbackItem[] | null>(null);
    const [mineError, setMineError] = useState<{ message: string; offline: boolean } | null>(null);
    const [retracting, setRetracting] = useState<FeedbackItem | null>(null);
    const [retractBusy, setRetractBusy] = useState(false);

    const [all, setAll] = useState<{ items: FeedbackItem[]; summary: FeedbackSummary } | null>(null);
    const [allError, setAllError] = useState<{ message: string; offline: boolean } | null>(null);
    const [status, setStatus] = useState<StatusFilter>('');
    const [kind, setKind] = useState<FeedbackKind | ''>('');
    const [order, setOrder] = useState<Order>('desc');

    const loadMine = useCallback(async () => {
        setMineError(null);
        try {
            const body = await getJson<{ items: FeedbackItem[] }>('/api/feedback?scope=mine');
            setMine(body.items);
            // Al abrir la lista, las respuestas nuevas quedan vistas (se siguen marcando como "Novedad" en esta visita).
            if (body.items.some((i) => i.unseen_update)) {
                await sendJson('/api/feedback/seen', 'POST', {}).catch(() => null);
                refreshFeedbackCounters();
            }
        } catch (e) {
            setMineError({ message: toUserMessage(e, 'No se pudieron cargar tus comentarios.'), offline: isOfflineError(e) });
        }
    }, []);

    const loadAll = useCallback(async (s: StatusFilter, k: FeedbackKind | '') => {
        setAllError(null);
        try {
            const qs = new URLSearchParams({ scope: 'all' });
            if (s) qs.set('status', s);
            if (k) qs.set('kind', k);
            const body = await getJson<{ items: FeedbackItem[]; summary: FeedbackSummary }>(`/api/feedback?${qs.toString()}`);
            setAll({ items: body.items, summary: body.summary });
        } catch (e) {
            setAllError({ message: toUserMessage(e, 'No se pudieron cargar los comentarios.'), offline: isOfflineError(e) });
        }
    }, []);

    useEffect(() => { void loadMine(); }, [loadMine]);
    useEffect(() => { if (isOwner && tab === 'all') void loadAll(status, kind); }, [isOwner, tab, status, kind, loadAll]);

    const confirmRetract = async () => {
        if (!retracting) return;
        setRetractBusy(true);
        try {
            const { data } = await sendJson<{ item: FeedbackItem }>(`/api/feedback/${retracting.id}/retract`, 'POST', {});
            setMine((list) => list?.map((i) => (i.id === data.item.id ? data.item : i)) ?? list);
            toast.success('Comentario retirado.');
            refreshFeedbackCounters();
            setRetracting(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo retirar.');
        } finally {
            setRetractBusy(false);
        }
    };

    const review = async (item: FeedbackItem, change: { status?: ReviewStatus; reply?: string }) => {
        try {
            await sendJson(`/api/feedback/${item.id}`, 'PATCH', change);
            toast.success(change.reply !== undefined ? 'Respuesta guardada. Le aparecerá a quien lo escribió.' : `Marcado como «${STATUS_LABELS[change.status ?? item.status]}».`);
            await loadAll(status, kind);
            refreshFeedbackCounters();
            return true;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
            return false;
        }
    };

    const copy = async () => {
        if (!all) return;
        const label = [status ? (status === 'retirado' ? 'Retirados' : STATUS_LABELS[status]) : 'todos los estados', kind ? KIND_LABELS[kind] : 'todos los tipos'].join(', ');
        const text = buildCopyText([...all.items].sort((a, b) => (order === 'desc' ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at))), label);
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`Copiados ${all.items.length} comentarios. Ya los puedes pegar en la conversación.`);
        } catch {
            toast.error('No se pudo copiar. Inténtalo de nuevo.');
        }
    };

    const tabClass = (on: boolean) => `min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none ${on ? 'bg-bos-accent-soft text-bos-text' : 'text-bos-muted hover:text-bos-text'}`;

    return (
        <div className="mx-auto max-w-3xl space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="hidden font-display text-2xl font-semibold md:block">Comentarios</h1>
                    <p className="text-sm text-bos-muted">Ideas, fallas y dudas sobre la aplicación. {isOwner ? 'Tú ves los de todos y les respondes.' : 'Los lee la cuenta principal y te responde aquí.'}</p>
                </div>
                <Button size="md" onClick={() => setWriting(true)} className="shrink-0">
                    <MessageSquarePlus aria-hidden="true" className="h-4 w-4" />Escribir comentario
                </Button>
            </div>

            {isOwner && (
                <div role="tablist" aria-label="Qué comentarios ver" className="flex rounded-xl border border-bos-border bg-bos-surface p-1 sm:inline-flex">
                    <button type="button" role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')} className={tabClass(tab === 'mine')}>Mis comentarios</button>
                    <button type="button" role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')} className={tabClass(tab === 'all')}>Todos</button>
                </div>
            )}

            {tab === 'mine' || !isOwner ? (
                mineError ? <ErrorState message={mineError.message} offline={mineError.offline} onRetry={() => void loadMine()} />
                    : mine === null ? <ListSkeleton />
                        : <MyFeedbackList items={mine} onRetract={setRetracting} onWrite={() => setWriting(true)} />
            ) : (
                allError ? <ErrorState message={allError.message} offline={allError.offline} onRetry={() => void loadAll(status, kind)} />
                    : all === null ? <ListSkeleton />
                        : <AllFeedbackView items={all.items} summary={all.summary} status={status} kind={kind} order={order}
                            onFilter={(next) => {
                                if (next.status !== undefined) setStatus(next.status);
                                if (next.kind !== undefined) setKind(next.kind);
                                if (next.order !== undefined) setOrder(next.order);
                            }}
                            onReview={review} onCopy={() => void copy()} />
            )}

            {writing && (
                <FeedbackComposer screen={null} device={deviceFromWidth(window.innerWidth)} onClose={() => setWriting(false)}
                    onSent={(item) => { setMine((list) => [item, ...(list ?? [])]); refreshFeedbackCounters(); if (isOwner && tab === 'all') void loadAll(status, kind); }} />
            )}
            {retracting && (
                <ConfirmDialog title="¿Retirar este comentario?" variant="danger" confirmLabel="Retirar" loading={retractBusy}
                    message="Ya no aparecerá como pendiente para la cuenta principal. Queda guardado como retirado; no se borra."
                    onConfirm={() => void confirmRetract()} onCancel={() => setRetracting(null)} />
            )}
        </div>
    );
}
