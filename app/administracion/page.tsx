'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Loader2, TriangleAlert } from 'lucide-react';
import { isValidDay, MAX_RANGE_DAYS, profitPresetRange, rangeDays, type ProfitPreset, type ProfitReport } from '@/lib/admin/profit';
import { localDateKey } from '@/lib/utils/dates';

type PeriodId = ProfitPreset | 'custom';
const PERIODS: { id: PeriodId; label: string }[] = [
    { id: 'week', label: 'Esta semana' },
    { id: 'month', label: 'Este mes' },
    { id: 'last_month', label: 'Mes pasado' },
    { id: 'custom', label: 'Rango' },
];

const money = (n: number) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const units = (n: number) => `${n} pieza${n === 1 ? '' : 's'}`;

function Line({ label, hint, value, sign, strong }: { label: string; hint?: string; value: number; sign?: '−' | '='; strong?: boolean }) {
    return (
        <div className={`flex items-baseline justify-between gap-4 py-3 ${strong ? 'border-t border-bos-border' : ''}`}>
            <div className="min-w-0">
                <p className={strong ? 'font-semibold' : ''}>
                    {sign && <span aria-hidden="true" className="inline-block w-4 text-bos-muted">{sign}</span>}{label}
                </p>
                {hint && <p className={`text-[13px] text-bos-muted ${sign ? 'pl-4' : ''}`}>{hint}</p>}
            </div>
            <p className={`shrink-0 tabular-nums ${strong ? 'font-display text-xl font-semibold' : ''}`}>{money(value)}</p>
        </div>
    );
}

