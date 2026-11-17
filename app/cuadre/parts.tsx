'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
    ISSUE_LABELS, PRE_AGENDA_GUIDE, issueGuide, primaryAction, secondaryAction,
    type ReconciliationIssue, type ReviewDecision,
} from '@/lib/reports/reconciliation';
import { formatMoney } from '@/lib/utils/money';
import { formatDateTime } from '@/lib/utils/dates';

// Piezas de la pantalla de Cuadre. Solo colores del sistema (bos-*).

export const money = (n: number) => formatMoney(n, { cents: true });
export const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
export const timeOf = (iso: string, timeZone?: string) =>
    formatDateTime(iso, timeZone, { year: false });

export const btnPrimary = 'min-h-11 px-4 rounded-xl bg-bos-accent text-bos-on-accent font-bold inline-flex items-center justify-center gap-2 hover:bg-bos-accent-strong disabled:cursor-not-allowed';
export const btnSecondary = 'min-h-11 px-4 rounded-xl border border-bos-border font-semibold inline-flex items-center justify-center gap-2 hover:bg-bos-raised disabled:cursor-not-allowed';

export type ReviewSubmit = (issue: ReconciliationIssue, decision: ReviewDecision, reason: string) => Promise<string | null>;

/** Formulario del motivo, dentro de la tarjeta. Devuelve el error de la base, si lo hubo. */
function ReasonForm({ label, submitLabel, placeholder, onSubmit, onCancel }: {
    label: string; submitLabel: string; placeholder: string;
    onSubmit: (reason: string) => Promise<string | null>; onCancel: () => void;
}) {
    const id = useId();
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (reason.trim().length < 3) { setError('Escribe el motivo (al menos 3 letras).'); return; }
        setBusy(true);
        setError('');
        const failure = await onSubmit(reason.trim());
        setBusy(false);
        if (failure) setError(failure);
    };
    return (
        <form onSubmit={submit} className="mt-3 rounded-xl border border-bos-border bg-bos-bg p-3 space-y-2">
            <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
            <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} required autoFocus
                placeholder={placeholder} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
                className="w-full rounded-lg border border-bos-control bg-bos-surface px-3 py-2 text-sm text-bos-text placeholder:text-bos-muted" />
            {error && <p id={`${id}-error`} role="alert" className="text-sm text-bos-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={btnPrimary}>
                    {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{submitLabel}
                </button>
                <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>Cancelar</button>
            </div>
        </form>
    );
}

/** Una diferencia: qué pasó, por qué importa, qué hacer y sus acciones. */
// Sin onReview (cuenta de consulta) la tarjeta se muestra sin revisar/reabrir ni el atajo para cobrar.
export function IssueCard({ issue, timeZone, onReview }: { issue: ReconciliationIssue; timeZone: string; onReview?: ReviewSubmit }) {
    const [open, setOpen] = useState(false);
    const guide = issueGuide(issue);
    const primary = primaryAction(issue);
    const secondary = secondaryAction(issue);
    const reviewed = issue.status === 'revisada';
    const reopened = !reviewed && issue.review?.decision === 'reabierta';

    return (
        <li data-testid="reconciliation-issue" className="rounded-xl border border-bos-border bg-bos-surface p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${reviewed ? 'bg-bos-success-soft text-bos-success' : 'bg-bos-raised text-bos-text'}`}>
                    {ISSUE_LABELS[issue.kind]}
                </span>
                <span className="text-bos-muted">{issue.name ?? 'Sin barbero'} · {timeOf(issue.at, timeZone)}</span>
            </div>

            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[9rem_1fr] sm:gap-x-4">
                <dt className="font-semibold text-bos-muted">Qué pasó</dt>
                <dd className="text-bos-text">{issue.message}</dd>
                {!reviewed && <>
                    <dt className="font-semibold text-bos-muted">Por qué importa</dt>
                    <dd>{guide.why}</dd>
                    <dt className="font-semibold text-bos-muted">Qué hacer</dt>
                    <dd>{guide.todo}</dd>
                </>}
                {issue.review && (reviewed || reopened) && <>
                    <dt className="font-semibold text-bos-muted">{reviewed ? 'Revisada' : 'Reabierta'}</dt>
                    <dd>
                        Por {issue.review.by} · {timeOf(issue.review.at, timeZone)} · <span className="text-bos-muted">Motivo:</span> {issue.review.reason}
                    </dd>
                </>}
            </dl>

            {!open && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {!reviewed && primary && (onReview || primary.kind !== 'cobrar') && (
                        <Link href={primary.href} className={primary.kind === 'cobrar' ? btnPrimary : btnSecondary}>{primary.label}</Link>
                    )}
                    {!reviewed && secondary && <Link href={secondary.href} className={btnSecondary}>{secondary.label}</Link>}
                    {reviewed && primary && primary.kind !== 'cobrar' && <Link href={primary.href} className={btnSecondary}>{primary.label}</Link>}
                    {onReview && <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>
                        {reviewed ? 'Reabrir' : 'Revisada, está bien'}
                    </button>}
                </div>
            )}
            {open && onReview && (
                <ReasonForm
                    label={reviewed ? '¿Por qué se reabre?' : '¿Por qué está bien? (queda guardado)'}
                    submitLabel={reviewed ? 'Reabrir' : 'Guardar como revisada'}
                    placeholder={reviewed ? 'Ej.: El cliente sí debía el servicio.' : 'Ej.: Fue cortesía; Dani cubrió a Deya.'}
                    onCancel={() => setOpen(false)}
                    onSubmit={async (reason) => {
                        const failure = await onReview(issue, reviewed ? 'reabierta' : 'aceptada', reason);
                        if (!failure) setOpen(false);
                        return failure;
                    }}
                />
            )}
        </li>
    );
}

