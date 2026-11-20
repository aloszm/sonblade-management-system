'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Banknote, CreditCard, Landmark, Minus, TriangleAlert, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BarberRow, Delta, ProfitReport } from '@/lib/admin/profit';
import { waterfallRows } from '@/lib/admin/waterfall';
import { formatMoney } from '@/lib/utils/money';
import Skeleton from '@/components/ui/Skeleton';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils/payment';

// Piezas de presentación del tablero de Finanzas. Reciben el reporte ya calculado; no calculan dinero propio
// salvo proporciones para dibujar barras. Solo colores del sistema (bos-*).

export const money = (n: number) => formatMoney(n, { cents: true });
const moneyShort = (n: number) => formatMoney(n);
const pctText = (n: number) => `${Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
export const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const units = (n: number) => `${n} pieza${n === 1 ? '' : 's'}`;
export const METHOD_LABEL = PAYMENT_METHOD_LABELS;
const METHOD_ICON: Record<string, typeof Banknote> = { cash: Banknote, card: CreditCard, transfer: Landmark, other: Wallet };

const card = 'rounded-xl border border-bos-border bg-bos-surface print:break-inside-avoid';
const h2 = 'font-display text-xl font-semibold tracking-tight';

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(query.matches);
        const onChange = () => setReduced(query.matches);
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
    }, []);
    return reduced;
}

// ---------- Comparación ----------

/** Frase de la comparación. goodWhen: qué dirección es buena para el negocio (un gasto que sube es malo). */
export function DeltaNote({ delta, hasBase, goodWhen = 'up', compact }: { delta: Delta; hasBase: boolean; goodWhen?: 'up' | 'down'; compact?: boolean }) {
    if (!hasBase) return <span className="text-[13px] text-bos-muted">Sin periodo anterior con qué comparar.</span>;
    if (delta.delta === 0) {
        return <span className="inline-flex items-center gap-1 text-[13px] text-bos-muted"><Minus aria-hidden="true" className="h-4 w-4" /> Igual que el periodo anterior.</span>;
    }
    const up = delta.delta > 0;
    const good = (up && goodWhen === 'up') || (!up && goodWhen === 'down');
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    const amount = money(Math.abs(delta.delta));
    const verb = up ? 'Sube' : 'Baja';
    const tail = delta.pct === null ? ' (antes fue cero)' : ` (${pctText(delta.pct)})`;
    return (
        <span className={`inline-flex items-start gap-1 rounded-lg px-2.5 py-1 text-[13px] font-medium ${good ? 'bg-bos-success-soft text-bos-success' : 'bg-bos-danger-soft text-bos-danger'} print:bg-white print:text-black print:border print:border-bos-border`}>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{verb} {amount}{tail}{compact ? '' : ' frente al periodo anterior'}</span>
        </span>
    );
}

// ---------- Cabecera de resultado ----------

export function Hero({ data }: { data: ProfitReport }) {
    const { profit, marginPct, comparison } = data;
    const negative = profit < 0;
    const per100 = marginPct === null ? null : Math.abs(Math.round(marginPct));
    const sentence = marginPct === null
        ? 'En este periodo no hubo ingresos, solo gastos.'
        : negative
            ? `De cada $100 que entraron, perdiste $${per100}: salió más dinero del que entró.`
            : `De cada $100 que entraron, te quedaron $${per100}.`;
    return (
        <section aria-label="Utilidad neta" className={`${card} bg-bos-accent-soft p-5 sm:p-7 print:bg-white print:border-black`}>
            <p className="text-[13px] font-medium text-bos-muted">Utilidad neta del periodo</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <p data-testid="profit-total" className={`font-display text-5xl sm:text-6xl font-semibold tabular-nums tracking-tight ${negative ? 'text-bos-danger' : 'text-bos-text'}`}>{money(profit)}</p>
                <p className="text-[15px] font-medium text-bos-muted">
                    Margen <span className="font-display text-xl font-semibold tabular-nums text-bos-text">{marginPct === null ? '—' : `${marginPct.toLocaleString('es-MX')} %`}</span>
                </p>
            </div>
            <p className="mt-3 text-lg text-bos-text max-w-2xl">{sentence}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                <DeltaNote delta={comparison.profit} hasBase={comparison.hasBase} />
                {comparison.hasBase && (
                    <span className="text-[13px] text-bos-muted">Periodo anterior: {shortDay(comparison.period.from)} al {shortDay(comparison.period.to)} ({money(comparison.profit.previous)}).</span>
                )}
            </div>
            <p className="mt-3 text-[13px] text-bos-muted">Utilidad = lo cobrado (sin descuentos) menos comisiones, sueldos{data.bonuses.total > 0 ? ', bonos' : ''}, costo de los productos vendidos y gastos. Las propinas no entran: son del barbero.</p>
        </section>
    );
}

export function KpiStrip({ data }: { data: ProfitReport }) {
    const c = data.comparison;
    const items: { label: string; value: number; delta: Delta | null; goodWhen: 'up' | 'down'; note?: string }[] = [
        { label: 'Ingresos', value: data.revenue.total, delta: c.revenue, goodWhen: 'up', note: `${data.counts.sales} venta${data.counts.sales === 1 ? '' : 's'} cobrada${data.counts.sales === 1 ? '' : 's'}` },
        { label: 'Comisiones', value: data.commissions.total, delta: c.commissions, goodWhen: 'down' },
        { label: 'Sueldos', value: data.wages.total, delta: c.wages, goodWhen: 'down', note: `${data.wages.days} día${data.wages.days === 1 ? '' : 's'} de sueldo` },
        // Los bonos solo se muestran si hubo (sin metas activas no hay nada que contar).
        ...(data.bonuses.total > 0 ? [{ label: 'Bonos', value: data.bonuses.total, delta: null, goodWhen: 'down' as const, note: `${data.bonuses.count} bono${data.bonuses.count === 1 ? '' : 's'} por metas` }] : []),
        { label: 'Gastos', value: data.expenses.total, delta: c.expenses, goodWhen: 'down' },
        { label: 'Propinas (del barbero)', value: data.tips.total, delta: c.tips, goodWhen: 'up' },
    ];
    return (
        <section aria-label="Resumen" className={`grid grid-cols-2 gap-3 ${items.length > 5 ? 'lg:grid-cols-3' : 'lg:grid-cols-5'}`}>
            {items.map((k) => (
                <div key={k.label} className={`${card} p-4`} data-testid={`kpi-${k.label.split(' ')[0].toLowerCase()}`}>
                    <p className="text-[13px] font-medium text-bos-muted">{k.label}</p>
                    <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{money(k.value)}</p>
                    <div className="mt-2 min-h-[1.75rem]">
                        {k.label.startsWith('Propinas')
                            ? <p className="text-[13px] text-bos-muted">{data.tips.count} propina{data.tips.count === 1 ? '' : 's'}</p>
                            : k.delta ? <DeltaNote delta={k.delta} hasBase={c.hasBase} goodWhen={k.goodWhen} compact /> : null}
                    </div>
                    {k.note && <p className="mt-1 text-[13px] text-bos-muted">{k.note}</p>}
                </div>
            ))}
        </section>
    );
}

// ---------- Cascada ----------

export function Waterfall({ data }: { data: ProfitReport }) {
    const revenue = data.revenue.total;
    const rows = waterfallRows(data);
    const outTotal = rows.filter((r) => r.sign === '−').reduce((n, r) => n + r.amount, 0);
    const scale = Math.max(revenue, outTotal, 0.01);
    const share = (n: number) => (revenue > 0 ? `${((n / revenue) * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} % de lo cobrado` : '');
    return (
        <section aria-labelledby="fin-cascada" data-testid="waterfall" className={`${card} p-5 sm:p-6`}>
            <h2 id="fin-cascada" className={h2}>Del ingreso a la utilidad</h2>
            <p className="mt-1 text-sm text-bos-muted">Cada barra parte de lo que quedaba antes de ese concepto.</p>
            <ol className="mt-4 divide-y divide-bos-border">
                {rows.map((r) => {
                    const left = Math.max(0, Math.min(r.start, r.end)) / scale * 100;
                    const width = Math.max(0, Math.max(r.start, r.end) - Math.max(0, Math.min(r.start, r.end))) / scale * 100;
                    const strong = r.key === 'net' || r.key === 'rev';
                    return (
                        <li key={r.key} data-testid={`step-${r.key}`} className="py-3">
                            <div className="flex items-baseline justify-between gap-4">
                                <p className={strong ? 'font-semibold' : ''}>
                                    {r.sign && <span aria-hidden="true" className="inline-block w-4 text-bos-muted">{r.sign}</span>}
                                    {r.sign === '−' && <span className="sr-only">Menos </span>}{r.label}
                                </p>
                                <p className={`shrink-0 tabular-nums ${strong ? 'font-display text-lg font-semibold' : ''} ${r.key === 'net' && r.amount < 0 ? 'text-bos-danger' : ''}`}>{money(r.amount)}</p>
                            </div>
                            <div aria-hidden="true" className="relative mt-2 h-3 rounded-full bg-bos-raised">
                                <div className={`absolute inset-y-0 rounded-full ${r.tone}`} style={{ left: `${left}%`, width: `${Math.max(width, r.amount !== 0 ? 0.8 : 0)}%` }} />
                            </div>
                            <p className="mt-1.5 text-[13px] text-bos-muted">{r.hint}{r.key !== 'rev' && r.amount !== 0 && share(Math.abs(r.amount)) ? ` ${share(Math.abs(r.amount))}.` : ''}</p>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}

// ---------- A dónde va cada $100 ----------

export function Per100({ data }: { data: ProfitReport }) {
    const revenue = data.revenue.total;
    const parts = [
        { key: 'com', label: 'Comisiones', value: data.commissions.total, tone: 'bg-bos-accent' },
        { key: 'wage', label: 'Sueldos', value: data.wages.total, tone: 'bg-bos-text' },
        ...(data.bonuses.total > 0 ? [{ key: 'bonus', label: 'Bonos', value: data.bonuses.total, tone: 'bg-bos-muted' }] : []),
        { key: 'cost', label: 'Costo de productos', value: data.productCost.total, tone: 'bg-bos-control' },
        { key: 'exp', label: 'Gastos', value: data.expenses.total, tone: 'bg-bos-danger' },
        ...(data.profit > 0 ? [{ key: 'net', label: 'Utilidad', value: data.profit, tone: 'bg-bos-success' }] : []),
    ];
    const total = parts.reduce((n, p) => n + p.value, 0);
    return (
        <section aria-labelledby="fin-100" className={`${card} p-5 sm:p-6`}>
            <h2 id="fin-100" className={h2}>A dónde va cada $100</h2>
            {revenue <= 0 || total <= 0 ? <p className="mt-3 text-sm text-bos-muted">Sin ingresos en el periodo, no hay con qué repartir.</p> : (
                <>
                    <p className="mt-1 text-sm text-bos-muted">
                        {data.profit < 0 ? 'Se gastó más de lo que entró; la barra muestra cómo se reparte lo que salió.' : 'De cada $100 que entraron por ventas:'}
                    </p>
                    <div aria-hidden="true" className="mt-4 flex h-6 overflow-hidden rounded-full bg-bos-raised">
                        {parts.filter((p) => p.value > 0).map((p) => (
                            <div key={p.key} className={`${p.tone} border-r-2 border-bos-surface last:border-r-0`} style={{ width: `${(p.value / total) * 100}%` }} />
                        ))}
                    </div>
                    <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                        {parts.map((p) => (
                            <li key={p.key} className="flex items-center gap-2 text-sm">
                                <span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-sm ${p.tone}`} />
                                <span className="text-bos-text">{p.label}</span>
                                <span className="ml-auto tabular-nums font-medium">${Math.round((p.value / revenue) * 100)}</span>
                            </li>
                        ))}
                    </ul>
                    {data.profit < 0 && <p className="mt-3 text-sm text-bos-danger">Faltaron {money(-data.profit)} para cubrirlo todo.</p>}
                </>
            )}
        </section>
    );
}

