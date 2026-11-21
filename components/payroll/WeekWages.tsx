'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarMinus, CalendarPlus, Undo2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import PinConfirm from '@/components/ui/PinConfirm';
import { useToast } from '@/components/ui/Toast';
import { getJson, sendJson } from '@/lib/money/client';
import { accruedText, canRegisterExceptions, exceptionDayOptions, longDayLabel, weekDates, weekdayOfDate, type ExceptionKind } from '@/lib/payroll/wage-ui';
import { DAY_STATUS_LABELS, WEEKDAY_SHORT, type WageWeek } from '@/lib/payroll/wages';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { formatDateTime } from '@/lib/utils/dates';
import { formatMoney } from '@/lib/utils/money';

export interface WeekException {
    id: string; work_date: string; kind: ExceptionKind; reason: string; created_at: string; voided_at: string | null; void_reason: string | null;
    can_void: boolean; label: string; created_by_name: string | null; voided_by_name: string | null;
}
export interface WeekPerson {
    employee_id: string; name: string; settled: boolean; settlement_id: string | null; receipt_number: string | null; can_edit: boolean;
    amount: number; summary: string | null; accrued_amount: number; accrued_days: number; wage: WageWeek | null; exceptions: WeekException[];
}
export interface WeekWagesResponse {
    period_start: string; period_end: string; today: string; can_edit: boolean; people: WeekPerson[];
    /** Fecha de pago (sábado) y periodo de transición (lib/payroll/pay-period.ts). */
    pay_date?: string; is_transition?: boolean;
}

interface Props {
    periodStart: string;
    /** Cuenta de consulta: ve todo pero no registra nada. */
    readOnly?: boolean;
    /** Se llama cuando se registró o anuló algo (para refrescar los montos de la vista previa). */
    onChanged?: () => void;
}

type Pending =
    | { type: 'register'; person: WeekPerson; kind: ExceptionKind }
    | { type: 'void'; person: WeekPerson; exception: WeekException };

const CELL: Record<string, string> = {
    worked: 'bg-bos-success-soft text-bos-success border-bos-success',
    absent: 'bg-bos-danger-soft text-bos-danger border-bos-danger',
    extra: 'bg-bos-accent-soft text-bos-accent-text border-bos-accent',
    rest: 'bg-bos-bg text-bos-muted border-bos-border',
};
const MARK: Record<string, string> = { worked: '✓', absent: '✗', extra: '+', rest: '·' };
/** Cómo se nombra cada excepción en botones y títulos ("Registrar falta", no "Registrar faltó"). */
const NOUN: Record<ExceptionKind, string> = { absent: 'falta', extra: 'día extra' };

/**
 * Sueldo por día del periodo que se está viendo en Pago semanal: qué días cuenta cada persona, faltas y días extra.
 * Gerencia registra "Faltó" o "Día extra" y los anula (con motivo y PIN) mientras la semana no esté pagada. Con la
 * semana pagada, o en una cuenta de consulta, todo es solo lectura. El monto sale de la base: la pantalla no calcula.
 */
