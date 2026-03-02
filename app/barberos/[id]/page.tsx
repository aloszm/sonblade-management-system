'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Scissors, DollarSign, TrendingUp, Award, Calendar, Loader2, User } from 'lucide-react';
import { format } from 'date-fns';

interface BarberStats {
    barber: { id: string; name: string; status: string; avatar_url: string };
    period: string;
    kpis: {
        cuts: number; serviceRevenue: number; productRevenue: number;
        totalRevenue: number; tips: number; commissionRate: number; totalCommission: number;
    };
    movements: {
        id: string; date: string; services: string; products: string;
        payment_method: string; tip: number; total: number; commission: number;
    }[];
}

export default function BarberProfilePage() {
    const params = useParams();
    const barberId = params.id as string;
    const [data, setData] = useState<BarberStats | null>(null);
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
    const [loading, setLoading] = useState(true);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const fetchStats = async () => {
        setLoading(true);
        let url = `/api/barbers/${barberId}/stats?period=${period}`;
        if (dateFrom && dateTo) url = `/api/barbers/${barberId}/stats?from=${dateFrom}&to=${dateTo}`;
        try {
            const res = await fetch(url);
            if (res.ok) setData(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchStats(); }, [period, barberId]);

    if (!data && loading) return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-sonblade-gold" /></div>;
    if (!data) return <p className="text-center text-gray-500 mt-10">No se encontró el barbero</p>;

    const { barber, kpis, movements } = data;
    const periodLabel = period === 'today' ? 'Hoy' : period === 'week' ? 'Esta Semana' : 'Este Mes';

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/" className="p-2 rounded-lg hover:bg-gray-100 transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-black to-gray-700 flex items-center justify-center text-sonblade-gold font-bold text-xl ring-2 ring-sonblade-gold/30">
                        {barber.name.charAt(0)}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{barber.name}</h1>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${barber.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {barber.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Period Toggle */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                    {(['today', 'week', 'month'] as const).map(p => (
                        <button key={p} onClick={() => { setPeriod(p); setDateFrom(''); setDateTo(''); }}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${period === p && !dateFrom ? 'bg-black text-sonblade-gold shadow' : 'text-gray-500 hover:text-gray-900'}`}>
                            {p === 'today' ? 'Día' : p === 'week' ? 'Semana' : 'Mes'}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2 py-1 border rounded text-sm" />
                    <span className="text-gray-400">a</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-1 border rounded text-sm" />
                    <button onClick={fetchStats} className="px-3 py-1 bg-black text-sonblade-gold rounded text-sm font-semibold">Filtrar</button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 relative">
                {loading && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-20 flex items-center justify-center rounded-xl"><Loader2 className="h-6 w-6 animate-spin text-sonblade-gold" /></div>}
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2"><Scissors className="h-4 w-4 text-gray-500" /><span className="text-xs font-bold text-gray-500 uppercase">Cortes</span></div>
                    <p className="text-3xl font-black text-gray-900">{kpis.cuts}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2"><DollarSign className="h-4 w-4 text-green-500" /><span className="text-xs font-bold text-gray-500 uppercase">Ingresos</span></div>
                    <p className="text-3xl font-black text-gray-900">${kpis.totalRevenue.toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2"><TrendingUp className="h-4 w-4 text-sonblade-gold" /><span className="text-xs font-bold text-gray-500 uppercase">Propinas</span></div>
                    <p className="text-3xl font-black text-gray-900">${kpis.tips.toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-2"><Award className="h-4 w-4 text-sonblade-gold" /><span className="text-xs font-bold text-gray-500 uppercase">Tasa</span></div>
                    <p className="text-3xl font-black text-sonblade-gold">{kpis.commissionRate}%</p>
                </div>
                <div className="bg-gradient-to-r from-black to-gray-800 rounded-xl p-4 shadow-sm text-white">
                    <span className="text-xs font-bold text-gray-300 uppercase">Comisión a Pagar</span>
                    <p className="text-3xl font-black text-sonblade-gold mt-1">${kpis.totalCommission.toFixed(2)}</p>
                </div>
            </div>

            {/* Movements Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-gray-50">
                    <h2 className="font-bold text-gray-900">Detalle de Movimientos ({periodLabel})</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-white text-gray-500">
                            <tr>
                                <th className="p-3 text-xs uppercase font-semibold">Fecha</th>
                                <th className="p-3 text-xs uppercase font-semibold">Hora</th>
                                <th className="p-3 text-xs uppercase font-semibold">Servicio</th>
                                <th className="p-3 text-xs uppercase font-semibold">Producto</th>
                                <th className="p-3 text-xs uppercase font-semibold">Pago</th>
                                <th className="p-3 text-xs uppercase font-semibold text-right">Propina</th>
                                <th className="p-3 text-xs uppercase font-semibold text-right">Total</th>
                                <th className="p-3 text-xs uppercase font-semibold text-right">Comisión</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {movements.length === 0 ? (
                                <tr><td colSpan={8} className="p-6 text-center text-gray-400">Sin movimientos en este período</td></tr>
                            ) : movements.map(m => (
                                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-3 font-medium">{format(new Date(m.date), 'MMM dd')}</td>
                                    <td className="p-3 text-gray-500">{format(new Date(m.date), 'hh:mm a')}</td>
                                    <td className="p-3">{m.services}</td>
                                    <td className="p-3 text-gray-500">{m.products}</td>
                                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.payment_method === 'cash' ? 'bg-green-100 text-green-700' : m.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{m.payment_method}</span></td>
                                    <td className="p-3 text-right">${m.tip.toFixed(2)}</td>
                                    <td className="p-3 text-right font-bold">${m.total.toFixed(2)}</td>
                                    <td className="p-3 text-right font-bold text-sonblade-gold">${m.commission.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
