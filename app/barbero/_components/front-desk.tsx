'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getJson } from '@/lib/money/client';
import { accruedText, longDayLabel, weekDates } from '@/lib/payroll/wage-ui';
import { DAY_STATUS_LABELS, WEEKDAY_SHORT } from '@/lib/payroll/wages';
import type { MyWeek } from '@/lib/barber/my-week';
import { weekLabel } from '@/lib/settlements/week';
import { toUserMessage } from '@/lib/utils/errors';
import { formatMoney } from '@/lib/utils/money';
import { SectionError, SectionSkeleton, card, label, moneyC, sectionTitle } from './ui';
import type { WeekPerson, WeekWagesResponse } from '@/components/payroll/WeekWages';

const money = (n: number) => formatMoney(n, { cents: true });
const empty = 'rounded-lg bg-bos-raised px-4 py-5 text-center text-[15px] text-bos-muted';

const CELL: Record<string, string> = {
    worked: 'bg-bos-success-soft text-bos-success border-bos-success',
    absent: 'bg-bos-danger-soft text-bos-danger border-bos-danger',
    extra: 'bg-bos-accent-soft text-bos-accent-text border-bos-accent',
    rest: 'bg-bos-bg text-bos-muted border-bos-border',
};
const MARK: Record<string, string> = { worked: '✓', absent: '✗', extra: '+', rest: '·' };

/** Sueldo de la semana en curso de la persona que entró (la API ya limita a lo suyo). null = sin sueldo por día. */
function useMyWage(employeeId: string) {
    const [week, setWeek] = useState<WeekWagesResponse | null>(null);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setError('');
        try { setWeek(await getJson<WeekWagesResponse>('/api/wages/week')); }
        catch (e) { console.error(e); setError(toUserMessage(e, 'No se pudo cargar tu sueldo.')); }
    }, []);
    useEffect(() => { load(); }, [load]);
    const person: WeekPerson | null = week ? (week.people ?? []).find((p) => p.employee_id === employeeId) ?? (week.people ?? [])[0] ?? null : null;
    return { week, person, error, reload: load, loading: !week && !error };
}

/**
 * «Mi semana» de recepción: su sueldo por día de la semana (día por día), lo que lleva por cobrar (sueldo devengado,
 * comisiones de producto y propinas) y sus recibos. Es la misma pantalla del barbero sin lo que solo aplica a quien
 * corta: agenda del día, cortes, clientes y ranking. Solo lectura y solo lo suyo.
 */