export default function WeekWages({ periodStart, readOnly = false, onChanged }: Props) {
    const toast = useToast();
    const [data, setData] = useState<WeekWagesResponse | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [pending, setPending] = useState<Pending | null>(null);
    const [pickedDay, setPickedDay] = useState('');

    const load = useCallback(async (quiet = false) => {
        if (!quiet) { setData(null); }
        setError(null);
        try {
            setData(await getJson<WeekWagesResponse>(`/api/wages/week?period_start=${periodStart}`));
        } catch (e) { console.error(e); setError(e); }
    }, [periodStart]);
    useEffect(() => { load(); }, [load]);

    if (error && !data) {
        return <ErrorState title="No se pudo cargar el sueldo por día" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={() => load()} />;
    }
    if (!data) {
        return <div role="status" aria-busy="true"><span className="sr-only">Cargando sueldo por día…</span><Skeleton className="h-40 w-full rounded-xl" /></div>;
    }

    const people = data.people ?? [];

    /** Lo que devuelve la API ya trae el sueldo recalculado: se pinta de inmediato y luego se vuelve a leer todo. */
    const applyWeek = (employeeId: string, week: WageWeek | null) => {
        if (week) {
            setData((prev) => prev && ({
                ...prev,
                people: prev.people.map((p) => (p.employee_id === employeeId ? {
                    ...p, wage: week, amount: week.amount, summary: `Sueldo: ${week.summary}`,
                    accrued_amount: week.days.filter((d) => d.date <= prev.today).reduce((n, d) => n + d.amount, 0),
                    accrued_days: week.days.filter((d) => d.date <= prev.today && d.status !== 'absent').length,
                } : p)),
            }));
        }
        load(true);
        onChanged?.();
    };

    const openRegister = (person: WeekPerson, kind: ExceptionKind) => {
        const options = exceptionDayOptions(kind, person.wage, data.period_start, data.period_end);
        setPickedDay(options[0] ?? '');
        setPending({ type: 'register', person, kind });
    };

    const dialog = () => {
        if (!pending) return null;
        if (pending.type === 'register') {
            const { person, kind } = pending;
            const options = exceptionDayOptions(kind, person.wage, data.period_start, data.period_end);
            const noun = NOUN[kind];
            return (
                <PinConfirm title={`Registrar ${noun}: ${person.name}`} confirmLabel={`Registrar ${noun} con PIN`}
                    subtitle="Queda en la bitácora con tu nombre y se confirma con tu PIN."
                    commentLabel={kind === 'absent' ? 'Motivo de la falta' : 'Motivo del día extra'}
                    commentPlaceholder={kind === 'absent' ? 'Ej: Avisó que estaba enfermo' : 'Ej: Cubrió a un compañero'}
                    summary={(
                        <div className="space-y-2">
                            <p>{kind === 'absent' ? 'Ese día fijo no se paga.' : 'Ese día se paga a la tarifa vigente.'}</p>
                            {options.length === 0 ? (
                                <p role="alert" className="text-sm font-medium text-bos-danger">
                                    {kind === 'absent' ? 'No hay días fijos para marcar como falta en esta semana.' : 'No hay días sin sueldo disponibles en esta semana.'}
                                </p>
                            ) : (
                                <label className="block text-[13px] font-medium text-bos-muted">Día
                                    <select data-testid="exception-day" value={pickedDay} onChange={(e) => setPickedDay(e.target.value)}
                                        className="mt-1.5 w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text">
                                        {options.map((d) => <option key={d} value={d}>{longDayLabel(d)}</option>)}
                                    </select>
                                </label>
                            )}
                        </div>
                    )}
                    onClose={() => setPending(null)}
                    onConfirm={async ({ pin, comment }) => {
                        if (!pickedDay || !options.includes(pickedDay)) throw new Error('Elige el día de esta semana.');
                        const { data: res } = await sendJson<{ week: WageWeek | null; replayed: boolean }>('/api/wages/exceptions', 'POST',
                            { employee_id: person.employee_id, work_date: pickedDay, kind, reason: comment, pin }, 'No se pudo registrar.');
                        toast.success(res.replayed ? 'Ya estaba registrado; no se duplicó.' : `${noun[0].toUpperCase()}${noun.slice(1)} registrado. El sueldo de la semana se actualizó.`);
                        setPending(null);
                        applyWeek(person.employee_id, res.week);
                    }} />
            );
        }
        const { person, exception } = pending;
        return (
            <PinConfirm title={`Anular ${NOUN[exception.kind]}: ${person.name}`} confirmLabel="Anular con PIN"
                subtitle="No se borra: queda anulada con su motivo y el sueldo de la semana se recalcula."
                commentLabel="Motivo de la anulación" commentPlaceholder="Ej: Se anotó el día equivocado"
                summary={<p><strong>{exception.label}</strong> · {longDayLabel(exception.work_date)} · {exception.reason}</p>}
                onClose={() => setPending(null)}
                onConfirm={async ({ pin, comment }) => {
                    const { data: res } = await sendJson<{ week: WageWeek | null }>(`/api/wages/exceptions/${exception.id}/void`, 'POST', { reason: comment, pin }, 'No se pudo anular.');
                    toast.success(`${NOUN[exception.kind][0].toUpperCase()}${NOUN[exception.kind].slice(1)} anulada. El sueldo de la semana se actualizó.`);
                    setPending(null);
                    applyWeek(person.employee_id, res.week);
                }} />
        );
    };

    return (
        <section aria-labelledby="week-wages-title" data-testid="week-wages" className="space-y-3">
            <div>
                <h2 id="week-wages-title" className="font-display text-xl font-semibold">Sueldo por día de la semana</h2>
                <p className="text-sm text-bos-muted">Los días fijos se dan por trabajados. Anota aquí las faltas y los días extra; el monto entra al pago de la semana.</p>
            </div>

            {people.length === 0 ? (
                <Card><EmptyState title="Nadie tiene sueldo por día en esta semana" description="El sueldo se asigna en Equipo, en la ficha de cada persona." /></Card>
            ) : people.map((p) => {
                const wage = p.wage;
                const byDate = new Map((wage?.days ?? []).map((d) => [d.date, d]));
                const canRegister = !readOnly && canRegisterExceptions(p);
                const isCurrent = data.today >= data.period_start && data.today <= data.period_end;
                return (
                    <Card key={p.employee_id} as="article" data-testid={`week-wage-${p.employee_id}`} aria-label={`Sueldo de ${p.name}`} className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                                <p data-testid="wage-summary-line" className="text-sm text-bos-muted">{p.summary ?? 'Sin días de sueldo en esta semana'}</p>
                                {isCurrent && !p.settled && wage && <p data-testid="wage-accrued" className="text-sm text-bos-muted">Hasta hoy: {accruedText(p.accrued_days, p.accrued_amount)}</p>}
                            </div>
                            <p data-testid="wage-amount" className="font-display text-2xl font-semibold tabular-nums">{formatMoney(p.amount, { cents: true })}</p>
                        </div>

                        <ol aria-label="Días de la semana" className="grid grid-cols-7 gap-1.5">
                            {weekDates(data.period_start, data.period_end).map((date) => {
                                const day = byDate.get(date);
                                const key = day ? day.status : 'rest';
                                const future = date > data.today;
                                return (
                                    <li key={date} data-testid={`day-${date}`} data-status={key}
                                        className={`flex min-w-0 flex-col items-center rounded-lg border px-0.5 py-1.5 text-center ${CELL[key]} ${future ? 'border-dashed' : ''}`}>
                                        <span className="text-[11px] font-medium">{WEEKDAY_SHORT[weekdayOfDate(date)]}</span>
                                        <span aria-hidden="true" className="text-base font-bold leading-6">{MARK[key]}</span>
                                        <span className="sr-only">{day ? `${DAY_STATUS_LABELS[day.status]}${future ? ', por venir' : ''}` : 'Descanso'}</span>
                                        <span className="text-[11px] tabular-nums">{day && day.amount > 0 ? formatMoney(day.amount) : '—'}</span>
                                    </li>
                                );
                            })}
                        </ol>
                        <p className="text-xs text-bos-muted">✓ trabajó · ✗ faltó · + día extra · · descanso</p>

                        {p.settled ? (
                            <p data-testid="wage-settled" role="status" className="rounded-xl bg-bos-raised px-4 py-3 text-sm">
                                Semana pagada{p.receipt_number ? ` (recibo ${p.receipt_number})` : ''}: el sueldo ya no se puede cambiar. Si hubo un error, se corrige con un descuento en el siguiente recibo.
                            </p>
                        ) : canRegister ? (
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button variant="secondary" onClick={() => openRegister(p, 'absent')}><CalendarMinus aria-hidden="true" className="h-4 w-4" /> Registrar falta</Button>
                                <Button variant="secondary" onClick={() => openRegister(p, 'extra')}><CalendarPlus aria-hidden="true" className="h-4 w-4" /> Registrar día extra</Button>
                            </div>
                        ) : readOnly ? (
                            <p className="text-sm text-bos-muted">Tu cuenta es de consulta: ves el sueldo pero no registras faltas ni días extra.</p>
                        ) : null}

                        {p.exceptions.length > 0 && (
                            <ul data-testid="wage-exceptions" className="divide-y divide-bos-border">
                                {p.exceptions.map((x) => (
                                    <li key={x.id} data-testid="wage-exception" className={`flex flex-wrap items-start justify-between gap-2 py-3 text-sm`}>
                                        <div className="min-w-0">
                                            <p className={`font-semibold ${x.voided_at ? 'line-through' : ''}`}>{x.label} · {longDayLabel(x.work_date)}</p>
                                            <p className="break-words text-bos-muted">{x.reason}</p>
                                            <p className="text-xs text-bos-muted">
                                                {x.voided_at
                                                    ? `Anulado${x.voided_by_name ? ` por ${x.voided_by_name}` : ''}: ${x.void_reason ?? ''}`
                                                    : `Registrado${x.created_by_name ? ` por ${x.created_by_name}` : ''} · ${formatDateTime(x.created_at)}`}
                                            </p>
                                        </div>
                                        {x.can_void && !readOnly && !p.settled && (
                                            <Button variant="ghost" size="sm" onClick={() => setPending({ type: 'void', person: p, exception: x })} aria-label={`Anular ${NOUN[x.kind]} del ${longDayLabel(x.work_date)}`}>
                                                <Undo2 aria-hidden="true" className="h-4 w-4" /> Anular
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                );
            })}

            {dialog()}
        </section>
    );
}
