'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { money } from '@/lib/cash/day-summary-text';
import { openingGap, visibleLines, type CashFlow, type DayFlowTotal, type FlowLine, type OtherExpenses } from '@/lib/cash/cash-flow';
import { formatTime } from '@/lib/utils/dates';

// «El camino del efectivo»: el efectivo de una caja como una resta, de arriba hacia abajo, con cada renglón desplegable.
// Los números salen de buildCashFlow (lib/cash/cash-flow.ts); aquí solo se muestran. Nada se cuadra a la fuerza: si algo no
// suma, se avisa.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const minus = (cents: number) => `−${money(cents)}`;

function DiffText({ cents }: { cents: number }) {
    if (cents === 0) return <span className="text-bos-success">Cuadra</span>;
    return <span className="text-bos-danger">{cents > 0 ? 'Sobran' : 'Faltan'} {money(Math.abs(cents))}</span>;
}

function Row({ sign, label, hint, value, strong, dim, testId, children }: {
    sign?: string; label: React.ReactNode; hint?: string | null; value: React.ReactNode; strong?: boolean; dim?: boolean; testId?: string; children?: React.ReactNode;
}) {
    return (
        <li data-testid={testId} className={`${strong ? 'border-t border-bos-border pt-2 font-semibold' : ''} ${dim ? 'text-bos-muted' : ''}`}>
            <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                    <span aria-hidden="true" className="w-4 shrink-0 text-center font-display text-bos-muted">{sign ?? ''}</span>
                    <span className="min-w-0">
                        <span className={strong ? '' : dim ? '' : 'text-bos-text'}>{label}</span>
                        {hint && <span className="block text-[13px] font-normal text-bos-muted">{hint}</span>}
                    </span>
                </span>
                <span className="shrink-0 text-right tabular-nums">{value}</span>
            </div>
            {children}
        </li>
    );
}

