'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, Download, TrendingUp, TrendingDown, Users, Package, Scissors, PieChart as PieIcon, LineChart as LineIcon, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';

interface ReportData {
    kpis: any;
    serviceBreakdown: any[];
    paymentBreakdown: any;
    dailySales: any[];
}

const COLORS = ['#D4AF37', '#000000', '#4B5563', '#9CA3AF'];

export default function ReportsPage() {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('week');

    useEffect(() => {
        fetchData();
    }, [period]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/summary?period=${period}`);
            if (res.ok) {
                setData(await res.json());
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (loading || !data) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-sonblade-gold" />
                <p className="text-gray-500 font-bold animate-pulse">Generando reportes inteligentes...</p>
            </div>
        );
    }

    const pieData = [
        { name: 'Efectivo', value: data.paymentBreakdown.cash },
        { name: 'Tarjeta', value: data.paymentBreakdown.card },
        { name: 'Transferencia', value: data.paymentBreakdown.transfer },
    ].filter(d => d.value > 0);

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        <BarChart3 className="text-sonblade-gold h-8 w-8" />
                        Centro de Reportes
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Análisis estadístico y exportación de datos operativos</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                        {['today', 'week', 'month'].map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${period === p ? 'bg-black text-sonblade-gold shadow-md' : 'text-gray-400'}`}
                            >
                                {p === 'today' ? 'HOY' : p === 'week' ? 'SEMANA' : 'MES'}
                            </button>
                        ))}
                    </div>
                    <button className="bg-sonblade-gold text-black p-2.5 rounded-xl hover:bg-yellow-500 transition-all shadow-lg">
                        <Download className="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Ingresos Totales', value: `$${data.kpis.totalRevenue.toFixed(2)}`, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: 'Comisiones Pagadas', value: `$${data.kpis.totalCommissions.toFixed(2)}`, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
                    { label: 'Ticket Promedio', value: `$${data.kpis.avgTicket.toFixed(2)}`, icon: PieIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Visitas Totales', value: data.kpis.totalSales, icon: Users, color: 'text-sonblade-gold', bg: 'bg-yellow-50' },
                ].map((kpi, i) => (
                    <div key={i} className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                        <div className={`absolute top-0 right-0 w-16 h-16 ${kpi.bg} rounded-bl-full -mr-4 -mt-4 opacity-50`}></div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{kpi.label}</p>
                        <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
                        <kpi.icon className={`absolute bottom-4 right-4 h-5 w-5 ${kpi.color.replace('text-', 'text- opacity-20')}`} />
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="font-black text-gray-900 flex items-center gap-2"><LineIcon className="h-5 w-5 text-sonblade-gold" /> Tendencia de Ingresos</h3>
                        <span className="text-xs font-bold text-green-500">+12% vs período anterior</span>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.dailySales}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `$${v}`} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                                    formatter={(v: any) => [`$${v}`, 'Ingresos']}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="font-black text-gray-900 flex items-center gap-2"><PieIcon className="h-5 w-5 text-sonblade-gold" /> Métodos de Pago</h3>
                        <div className="flex gap-4">
                            {pieData.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">{d.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="h-[300px] w-full flex items-center justify-center">
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80}
                                        outerRadius={110}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: any) => `$${v.toFixed(2)}`} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-gray-400 italic">No hay datos de pago</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm overflow-hidden">
                    <h3 className="font-black text-gray-900 mb-6 flex items-center gap-2"><Scissors className="h-5 w-5 text-sonblade-gold" /> Ranking de Popularidad</h3>
                    <div className="space-y-6">
                        {data.serviceBreakdown.slice(0, 5).map((svc, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <div className="flex items-center gap-3">
                                        <span className="w-6 h-6 rounded-lg bg-gray-900 text-sonblade-gold text-[10px] font-black flex items-center justify-center">#{i + 1}</span>
                                        <span className="font-bold text-gray-900 text-sm">{svc.name}</span>
                                    </div>
                                    <span className="text-xs font-black text-gray-400">{svc.count} servicios</span>
                                </div>
                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-sonblade-gold rounded-full"
                                        style={{ width: `${(svc.revenue / data.kpis.totalRevenue) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-sonblade-gold / 10 to-transparent rounded-[2rem] p-8 border border-sonblade-gold/20 flex flex-col justify-center items-center text-center">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-6">
                        <Download className="h-8 w-8 text-sonblade-gold" />
                    </div>
                    <h3 className="font-black text-xl text-gray-900 mb-2">Reporte Ejecutivo PDF</h3>
                    <p className="text-sm text-gray-500 mb-6">Genera un documento profesional con todos los KPIs para impresión o envío por correo.</p>
                    <button className="w-full py-4 bg-black text-sonblade-gold font-black rounded-2xl hover:scale-105 transition-transform shadow-xl shadow-sonblade-gold/10">
                        DESCARGAR PDF
                    </button>
                </div>
            </div>
        </div>
    );
}
