'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, Download, Loader2, Package, TriangleAlert } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Link from 'next/link';

interface Finance {
    period: { from: string; to: string; timezone: string };
    revenue: number; commissions: number; productCost: number; expenses: number; tips: number;
    profit: number; marginPct: number | null; productsWithoutCost: number; sales: number; avgTicket: number;
    profitDeltaPct: number | null;
}

interface AdminData {
    kpis: { totalRevenue: number; totalTips: number; avgTicket: number; totalCommissions: number; netProfit: number; totalSales: number };
    paymentBreakdown: { cash: number; card: number; transfer: number };
    serviceBreakdown: { name: string; count: number; revenue: number }[];
    hourlySales: { hour: string; revenue: number }[];
    dailySales: { day: string; revenue: number }[];
    lowStockProducts: { id: string; name: string; stock: number; min_stock: number }[];
    finance: Finance;
}

type Period = 'today' | 'week' | 'month';
const PERIODS: { id: Period; chip: string; label: string; empty: string }[] = [
    { id: 'today', chip: 'Hoy', label: 'Hoy', empty: 'Aún no hay ventas hoy' },
    { id: 'week', chip: 'Semana', label: 'Esta semana', empty: 'Aún no hay ventas esta semana' },
    { id: 'month', chip: 'Mes', label: 'Este mes', empty: 'Aún no hay ventas este mes' },
];

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const rangeText = (from: string, to: string) => (from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`);

const card = 'rounded-xl border border-bos-border bg-bos-surface';
const labelCls = 'text-[13px] font-medium text-bos-muted';
const th = 'px-4 py-3 text-[13px] font-medium';
const linkCls = 'inline-flex items-center gap-1 text-sm font-semibold text-bos-accent-text hover:underline underline-offset-2';
const chip = (on: boolean) => `min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${on ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:text-bos-text'}`;

function Empty({ title, hint }: { title: string; hint?: string }) {
    return (
        <div className="flex h-full min-h-32 flex-col items-center justify-center gap-1 text-center px-4">
            <p className="font-medium">{title}</p>
            {hint && <p className="text-sm text-bos-muted">{hint}</p>}
        </div>
    );
}

export default function AdminPage() {
    const [period, setPeriod] = useState<Period>('today');
    const [data, setData] = useState<AdminData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/admin/summary?period=${period}&basis=finanzas`, { cache: 'no-store' });
                const body = await res.json().catch(() => null);
                if (cancelled) return;
                if (!res.ok || !body?.finance) throw new Error(body?.error ?? 'No se pudo cargar el resumen.');
                setData(body as AdminData);
                setError('');
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.');
            } finally { if (!cancelled) setLoading(false); }
        };
        fetchData();
        return () => { cancelled = true; };
    }, [period]);

    const meta = PERIODS.find((p) => p.id === period)!;

    if (!data) {
        return error
            ? <p role="alert" className={`${card} max-w-7xl mx-auto p-4 text-bos-danger`}>{error}</p>
            : <div className="flex justify-center items-center h-[60vh]"><Loader2 aria-label="Cargando" className="h-8 w-8 animate-spin text-bos-muted" /></div>;
    }

    const { kpis, paymentBreakdown, serviceBreakdown, hourlySales, dailySales, lowStockProducts, finance } = data;
    const hasSales = finance.sales > 0;
    const dates = rangeText(finance.period.from, finance.period.to);
    const salesChartData = period === 'today'
        ? hourlySales.map(({ hour, revenue }) => ({ label: hour, revenue }))
        : dailySales.map(({ day, revenue }) => ({ label: day, revenue }));
    const pct = (value: number) => Math.round((value / (kpis.totalRevenue || 1)) * 100);
    const payTotal = paymentBreakdown.cash + paymentBreakdown.card + paymentBreakdown.transfer;

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Resumen del negocio</h1>
                    <p className="text-bos-muted text-sm mt-1" data-testid="period-label">{meta.label} · {dates}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div role="group" aria-label="Periodo" className="flex gap-2">
                        {PERIODS.map((p) => (
                            <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={chip(period === p.id)}>{p.chip}</button>
                        ))}
                    </div>
                    {loading && <Loader2 aria-label="Actualizando" className="h-5 w-5 animate-spin text-bos-muted" />}
                </div>
            </header>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Link href="/reportes" className={linkCls}><Download aria-hidden="true" className="h-4 w-4" /> Descargar reporte del periodo</Link>
                <Link href="/liquidaciones" className={linkCls}>Pago semanal <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
            </div>

            {error && <p role="alert" className={`${card} p-4 text-bos-danger`}>{error}</p>}

            {lowStockProducts && lowStockProducts.length > 0 && (
                <div className={`${card} p-4 flex items-start gap-3`}>
                    <div className="bg-bos-accent-soft p-2 rounded-xl text-bos-accent-text"><Package aria-hidden="true" className="h-5 w-5" /></div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-display font-semibold">Stock bajo</h2>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {lowStockProducts.map((p) => (
                                <span key={p.id} className="bg-bos-bg border border-bos-control px-2.5 py-1 rounded-full text-xs font-medium">
                                    {p.name}: {p.stock} (mín. {p.min_stock})
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <section aria-label="Indicadores" className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className={`${card} p-5`}>
                        <p className={labelCls}>Ingresos</p>
                        <p data-testid="kpi-revenue" className="font-display text-2xl sm:text-3xl font-semibold tabular-nums mt-1">{money(kpis.totalRevenue)}</p>
                        <p className="text-xs text-bos-muted mt-1">{kpis.totalSales} {kpis.totalSales === 1 ? 'venta cobrada' : 'ventas cobradas'}</p>
                    </div>
                    <div className={`${card} p-5`}>
                        <p className={labelCls}>Utilidad neta</p>
                        <p data-testid="kpi-profit" className="font-display text-2xl sm:text-3xl font-semibold tabular-nums text-bos-accent-text mt-1">{money(kpis.netProfit)}</p>
                        <Link href="/administracion" className={`${linkCls} mt-1`}>Ver detalle en Finanzas <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                    </div>
                    <div className={`${card} p-5`}>
                        <p className={labelCls}>Comisiones</p>
                        <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums mt-1">{money(kpis.totalCommissions)}</p>
                        <p className="text-xs text-bos-muted mt-1">De las ventas cobradas</p>
                    </div>
                    <div className={`${card} p-5`}>
                        <p className={labelCls}>Ticket promedio</p>
                        <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums mt-1">{money(kpis.avgTicket)}</p>
                        <p className="text-xs text-bos-muted mt-1">Ingresos entre ventas</p>
                    </div>
                </div>
                <p className="text-sm text-bos-muted" data-testid="profit-formula">
                    Utilidad = ingresos − comisiones ({money(finance.commissions)}) − costo de producto ({money(finance.productCost)}) − gastos ({money(finance.expenses)}).
                    {' '}Propinas ({money(finance.tips)}) son del barbero: no cuentan como ingreso ni se restan.
                </p>
                {finance.productsWithoutCost > 0 && (
                    <p role="status" className="flex items-start gap-2 text-sm text-bos-text">
                        <TriangleAlert aria-hidden="true" className="h-4 w-4 mt-0.5 shrink-0 text-bos-danger" />
                        <span>{finance.productsWithoutCost} {finance.productsWithoutCost === 1 ? 'producto vendido no tiene' : 'productos vendidos no tienen'} costo: la utilidad puede estar por encima de la real. <Link href="/administracion" className="font-semibold underline underline-offset-2">Verlo en Finanzas</Link></span>
                    </p>
                )}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <section aria-labelledby="sales-chart" className={`lg:col-span-2 ${card} p-5 sm:p-6`}>
                    <h2 id="sales-chart" className="font-display text-lg font-semibold">{period === 'today' ? 'Ingresos por hora' : 'Ingresos por día'}</h2>
                    <p className="text-sm text-bos-muted mb-4">{meta.label} · {dates}</p>
                    <div className="h-[260px]">
                        {!hasSales ? <Empty title={meta.empty} hint="Cuando se cobre la primera, aparece aquí." /> : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={salesChartData}>
                                    <CartesianGrid vertical={false} stroke="var(--bos-border)" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--bos-muted)' }} interval="preserveStartEnd" minTickGap={12} />
                                    <YAxis axisLine={false} tickLine={false} width={48} tick={{ fontSize: 12, fill: 'var(--bos-muted)' }} tickFormatter={(v) => `$${v}`} />
                                    <Tooltip
                                        contentStyle={{ background: 'var(--bos-surface)', border: '1px solid var(--bos-border)', borderRadius: 12, color: 'var(--bos-text)', fontSize: 13 }}
                                        labelStyle={{ color: 'var(--bos-muted)' }}
                                        itemStyle={{ color: 'var(--bos-text)' }}
                                        cursor={{ fill: 'var(--bos-raised)' }}
                                        formatter={(v) => [money(Number(v)), 'Ingresos']}
                                    />
                                    <Bar dataKey="revenue" fill="var(--bos-accent)" radius={[6, 6, 0, 0]} maxBarSize={period === 'today' ? 24 : 36} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </section>

                <section aria-labelledby="pay-title" className={`${card} p-5 sm:p-6`}>
                    <h2 id="pay-title" className="font-display text-lg font-semibold">Cómo pagaron</h2>
                    <p className="text-sm text-bos-muted mb-4">{meta.label} · {dates}</p>
                    {payTotal === 0 ? <Empty title={meta.empty} /> : (
                        <ul className="space-y-3">
                            {([['Efectivo', paymentBreakdown.cash], ['Tarjeta', paymentBreakdown.card], ['Transferencia', paymentBreakdown.transfer]] as const).map(([name, amount]) => (
                                <li key={name} className="p-4 rounded-xl border border-bos-border bg-bos-bg">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className={labelCls}>{name}</p>
                                        <p className="text-xs font-medium text-bos-muted tabular-nums">{Math.round((amount / payTotal) * 100)}%</p>
                                    </div>
                                    <p className="font-display text-xl font-semibold tabular-nums">{money(amount)}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            <section aria-labelledby="rank-title" className={`${card} overflow-hidden`}>
                <div className="px-5 py-4 border-b border-bos-border flex flex-wrap gap-2 justify-between items-center">
                    <div>
                        <h2 id="rank-title" className="font-display font-semibold">Servicios más vendidos</h2>
                        <p className="text-sm text-bos-muted">{meta.label} · {dates}</p>
                    </div>
                    {serviceBreakdown.length > 0 && (
                        <span className="text-xs font-medium bg-bos-raised px-2.5 py-1 rounded-full text-bos-muted">
                            {serviceBreakdown.reduce((s, b) => s + b.count, 0)} servicios
                        </span>
                    )}
                </div>
                {serviceBreakdown.length === 0 ? <div className="py-8"><Empty title={meta.empty} /></div> : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[420px] text-sm">
                            <thead className="text-bos-muted">
                                <tr>
                                    <th className={`${th} text-left`}>Servicio</th>
                                    <th className={`${th} text-center`}>Cantidad</th>
                                    <th className={`${th} text-right`}>Ingresos</th>
                                    <th className={`${th} text-right`}>% del total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {serviceBreakdown.map((s) => (
                                    <tr key={s.name} className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                        <td className="px-4 py-3 font-semibold">{s.name}</td>
                                        <td className="px-4 py-3 text-center tabular-nums">{s.count}</td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(s.revenue)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <span className="text-xs text-bos-muted font-medium tabular-nums">{pct(s.revenue)}%</span>
                                                <div aria-hidden="true" className="w-16 h-1.5 bg-bos-raised rounded-full overflow-hidden">
                                                    <div className="h-full bg-bos-accent" style={{ width: `${Math.min(100, (s.revenue / (kpis.totalRevenue || 1)) * 100)}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