/** Renglón con movimientos: se despliega para ver hora, motivo, quién lo registró y monto de cada uno. */
function MoveRow({ line, tz, idPrefix }: { line: FlowLine; tz: string; idPrefix: string }) {
    const [open, setOpen] = useState(false);
    const sign = line.side === 'in' ? '+' : '−';
    const amount = line.side === 'in' ? `+${money(line.cents)}` : minus(line.cents);
    const empty = line.count === 0;
    const panelId = `${idPrefix}-${line.id}`;
    const title = `${line.label}${line.count > 0 ? ` (${line.count})` : ''}`;
    return (
        <Row
            testId={`cf-line-${line.id}`} sign={sign} dim={empty && line.cents === 0} hint={line.hint}
            label={empty ? <span>{title}</span> : (
                <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} data-testid={`cf-toggle-${line.id}`}
                    className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-left font-medium hover:bg-bos-raised print:hover:bg-transparent">
                    <span>{title}</span>
                    <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-bos-muted transition-transform print:hidden ${open ? 'rotate-180' : ''}`} />
                </button>
            )}
            value={<span data-testid={`cf-amount-${line.id}`} className={line.side === 'in' && line.cents > 0 ? 'text-bos-success' : ''}>{empty && line.cents === 0 ? money(0) : amount}</span>}
        >
            {!empty && (
                <ul id={panelId} data-testid={`cf-items-${line.id}`} className={`${open ? 'block' : 'hidden'} mt-1 space-y-1 border-l-2 border-bos-border pl-3 print:block`}>
                    {line.items.map((it, i) => (
                        <li key={it.id || i} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0">
                                <span className="break-words">{it.description}</span>
                                <span className="block text-[13px] text-bos-muted">
                                    {it.at ? formatTime(it.at, tz) : ''}{it.by ? ` · registró ${it.by}` : ''}
                                </span>
                            </span>
                            <span className="shrink-0 tabular-nums">{line.side === 'in' ? '+' : '−'}{money(it.cents)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Row>
    );
}

function Notes({ flow, otherExpenses, omitOther }: { flow: CashFlow; otherExpenses: OtherExpenses | null; omitOther: boolean }) {
    const other = otherExpenses ? otherExpenses.envelopeCents + otherExpenses.bankCents : 0;
    return (
        <div className="space-y-1 text-[13px] text-bos-muted" data-testid="cf-notes">
            <p data-testid="cf-notcash">Tarjeta {money(flow.cardCents)} y transferencia {money(flow.transferCents)} no están en la caja.</p>
            {omitOther ? null : otherExpenses ? (
                <p data-testid="cf-otherexp">
                    Gastos pagados del sobre o del banco: {money(other)} (no salen de la caja)
                    {otherExpenses.count > 0 && <> · {plural(otherExpenses.count, 'gasto', 'gastos')}</>}.{' '}
                    <Link href="/gastos" className="font-semibold text-bos-accent-text underline underline-offset-2 print:no-underline">Ver Gastos</Link>
                </p>
            ) : (
                <p data-testid="cf-otherexp">Los gastos pagados del sobre o del banco no salen de la caja.</p>
            )}
        </div>
    );
}

/** El camino del efectivo de UNA caja. */
export default function CashFlowView({ flow, timezone, otherExpenses = null, omitOtherExpenses = false, idPrefix = 'cf' }: {
    flow: CashFlow; timezone: string; otherExpenses?: OtherExpenses | null;
    /** Cuando hay varias cajas el día, los gastos del sobre o del banco van una sola vez en el total del día. */
    omitOtherExpenses?: boolean; idPrefix?: string;
}) {
    const ins = visibleLines(flow, 'in');
    const gap = openingGap(flow);
    const outs = visibleLines(flow, 'out');
    const id = `${idPrefix}-${flow.id}`;
    const split = flow.split;
    return (
        <div className="space-y-4 print:space-y-2" data-testid="cash-flow">
            {!flow.check.ok && (
                <div role="alert" data-testid="cf-warning" className="flex items-start gap-2 rounded-lg border border-bos-danger p-2 text-sm font-semibold text-bos-danger">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                        <p>Atención: las cuentas de esta caja no cuadran. Avisa a la cuenta principal.</p>
                        <ul className="mt-1 list-disc pl-4 font-normal">{flow.check.issues.map((t) => <li key={t}>{t}</li>)}</ul>
                    </div>
                </div>
            )}

            <section aria-label="Cuenta del efectivo" className="space-y-1.5">
                <h4 className="text-[13px] font-medium text-bos-muted">{flow.open ? 'Cuánto efectivo hay y por qué' : 'Cuánto efectivo debe haber y por qué'}</h4>
                <ul className="space-y-1.5 text-[15px]">
                    <Row testId="cf-opening" label="Fondo con que se abrió" value={money(flow.openingCents)}>
                        {/* Abrió con otro monto: se ve cuánto se esperaba y el motivo que se pidió al abrir (antes solo quedaba en la bitácora). */}
                        {gap && (
                            <p data-testid="cf-opening-note" className="ml-6 mt-0.5 break-words text-[13px] text-bos-muted">
                                Se esperaba abrir con {money(gap.expectedCents)}: abrió con{' '}
                                <span className={gap.gapCents < 0 ? 'text-bos-danger' : 'text-bos-text'}>{money(Math.abs(gap.gapCents))} {gap.gapCents < 0 ? 'menos' : 'más'}</span>.{' '}
                                {gap.note ? <>Motivo: <span className="text-bos-text">{gap.note}</span></> : <span className="italic">Sin motivo registrado</span>}
                            </p>
                        )}
                    </Row>
                    {ins.map((l) => <MoveRow key={l.id} line={l} tz={timezone} idPrefix={id} />)}
                    {outs.map((l) => <MoveRow key={l.id} line={l} tz={timezone} idPrefix={id} />)}
                    <Row strong sign="=" testId="cf-expected" label={flow.open ? 'Efectivo que debe haber ahora' : 'Efectivo que debe haber'}
                        value={<span data-testid="cf-expected-value" className="font-display text-lg">{money(flow.expectedCents)}</span>} />
                    {!flow.open && flow.countedCents !== null && <Row testId="cf-counted" label="Efectivo contado al cerrar" value={money(flow.countedCents)} />}
                    {!flow.open && flow.differenceCents !== null && (
                        <Row testId="cf-difference" label="Diferencia" value={<span className="font-semibold"><DiffText cents={flow.differenceCents} /></span>}>
                            {flow.differenceCents !== 0 && (
                                <p data-testid="cf-difference-reason" className={`ml-6 mt-0.5 break-words text-[13px] ${flow.differenceReason ? 'text-bos-text' : 'text-bos-muted italic'}`}>
                                    {flow.differenceReason ? <><span className="text-bos-muted">Motivo: </span>{flow.differenceReason}</> : 'Sin motivo registrado'}
                                </p>
                            )}
                        </Row>
                    )}
                </ul>
            </section>

            {split ? (
                <section aria-label={split.proposed ? 'Al cerrar se propone' : 'A dónde se fue lo contado'} className="space-y-1.5" data-testid="cf-split">
                    <h4 className="text-[13px] font-medium text-bos-muted">
                        {split.proposed ? 'Al cerrar se propone' : '¿A dónde se fue lo contado?'}
                        {split.proposed && <span className="ml-2 rounded-md bg-bos-accent-soft px-1.5 py-0.5 text-xs font-semibold text-bos-text">propuesta</span>}
                    </h4>
                    <ul className="space-y-1.5 text-[15px]">
                        <Row testId="cf-float" label="Se deja de fondo para mañana" value={money(split.floatCents)} />
                        <Row testId="cf-reserve" label={`Se aparta al sobre «${split.reserveLabel}»`} value={money(split.reserveCents)} />
                        <Row testId="cf-withdrawn" label={`Se retira${split.deliveredTo ? ` (entregado a: ${split.deliveredTo})` : ''}`} value={money(split.withdrawnCents)} />
                        <Row strong sign="=" testId="cf-split-total" label={split.proposed ? 'Total propuesto (lo que debe haber)' : 'Total (debe ser igual a lo contado)'}
                            value={money(split.floatCents + split.reserveCents + split.withdrawnCents)} />
                    </ul>
                    {split.floatNote && <p className="text-[13px] text-bos-muted" data-testid="cf-float-note">Se dejó menos del fondo recomendado: {split.floatNote}</p>}
                    {split.proposed && <p className="text-[13px] text-bos-muted">Es una propuesta con los ajustes de caja; al cerrar se puede cambiar.</p>}
                </section>
            ) : !flow.open && (
                <p data-testid="cf-nosplit" className="text-[13px] text-bos-muted">Esta caja se cerró sin repartir lo contado (antes del cierre guiado): no hay fondo, apartado ni retiro guardados.</p>
            )}

            <Notes flow={flow} otherExpenses={otherExpenses} omitOther={omitOtherExpenses} />
        </div>
    );
}

/** Entradas y salidas de todas las cajas del día juntas (arriba cuando hubo varias cajas). */
export function CashFlowDayTotal({ total, otherExpenses }: { total: DayFlowTotal; otherExpenses: OtherExpenses | null }) {
    const lines = total.lines.filter((l) => l.always || l.count > 0 || l.cents !== 0);
    const other = otherExpenses ? otherExpenses.envelopeCents + otherExpenses.bankCents : 0;
    return (
        <article data-testid="cf-day-total" className="space-y-2 rounded-lg border border-bos-border bg-bos-raised p-3 sm:p-4 print:break-inside-avoid">
            <h4 className="font-semibold">Total del día · {plural(total.sessionCount, 'caja', 'cajas')}</h4>
            {total.anyOpen && <p role="status" className="text-sm font-semibold">Hay una caja abierta: el resumen puede cambiar.</p>}
            <ul className="space-y-1 text-[15px]">
                {lines.map((l) => (
                    <Row key={l.id} testId={`cf-total-${l.id}`} sign={l.side === 'in' ? '+' : '−'} dim={l.cents === 0 && l.count === 0}
                        label={`${l.label}${l.count > 0 ? ` (${l.count})` : ''}`} value={l.side === 'in' ? `+${money(l.cents)}` : minus(l.cents)} />
                ))}
                <Row strong testId="cf-total-difference" label="Diferencia de las cajas cerradas" value={<DiffText cents={total.differenceCents} />} />
                <Row testId="cf-total-reserve" label="Apartado al sobre" value={money(total.reserveCents)} />
                <Row testId="cf-total-withdrawn" label="Retirado" value={money(total.withdrawnCents)} />
            </ul>
            <p className="text-[13px] text-bos-muted">Cada caja arrastra su propio fondo, por eso aquí no se suman el fondo ni el esperado.</p>
            {otherExpenses && (
                <p className="text-[13px] text-bos-muted" data-testid="cf-total-otherexp">
                    Gastos pagados del sobre o del banco: {money(other)} (no salen de la caja).{' '}
                    <Link href="/gastos" className="font-semibold text-bos-accent-text underline underline-offset-2 print:no-underline">Ver Gastos</Link>
                </p>
            )}
        </article>
    );
}