/** Administración: cuánto le quedó realmente al negocio en el periodo. Solo lectura. */
export default function AdministracionPage() {
    const today = useMemo(() => localDateKey(new Date()), []);
    const [period, setPeriod] = useState<PeriodId>('month');
    const [custom, setCustom] = useState(() => profitPresetRange('month', today));
    const [data, setData] = useState<ProfitReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const range = period === 'custom' ? custom : profitPresetRange(period, today);
    const rangeError = period !== 'custom' ? ''
        : !isValidDay(custom.from) || !isValidDay(custom.to) ? 'Elige ambas fechas.'
            : custom.from > custom.to ? 'La fecha inicial debe ser anterior o igual a la final.'
                : rangeDays(custom.from, custom.to) > MAX_RANGE_DAYS ? `El periodo no puede pasar de ${MAX_RANGE_DAYS} días.` : '';

    const load = useCallback(async (from: string, to: string) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/profit?from=${from}&to=${to}`, { cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo calcular la utilidad.');
            setData(body as ProfitReport);
        } catch (e) {
            setData(null);
            setError(e instanceof Error ? e.message : 'No se pudo calcular la utilidad.');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (rangeError) { setLoading(false); return; }
        load(range.from, range.to);
    }, [load, range.from, range.to, rangeError]);

    const empty = !!data && data.revenue.total === 0 && data.expenses.total === 0 && data.counts.sales === 0;
    const field = 'h-11 w-full px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text outline-none focus:border-bos-accent';

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <header className="space-y-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Administración</h1>
                    <p className="text-sm text-bos-muted max-w-2xl">Cuánto le quedó al negocio: lo cobrado menos comisiones, costo de los productos vendidos y gastos.</p>
                </div>
                <div role="group" aria-label="Periodo" className="flex flex-wrap gap-2">
                    {PERIODS.map((p) => (
                        <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}
                            className={`h-9 px-3.5 rounded-full border text-sm font-medium ${period === p.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`}>{p.label}</button>
                    ))}
                </div>
                {period === 'custom' && (
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                        <label className="block">
                            <span className="block text-[13px] font-medium text-bos-muted mb-1.5">Desde</span>
                            <input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className={field} />
                        </label>
                        <label className="block">
                            <span className="block text-[13px] font-medium text-bos-muted mb-1.5">Hasta</span>
                            <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className={field} />
                        </label>
                    </div>
                )}
                {!rangeError && <p className="text-[13px] text-bos-muted">Del {dayLabel(range.from)} al {dayLabel(range.to)}, hora de la barbería.</p>}
            </header>

            {rangeError && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-bos-danger">{rangeError}</p>}
            {!rangeError && error && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-bos-danger">{error}</p>}
            {!rangeError && loading && <div className="flex justify-center py-16"><Loader2 aria-label="Cargando" className="h-8 w-8 animate-spin text-bos-muted" /></div>}

            {!rangeError && !loading && !error && data && (
                <>
                    {empty && (
                        <p className="rounded-xl border border-bos-border bg-bos-surface p-6 text-center text-bos-muted">No hay ventas cobradas ni gastos en este periodo.</p>
                    )}

                    {data.productsWithoutCost > 0 && (
                        <section role="status" data-testid="profit-missing-cost" className="flex items-start gap-3 rounded-xl border border-bos-border bg-bos-surface p-4">
                            <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-danger mt-0.5" />
                            <div className="text-sm">
                                <p className="font-semibold">
                                    {data.productsWithoutCost} producto{data.productsWithoutCost === 1 ? '' : 's'} sin costo registrado
                                </p>
                                <p className="text-bos-muted">
                                    Se vendieron {units(data.productCost.unitsWithoutCost)} sin costo; no se restó nada por ellas, así que la utilidad real es menor a la que se muestra.
                                    Registra el costo en Inventario.
                                </p>
                                <ul className="mt-2 text-bos-muted">
                                    {data.productCost.missing.map((m) => <li key={m.productId || m.name}>{m.name} · {units(m.units)}</li>)}
                                </ul>
                            </div>
                        </section>
                    )}

                    {!empty && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-xl border border-bos-border bg-bos-surface p-5">
                                <p className="text-[13px] font-medium text-bos-muted">Utilidad real</p>
                                <p data-testid="profit-total" className={`font-display text-4xl font-semibold tabular-nums mt-1 ${data.profit < 0 ? 'text-bos-danger' : 'text-bos-success'}`}>{money(data.profit)}</p>
                            </div>
                            <div className="rounded-xl border border-bos-border bg-bos-surface p-5">
                                <p className="text-[13px] font-medium text-bos-muted">Margen</p>
                                <p className="font-display text-4xl font-semibold tabular-nums mt-1">{data.marginPct === null ? '—' : `${data.marginPct.toLocaleString('es-MX')} %`}</p>
                                <p className="text-[13px] text-bos-muted mt-1">{data.marginPct === null ? 'Sin ingresos en el periodo.' : 'De cada $100 cobrados.'}</p>
                            </div>
                        </div>
                    )}

                    {!empty && (
                        <section aria-label="Estado de resultados" className="rounded-xl border border-bos-border bg-bos-surface px-5 py-2">
                            <Line label="Ingresos" value={data.revenue.total}
                                hint={`Servicios ${money(data.revenue.services)} · productos ${money(data.revenue.products)}. Ya sin descuentos (${money(data.revenue.discounts)}) ni propinas.`} />
                            <Line sign="−" label="Comisiones" value={data.commissions.total}
                                hint={`Servicios ${money(data.commissions.services)} · productos ${money(data.commissions.products)} (incluye recepción).`} />
                            <Line sign="−" label="Costo de productos vendidos" value={data.productCost.total}
                                hint={`${units(data.counts.productUnits)} vendidas, al costo registrado de cada producto.`} />
                            <Line sign="−" label="Gastos" value={data.expenses.total} hint="Gastos registrados en caja (Gastos e insumos)." />
                            <Line sign="=" label="Utilidad" value={data.profit} strong />
                        </section>
                    )}

                    {!empty && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <section aria-label="Gastos por categoría" className="rounded-xl border border-bos-border bg-bos-surface p-5">
                                <h2 className="text-[15px] font-semibold">Gastos por categoría</h2>
                                {data.expenses.byCategory.length === 0
                                    ? <p className="mt-3 text-sm text-bos-muted">Sin gastos en este periodo.</p>
                                    : (
                                        <ul className="mt-3 divide-y divide-bos-border text-sm">
                                            {data.expenses.byCategory.map((c) => (
                                                <li key={c.category} className="flex justify-between gap-4 py-2">
                                                    <span>{c.category} <span className="text-bos-muted">· {c.count}</span></span>
                                                    <span className="tabular-nums">{money(c.total)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                            </section>
                            <section aria-label="Propinas" className="rounded-xl border border-bos-border bg-bos-surface p-5">
                                <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Info aria-hidden="true" className="h-4 w-4 text-bos-muted" /> Propinas</h2>
                                <p className="mt-3 font-display text-2xl font-semibold tabular-nums">{money(data.tips.total)}</p>
                                <p className="mt-1 text-sm text-bos-muted">
                                    {data.tips.count} propina{data.tips.count === 1 ? '' : 's'}. Se cobran al cliente y se entregan completas al barbero en su recibo semanal:
                                    no son ingreso del negocio, por eso no suman ni restan en la utilidad.
                                </p>
                            </section>
                        </div>
                    )}

                    {!empty && (
                        <p className="text-[13px] text-bos-muted">
                            {data.counts.sales} venta{data.counts.sales === 1 ? '' : 's'} cobrada{data.counts.sales === 1 ? '' : 's'}
                            {data.counts.voidedExcluded > 0 && ` · ${data.counts.voidedExcluded} anulada${data.counts.voidedExcluded === 1 ? '' : 's'} sin contar`}.
                            {' '}El costo de producto usa el costo registrado hoy en Inventario.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
