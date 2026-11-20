'use client';

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/utils/dates';
import { formatMoney } from '@/lib/utils/money';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import CancelEntry from './CancelEntry';
import LedgerForm, { type Person } from './LedgerForm';
import { PAID_FROM_LABELS, useLedger, type LedgerEntry, type PendingSummary } from './ledger-data';

const money = (n: number) => formatMoney(n, { cents: true });

interface Props {
    people: Person[];
    /** Si viene, solo esa persona (ficha de Equipo). Sin él, todo el equipo (Pago semanal). */
    employeeId?: string | null;
    title?: string;
    /** Se llama cuando algo cambió (para refrescar la vista previa del pago). */
    onChanged?: () => void;
    /** Cuenta de consulta: ve el libro pero no registra. */
    readOnly?: boolean;
}

function statusOf(e: LedgerEntry): { text: string; tone: string } {
    if (e.entry_type === 'reversal') return { text: 'Cancelación', tone: 'text-bos-muted' };
    if (e.is_cancelled) return { text: 'Cancelado', tone: 'text-bos-muted' };
    if (e.settlement_id) return { text: `En el recibo ${e.receipt_number ?? ''}`.trim(), tone: 'text-bos-success' };
    if (e.is_pending) return { text: 'Pendiente: se descontará en el próximo recibo', tone: 'text-bos-accent-text' };
    return { text: '', tone: '' };
}

/**
 * "Movimientos del equipo": lo pendiente por descontar, préstamos con saldo, historial y el formulario para registrar.
 * Lo usan Pago semanal (todo el equipo) y la ficha de cada persona en Equipo. Quien no es gerencia (can_edit = false)
 * solo lee. El servidor es quien decide; aquí solo se ocultan los botones.
 */
