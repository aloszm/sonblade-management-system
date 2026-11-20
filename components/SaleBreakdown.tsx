'use client';

import React, { useCallback, useEffect, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { HttpError, isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { formatMoney } from '@/lib/utils/money';
import { paymentMethodLabel } from '@/lib/utils/payment';
import type { BreakdownLine, SaleBreakdown } from '@/lib/sales/breakdown';

const money = (n: number) => formatMoney(n, { cents: true });
const percent = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} %`;

/**
 * "Desglose de la venta": cómo se repartió el dinero de ESTA venta. Va debajo del ticket, solo en pantalla
 * (`print:hidden`): el ticket impreso es del cliente y no debe mostrar comisiones ni lo que le queda a la barbería.
 * Lo que llega ya viene recortado por puesto desde el servidor (/api/sales/[id]/breakdown); aquí no se decide quién ve qué.
 */
export default function SaleBreakdownBlock({ saleId }: { saleId: string }) {
    const [data, setData] = useState<SaleBreakdown | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/sales/${saleId}/breakdown`, { cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new HttpError(res.status, body?.error);
            if (!Array.isArray(body?.lines)) throw new Error('Respuesta inesperada del desglose.');
            setData(body as SaleBreakdown);
        } catch (e) {
            console.error(e);
            setData(null);
            setError(e);
        } finally {
            setLoading(false);
        }
    }, [saleId]);

    useEffect(() => { void load(); }, [load]);

    return (
        <section aria-labelledby="desglose-titulo" data-testid="sale-breakdown" className="print:hidden mx-auto mt-8 max-w-3xl">
            <h2 id="desglose-titulo" className="font-display text-xl font-semibold tracking-tight text-bos-text">Desglose de la venta</h2>
            <p className="mt-1 text-sm text-bos-muted">Cómo se repartió el dinero de esta venta. No se imprime con el ticket del cliente.</p>
            <div className="mt-4">
                {loading ? <Loading /> : error ? <Failure error={error} onRetry={load} /> : data ? <Body data={data} /> : null}
            </div>
        </section>
    );
}

function Loading() {
    return (
        <div role="status" aria-label="Cargando el desglose" className="space-y-3 rounded-xl border border-bos-border bg-bos-surface p-4">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-24 w-full" />
        </div>
    );
}

function Failure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
    const status = error instanceof HttpError ? error.status : 0;
    if (status === 403) {
        return (
            <div className="rounded-xl border border-bos-border bg-bos-surface">
                <EmptyState title="No puedes ver el desglose" description="Tu puesto no tiene permiso para ver cómo se repartió esta venta." />
            </div>
        );
    }
    if (status === 404) {
        return (
            <div className="rounded-xl border border-bos-border bg-bos-surface">
                <EmptyState title="No encontramos el desglose" description="La venta no existe en esta sucursal." />
            </div>
        );
    }
    return <ErrorState title="No se pudo cargar el desglose" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={onRetry} />;
}

