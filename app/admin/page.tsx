'use client';

import React, { useState, useEffect } from 'react';
import { Award, Loader2, BarChart3, Package } from 'lucide-react';
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

    if (!data) return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-sonblade-gold" /></div>;

    const { kpis, paymentBreakdown, weeklyBreakdown, serviceBreakdown, hourlySales, dailySales, lowStockProducts } = data;
    const periodLabel = period === 'today' ? 'Hoy' : period === 'week' ? 'Esta Semana' : 'Este Mes';
    // Las ventas por hora y por dia llegan con formas distintas ({hour} / {day}).
    // Se normalizan a un solo tipo para que la grafica reciba un arreglo homogeneo.
    const salesChartData: { label: string; revenue: number }[] = period === 'today'
        ? hourlySales.map(({ hour, revenue }) => ({ label: hour, revenue }))
        : dailySales.map(({ day, revenue }) => ({ label: day, revenue }));

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
                {([['resumen', 'Resumen General'], ['ganancias', 'Ganancias']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${tab === key ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                        {label}
                    </button>
                ))}
                <Link href="/liquidaciones" className="px-4 py-2 text-sm font-semibold rounded-md text-gray-500 hover:text-gray-900 transition-all">
                    Pago de Barberos →
                </Link>
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
                                    <BarChart data={salesChartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `$${v}`} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Venta']}
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
