'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReadOnlyNotice, useReadOnly } from '@/lib/auth/read-only';
import { ArrowDown, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { presetRange, type PresetId } from '@/lib/reports/metrics';
import {
    ISSUE_KINDS, ISSUE_LABELS, countByKind, groupIssues, issueCounts, issueEmployees, moneySummary, rowState,
    type IssueKind, type IssueTab, type Reconciliation, type ReconciliationIssue, type ReviewDecision,
} from '@/lib/reports/reconciliation';
import { localDateKey } from '@/lib/utils/dates';
import { IssueCard, PreAgendaGroup, PreAgendaReviewedGroup, dayLabel, money } from './parts';
import { RECONCILIATION_LABELS, reconciliationRowText, reconciliationSummaryText } from './labels';

const PRESETS: { id: Exclude<PresetId, 'custom' | 'last30'>; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const chip = (on: boolean) => `min-h-11 px-3 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 ${on ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`;

/**
 * Cuadre: lo que dice la agenda, lo que se cobró, la comisión que eso generó y lo que ya se pagó al equipo
 * tienen que coincidir. Cada diferencia dice qué pasó, por qué importa y qué hacer; el dueño o la gerencia la
 * corrige o la marca como revisada con motivo (queda en el historial y en la bitácora).
 */
export default function ReconciliationPage() {
    // Cuenta de consulta: ve el cuadre y las diferencias, sin revisarlas ni aceptarlas.
    const readOnly = useReadOnly();
    const today = useMemo(() => localDateKey(new Date()), []);
    const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('today');
    const [data, setData] = useState<Reconciliation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [tab, setTab] = useState<IssueTab>('pendiente');
    const [kind, setKind] = useState<IssueKind | 'all'>('all');
    const [employee, setEmployee] = useState<string>('all');
    const listHeading = useRef<HTMLHeadingElement>(null);

    const fetchData = useCallback(async () => {
        const { from, to } = presetRange(preset, today);
        const res = await fetch(`/api/reconciliation?from=${from}&to=${to}`, { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || 'No se pudo cargar el cuadre.');
        return body as Reconciliation;
    }, [preset, today]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setData(await fetchData());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo cargar el cuadre.');
        } finally { setLoading(false); }
    }, [fetchData]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setNotice(''); setKind('all'); setEmployee('all'); }, [preset]);

    /** Recarga sin vaciar la pantalla, después de revisar algo. */
    const refresh = useCallback(async () => {
        try { setData(await fetchData()); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el cuadre.'); }
    }, [fetchData]);

    const post = async (payload: object): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> => {
        try {
            const res = await fetch('/api/reconciliation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const body = await res.json().catch(() => null);
            if (!res.ok) return { ok: false, error: body?.error || 'No se pudo guardar la revisión.' };
            return { ok: true, body: body ?? {} };
        } catch {
            return { ok: false, error: 'No hay conexión. Intenta de nuevo.' };
        }
    };

    const review = async (issue: ReconciliationIssue, decision: ReviewDecision, reason: string) => {
        const result = await post({ action: 'review', key: issue.key, decision, reason });
        if (!result.ok) return result.error;
        setNotice(decision === 'aceptada'
            ? `Listo: "${ISSUE_LABELS[issue.kind]}" de ${issue.name ?? 'sin barbero'} quedó como revisada. La encuentras en Revisadas.`
            : `Listo: "${ISSUE_LABELS[issue.kind]}" de ${issue.name ?? 'sin barbero'} volvió a Por revisar.`);
        await refresh();
        return null;
    };

    const acceptAll = async () => {
        const result = await post({ action: 'accept_pre_agenda' });
        if (!result.ok) return result.error;
        const n = Number(result.body.accepted ?? 0);
        setNotice(n > 0 ? `Listo: se aceptaron ${plural(n, 'venta anterior', 'ventas anteriores')} a la agenda.` : 'No quedaba ninguna venta anterior a la agenda por aceptar.');
        await refresh();
        return null;
    };

    const goToList = () => {
        setTab('pendiente');
        document.getElementById('diferencias')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        listHeading.current?.focus({ preventScroll: true });
    };

    const sum = data ? moneySummary(data.rows) : null;
    const counts = data ? issueCounts(data) : { pending: 0, reviewed: 0, total: 0 };
    const tz = data?.range.timezone ?? 'America/Mexico_City';
    const preAgendaTotal = Number(data?.summary?.pre_agenda_pending_total ?? 0);
    const preAgendaInRange = Number(data?.summary?.pre_agenda_pending ?? 0);
    const employees = data ? issueEmployees(data.issues) : [];
    const kindCounts = data ? countByKind(data.issues, tab, employee) : null;
    const groups = data ? groupIssues(data.issues, { tab, kind, employee }) : { preAgenda: [], others: [] };
    const fixable = counts.pending - preAgendaInRange;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Cuadre</h1>
                    <p className="text-sm text-bos-muted max-w-2xl">Compara la agenda con lo cobrado y con lo que se le paga al equipo. Si algo no coincide, aquí aparece qué pasó y qué hacer.</p>
                </div>
                <div role="group" aria-label="Periodo" className="flex gap-2">
                    {PRESETS.map((p) => (
                        <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}
                            className={`min-h-11 px-3.5 rounded-full border text-sm font-medium ${preset === p.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`}>{p.label}</button>
                    ))}
                </div>
            </header>
            <ReadOnlyNotice readOnly={readOnly}>Ves el cuadre y las diferencias, pero no las marcas como revisadas.</ReadOnlyNotice>

            {error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bos-border bg-bos-danger-soft p-4">
                    <p className="text-bos-danger font-medium">{error}</p>
                    <button type="button" onClick={load} className="min-h-11 px-4 rounded-xl border border-bos-border bg-bos-surface font-semibold">Reintentar</button>
                </div>
            )}
            {loading && (
                <div role="status" className="flex flex-col items-center gap-2 py-16 text-bos-muted">
                    <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin" />
                    <span className="text-sm">Cargando el cuadre…</span>
                </div>
            )}

            {!loading && data && sum && (
                <>
                    {counts.pending === 0 ? (
                        <section data-testid="reconciliation-status" className="flex items-start gap-3 rounded-xl border border-bos-border bg-bos-success-soft p-4">
                            <CheckCircle2 aria-hidden="true" className="h-6 w-6 shrink-0 text-bos-success" />
                            <div>
                                <p className="font-semibold text-bos-success">Todo cuadra</p>
                                <p className="text-sm text-bos-text">
                                    {counts.reviewed > 0
                                        ? `No queda nada por revisar. ${plural(counts.reviewed, 'diferencia ya se revisó', 'diferencias ya se revisaron')} en este periodo.`
                                        : 'La agenda, los cobros y las comisiones coinciden en este periodo.'}
                                </p>
                            </div>
                        </section>
                    ) : (
                        <button type="button" data-testid="reconciliation-status" onClick={goToList}
                            className="w-full flex items-start gap-3 rounded-xl border border-bos-border bg-bos-surface p-4 text-left hover:bg-bos-raised">
                            <TriangleAlert aria-hidden="true" className="h-6 w-6 shrink-0 text-bos-danger" />
                            <span className="min-w-0 flex-1">
                                <span className="block font-semibold">{plural(counts.pending, 'diferencia por revisar', 'diferencias por revisar')}</span>
                                <span className="block text-sm text-bos-muted">
                                    {preAgendaInRange > 0 && fixable > 0 && `${plural(fixable, 'necesita', 'necesitan')} tu atención; ${preAgendaInRange} ${preAgendaInRange === 1 ? 'es una venta anterior' : 'son ventas anteriores'} a la agenda y se aceptan de una vez.`}
                                    {preAgendaInRange > 0 && fixable <= 0 && 'Todas son ventas anteriores a la agenda: se aceptan de una vez.'}
                                    {preAgendaInRange === 0 && (counts.pending === 1 ? 'Dice qué pasó y qué hacer.' : 'Cada una dice qué pasó y qué hacer.')}
                                </span>
                            </span>
                            <span className="hidden sm:inline-flex items-center gap-1 self-center text-sm font-semibold text-bos-accent-text">Ver la lista <ArrowDown aria-hidden="true" className="h-4 w-4" /></span>
                        </button>
                    )}

                    <section aria-label="Resumen del periodo" className="rounded-xl border border-bos-border bg-bos-surface p-4 sm:p-5">
                        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                            <div>
                                <dt className="text-[13px] text-bos-muted">{RECONCILIATION_LABELS.agenda}</dt>
                                <dd className="font-display text-2xl font-semibold tabular-nums">{sum.agenda}</dd>
                            </div>
                            <div>
                                <dt className="text-[13px] text-bos-muted">{RECONCILIATION_LABELS.charged}</dt>
                                <dd className="font-display text-2xl font-semibold tabular-nums">{sum.charged}</dd>
                                <dd className="text-sm text-bos-muted tabular-nums">{RECONCILIATION_LABELS.chargedHint} · por {money(sum.amount)}</dd>
                            </div>
                            <div>
                                <dt className="text-[13px] text-bos-muted">Comisión generada</dt>
                                <dd className="font-display text-2xl font-semibold tabular-nums">{money(sum.commission)}</dd>
                            </div>
                            <div>
                                <dt className="text-[13px] text-bos-muted">Ya pagada al equipo</dt>
                                <dd className="font-display text-2xl font-semibold tabular-nums">{money(sum.inReceipt)}</dd>
                            </div>
                            <div className="col-span-2 lg:col-span-1">
                                <dt className="text-[13px] text-bos-muted">Falta por pagar</dt>
                                <dd className="font-display text-2xl font-semibold tabular-nums text-bos-accent-text">{money(sum.commissionPending)}</dd>
                            </div>
                        </dl>
                        <p className="mt-4 text-sm text-bos-muted">
                            {reconciliationSummaryText(sum.charged, sum.agenda)}
                            {' '}{RECONCILIATION_LABELS.note}
                            {' '}La comisión se paga en el pago semanal; &quot;falta por pagar&quot; es lo que aún no está en un recibo pagado.
                        </p>
                    </section>

                    <section id="diferencias" aria-labelledby="diferencias-title" className="space-y-4 scroll-mt-4">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <h2 id="diferencias-title" ref={listHeading} tabIndex={-1} className="font-display text-xl font-semibold tracking-tight">Diferencias</h2>
                            <div role="tablist" aria-label="Estado de las diferencias" className="inline-flex rounded-xl border border-bos-border bg-bos-surface p-1">
                                {([['pendiente', 'Por revisar', counts.pending], ['revisada', 'Revisadas', counts.reviewed]] as const).map(([id, label, n]) => (
                                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setKind('all'); }}
                                        className={`min-h-11 px-3 rounded-lg text-sm font-semibold ${tab === id ? 'bg-bos-raised text-bos-text' : 'text-bos-muted hover:text-bos-text'}`}>
                                        {label} ({n})
                                    </button>
                                ))}
                            </div>
                        </div>

                        {notice && (
                            <p role="status" className="flex items-start gap-2 rounded-xl border border-bos-border bg-bos-success-soft p-3 text-sm text-bos-text">
                                <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-success" />{notice}
                            </p>
                        )}

                        {(counts.total > 0) && kindCounts && (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
                                    <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')} className={chip(kind === 'all')}>
                                        Todas <span className="tabular-nums">{Object.values(kindCounts).reduce((a, b) => a + b, 0)}</span>
                                    </button>
                                    {ISSUE_KINDS.filter((k) => kindCounts[k] > 0 || kind === k).map((k) => (
                                        <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
                                            {ISSUE_LABELS[k]} <span className="tabular-nums">{kindCounts[k]}</span>
                                        </button>
                                    ))}
                                </div>
                                {employees.length > 1 && (
                                    <label className="flex items-center gap-2 text-sm">
                                        <span className="text-bos-muted">Barbero</span>
                                        <select value={employee} onChange={(e) => setEmployee(e.target.value)}
                                            className="min-h-11 rounded-xl border border-bos-control bg-bos-surface px-3 text-bos-text">
                                            <option value="all">Todos</option>
                                            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                                        </select>
                                    </label>
                                )}
                            </div>
                        )}

                        {tab === 'pendiente' && groups.preAgenda.length > 0 && (
                            <PreAgendaGroup issues={groups.preAgenda} total={Math.max(preAgendaTotal, groups.preAgenda.length)}
                                before={data.summary?.pre_agenda_before ?? '2026-11-15T17:56:46Z'} timeZone={tz} onAcceptAll={readOnly ? undefined : acceptAll} />
                        )}

                        {tab === 'revisada' && groups.preAgenda.length > 0 && (
                            <PreAgendaReviewedGroup issues={groups.preAgenda} timeZone={tz} onReview={readOnly ? undefined : review} />
                        )}

                        {groups.others.length > 0 ? (
                            <ul className="space-y-3">
                                {groups.others.map((i) => <IssueCard key={i.key} issue={i} timeZone={tz} onReview={readOnly ? undefined : review} />)}
                            </ul>
                        ) : groups.preAgenda.length === 0 && (
                            <p className="rounded-xl border border-dashed border-bos-border p-6 text-center text-sm text-bos-muted">
                                {tab === 'pendiente'
                                    ? (kind !== 'all' || employee !== 'all' ? 'No hay diferencias por revisar con estos filtros.' : 'No hay nada por revisar en este periodo.')
                                    : (kind !== 'all' || employee !== 'all' ? 'No hay diferencias revisadas con estos filtros.' : 'Todavía no se ha revisado ninguna diferencia de este periodo.')}
                            </p>
                        )}
                    </section>

                    <section aria-labelledby="detalle-title" className="space-y-3">
                        <h2 id="detalle-title" className="font-display text-xl font-semibold tracking-tight">Por barbero y día</h2>
                        {data.rows.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-bos-border p-6 text-center text-sm text-bos-muted">Sin servicios en este periodo.</p>
                        ) : (
                            <>
                                <div className="hidden md:block rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-bos-border text-left text-[13px] text-bos-muted">
                                                <th className="px-4 py-3 font-medium">Día</th>
                                                <th className="px-4 py-3 font-medium">Barbero</th>
                                                <th className="px-4 py-3 font-medium text-right">{RECONCILIATION_LABELS.columnAgenda}</th>
                                                <th className="px-4 py-3 font-medium text-right">{RECONCILIATION_LABELS.columnCharged}</th>
                                                <th className="px-4 py-3 font-medium text-right">Importe</th>
                                                <th className="px-4 py-3 font-medium text-right">Comisión</th>
                                                <th className="px-4 py-3 font-medium text-right">Ya pagada</th>
                                                <th className="px-4 py-3 font-medium">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.rows.map((r) => (
                                                <tr key={`${r.day}-${r.employee_id}`} data-testid="reconciliation-row" className="border-b border-bos-border last:border-0">
                                                    <td className="px-4 py-3 whitespace-nowrap first-letter:uppercase">{dayLabel(r.day)}</td>
                                                    <td className="px-4 py-3 font-medium">{r.name}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{r.agenda_services}{Number(r.agenda_walk_in) > 0 && <span className="text-bos-muted"> ({r.agenda_walk_in} sin cita)</span>}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{r.charged_services}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{money(r.charged_amount)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{money(r.commission)}</td>
                                                    <td className="px-4 py-3 text-right tabular-nums">{money(r.commission_in_receipt)}</td>
                                                    <td className="px-4 py-3"><RowBadge row={r} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <ul className="space-y-2 md:hidden">
                                    {data.rows.map((r) => (
                                        <li key={`${r.day}-${r.employee_id}`} data-testid="reconciliation-row" className="rounded-xl border border-bos-border bg-bos-surface p-3 text-sm">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="font-semibold">{r.name} <span className="font-normal text-bos-muted first-letter:uppercase">· {dayLabel(r.day)}</span></p>
                                                <RowBadge row={r} />
                                            </div>
                                            <p className="mt-1 text-bos-muted">
                                                {reconciliationRowText(r, money(r.charged_amount))}
                                            </p>
                                            <p className="text-bos-muted">Comisión {money(r.commission)} · Pagada {money(r.commission_in_receipt)}</p>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

function RowBadge({ row }: { row: Reconciliation['rows'][number] }) {
    const state = rowState(row);
    const pending = Number(row.issues_pending ?? row.issues);
    const text = state === 'cuadra' ? 'Cuadra' : state === 'revisado' ? 'Revisado' : `${pending} por revisar`;
    return (
        <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold ${state === 'pendiente' ? 'bg-bos-danger-soft text-bos-danger' : 'bg-bos-success-soft text-bos-success'}`}>
            {text}
        </span>
    );
}