function Body({ data }: { data: SaleBreakdown }) {
    const struck = data.voided ? 'line-through text-bos-muted' : '';
    const hasMoney = data.generatedCount > 0 || data.courtesyCount > 0 || data.voided;
    return (
        <div className="space-y-4">
            {data.voided && (
                <p role="status" data-testid="sale-breakdown-voided" className="rounded-xl border-2 border-bos-danger bg-bos-danger-soft px-4 py-3 text-sm font-semibold text-bos-text">
                    Venta anulada: las comisiones y la propina se revirtieron. Los montos de abajo son los que se revirtieron y ya no cuentan.
                </p>
            )}
            {!data.voided && data.generatedCount === 0 && data.pendingCount > 0 && (
                <p role="status" data-testid="sale-breakdown-empty" className="rounded-xl border border-bos-border bg-bos-surface px-4 py-3 text-sm text-bos-text">
                    Esta venta todavía no tiene comisiones generadas. Cada renglón aparece «en espera» hasta que se defina quién recibe su comisión.
                </p>
            )}
            {!data.voided && data.generatedCount > 0 && data.pendingCount > 0 && (
                <p role="status" data-testid="sale-breakdown-partial" className="rounded-xl border border-bos-warn bg-bos-surface px-4 py-3 text-sm text-bos-text">
                    {data.pendingCount === 1 ? 'Hay 1 renglón con la comisión en espera.' : `Hay ${data.pendingCount} renglones con la comisión en espera.`} No se suma a lo que va al equipo hasta que se resuelva.
                </p>
            )}

            <div className="overflow-hidden rounded-xl border border-bos-border bg-bos-surface">
                <table className="bos-stack w-full text-left text-sm tabular-nums" aria-label="Reparto por partida">
                    <thead className="text-bos-muted">
                        <tr>
                            <th className="px-4 py-3 text-[13px] font-semibold">Concepto</th>
                            <th className="px-4 py-3 text-right text-[13px] font-semibold">Base</th>
                            <th className="px-4 py-3 text-right text-[13px] font-semibold">%</th>
                            <th className="px-4 py-3 text-[13px] font-semibold">Para quién</th>
                            <th className="px-4 py-3 text-right text-[13px] font-semibold">Comisión</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.lines.map((line) => <LineRow key={line.itemId} line={line} voided={data.voided} />)}
                        {data.tips.map((tip, i) => (
                            <tr key={`tip-${i}`} data-testid="sale-breakdown-tip" className="border-t border-bos-border">
                                <td data-label="" className="px-4 py-3 font-medium max-md:order-first">
                                    Propina
                                    <span className="block text-xs font-normal text-bos-muted">Pagada con {paymentMethodLabel(tip.method).toLowerCase()}</span>
                                    {tip.reversed && <span className="text-xs font-semibold text-bos-danger">Revertida</span>}
                                </td>
                                <td data-label="Base" className={`px-4 py-3 text-right ${struck}`}>{money(tip.amount)}</td>
                                <td data-label="%" className={`px-4 py-3 text-right ${struck}`}>{percent(tip.percentage)}</td>
                                <td data-label="Para quién" className="px-4 py-3">{tip.name ?? 'Sin nombre'}</td>
                                <td data-label="Comisión" className={`px-4 py-3 text-right font-semibold ${struck}`}>{money(tip.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {hasMoney && <Summary data={data} />}
        </div>
    );
}

function LineRow({ line, voided }: { line: BreakdownLine; voided: boolean }) {
    const struck = voided ? 'line-through text-bos-muted' : '';
    return (
        <tr data-testid="sale-breakdown-line" className="border-t border-bos-border">
            <td data-label="" className="px-4 py-3 max-md:order-first">
                <span className="font-medium">{line.name}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</span>
                <span className="block text-xs text-bos-muted">{line.type === 'service' ? 'Servicio' : 'Producto'}</span>
                {line.reversed && <span className="text-xs font-semibold text-bos-danger">Revertida</span>}
                {line.pending && line.pendingReason && <span className="block text-xs text-bos-muted">{line.pendingReason}</span>}
                {line.courtesy && <span data-testid="sale-breakdown-courtesy" className="block text-xs font-semibold text-bos-text">Cortesía · sin comisión</span>}
            </td>
            <td data-label="Base" className={`px-4 py-3 text-right ${struck}`}>
                {line.base === null ? '—' : money(line.base)}
                {line.baseNote && <span className="block text-xs font-normal text-bos-muted md:max-w-56 md:ml-auto max-md:text-right">{line.baseNote}</span>}
            </td>
            <td data-label="%" className={`px-4 py-3 text-right ${struck}`}>
                {line.percentage !== null ? percent(line.percentage) : line.fixedAmount !== null ? `${money(line.fixedAmount)} fijo` : '—'}
            </td>
            <td data-label="Para quién" className="px-4 py-3">
                {line.pending ? <span className="font-semibold text-bos-text">En espera · sin beneficiario</span> : line.beneficiaryName ?? '—'}
            </td>
            <td data-label="Comisión" className={`px-4 py-3 text-right font-semibold ${line.pending ? '' : struck}`}>
                {line.pending ? 'En espera' : line.courtesy ? <span className="font-normal">Cortesía · sin comisión</span> : line.commission === null ? '—' : money(line.commission)}
            </td>
        </tr>
    );
}

function Summary({ data }: { data: SaleBreakdown }) {
    const { summary, shop, voided } = data;
    const struck = voided ? 'line-through text-bos-muted' : '';
    const methods = summary.paymentsByMethod.map((p) => `${paymentMethodLabel(p.method)} ${money(p.amount)}`).join(' · ');
    return (
        <div data-testid="sale-breakdown-summary" className="rounded-xl border border-bos-border bg-bos-surface p-4 sm:p-5">
            <h3 className="font-display text-base font-semibold text-bos-text">Resumen{voided ? ' (revertido)' : ''}</h3>
            <dl className="mt-3 space-y-2 text-sm tabular-nums">
                <Row label="Total cobrado al cliente" value={money(summary.charged)} struck={struck}
                    hint={[methods, summary.tipsTotal > 0 ? `incluye propina de ${money(summary.tipsTotal)}` : ''].filter(Boolean).join(' · ') || undefined} />
                <Row label="Va al equipo" value={money(summary.toTeam)} struck={struck} hint={`Comisiones ${money(summary.commissionsTotal)} + propina ${money(summary.tipsTotal)}`} />
                {shop && (
                    <>
                        <Row label="Costo de producto" value={money(shop.productCost)} struck={struck}
                            hint={shop.unitsWithoutCost > 0 ? `Falta el costo de ${shop.unitsWithoutCost} ${shop.unitsWithoutCost === 1 ? 'pieza' : 'piezas'}; no se descuenta.` : undefined} />
                        <div className="mt-1 border-t-2 border-bos-text pt-3">
                            <Row label="Le queda a la barbería en esta venta" value={money(shop.keeps)} struck={struck} strong testId="sale-breakdown-keeps"
                                hint={`${shop.formula}. No incluye sueldos ni gastos del periodo.`} />
                        </div>
                    </>
                )}
            </dl>
            {voided && <p className="mt-3 text-sm font-semibold text-bos-danger">Efecto neto de la venta anulada: {money(0)}.</p>}
        </div>
    );
}

function Row({ label, value, hint, struck, strong, testId }: { label: string; value: string; hint?: string; struck: string; strong?: boolean; testId?: string }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <dt className={strong ? 'font-semibold text-bos-text' : 'text-bos-text'}>{label}</dt>
                {hint && <dd className="text-xs text-bos-muted">{hint}</dd>}
            </div>
            <dd data-testid={testId} className={`shrink-0 text-right ${strong ? 'font-display text-lg font-semibold' : 'font-semibold'} ${struck}`}>{value}</dd>
        </div>
    );
}
