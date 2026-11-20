'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/money/client';
import { formatMoney } from '@/lib/utils/money';
import { formatDateTime } from '@/lib/utils/dates';
import { progressText } from '@/lib/payroll/breakdown';
import { useLedger, type LedgerEntry } from '@/components/payroll/ledger-data';
import { SectionError, SectionSkeleton, card, label, sectionTitle } from './ui';

const money = (n: number) => formatMoney(n, { cents: true });

interface GoalProgress {
    goal_id: string; name: string; metric: 'services_count' | 'service_revenue';
    value: number; threshold: number; achieved: boolean; remaining: number; bonus_amount: number;
}
interface ProgressResponse {
    enabled: boolean;
    people: { employee_id: string; name: string; goals: GoalProgress[] }[];
}

/** Avance de las metas de bono de la semana en curso. Sin metas activas: `enabled: false` y no se dibuja nada. */
function useBonusProgress(employeeId: string, enabled: boolean) {
    return useQuery({
        queryKey: ['bonus-progress', employeeId],
        enabled,
        queryFn: () => getJson<ProgressResponse>(`/api/bonus-goals/progress?employee_id=${employeeId}`),
    });
}

function remainingText(g: GoalProgress): string {
    return g.metric === 'service_revenue' ? money(g.remaining) : `${g.remaining} servicio${g.remaining === 1 ? '' : 's'}`;
}

/** Una meta con su barra: texto claro y barra accesible (role="progressbar"). */
export function GoalBar({ goal, mine, name }: { goal: GoalProgress; mine: boolean; name: string }) {
    const pct = goal.threshold > 0 ? Math.min(100, Math.round((goal.value / goal.threshold) * 100)) : 0;
    const who = mine ? 'Llevas' : `${name} lleva`;
    const text = goal.achieved
        ? `¡Meta lograda! ${who} ${progressText(goal.metric, goal.value, goal.threshold)}: bono de ${money(goal.bonus_amount)}.`
        : `${who} ${progressText(goal.metric, goal.value, goal.threshold)}; ${mine ? 'te faltan' : 'le faltan'} ${remainingText(goal)} para el bono de ${money(goal.bonus_amount)}.`;
    return (
        <li data-testid="goal-progress" className="space-y-2">
            <p className="font-semibold">{goal.name}</p>
            <div role="progressbar" aria-label={`Avance hacia ${goal.name}`} aria-valuemin={0} aria-valuemax={goal.threshold} aria-valuenow={Math.min(goal.value, goal.threshold)}
                aria-valuetext={progressText(goal.metric, goal.value, goal.threshold)} className="h-3 w-full overflow-hidden rounded-full bg-bos-raised">
                <div className={`h-full rounded-full ${goal.achieved ? 'bg-bos-success' : 'bg-bos-accent'}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-sm text-bos-muted">{text}</p>
        </li>
    );
}

function entryStatus(e: LedgerEntry): string {
    if (e.entry_type === 'reversal') return 'Cancelación';
    if (e.is_cancelled) return 'Cancelado';
    if (e.settlement_id) return `Descontado en el recibo ${e.receipt_number ?? ''}`.trim();
    if (e.is_pending) return 'Se descontará en tu próximo recibo';
    return '';
}

/**
 * Dinero de la semana del barbero: lo que se descontará en el próximo recibo, su historial y —solo si hay metas activas—
 * su avance hacia cada bono. Solo lectura: no hay botones de registrar ni cancelar.
 */
export function MyMoneySections({ employeeId, mine, name, showProgress }: { employeeId: string; mine: boolean; name: string; showProgress: boolean }) {
    const ledger = useLedger(employeeId);
    const progress = useBonusProgress(employeeId, showProgress);

    const entries = ledger.data?.entries ?? [];
    const pending = ledger.data?.pending;
    const history = entries.filter((e) => e.entry_type !== 'reversal');
    const person = progress.data?.people.find((p) => p.employee_id === employeeId) ?? (mine ? progress.data?.people[0] : undefined);
    const goals = progress.data?.enabled && person ? person.goals : [];

    return (
        <>
            {ledger.isLoading && <SectionSkeleton title="Lo que se descontará" rows={2} />}
            {ledger.error && !ledger.data && <SectionError message="No se pudieron cargar tus descuentos." onRetry={() => ledger.refetch()} />}

            {pending && pending.count > 0 && (
                <section aria-labelledby="pending-title" data-testid="my-pending" className={`${card} p-4 sm:p-6`}>
                    <h2 id="pending-title" className={sectionTitle}>{mine ? 'Lo que se descontará en tu próximo recibo' : `Lo que se descontará en el próximo recibo de ${name}`}</h2>
                    <dl className="mt-3 space-y-2 text-sm">
                        {pending.advances > 0 && <div className="flex justify-between gap-3"><dt>Adelantos</dt><dd className="tabular-nums font-semibold">− {money(pending.advances)}</dd></div>}
                        {pending.loan_payments > 0 && <div className="flex justify-between gap-3"><dt>Abonos a préstamo</dt><dd className="tabular-nums font-semibold">− {money(pending.loan_payments)}</dd></div>}
                        {pending.deductions > 0 && <div className="flex justify-between gap-3"><dt>Descuentos</dt><dd className="tabular-nums font-semibold">− {money(pending.deductions)}</dd></div>}
                        {pending.carryover > 0 && <div className="flex justify-between gap-3"><dt>Pendiente de la semana anterior</dt><dd className="tabular-nums font-semibold">− {money(pending.carryover)}</dd></div>}
                    </dl>
                    <p className={`${label} mt-3`}>Si lo descontado es más que lo ganado, el recibo sale en $0 y lo que falte pasa a la semana siguiente.</p>
                </section>
            )}

            {goals.length > 0 && (
                <section aria-labelledby="goals-progress-title" data-testid="my-goals" className={`${card} p-4 sm:p-6`}>
                    <h2 id="goals-progress-title" className={sectionTitle}>{mine ? 'Tu avance hacia el bono' : `Avance de ${name} hacia el bono`}</h2>
                    <ul className="mt-3 space-y-5">
                        {goals.map((g) => <GoalBar key={g.goal_id} goal={g} mine={mine} name={name} />)}
                    </ul>
                </section>
            )}

            {history.length > 0 && (
                <section aria-labelledby="my-ledger-title" data-testid="my-ledger" className={`${card} p-4 sm:p-6 lg:col-span-2`}>
                    <h2 id="my-ledger-title" className={sectionTitle}>{mine ? 'Mis adelantos, préstamos y descuentos' : `Adelantos, préstamos y descuentos de ${name}`}</h2>
                    <ul className="mt-3 divide-y divide-bos-border">
                        {history.map((e) => (
                            <li key={e.id} className={`py-3 text-sm ${e.is_cancelled ? 'opacity-70' : ''}`}>
                                <p className={`font-semibold ${e.is_cancelled ? 'line-through' : ''}`}>{e.label} · {money(e.amount)}</p>
                                <p className="break-words text-bos-muted">{e.reason}</p>
                                <p className="text-xs text-bos-muted">{formatDateTime(e.created_at)}{entryStatus(e) ? ` · ${entryStatus(e)}` : ''}</p>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}
