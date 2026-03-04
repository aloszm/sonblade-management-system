'use client';

import React, { useState, useEffect } from 'react';
import { Clock, DollarSign, Scissors, Gift, TrendingUp, CreditCard, Banknote, Loader2, ChevronDown } from 'lucide-react';
import type { Barber } from '@/types';

function getCommissionTier(totalCuts: number): { current: number; next: number; cutsForNext: number } {
    const tiers = [
        { minCuts: 0, rate: 40 },
        { minCuts: 25, rate: 45 },
        { minCuts: 50, rate: 50 },
    ];
    let currentTier = tiers[0];
    let nextTier = tiers[1];
    for (let i = 0; i < tiers.length; i++) {
        if (totalCuts >= tiers[i].minCuts) {
            currentTier = tiers[i];
            nextTier = tiers[i + 1] || tiers[i];
        }
    }
    return { current: currentTier.rate, next: nextTier.rate, cutsForNext: Math.max(0, nextTier.minCuts - totalCuts) };
}

const BarberDashboard: React.FC = () => {
    const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
    const [barbers, setBarbers] = useState<Barber[] | null>(null);
    const [loadingBarbers, setLoadingBarbers] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // Fetch barbers via API
    useEffect(() => {
        fetch('/api/barbers').then(r => r.json()).then(data => {
            if (Array.isArray(data)) setBarbers(data);
        }).catch(console.error).finally(() => setLoadingBarbers(false));
    }, []);

    // Auto-select first barber
    const barberId = selectedBarberId || barbers?.[0]?.id || null;

    // Fetch stats via API
    useEffect(() => {
        if (!barberId) return;
        setLoadingStats(true);
        fetch(`/api/barbers/${barberId}/stats?period=week`)
            .then(r => r.json())
            .then(data => setStats(data))
            .catch(console.error)
            .finally(() => setLoadingStats(false));
    }, [barberId]);

    const tier = stats?.barber ? getCommissionTier(stats.barber.total_cuts) : null;
    const now = new Date();
    const dayName = now.toLocaleDateString('es-MX', { weekday: 'long' });
    const dateStr = now.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    if (loadingBarbers) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-sonblade-primary" />
                <span className="ml-3 text-gray-500">Cargando dashboard...</span>
            </div>
        );
    }

    const barber = stats?.barber || barbers?.[0];
    if (!barber) {
        return (
            <div className="text-center py-20 text-gray-500">
                No hay barberos registrados. Agrega barberos en Supabase.
            </div>
        );
    }

    const weeklyCuts = stats?.weeklyStats?.cuts || 0;
    const progressPercent = Math.min(100, (weeklyCuts / 60) * 100);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <header className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                    <div className="relative">
                        <img src={barber.avatar_url || `https://picsum.photos/seed/${barber.id}/100/100`} alt="Profile" className="w-[60px] h-[60px] rounded-full object-cover border-2 border-gray-100 shadow-sm" />
                        <div className={`absolute bottom-0 right-0 w-4 h-4 border-2 border-white rounded-full ${barber.status === 'active' ? 'bg-green-500' : barber.status === 'busy' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-gray-900">Hola, {barber.name}</h2>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${barber.status === 'active'
                                ? 'bg-green-100 text-green-700 border-green-200'
                                : barber.status === 'busy'
                                    ? 'bg-red-100 text-red-700 border-red-200'
                                    : 'bg-gray-100 text-gray-500 border-gray-200'
                                }`}>
                                {barber.status === 'active' ? '🟢 Activo' : barber.status === 'busy' ? '🔴 Ocupado' : '⚪ Descanso'}
                            </span>
                        </div>
                        <div className="text-gray-500 text-sm flex items-center gap-2 mt-1">
                            <Clock className="h-4 w-4" />
                            <span className="capitalize">{dayName}, {dateStr} | {timeStr}</span>
                        </div>
                    </div>
                </div>
                {/* Barber Selector */}
                {barbers && barbers.length > 1 && (
                    <div className="relative">
                        <select
                            value={barberId || ''}
                            onChange={(e) => setSelectedBarberId(e.target.value)}
                            className="appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 focus:ring-2 focus:ring-sonblade-primary outline-none cursor-pointer"
                        >
                            {barbers.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
                    </div>
                )}
            </header>

            {loadingStats ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-sonblade-primary" />
                </div>
            ) : (
                <>
                    {/* Stats */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-transparent hover:border-sonblade-gold/50 transition-colors cursor-pointer group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-gray-100 transition-colors"><DollarSign className="text-black h-6 w-6" /></div>
                            </div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Generado (Semana)</h3>
                            <div className="text-3xl font-bold text-gray-900">
                                $ {(stats?.weeklyStats?.totalGenerated || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-transparent hover:border-sonblade-gold/50 transition-colors cursor-pointer group">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-yellow-50 rounded-lg group-hover:bg-yellow-100 transition-colors"><TrendingUp className="text-sonblade-gold h-6 w-6" /></div>
                            </div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Total a Pagar (Semana)</h3>
                            <div className="text-3xl font-bold text-sonblade-gold mb-2">
                                $ {(stats?.weeklyStats?.commission || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="space-y-1 mb-3">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 text-[10px] uppercase font-bold">Comisión Serv.</span>
                                    <span className="font-semibold text-gray-700">${(stats?.weeklyStats?.serviceCommission || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 text-[10px] uppercase font-bold">Comisión Prod.</span>
                                    <span className="font-semibold text-gray-700">${(stats?.weeklyStats?.productCommission || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500 text-[10px] uppercase font-bold">Propinas</span>
                                    <span className="font-semibold text-blue-600">${(stats?.weeklyStats?.tips || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div><span className="text-[10px] font-bold text-black bg-sonblade-gold px-2 py-0.5 rounded uppercase">Tasa Servicios: {stats?.tier?.current || 35}%</span></div>
                        </div>
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-transparent hover:border-sonblade-gold/50 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-gray-100 rounded-lg"><Scissors className="text-gray-800 h-6 w-6" /></div>
                            </div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Cortes Hoy</h3>
                            <div className="flex items-baseline gap-2 mb-1">
                                <div className="text-4xl font-bold text-black">{stats?.todayStats?.cuts || 0}</div>
                                <span className="text-sm text-gray-500">servicios</span>
                            </div>
                        </div>
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-transparent hover:border-green-500 transition-colors group cursor-pointer">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors"><Gift className="text-green-600 h-6 w-6" /></div>
                            </div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Propinas Hoy</h3>
                            <div className="text-3xl font-bold text-green-600">
                                $ {(stats?.todayStats?.tips || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </section>

                    {/* Commission Progress */}
                    {tier && (
                        <section className="bg-white rounded-2xl p-8 shadow-sm relative overflow-hidden border border-gray-100">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 relative z-10">
                                <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">PROGRESO DE COMISIÓN</h3>
                                        <span className="bg-sonblade-primary text-white text-lg font-bold px-3 py-1 rounded-lg shadow-sm">{tier.current}% Actual</span>
                                    </div>
                                    <p className="text-gray-500">Acumula más cortes para desbloquear mejores comisiones.</p>
                                </div>
                                {tier.cutsForNext > 0 && (
                                    <div className="text-right mt-4 md:mt-0">
                                        <p className="text-sm text-gray-500 font-medium">
                                            Faltan <strong className="text-sonblade-primary">{tier.cutsForNext} cortes</strong> para subir a{' '}
                                            <span className="bg-sonblade-dark text-white text-xs px-1.5 py-0.5 rounded ml-1">{tier.next}%</span>
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div className="relative pt-6 pb-2 z-10">
                                <div className="flex justify-between text-xs font-medium text-gray-500 mb-2 px-1"><span>0</span><span>20</span><span>40</span><span>60+</span></div>
                                <div className="relative h-8 bg-gray-200 rounded-full w-full overflow-hidden shadow-inner">
                                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-black to-gray-700 rounded-full flex items-center justify-end pr-3 transition-all duration-700" style={{ width: `${progressPercent}%` }}>
                                        <span className="text-sonblade-gold text-xs font-bold drop-shadow-md">{weeklyCuts} Cortes</span>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Movements Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-900">MIS MOVIMIENTOS HOY</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="p-4 font-semibold text-xs uppercase">Hora</th>
                                        <th className="p-4 font-semibold text-xs uppercase">Tipo</th>
                                        <th className="p-4 font-semibold text-xs uppercase">Detalle</th>
                                        <th className="p-4 font-semibold text-xs uppercase">Método</th>
                                        <th className="p-4 font-semibold text-xs uppercase text-right">Monto</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {(!stats?.todayStats?.sales || stats.todayStats.sales.length === 0) && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-gray-400">No hay ventas hoy</td>
                                        </tr>
                                    )}
                                    {stats?.todayStats?.sales?.map((sale: any) => (
                                        <tr key={sale.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-medium text-gray-900">
                                                {new Date(sale.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="p-4">
                                                {sale.items?.map((item: any, idx: number) => (
                                                    <span key={idx} className={`inline-flex mr-1 mb-1 px-2 py-0.5 rounded text-xs font-semibold ${item.item_type === 'service'
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-green-100 text-green-700'
                                                        }`}>
                                                        {item.item_type === 'service' ? 'Servicio' : 'Producto'}
                                                    </span>
                                                ))}
                                            </td>
                                            <td className="p-4 text-gray-900">
                                                {sale.items?.map((i: any) => i.item_name).join(', ') || 'Venta'}
                                            </td>
                                            <td className="p-4 text-gray-500 flex items-center gap-1">
                                                {sale.payment_method === 'card' ? <CreditCard className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                                                {sale.payment_method === 'cash' ? 'Efectivo' : sale.payment_method === 'card' ? 'Tarjeta' : sale.payment_method === 'transfer' ? 'Transf.' : 'Mixto'}
                                            </td>
                                            <td className="p-4 text-right font-medium">${Number(sale.total).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default BarberDashboard;