/** Ventas anteriores a la agenda ya aceptadas: plegadas, cada una se puede reabrir. */
export function PreAgendaReviewedGroup({ issues, timeZone, onReview }: { issues: ReconciliationIssue[]; timeZone: string; onReview?: ReviewSubmit }) {
    return (
        <details data-testid="pre-agenda-reviewed" className="group rounded-xl border border-bos-border bg-bos-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <span>
                    <span className="block font-semibold">Ventas anteriores a la agenda aceptadas ({issues.length})</span>
                    <span className="block text-sm text-bos-muted">Ábrelo para ver quién las aceptó o reabrir alguna.</span>
                </span>
                <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-muted transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-3 border-t border-bos-border p-3">
                {issues.map((i) => <IssueCard key={i.key} issue={i} timeZone={timeZone} onReview={onReview} />)}
            </ul>
        </details>
    );
}

/** Grupo plegado de las ventas anteriores a la agenda, con "Aceptar todas". */
export function PreAgendaGroup({ issues, total, before, timeZone, onAcceptAll }: {
    issues: ReconciliationIssue[]; total: number; before: string; timeZone: string; onAcceptAll?: () => Promise<string | null>;
}) {
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const cutoff = formatDateTime(before, timeZone, { year: false });
    const others = Math.max(0, total - issues.length);
    const accept = async () => {
        setBusy(true);
        setError('');
        if (!onAcceptAll) return;
        const failure = await onAcceptAll();
        setBusy(false);
        if (failure) setError(failure); else setConfirming(false);
    };

    return (
        <details data-testid="pre-agenda-group" className="group rounded-xl border border-bos-border bg-bos-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                <span>
                    <span className="block font-semibold">Ventas anteriores a la agenda ({issues.length})</span>
                    <span className="block text-sm text-bos-muted">Cobros sin cita de antes del {cutoff}, cuando el cobro aún no pasaba por la agenda. No son errores.</span>
                </span>
                <ChevronDown aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-bos-border p-4 space-y-3 text-sm">
                <p>{PRE_AGENDA_GUIDE.why}</p>
                <p>{PRE_AGENDA_GUIDE.todo}</p>
                {others > 0 && <p className="text-bos-muted">Además de estas {issues.length}, hay {others} de otros días fuera de este periodo; &quot;Aceptar todas&quot; las incluye.</p>}
                {error && <p role="alert" className="text-bos-danger">{error}</p>}
                {!onAcceptAll ? null : !confirming ? (
                    <button type="button" onClick={() => setConfirming(true)} className={btnPrimary}>Aceptar todas ({total})</button>
                ) : (
                    <div className="rounded-xl border border-bos-border bg-bos-bg p-3 space-y-2">
                        <p className="font-semibold">¿Aceptar las {total} ventas anteriores a la agenda?</p>
                        <p className="text-bos-muted">Se guardan como revisadas a tu nombre con el motivo &quot;Venta anterior a la agenda: el cobro todavía no pasaba por la agenda.&quot; Puedes reabrir cualquiera después.</p>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={accept} disabled={busy} className={btnPrimary}>
                                {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Sí, aceptar todas
                            </button>
                            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={btnSecondary}>Cancelar</button>
                        </div>
                    </div>
                )}
                {issues.length > 0 && (
                    <ul className="divide-y divide-bos-border rounded-xl border border-bos-border">
                        {issues.map((i) => (
                            <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span className="min-w-0">
                                    <span className="font-medium">{i.name ?? 'Sin barbero'}</span>
                                    <span className="text-bos-muted"> · {timeOf(i.at, timeZone)} · {i.message.replace(/^Se cobró /, '').replace(/ y no aparece en la agenda\.$/, '')}</span>
                                </span>
                                {i.sale_id && <Link href={`/ticket/${i.sale_id}`} className="text-sm font-semibold text-bos-accent-text underline underline-offset-2">Ver ticket</Link>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </details>
    );
}
