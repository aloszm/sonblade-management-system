'use client';

import React, { useId, useState } from 'react';
import { ArrowDownUp, ClipboardCopy, CornerDownRight, Inbox } from 'lucide-react';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { FIELD_CLASS, LABEL_CLASS } from '@/components/ui/Field';
import {
    FEEDBACK_KINDS, FEEDBACK_STATUSES, KIND_LABELS, REPLY_MAX, REVIEW_STATUSES, STATUS_LABELS, formatWhen,
    type FeedbackItem, type FeedbackKind, type FeedbackStatus, type FeedbackSummary, type ReviewStatus,
} from '@/lib/feedback/model';
import { KindTag, Origin, StatusPill } from './FeedbackBits';

export type StatusFilter = FeedbackStatus | 'retirado' | '';
export type Order = 'desc' | 'asc';

interface Props {
    items: FeedbackItem[];
    summary: FeedbackSummary;
    status: StatusFilter;
    kind: FeedbackKind | '';
    order: Order;
    onFilter: (next: { status?: StatusFilter; kind?: FeedbackKind | ''; order?: Order }) => void;
    onReview: (item: FeedbackItem, change: { status?: ReviewStatus; reply?: string }) => Promise<boolean>;
    onCopy: () => void;
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: 'accent' | 'plain' | 'success' }) {
    const color = tone === 'accent' ? 'text-bos-accent-text' : tone === 'success' ? 'text-bos-success' : 'text-bos-text';
    return (
        <div className="rounded-xl border border-bos-border bg-bos-surface px-3 py-3 sm:px-4">
            <p className="text-xs font-medium text-bos-muted">{label}</p>
            <p className={`mt-0.5 font-display text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
        </div>
    );
}

function ReviewCard({ item, onReview }: { item: FeedbackItem; onReview: Props['onReview'] }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [replying, setReplying] = useState(false);
    const [reply, setReply] = useState(item.reply ?? '');
    const replyId = useId();
    const locked = item.retracted;

    const run = async (key: string, change: { status?: ReviewStatus; reply?: string }) => {
        setBusy(key);
        const ok = await onReview(item, change);
        setBusy(null);
        if (ok && change.reply !== undefined) setReplying(false);
    };

    return (
        <li data-testid="all-feedback" className={`rounded-xl border bg-bos-surface p-4 ${item.status === 'nuevo' && !locked ? 'border-bos-accent/60' : 'border-bos-border'} ${locked ? 'opacity-75' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <KindTag kind={item.kind} />
                <StatusPill item={item} />
            </div>
            <p className="mt-1.5 text-xs text-bos-muted">
                <span className="font-semibold text-bos-text">{item.author_name ?? 'Alguien del equipo'}</span>
                {' · '}{item.author_role_label}{' · '}{formatWhen(item.created_at)}
            </p>
            <p className="mt-2.5 whitespace-pre-line break-words text-[15px] leading-relaxed">{item.body}</p>
            <div className="mt-2"><Origin item={item} /></div>

            {item.reply && !replying && (
                <div className="mt-3 rounded-lg border border-bos-border bg-bos-bg p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-bos-muted">
                        <CornerDownRight aria-hidden="true" className="h-3.5 w-3.5" />Tu respuesta{item.replied_at ? ` · ${formatWhen(item.replied_at)}` : ''}
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-sm">{item.reply}</p>
                </div>
            )}

            {locked ? (
                <p className="mt-3 text-xs text-bos-muted">Lo retiró quien lo escribió. Queda guardado, sin acciones.</p>
            ) : (
                <>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Cambiar estado">
                        {REVIEW_STATUSES.map((s) => {
                            const on = item.status === s;
                            return (
                                <button key={s} type="button" aria-pressed={on} disabled={busy !== null || on}
                                    onClick={() => void run(s, { status: s })}
                                    className={`min-h-11 rounded-xl border px-2 text-sm font-semibold transition-colors disabled:cursor-default ${on
                                        ? 'border-bos-accent bg-bos-accent-soft text-bos-text'
                                        : 'border-bos-border text-bos-text hover:bg-bos-raised disabled:text-bos-muted'}`}>
                                    {busy === s ? 'Guardando…' : STATUS_LABELS[s]}
                                </button>
                            );
                        })}
                    </div>
                    {replying ? (
                        <div className="mt-3">
                            <label htmlFor={replyId} className={LABEL_CLASS}>Respuesta para quien lo escribió</label>
                            <textarea id={replyId} value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={REPLY_MAX}
                                placeholder="Ya quedó en la versión de hoy." className={`${FIELD_CLASS} h-auto min-h-20 py-2.5 resize-y`} />
                            <div className="mt-2 flex flex-wrap justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => { setReply(item.reply ?? ''); setReplying(false); }} disabled={busy !== null}>Cancelar</Button>
                                <Button size="sm" loading={busy === 'reply'} disabled={reply.trim() === (item.reply ?? '')}
                                    onClick={() => void run('reply', { reply: reply.trim(), ...(item.status === 'nuevo' ? { status: 'visto' as const } : {}) })}>
                                    Guardar respuesta
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-2 flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setReplying(true)}>{item.reply ? 'Cambiar respuesta' : 'Responder'}</Button>
                        </div>
                    )}
                </>
            )}
        </li>
    );
}

/** Vista "Todos" de la cuenta principal: resumen, filtros, orden, acciones rápidas y "Copiar para enviar". */
export default function AllFeedbackView({ items, summary, status, kind, order, onFilter, onReview, onCopy }: Props) {
    const statusId = useId();
    const kindId = useId();
    const sorted = [...items].sort((a, b) => (order === 'desc' ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at)));
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Resumen">
                <SummaryTile label="Nuevos" value={summary.nuevo} tone="accent" />
                <SummaryTile label="En proceso" value={summary.en_proceso} tone="plain" />
                <SummaryTile label="Hechos" value={summary.hecho} tone="success" />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                <div className="sm:w-40">
                    <label htmlFor={statusId} className={LABEL_CLASS}>Estado</label>
                    <select id={statusId} value={status} onChange={(e) => onFilter({ status: e.target.value as StatusFilter })} className={FIELD_CLASS}>
                        <option value="">Todos</option>
                        {FEEDBACK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        <option value="retirado">Retirados</option>
                    </select>
                </div>
                <div className="sm:w-44">
                    <label htmlFor={kindId} className={LABEL_CLASS}>Tipo</label>
                    <select id={kindId} value={kind} onChange={(e) => onFilter({ kind: e.target.value as FeedbackKind | '' })} className={FIELD_CLASS}>
                        <option value="">Todos</option>
                        {FEEDBACK_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                    </select>
                </div>
                <Button variant="secondary" size="sm" className="h-12 whitespace-nowrap px-3" onClick={() => onFilter({ order: order === 'desc' ? 'asc' : 'desc' })}
                    aria-label={order === 'desc' ? 'Orden: más nuevos primero. Cambiar a más antiguos primero' : 'Orden: más antiguos primero. Cambiar a más nuevos primero'}>
                    <ArrowDownUp aria-hidden="true" className="h-4 w-4" />{order === 'desc' ? 'Nuevos primero' : 'Antiguos primero'}
                </Button>
                <Button variant="secondary" size="sm" className="h-12 whitespace-nowrap px-3" onClick={onCopy} disabled={items.length === 0}>
                    <ClipboardCopy aria-hidden="true" className="h-4 w-4" />Copiar para enviar
                </Button>
            </div>

            {sorted.length === 0 ? (
                <EmptyState icon={<Inbox className="h-8 w-8" />} title="No hay comentarios con ese filtro"
                    description={status || kind ? 'Prueba con otro estado o tipo.' : 'Cuando alguien del equipo escriba, aparecerá aquí.'} />
            ) : (
                <ul className="space-y-3" aria-label="Comentarios de todos">
                    {sorted.map((item) => <ReviewCard key={`${item.id}:${item.status}:${item.reply ?? ''}`} item={item} onReview={onReview} />)}
                </ul>
            )}
        </div>
    );
}