export function FrontDeskWeek({ employeeId, data, mine }: { employeeId: string; data: MyWeek | null; mine: boolean }) {
    const { week, person, error, reload, loading } = useMyWage(employeeId);

    if (loading) return <SectionSkeleton title="Mi sueldo" rows={4} />;
    if (error || !week) return <SectionError message={error || 'No se pudo cargar tu sueldo.'} onRetry={reload} />;

    const wage = person?.wage ?? null;
    const byDate = new Map((wage?.days ?? []).map((d) => [d.date, d]));
    const accrued = person?.accrued_amount ?? 0;
    const e = data?.earnings;
    const tips = e?.tipsCents ?? 0;
    const owed = accrued + (e ? e.totalCents / 100 : 0);

    return (
        <>
            <section aria-labelledby="my-wage-title" data-testid="my-wage" className={`${card} space-y-4 p-4 sm:p-6`}>
                <div>
                    <h2 id="my-wage-title" className={sectionTitle}>{mine ? 'Mi sueldo por día' : 'Sueldo por día'}</h2>
                    <p className="text-sm text-bos-muted">Semana del {weekLabel(week.period_start)}</p>
                </div>

                {!person || !wage ? (
                    <p className={empty} data-testid="my-wage-empty">{mine ? 'No tienes un sueldo por día asignado: ganas por comisión y propinas.' : 'No tiene un sueldo por día asignado.'}</p>
                ) : (
                    <>
                        <div>
                            <p className={label}>{mine ? 'Llevas de sueldo esta semana' : 'Lleva de sueldo esta semana'}</p>
                            <p data-testid="my-wage-accrued" className="mt-1 font-display text-5xl font-semibold tabular-nums text-bos-accent-text">{money(accrued)}</p>
                            <p className="mt-1 text-sm text-bos-muted">{accruedText(person.accrued_days, accrued)}. Semana completa: <span className="font-semibold text-bos-text">{money(person.amount)}</span> ({person.summary?.replace('Sueldo: ', '') ?? ''}).</p>
                        </div>

                        <ol aria-label="Días de la semana" className="grid grid-cols-7 gap-1.5">
                            {weekDates(week.period_start).map((date, i) => {
                                const day = byDate.get(date);
                                const key = day ? day.status : 'rest';
                                const future = date > week.today;
                                return (
                                    <li key={date} data-testid={`my-day-${date}`} data-status={key}
                                        className={`flex min-w-0 flex-col items-center rounded-lg border px-0.5 py-1.5 text-center ${CELL[key]} ${future ? 'border-dashed' : ''}`}>
                                        <span className="text-[11px] font-medium">{WEEKDAY_SHORT[i]}</span>
                                        <span aria-hidden="true" className="text-base font-bold leading-6">{MARK[key]}</span>
                                        <span className="sr-only">{day ? `${DAY_STATUS_LABELS[day.status]}${future ? ', por venir' : ''}` : 'Descanso'}</span>
                                        <span className="text-[11px] tabular-nums">{day && day.amount > 0 ? formatMoney(day.amount) : '—'}</span>
                                    </li>
                                );
                            })}
                        </ol>
                        <p className="text-xs text-bos-muted">✓ trabajó · ✗ faltó · + día extra · · descanso. Los días que aún no llegan cuentan como trabajados si son tus días fijos.</p>

                        {person.exceptions.filter((x) => !x.voided_at).length > 0 && (
                            <ul data-testid="my-wage-exceptions" className="divide-y divide-bos-border">
                                {person.exceptions.filter((x) => !x.voided_at).map((x) => (
                                    <li key={x.id} className="py-2.5 text-sm">
                                        <p className="font-semibold">{x.label} · {longDayLabel(x.work_date)}</p>
                                        <p className="break-words text-bos-muted">{x.reason}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="rounded-lg bg-bos-raised px-4 py-3 text-sm text-bos-text">
                            {person.settled ? `Esta semana ya se pagó${person.receipt_number ? ` (recibo ${person.receipt_number})` : ''}.` : 'Se paga en tu recibo semanal, con corte el sábado a las 8:00 p. m.'}
                        </p>
                    </>
                )}
            </section>

            <section aria-labelledby="my-owed-title" data-testid="my-owed" className={`${card} space-y-4 p-4 sm:p-6`}>
                <div>
                    <p id="my-owed-title" className={label}>{mine ? 'Lo que llevas por cobrar esta semana' : 'Lo que lleva por cobrar esta semana'}</p>
                    <p data-testid="my-owed-total" className="mt-1 font-display text-5xl font-semibold tabular-nums">{money(owed)}</p>
                    <p className="mt-1 text-sm text-bos-muted">Antes de adelantos y descuentos. Puede cambiar si se anula una venta.</p>
                </div>
                <dl className="space-y-2 border-t border-bos-border pt-4 text-[15px]">
                    <div className="flex justify-between gap-4"><dt className="text-bos-muted">Sueldo devengado</dt><dd className="font-semibold tabular-nums">{money(accrued)}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-bos-muted">Comisión de productos</dt><dd className="font-semibold tabular-nums">{moneyC(e?.productCents ?? 0)}</dd></div>
                    {(e?.serviceCents ?? 0) > 0 && (
                        <div className="flex justify-between gap-4"><dt className="text-bos-muted">Comisión de servicios</dt><dd className="font-semibold tabular-nums">{moneyC(e?.serviceCents ?? 0)}</dd></div>
                    )}
                    <div className="flex justify-between gap-4"><dt className="text-bos-muted">{mine ? 'Propinas (100 % tuyas)' : 'Propinas (100 % suyas)'}</dt><dd className="font-semibold tabular-nums">{moneyC(tips)}</dd></div>
                </dl>
                {!data && <p className="text-sm text-bos-muted">Las comisiones y propinas se están cargando…</p>}
                <Link href="/liquidaciones" className="flex min-h-12 items-center justify-between rounded-xl border border-bos-border px-4 text-[15px] font-semibold hover:bg-bos-raised">
                    {mine ? 'Ver mis recibos' : 'Ver recibos'} <ChevronRight aria-hidden="true" className="h-5 w-5 text-bos-muted" />
                </Link>
            </section>
        </>
    );
}