// ---------- Tendencia ----------

export function Trend({ data }: { data: ProfitReport }) {
    const reduced = usePrefersReducedMotion();
    const rows = useMemo(() => data.daily.map((d) => ({ ...d, label: shortDay(d.date) })), [data.daily]);
    const best = rows.reduce<(typeof rows)[number] | null>((b, d) => (!b || d.net > b.net ? d : b), null);
    const totalIn = data.revenue.total;
    const totalOut = data.commissions.total + data.wages.total + data.bonuses.total + data.productCost.total + data.expenses.total;
    const summary = `Ingresos contra egresos por día. En total entraron ${money(totalIn)} y salieron ${money(totalOut)}.${best && best.revenue > 0 ? ` El mejor día fue ${shortDay(best.date)}, con ${money(best.net)} de resultado.` : ''}`;
    const tick = { fontSize: 12, fill: 'var(--bos-muted)' };
    const tooltip = {
        contentStyle: { background: 'var(--bos-surface)', border: '1px solid var(--bos-border)', borderRadius: 12, color: 'var(--bos-text)', fontSize: 13 },
        labelStyle: { color: 'var(--bos-muted)' }, itemStyle: { color: 'var(--bos-text)' }, cursor: { fill: 'var(--bos-raised)' },
        formatter: (v: unknown, name: unknown) => [money(Number(v)), String(name)] as [string, string],
    };
    const axes = (
        <>
            <CartesianGrid vertical={false} stroke="var(--bos-border)" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} interval="preserveStartEnd" minTickGap={24} />
            <YAxis axisLine={false} tickLine={false} tick={tick} width={52} tickFormatter={(v) => moneyShort(Number(v))} />
            <Tooltip {...tooltip} />
            <Legend wrapperStyle={{ fontSize: 13, color: 'var(--bos-muted)' }} />
        </>
    );
    return (
        <section aria-labelledby="fin-tendencia" className={`${card} p-5 sm:p-6`}>
            <h2 id="fin-tendencia" className={h2}>Ingresos contra egresos por día</h2>
            <p className="mt-1 text-sm text-bos-muted">Egresos = comisiones + sueldos + bonos + costo de productos + gastos, cada uno en el día en que ocurrió.</p>
            <div role="img" aria-label={summary} className="mt-4 h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    {rows.length <= 31 ? (
                        <BarChart data={rows} barGap={2}>
                            {axes}
                            <Bar name="Ingresos" dataKey="revenue" fill="var(--bos-accent)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!reduced} />
                            <Bar name="Egresos" dataKey="outflow" fill="var(--bos-control)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!reduced} />
                        </BarChart>
                    ) : (
                        <LineChart data={rows}>
                            {axes}
                            <Line name="Ingresos" dataKey="revenue" stroke="var(--bos-accent)" strokeWidth={2.5} dot={false} isAnimationActive={!reduced} />
                            <Line name="Egresos" dataKey="outflow" stroke="var(--bos-control)" strokeWidth={2.5} strokeDasharray="6 4" dot={false} isAnimationActive={!reduced} />
                        </LineChart>
                    )}
                </ResponsiveContainer>
            </div>
            <details className="mt-3 text-sm print:hidden">
                <summary className="cursor-pointer font-medium text-bos-accent-text">Ver los datos día por día</summary>
                <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-bos-border">
                    <table className="w-full text-left text-sm">
                        <caption className="sr-only">Ingresos y egresos por día</caption>
                        <thead className="sticky top-0 bg-bos-raised text-[13px] font-medium text-bos-muted">
                            <tr><th scope="col" className="px-3 py-2">Día</th><th scope="col" className="px-3 py-2 text-right">Ingresos</th><th scope="col" className="px-3 py-2 text-right">Egresos</th><th scope="col" className="px-3 py-2 text-right">Resultado</th></tr>
                        </thead>
                        <tbody className="divide-y divide-bos-border">
                            {rows.map((d) => (
                                <tr key={d.date}>
                                    <th scope="row" className="px-3 py-2 font-normal">{shortDay(d.date)}</th>
                                    <td className="px-3 py-2 text-right tabular-nums">{money(d.revenue)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{money(d.outflow)}</td>
                                    <td className={`px-3 py-2 text-right tabular-nums ${d.net < 0 ? 'text-bos-danger' : ''}`}>{money(d.net)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </details>
        </section>
    );
}

// ---------- Propinas ----------

export function Tips({ data }: { data: ProfitReport }) {
    const t = data.tips;
    return (
        <section aria-labelledby="fin-propinas" className="rounded-xl border border-dashed border-bos-control bg-bos-surface p-5 sm:p-6 print:break-inside-avoid">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="fin-propinas" className={h2}>Propinas</h2>
                    <p className="mt-1 max-w-xl text-sm text-bos-muted">Son del barbero; no forman parte de la utilidad. Se cobran al cliente y se le entregan completas en su recibo semanal.</p>
                </div>
                <p data-testid="tips-total" className="font-display text-3xl font-semibold tabular-nums">{money(t.total)}</p>
            </div>
            {t.count === 0 ? <p className="mt-4 text-sm text-bos-muted">No hubo propinas en este periodo.</p> : (
                <div className="mt-5 grid gap-6 md:grid-cols-2">
                    <div>
                        <h3 className="text-[13px] font-medium text-bos-muted">Por barbero</h3>
                        <ul className="mt-2 divide-y divide-bos-border text-sm">
                            {t.byBarber.map((b) => (
                                <li key={b.employeeId ?? 'sin'} className="flex items-baseline justify-between gap-3 py-2">
                                    <span>{b.name} <span className="text-bos-muted">· {b.count}</span></span>
                                    <span className="tabular-nums font-medium">{money(b.total)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h3 className="text-[13px] font-medium text-bos-muted">Por método de pago</h3>
                        <ul className="mt-2 divide-y divide-bos-border text-sm">
                            {t.byMethod.map((m) => (
                                <li key={m.method} className="flex items-baseline justify-between gap-3 py-2">
                                    <span>{METHOD_LABEL[m.method] ?? m.method} <span className="text-bos-muted">· {m.count}</span></span>
                                    <span className="tabular-nums font-medium">{money(m.total)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}

// ---------- Por barbero ----------

type SortKey = 'sales' | 'commission' | 'keeps' | 'tips';
const SORTS: { id: SortKey; label: string }[] = [
    { id: 'sales', label: 'Ventas' }, { id: 'commission', label: 'Comisión' }, { id: 'keeps', label: 'Deja al negocio' }, { id: 'tips', label: 'Propinas' },
];

export function Barbers({ rows }: { rows: BarberRow[] }) {
    const [sort, setSort] = useState<SortKey>('sales');
    const sorted = useMemo(() => [...rows].sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name, 'es')), [rows, sort]);
    return (
        <section aria-labelledby="fin-barberos" className={`${card} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="fin-barberos" className={h2}>Por barbero</h2>
                    <p className="mt-1 text-sm text-bos-muted">“Deja al negocio” es lo que vendió menos su comisión y el costo de sus productos, antes de gastos generales. Las propinas van aparte.</p>
                </div>
                <div role="group" aria-label="Ordenar por" className="flex flex-wrap gap-2 print:hidden">
                    {SORTS.map((s) => (
                        <button key={s.id} type="button" aria-pressed={sort === s.id} onClick={() => setSort(s.id)}
                            className={`min-h-11 px-3 rounded-full border text-[13px] font-medium ${sort === s.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`}>{s.label}</button>
                    ))}
                </div>
            </div>
            {sorted.length === 0 ? <p className="mt-4 text-sm text-bos-muted">Sin ventas ni propinas por barbero en este periodo.</p> : (
                <>
                    <div className="mt-4 hidden md:block">
                        <table className="w-full text-left text-sm">
                            <caption className="sr-only">Resultado por barbero, ordenado por {SORTS.find((s) => s.id === sort)?.label}</caption>
                            <thead className="text-[13px] font-medium text-bos-muted">
                                <tr className="border-b border-bos-border">
                                    <th scope="col" className="py-2 pr-3">Barbero</th>
                                    <th scope="col" className="py-2 px-3 text-right">Servicios</th>
                                    <th scope="col" className="py-2 px-3 text-right">Productos</th>
                                    <th scope="col" className="py-2 px-3 text-right">Ventas</th>
                                    <th scope="col" className="py-2 px-3 text-right">Comisión</th>
                                    <th scope="col" className="py-2 px-3 text-right">Deja al negocio</th>
                                    <th scope="col" className="py-2 pl-3 text-right">Propinas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-bos-border">
                                {sorted.map((b) => (
                                    <tr key={b.employeeId ?? 'sin'}>
                                        <th scope="row" className="py-2.5 pr-3 font-medium">{b.name}</th>
                                        <td className="py-2.5 px-3 text-right tabular-nums">{money(b.services)}</td>
                                        <td className="py-2.5 px-3 text-right tabular-nums">{money(b.products)}</td>
                                        <td className="py-2.5 px-3 text-right tabular-nums font-medium">{money(b.sales)}</td>
                                        <td className="py-2.5 px-3 text-right tabular-nums">{money(b.commission)}</td>
                                        <td className={`py-2.5 px-3 text-right tabular-nums font-medium ${b.keeps < 0 ? 'text-bos-danger' : ''}`}>{money(b.keeps)}</td>
                                        <td className="py-2.5 pl-3 text-right tabular-nums">{money(b.tips)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ul className="mt-4 space-y-3 md:hidden">
                        {sorted.map((b) => (
                            <li key={b.employeeId ?? 'sin'} className="rounded-xl border border-bos-border p-4">
                                <p className="font-semibold">{b.name}</p>
                                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                    <div><dt className="text-[13px] text-bos-muted">Ventas</dt><dd className="tabular-nums font-medium">{money(b.sales)}</dd></div>
                                    <div><dt className="text-[13px] text-bos-muted">Comisión</dt><dd className="tabular-nums">{money(b.commission)}</dd></div>
                                    <div><dt className="text-[13px] text-bos-muted">Deja al negocio</dt><dd className={`tabular-nums font-medium ${b.keeps < 0 ? 'text-bos-danger' : ''}`}>{money(b.keeps)}</dd></div>
                                    <div><dt className="text-[13px] text-bos-muted">Propinas</dt><dd className="tabular-nums">{money(b.tips)}</dd></div>
                                </dl>
                                <p className="mt-2 text-[13px] text-bos-muted">Servicios {money(b.services)} · productos {money(b.products)}</p>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

// ---------- Cobros y gastos ----------

export function PaymentMethods({ data }: { data: ProfitReport }) {
    const p = data.payments;
    return (
        <section aria-labelledby="fin-cobros" className={`${card} p-5 sm:p-6`}>
            <h2 id="fin-cobros" className={h2}>Cobros por método de pago</h2>
            <p className="mt-1 text-sm text-bos-muted">Lo que pagaron los clientes por sus ventas, sin propinas.</p>
            {p.total <= 0 ? <p className="mt-4 text-sm text-bos-muted">Sin cobros en este periodo.</p> : (
                <ul className="mt-4 space-y-4">
                    {p.byMethod.map((m) => {
                        const Icon = METHOD_ICON[m.method] ?? Wallet;
                        return (
                            <li key={m.method}>
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="inline-flex items-center gap-2 font-medium"><Icon aria-hidden="true" className="h-4 w-4 text-bos-muted" />{METHOD_LABEL[m.method] ?? m.method}</span>
                                    <span className="tabular-nums"><span className="font-medium">{money(m.total)}</span> <span className="text-bos-muted">· {m.sharePct === null ? '—' : `${m.sharePct.toLocaleString('es-MX')} %`}</span></span>
                                </div>
                                <div aria-hidden="true" className="mt-1.5 h-2 rounded-full bg-bos-raised">
                                    <div className="h-full rounded-full bg-bos-accent" style={{ width: `${m.sharePct ?? 0}%` }} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

export function ExpensesByCategory({ data }: { data: ProfitReport }) {
    const rows = data.expenses.byCategory;
    return (
        <section aria-labelledby="fin-gastos" className={`${card} p-5 sm:p-6`}>
            <h2 id="fin-gastos" className={h2}>Gastos por categoría</h2>
            {rows.length === 0 ? <p className="mt-3 text-sm text-bos-muted">Sin gastos en este periodo.</p> : (
                <ul className="mt-3 divide-y divide-bos-border text-sm">
                    {rows.map((c) => (
                        <li key={c.category} className="flex justify-between gap-4 py-2.5">
                            <span>{c.category} <span className="text-bos-muted">· {c.count}</span></span>
                            <span className="tabular-nums font-medium">{money(c.total)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

// ---------- Avisos ----------

export function Notices({ data }: { data: ProfitReport }) {
    return (
        <section aria-label="Avisos" className="space-y-3">
            {data.productsWithoutCost > 0 && (
                <div role="status" data-testid="profit-missing-cost" className="flex items-start gap-3 rounded-xl border border-bos-danger bg-bos-danger-soft p-4 print:bg-white print:break-inside-avoid">
                    <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-bos-danger" />
                    <div className="text-sm">
                        <p className="font-semibold text-bos-text">{data.productsWithoutCost} producto{data.productsWithoutCost === 1 ? '' : 's'} sin costo registrado</p>
                        <p className="text-bos-text">
                            Se vendieron {units(data.productCost.unitsWithoutCost)} sin costo; no se restó nada por ellas, así que la utilidad real es menor a la mostrada. Registra el costo en Inventario.
                        </p>
                        <ul className="mt-2 text-bos-text">
                            {data.productCost.missing.map((m) => <li key={m.productId || m.name}>{m.name} · {units(m.units)}</li>)}
                        </ul>
                    </div>
                </div>
            )}
            <p className="text-[13px] text-bos-muted">
                El costo de los productos es el que tenía cada producto al momento de venderse. Las ventas anteriores al 15 de noviembre de 2026 usan el costo de ese día.
                {data.counts.voidedExcluded > 0 && ` Hay ${data.counts.voidedExcluded} venta${data.counts.voidedExcluded === 1 ? '' : 's'} anulada${data.counts.voidedExcluded === 1 ? '' : 's'} que no se cuenta${data.counts.voidedExcluded === 1 ? '' : 'n'}.`}
            </p>
        </section>
    );
}

// ---------- Estados ----------

export function DashboardSkeleton() {
    return (
        <div role="status" aria-label="Cargando finanzas" className="space-y-4">
            <Skeleton className="rounded-xl h-44" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="rounded-xl h-28" />)}</div>
            <Skeleton className="rounded-xl h-72" />
            <div className="grid gap-4 md:grid-cols-2"><Skeleton className="rounded-xl h-48" /><Skeleton className="rounded-xl h-48" /></div>
        </div>
    );
}
