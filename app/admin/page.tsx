'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Link from 'next/link';

interface AdminData {
    kpis: {
        totalRevenue: number; totalTips: number; avgTicket: number;
        totalCommissions: number; netProfit: number; totalSales: number;
    };
    paymentBreakdown: { cash: number; card: number; transfer: number };
    barberSummaries: {
        id: string; name: string; status: string;
        cuts: number; revenue: number; serviceRevenue: number; tips: number; rate: number; commission: number;
        serviceCommission: number; productCommission: number;
        serviceBreakdown?: { name: string; count: number; revenue: number }[];
    }[];
    weeklyBreakdown: { week: string; revenue: number }[];
    serviceBreakdown: { name: string; count: number; revenue: number }[];
    hourlySales: { hour: string; revenue: number }[];
    dailySales: { day: string; revenue: number }[];
    lowStockProducts: { id: string; name: string; stock: number; min_stock: number }[];
}

export default function AdminPage() {
    const [tab, setTab] = useState<'resumen' | 'ganancias'>('resumen');
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
    const [data, setData] = useState<AdminData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/admin/summary?period=${period}`);
                if (res.ok) setData(await res.json());
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        fetchData();
    }, [period]);

    if (!data) return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>;

    const { kpis, paymentBreakdown, weeklyBreakdown, serviceBreakdown, hourlySales, dailySales, lowStockProducts } = data;
    const periodLabel = period === 'today' ? 'Hoy' : period === 'week' ? 'Esta semana' : 'Este mes';
    // Las ventas por hora y por dia llegan con formas distintas ({hour} / {day}).
    // Se normalizan a un solo tipo para que la grafica reciba un arreglo homogeneo.
    const salesChartData: { label: string; revenue: number }[] = period === 'today'
        ? hourlySales.map(({ hour, revenue }) => ({ label: hour, revenue }))
        : dailySales.map(({ day, revenue }) => ({ label: day, revenue }));

    const card = 'rounded-xl border border-bos-border bg-bos-surface';
    const labelCls = 'text-[13px] font-medium text-bos-muted';
    const th = 'px-4 py-3 text-[13px] font-medium';
    const chip = (on: boolean) => `min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${on ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:text-bos-text'}`;
    const pct = (value: number) => Math.round((value / (kpis.totalRevenue || 1)) * 100);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Panel de administrador</h1>
                    <p className="text-bos-muted text-sm mt-1">Control financiero y comisiones</p>
                </div>
                <div role="group" aria-label="Periodo" className="flex gap-2">
                    {(['today', 'week', 'month'] as const).map(p => (
                        <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={chip(period === p)}>
                            {p === 'today' ? 'Día' : p === 'week' ? 'Semana' : 'Mes'}
                        </button>
                    ))}
                </div>
            </header>

            {/* Secciones */}
            <div className="flex flex-wrap gap-2">
                {([['resumen', 'Resumen general'], ['ganancias', 'Ganancias']] as const).map(([key, label]) => (
                    <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={chip(tab === key)}>
                        {label}
                    </button>
                ))}
                <Link href="/liquidaciones" className="min-h-11 px-4 inline-flex items-center rounded-full border border-bos-border text-sm font-semibold text-bos-muted hover:text-bos-text transition-colors">
                    Pago semanal →
                </Link>
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-bos-muted" /></div>}

            {/* Resumen */}
            {tab === 'resumen' && !loading && (
                <div className="space-y-6">
                    {/* Alertas de inventario */}
                    {lowStockProducts && lowStockProducts.length > 0 && (
                        <div className={`${card} p-4 flex items-start gap-3`}>
                            <div className="bg-bos-accent-soft p-2 rounded-xl text-bos-accent-text">
                                <Package className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-display font-semibold">Alertas de inventario</h3>
                                <p className="text-sm text-bos-muted mt-0.5">Los siguientes productos tienen stock bajo:</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {lowStockProducts.map(p => (
                                        <span key={p.id} className="bg-bos-bg border border-bos-control px-2.5 py-1 rounded-full text-xs font-medium">
                                            {p.name}: {p.stock} (mín. {p.min_stock})
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className={`${card} p-5`}>
                            <p className={labelCls}>Ingresos ({periodLabel})</p>
                            <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums mt-1">${kpis.totalRevenue.toFixed(2)}</p>
                        </div>
                        <div className={`${card} p-5`}>
                            <p className={labelCls}>Ganancia neta</p>
                            <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums text-bos-accent-text mt-1">${kpis.netProfit.toFixed(2)}</p>
                        </div>
                        <div className={`${card} p-5`}>
                            <p className={labelCls}>Comisiones totales</p>
                            <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums mt-1">${kpis.totalCommissions.toFixed(2)}</p>
                        </div>
                        <div className={`${card} p-5`}>
                            <p className={labelCls}>Ticket promedio</p>
                            <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums mt-1">${kpis.avgTicket.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Gráficas */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className={`lg:col-span-2 ${card} p-5 sm:p-6`}>
                            <h2 className="font-display text-lg font-semibold mb-6">Tendencia de ventas ({periodLabel})</h2>
                            <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={salesChartData}>
                                        <CartesianGrid vertical={false} stroke="var(--bos-border)" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--bos-muted)' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--bos-muted)' }} tickFormatter={(v) => `$${v}`} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--bos-surface)', border: '1px solid var(--bos-border)', borderRadius: 12, color: 'var(--bos-text)', fontSize: 13 }}
                                            labelStyle={{ color: 'var(--bos-muted)' }}
                                            itemStyle={{ color: 'var(--bos-text)' }}
                                            cursor={{ fill: 'var(--bos-raised)' }}
                                            formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Venta']}
                                        />
                                        <Bar dataKey="revenue" fill="var(--bos-accent)" radius={[6, 6, 0, 0]} maxBarSize={period === 'today' ? 24 : 36} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Métodos de pago */}
                        <div className={`${card} p-5 sm:p-6`}>
                            <h2 className="font-display text-lg font-semibold mb-5">Métodos de pago</h2>
                            <div className="space-y-3">
                                {([['Efectivo', paymentBreakdown.cash], ['Tarjeta', paymentBreakdown.card], ['Transferencia', paymentBreakdown.transfer]] as const).map(([name, amount]) => (
                                    <div key={name} className="p-4 rounded-xl border border-bos-border bg-bos-bg">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className={labelCls}>{name}</p>
                                            <p className="text-xs font-medium text-bos-muted tabular-nums">{pct(amount)}%</p>
                                        </div>
                                        <p className="font-display text-2xl font-semibold tabular-nums">${amount.toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Ranking de servicios */}
                    {serviceBreakdown && serviceBreakdown.length > 0 && (
                        <div className={`${card} overflow-hidden`}>
                            <div className="px-5 py-4 border-b border-bos-border flex flex-wrap gap-2 justify-between items-center">
                                <h2 className="font-display font-semibold">Ranking de servicios ({periodLabel})</h2>
                                <span className="text-xs font-medium bg-bos-raised px-2.5 py-1 rounded-full text-bos-muted">
                                    Total: {serviceBreakdown.reduce((s, b) => s + b.count, 0)} items
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-bos-muted">
                                        <tr>
                                            <th className={`${th} text-left`}>Servicio / producto</th>
                                            <th className={`${th} text-center`}>Ventas</th>
                                            <th className={`${th} text-right`}>Ingresos brutos</th>
                                            <th className={`${th} text-right`}>% participación</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {serviceBreakdown.map(s => (
                                            <tr key={s.name} className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                                <td className="px-4 py-3 font-semibold">{s.name}</td>
                                                <td className="px-4 py-3 text-center tabular-nums">{s.count}</td>
                                                <td className="px-4 py-3 text-right font-semibold tabular-nums">${s.revenue.toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-xs text-bos-muted font-medium tabular-nums">{pct(s.revenue)}%</span>
                                                        <div className="w-16 h-1.5 bg-bos-raised rounded-full overflow-hidden">
                                                            <div className="h-full bg-bos-accent" style={{ width: `${Math.min(100, (s.revenue / (kpis.totalRevenue || 1)) * 100)}%` }}></div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Ganancias */}
            {tab === 'ganancias' && !loading && (
                <div className="space-y-6">
                    <div className={`${card} p-6 sm:p-8`}>
                        <p className={labelCls}>Ganancia neta ({periodLabel})</p>
                        <h2 className="font-display text-4xl sm:text-5xl font-semibold tabular-nums text-bos-accent-text mt-2">${kpis.netProfit.toFixed(2)}</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mt-6 pt-6 border-t border-bos-border">
                            <div><p className={labelCls}>Ingresos totales</p><p className="font-display text-xl font-semibold tabular-nums">${kpis.totalRevenue.toFixed(2)}</p></div>
                            <div><p className={labelCls}>Comisiones</p><p className="font-display text-xl font-semibold tabular-nums text-bos-danger">−${kpis.totalCommissions.toFixed(2)}</p></div>
                            <div><p className={labelCls}>Propinas (barbero)</p><p className="font-display text-xl font-semibold tabular-nums text-bos-muted">${kpis.totalTips.toFixed(2)}</p></div>
                        </div>
                    </div>

                    <div className={`${card} p-5 sm:p-6`}>
                        <h2 className="font-display text-lg font-semibold mb-4">Desglose semanal del mes</h2>
                        <div className="space-y-2">
                            {weeklyBreakdown.map((w, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-bos-bg border border-bos-control rounded-xl">
                                    <span className="font-medium text-bos-muted">{w.week}</span>
                                    <span className="font-semibold tabular-nums">${w.revenue.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
