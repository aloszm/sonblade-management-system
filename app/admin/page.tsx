'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Scissors, TrendingDown, Award, Users, Loader2, Check, ChevronDown, BarChart3, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

interface AdminData {
    kpis: {
        totalRevenue: number; totalTips: number; avgTicket: number;
        totalCommissions: number; netProfit: number; totalSales: number;
    };
    paymentBreakdown: { cash: number; card: number; transfer: number };
    barberSummaries: {
        id: string; name: string; status: string;
        cuts: number; revenue: number; tips: number; rate: number; commission: number;
        serviceBreakdown?: { name: string; count: number; revenue: number }[];
    }[];
    payments: any[];
    weeklyBreakdown: { week: string; revenue: number }[];
    serviceBreakdown: { name: string; count: number; revenue: number }[];
    hourlySales: { hour: string; revenue: number }[];
    dailySales: { day: string; revenue: number }[];
    lowStockProducts: { id: string; name: string; stock: number; min_stock: number }[];
}

export default function AdminPage() {
    const [tab, setTab] = useState<'resumen' | 'pagos' | 'ganancias'>('resumen');
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
    const [data, setData] = useState<AdminData | null>(null);
    const [loading, setLoading] = useState(true);
    const [payingId, setPayingId] = useState<string | null>(null);
    const [expandedBarber, setExpandedBarber] = useState<string | null>(null);
    const [paymentNote, setPaymentNote] = useState('');

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

    const handlePay = async (barberId: string, commission: number, tips: number, name: string) => {
        const total = commission + tips;
        if (!window.confirm(`¿Confirmas pagar un total de $${total.toFixed(2)} ($${commission.toFixed(2)} comisión + $${tips.toFixed(2)} propinas) a ${name}?`)) return;
        setPayingId(barberId);
        try {
            const now = new Date();
            const day = now.getDay();
            const weekStart = new Date(now); weekStart.setDate(now.getDate() - day);
            const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

            await fetch('/api/admin/payments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    barber_id: barberId,
                    amount: total,
                    commission_amount: commission,
                    tips_amount: tips,
                    note: paymentNote,
                    period_start: format(weekStart, 'yyyy-MM-dd'),
                    period_end: format(weekEnd, 'yyyy-MM-dd')
                })
            });
            setPaymentNote('');
            // Refresh
            const res = await fetch(`/api/admin/summary?period=${period}`);
            if (res.ok) setData(await res.json());
        } catch (e) { console.error(e); }
        finally { setPayingId(null); }
    };

    if (!data) return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-sonblade-gold" /></div>;

    const { kpis, paymentBreakdown, barberSummaries, payments, weeklyBreakdown, serviceBreakdown, hourlySales, dailySales, lowStockProducts } = data;
    const periodLabel = period === 'today' ? 'Hoy' : period === 'week' ? 'Esta Semana' : 'Este Mes';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Award className="text-sonblade-gold h-6 w-6" />Panel de Administrador</h1>
                    <p className="text-gray-500 text-sm mt-1">Control financiero y comisiones</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                    {(['today', 'week', 'month'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${period === p ? 'bg-black text-sonblade-gold shadow' : 'text-gray-500'}`}>
                            {p === 'today' ? 'Día' : p === 'week' ? 'Semana' : 'Mes'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                {([['resumen', 'Resumen General'], ['pagos', 'Pago de Barberos'], ['ganancias', 'Ganancias']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key as any)}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {loading && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-sonblade-gold" /></div>}

            {/* TAB: Resumen */}
            {tab === 'resumen' && !loading && (
                <div className="space-y-6">
                    {/* Inventory Alerts */}
                    {lowStockProducts && lowStockProducts.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                            <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                                <Package className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-sm font-bold text-amber-800">Alertas de Inventario</h3>
                                <p className="text-xs text-amber-700 mt-0.5">Los siguientes productos tienen stock bajo:</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {lowStockProducts.map(p => (
                                        <span key={p.id} className="bg-white border border-amber-200 px-2 py-1 rounded text-[10px] font-bold text-amber-800">
                                            {p.name}: {p.stock} (Min: {p.min_stock})
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase">Ingresos ({periodLabel})</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">${kpis.totalRevenue.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase">Ganancia Neta</p>
                            <p className="text-3xl font-black text-green-600 mt-1">${kpis.netProfit.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase">Comisiones Totales</p>
                            <p className="text-3xl font-black text-sonblade-gold mt-1">${kpis.totalCommissions.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase">Ticket Promedio</p>
                            <p className="text-3xl font-black text-gray-900 mt-1">${kpis.avgTicket.toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Dashboard Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-bold text-gray-900">Tendencia de Ventas ({periodLabel})</h2>
                                <BarChart3 className="h-5 w-5 text-sonblade-gold" />
                            </div>
                            <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={period === 'today' ? hourlySales : dailySales}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey={period === 'today' ? 'hour' : 'day'} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}`} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Venta']}
                                        />
                                        <Bar dataKey="revenue" fill="#D4AF37" radius={[4, 4, 0, 0]} barSize={period === 'today' ? 20 : 30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Payment methods mini-chart/summary */}
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-6 font-display">Métodos de Pago</h2>
                            <div className="space-y-4">
                                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="text-xs font-bold text-green-600 uppercase">Efectivo</p>
                                        <p className="text-[10px] font-bold text-green-600 bg-white px-1.5 py-0.5 rounded shadow-sm">
                                            {Math.round((paymentBreakdown.cash / (kpis.totalRevenue || 1)) * 100)}%
                                        </p>
                                    </div>
                                    <p className="text-2xl font-black text-green-700">${paymentBreakdown.cash.toFixed(2)}</p>
                                </div>
                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="text-xs font-bold text-blue-600 uppercase">Tarjeta</p>
                                        <p className="text-[10px] font-bold text-blue-600 bg-white px-1.5 py-0.5 rounded shadow-sm">
                                            {Math.round((paymentBreakdown.card / (kpis.totalRevenue || 1)) * 100)}%
                                        </p>
                                    </div>
                                    <p className="text-2xl font-black text-blue-700">${paymentBreakdown.card.toFixed(2)}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                    <div className="flex justify-between items-center mb-1">
                                        <p className="text-xs font-bold text-gray-600 uppercase">Transferencia</p>
                                        <p className="text-[10px] font-bold text-gray-600 bg-white px-1.5 py-0.5 rounded shadow-sm">
                                            {Math.round((paymentBreakdown.transfer / (kpis.totalRevenue || 1)) * 100)}%
                                        </p>
                                    </div>
                                    <p className="text-2xl font-black text-gray-700">${paymentBreakdown.transfer.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Service Breakdown Table */}
                    {serviceBreakdown && serviceBreakdown.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                                <h2 className="font-bold text-gray-900">Ranking de Servicios ({periodLabel})</h2>
                                <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded text-gray-500">
                                    Total: {serviceBreakdown.reduce((s, b) => s + b.count, 0)} items
                                </span>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="p-4 text-left text-xs uppercase font-semibold">Servicio / Producto</th>
                                        <th className="p-4 text-center text-xs uppercase font-semibold">Ventas</th>
                                        <th className="p-4 text-right text-xs uppercase font-semibold">Ingresos Brutos</th>
                                        <th className="p-4 text-right text-xs uppercase font-semibold">% Participación</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {serviceBreakdown.map(s => (
                                        <tr key={s.name} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 font-bold text-gray-900">{s.name}</td>
                                            <td className="p-4 text-center font-bold text-gray-700">{s.count}</td>
                                            <td className="p-4 text-right font-black text-gray-900">${s.revenue.toFixed(2)}</td>
                                            <td className="p-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-xs text-gray-400 font-bold">{Math.round((s.revenue / (kpis.totalRevenue || 1)) * 100)}%</span>
                                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-sonblade-gold" style={{ width: `${(s.revenue / (kpis.totalRevenue || 1)) * 100}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: Pago de Barberos */}
            {tab === 'pagos' && !loading && (
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-5 bg-gray-50 border-b border-gray-100">
                            <h2 className="font-bold text-gray-900">Comisiones Pendientes ({periodLabel})</h2>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="text-gray-500 border-b">
                                <tr>
                                    <th className="p-4 text-xs uppercase font-semibold">Barbero</th>
                                    <th className="p-4 text-xs uppercase font-semibold text-center">Cortes</th>
                                    <th className="p-4 text-xs uppercase font-semibold text-right">Generado</th>
                                    <th className="p-4 text-xs uppercase font-semibold text-center">Tasa</th>
                                    <th className="p-4 text-xs uppercase font-semibold text-right">Comisión</th>
                                    <th className="p-4 text-xs uppercase font-semibold text-right">Propinas</th>
                                    <th className="p-4 text-xs uppercase font-semibold text-right">A Pagar</th>
                                    <th className="p-4 text-xs uppercase font-semibold text-center">Detalle</th>
                                    <th className="p-4 text-xs uppercase font-semibold text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {barberSummaries.map(b => (
                                    <React.Fragment key={b.id}>
                                        <tr className="hover:bg-gray-50">
                                            <td className="p-4 font-bold text-gray-900 flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-black text-sonblade-gold flex items-center justify-center text-xs font-bold">{b.name.charAt(0)}</div>
                                                {b.name}
                                            </td>
                                            <td className="p-4 text-center font-bold">{b.cuts}</td>
                                            <td className="p-4 text-right">${b.revenue.toFixed(2)}</td>
                                            <td className="p-4 text-center"><span className="bg-sonblade-gold text-black px-2 py-0.5 rounded text-xs font-bold">{b.rate}%</span></td>
                                            <td className="p-4 text-right font-bold text-gray-700">${b.commission.toFixed(2)}</td>
                                            <td className="p-4 text-right font-bold text-blue-600">${b.tips.toFixed(2)}</td>
                                            <td className="p-4 text-right font-black text-sonblade-gold text-base">${(b.commission + b.tips).toFixed(2)}</td>
                                            <td className="p-4 text-center">
                                                <button onClick={() => setExpandedBarber(expandedBarber === b.id ? null : b.id)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedBarber === b.id ? 'rotate-180' : ''}`} />
                                                </button>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex flex-col gap-2 min-w-[120px]">
                                                    <input
                                                        type="text"
                                                        placeholder="Nota..."
                                                        value={paymentNote}
                                                        onChange={(e) => setPaymentNote(e.target.value)}
                                                        className="text-[10px] px-2 py-1 border border-gray-200 rounded"
                                                    />
                                                    <button onClick={() => handlePay(b.id, b.commission, b.tips, b.name)} disabled={payingId === b.id || (b.commission + b.tips) === 0}
                                                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50 flex items-center gap-1 justify-center">
                                                        {payingId === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Pagar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedBarber === b.id && b.serviceBreakdown && (
                                            <tr className="bg-gray-50/50">
                                                <td colSpan={9} className="p-4">
                                                    <div className="bg-white rounded-lg border border-gray-200 p-4 max-w-md ml-auto">
                                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Desglose de Servicios - {b.name}</h4>
                                                        <div className="space-y-2">
                                                            {b.serviceBreakdown.map((s, i) => (
                                                                <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                                                                    <span className="text-gray-600">{s.name} <span className="text-xs text-gray-400">x{s.count}</span></span>
                                                                    <span className="font-bold">${s.revenue.toFixed(2)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Payment History */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-5 bg-gray-50 border-b border-gray-100">
                            <h2 className="font-bold text-gray-900">Historial de Pagos Realizados</h2>
                        </div>
                        <table className="w-full text-left text-sm">
                            <thead className="text-gray-500 border-b">
                                <tr>
                                    <th className="p-4 text-xs uppercase">Barbero</th>
                                    <th className="p-4 text-xs uppercase">Período</th>
                                    <th className="p-4 text-xs uppercase text-right">Comisión</th>
                                    <th className="p-4 text-xs uppercase text-right">Propinas</th>
                                    <th className="p-4 text-xs uppercase text-right">Total</th>
                                    <th className="p-4 text-xs uppercase text-right">Fecha Pago</th>
                                    <th className="p-4 text-xs uppercase text-center">Nota</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {payments.length === 0 ? (
                                    <tr><td colSpan={7} className="p-6 text-center text-gray-400">Sin pagos registrados</td></tr>
                                ) : payments.map((p: any) => (
                                    <tr key={p.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-medium">{p.barber?.name || 'N/A'}</td>
                                        <td className="p-4 text-gray-400 text-xs">{p.period_start} → {p.period_end}</td>
                                        <td className="p-4 text-right font-medium">${Number(p.commission_amount || 0).toFixed(2)}</td>
                                        <td className="p-4 text-right font-medium text-blue-600">${Number(p.tips_amount || 0).toFixed(2)}</td>
                                        <td className="p-4 text-right font-bold text-green-600">${Number(p.amount).toFixed(2)}</td>
                                        <td className="p-4 text-right text-gray-500">{format(new Date(p.paid_at), 'dd/MM/yyyy HH:mm')}</td>
                                        <td className="p-4 text-center text-xs text-gray-400 italic">{p.note || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB: Ganancias */}
            {tab === 'ganancias' && !loading && (
                <div className="space-y-6">
                    <div className="bg-gradient-to-r from-black to-gray-800 rounded-2xl p-8 text-white shadow-md">
                        <p className="text-gray-300 text-sm uppercase font-bold tracking-wider">Ganancia Neta ({periodLabel})</p>
                        <h2 className="text-5xl font-black text-sonblade-gold mt-2">${kpis.netProfit.toFixed(2)}</h2>
                        <div className="grid grid-cols-3 gap-6 mt-6">
                            <div><p className="text-xs text-gray-400 uppercase">Ingresos Totales</p><p className="text-xl font-bold">${kpis.totalRevenue.toFixed(2)}</p></div>
                            <div><p className="text-xs text-gray-400 uppercase">Comisiones</p><p className="text-xl font-bold text-red-400">−${kpis.totalCommissions.toFixed(2)}</p></div>
                            <div><p className="text-xs text-gray-400 uppercase">Propinas (Barbero)</p><p className="text-xl font-bold text-gray-400">${kpis.totalTips.toFixed(2)}</p></div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">Desglose Semanal del Mes</h2>
                        <div className="space-y-3">
                            {weeklyBreakdown.map((w, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <span className="font-semibold text-gray-700">{w.week}</span>
                                    <span className="font-bold text-gray-900">${w.revenue.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