export default function TeamLedger({ people, employeeId = null, title = 'Movimientos del equipo', onChanged, readOnly = false }: Props) {
    const q = useLedger(employeeId);
    const [registering, setRegistering] = useState(false);
    const [cancelling, setCancelling] = useState<LedgerEntry | null>(null);

    if (q.isLoading) {
        return <div role="status" aria-busy="true"><span className="sr-only">Cargando movimientos…</span><Skeleton className="h-40 w-full rounded-xl" /></div>;
    }
    if (q.error || !q.data) {
        return <ErrorState title="No se pudieron cargar los movimientos" message={toUserMessage(q.error)} offline={isOfflineError(q.error)} onRetry={() => q.refetch()} />;
    }

    const entries = q.data.entries ?? [];
    const loans = q.data.loans ?? [];
    const pending: PendingSummary = { count: 0, receipt_effect: 0, advances: 0, deductions: 0, loan_payments: 0, carryover: 0 };
    Object.assign(pending, q.data.pending);
    const canEdit = Boolean(q.data.can_edit);
    const canWrite = canEdit && !readOnly;
    const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? entries.find((e) => e.employee_id === id)?.employee_name ?? '';
    const pendingEntries = entries.filter((e) => e.is_pending && !e.is_cancelled && e.entry_type !== 'reversal');
    const activeLoans = loans.filter((l) => l.status === 'active' && l.outstanding > 0);
    const history = entries.filter((e) => e.entry_type !== 'reversal');
    const showPerson = employeeId === null;

    const summaryParts: string[] = [];
    if (pending.advances > 0) summaryParts.push(`Adelantos ${money(pending.advances)}`);
    if (pending.loan_payments > 0) summaryParts.push(`Abonos a préstamo ${money(pending.loan_payments)}`);
    if (pending.deductions > 0) summaryParts.push(`Descuentos ${money(pending.deductions)}`);
    if (pending.carryover > 0) summaryParts.push(`Pendiente anterior ${money(pending.carryover)}`);

    return (
        <section aria-labelledby="team-ledger-title" data-testid="team-ledger" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 id="team-ledger-title" className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
                    <p className="text-sm text-bos-muted">Adelantos, préstamos y descuentos que se restan en el recibo semanal.</p>
                </div>
                {canWrite && !registering && <Button onClick={() => setRegistering(true)}><Plus className="h-4 w-4" aria-hidden="true" />Registrar</Button>}
            </div>

            {registering && canWrite && (
                <LedgerForm people={people} employeeId={employeeId} loans={loans} onClose={() => setRegistering(false)}
                    onDone={() => { setRegistering(false); onChanged?.(); }} />
            )}

            <Card as="section" aria-labelledby="ledger-pending-title" data-testid="ledger-pending">
                <h3 id="ledger-pending-title" className="font-display text-lg font-semibold">Pendiente por descontar</h3>
                {pendingEntries.length === 0 ? (
                    <p className="mt-1 text-sm text-bos-muted">No hay nada pendiente: el próximo recibo sale sin descuentos de este tipo.</p>
                ) : (
                    <>
                        <p className="mt-1 text-sm text-bos-muted" data-testid="ledger-pending-summary">
                            Se descontará en el próximo recibo: <strong className="text-bos-text">{summaryParts.join(' · ') || money(Math.abs(pending.receipt_effect))}</strong>
                        </p>
                        <ul className="mt-3 divide-y divide-bos-border">
                            {pendingEntries.map((e) => (
                                <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                                    <span className="min-w-0">
                                        <span className="font-semibold">{e.label}</span>{showPerson && <> · {e.employee_name}</>}
                                        <span className="block text-bos-muted break-words">{e.reason}</span>
                                    </span>
                                    <span className="font-semibold tabular-nums whitespace-nowrap">− {money(Math.abs(e.receipt_effect || e.amount))}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </Card>

            <Card as="section" aria-labelledby="ledger-loans-title" data-testid="ledger-loans">
                <h3 id="ledger-loans-title" className="font-display text-lg font-semibold">Préstamos con saldo</h3>
                {activeLoans.length === 0 ? (
                    <p className="mt-1 text-sm text-bos-muted">No hay préstamos con saldo.</p>
                ) : (
                    <ul className="mt-2 divide-y divide-bos-border">
                        {activeLoans.map((l) => (
                            <li key={l.id} className="py-2 text-sm">
                                <p className="font-semibold">{showPerson ? `${nameOf(l.employee_id)} · ` : ''}Debe {money(l.outstanding)}</p>
                                <p className="text-bos-muted">Préstamo de {money(l.principal)} · abono semanal {money(l.weekly_amount)} · {l.reason}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <Card as="section" aria-labelledby="ledger-history-title" data-testid="ledger-history" padded={false}>
                <h3 id="ledger-history-title" className="p-4 pb-2 font-display text-lg font-semibold sm:px-6">Historial</h3>
                {history.length === 0 ? (
                    <EmptyState title="Todavía no hay movimientos" description="Cuando registres un adelanto, préstamo o descuento aparecerá aquí." />
                ) : (
                    <ul className="divide-y divide-bos-border">
                        {history.map((e) => {
                            const st = statusOf(e);
                            return (
                                <li key={e.id} data-testid="ledger-entry" className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 ${e.is_cancelled ? 'opacity-70' : ''}`}>
                                    <div className="min-w-0 space-y-0.5 text-sm">
                                        <p className={`font-semibold ${e.is_cancelled ? 'line-through' : ''}`}>
                                            {e.label}{showPerson && <> · {e.employee_name}</>} · {money(e.amount)}
                                        </p>
                                        <p className="break-words text-bos-muted">{e.reason}</p>
                                        <p className="text-xs text-bos-muted">
                                            {formatDateTime(e.created_at)}{e.paid_from ? ` · ${PAID_FROM_LABELS[e.paid_from]}` : ''}{e.created_by_name ? ` · ${e.created_by_name}` : ''}
                                        </p>
                                        {st.text && <p className={`text-xs font-medium ${st.tone}`}>{st.text}</p>}
                                    </div>
                                    {canWrite && e.can_cancel && (
                                        <Button variant="secondary" size="sm" onClick={() => setCancelling(e)} aria-label={`Cancelar ${e.label.toLowerCase()} de ${e.employee_name}`}>Cancelar</Button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Card>

            {cancelling && <CancelEntry entry={cancelling} onClose={() => setCancelling(null)} onDone={() => onChanged?.()} />}
        </section>
    );
}
