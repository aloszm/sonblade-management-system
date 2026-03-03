'use client';

import React, { useState, useEffect, use } from 'react';
import { ArrowLeft, Scissors, DollarSign, TrendingUp, Award, Loader2, Calendar, KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import CommissionBar from '@/components/CommissionBar';

interface Kpis { cuts: number; serviceRevenue: number; productRevenue: number; totalRevenue: number; tips: number; commissionRate: number; totalCommission: number; serviceCommission: number; productCommission: number; }
interface Movement { id: string; date: string; services: string; products: string; payment_method: string; cash_amount: number; card_amount: number; transfer_amount: number; tip: number; total: number; commission: number; }
interface ServiceBreak { name: string; count: number; revenue: number; }

export default function BarberProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [barber, setBarber] = useState<any>(null);
    const [kpis, setKpis] = useState<Kpis | null>(null);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [serviceBreakdown, setServiceBreakdown] = useState<ServiceBreak[]>([]);
    const [period, setPeriod] = useState('week');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    const [loading, setLoading] = useState(true);

    const [authedUserId, setAuthedUserId] = useState<string | null>(null);
    const [isPinModalOpen, setIsPinModalOpen] = useState(false);
    const [newPin, setNewPin] = useState('');
    const [pinSaving, setPinSaving] = useState(false);

    useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' }).then(res => res.json()).then(data => {
            if (data.authenticated) setAuthedUserId(data.user.id);
        });
    }, []);

    const fetchStats = async () => {
        setLoading(true);
        try {
            let url = `/api/barbers/${id}/stats?period=${period}`;
            if (dateRange.from && dateRange.to) url = `/api/barbers/${id}/stats?from=${dateRange.from}&to=${dateRange.to}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setBarber(data.barber);
                setKpis(data.kpis);
                setMovements(data.movements);
                setServiceBreakdown(data.serviceBreakdown || []);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchStats(); }, [period, dateRange]);

    const handleChangePin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPin.length < 4) { alert('El PIN debe tener al menos 4 dígitos'); return; }
        setPinSaving(true);
        try {
            const res = await fetch(`/api/barbers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: newPin })
            });
            if (res.ok) {
                alert('PIN actualizado correctamente');
                setIsPinModalOpen(false);
                setNewPin('');
            } else {
                alert('Error al actualizar el PIN');
            }
        } catch (e) { console.error(e); }
        finally { setPinSaving(false); }
    };

    function PaymentDetail({ m }: { m: Movement }) {
        const parts: string[] = [];
        if (m.cash_amount > 0) parts.push(`Efect. $${m.cash_amount.toFixed(0)}`);
        if (m.card_amount > 0) parts.push(`Tarj. $${m.card_amount.toFixed(0)}`);
        if (m.transfer_amount > 0) parts.push(`Transf. $${m.transfer_amount.toFixed(0)}`);
        if (parts.length > 1) return <span className="text-xs text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded font-semibold">{parts.join(' / ')}</span>;
        const label = m.payment_method === 'cash' ? 'Efectivo' : m.payment_method === 'card' ? 'Tarjeta' : m.payment_method === 'transfer' ? 'Transferencia' : m.payment_method;
        const color = m.payment_method === 'cash' ? 'bg-green-100 text-green-700' : m.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700';
        return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${color}`}>{label}</span>;
    }

    if (loading && !barber) return <div className="flex justify-center items-center h-full min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-sonblade-gold" /></div>;

    const svcTotal = serviceBreakdown.reduce((s, b) => s + b.revenue, 0);

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/equipo" className="p-2 bg-white border rounded-lg hover:bg-gray-50"><ArrowLeft className="h-5 w-5 text-gray-500" /></Link>
                <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-black to-gray-700 rounded-full flex items-center justify-center text-2xl font-bold text-sonblade-gold ring-2 ring-sonblade-gold/20">
                        {barber?.name?.charAt(0) || '?'}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{barber?.name}</h1>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase ${barber?.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{barber?.status}</span>
                    </div>
                </div>
                {authedUserId === id && (
                    <button
                        onClick={() => setIsPinModalOpen(true)}
                        className="ml-auto p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 text-sm font-semibold"
                    >
                        <KeyRound className="h-4 w-4" /> Cambiar mi PIN
                    </button>
                )}
            </div>

            {/* Period Toggle + Date Filter */}
            <div className="flex flex-wrap items-center gap-3">
                {['today', 'week', 'month'].map(p => (
                    <button key={p} onClick={() => { setPeriod(p); setDateRange({ from: '', to: '' }); }}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${period === p && !dateRange.from ? 'bg-black text-sonblade-gold' : 'bg-white text-gray-600 border'}`}>
                        {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : 'Mes'}
                    </button>
                ))}
                <div className="flex items-center gap-2 ml-auto">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <input type="date" value={dateRange.from} onChange={e => setDateRange(d => ({ ...d, from: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                    <span className="text-gray-400">—</span>
                    <input type="date" value={dateRange.to} onChange={e => setDateRange(d => ({ ...d, to: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                </div>
            </div>

            {/* KPI Cards + CommissionBar */}
            {kpis && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm border-l-4 border-l-gray-300">
                            <div className="flex items-center gap-2 mb-1"><Scissors className="h-4 w-4 text-gray-500" /><span className="text-xs text-gray-500 font-semibold uppercase">Cortes</span></div>
                            <p className="text-2xl font-bold text-gray-900">${kpis.serviceRevenue.toFixed(2)}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{kpis.cuts} servicios realizados</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm border-l-4 border-l-sonblade-gold">
                            <div className="flex items-center gap-2 mb-1"><Award className="h-4 w-4 text-sonblade-gold" /><span className="text-xs text-gray-500 font-semibold uppercase">Comisión</span></div>
                            <p className="text-2xl font-bold text-sonblade-gold">${kpis.serviceCommission.toFixed(2)}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{kpis.commissionRate}% de servicios</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm border-l-4 border-l-blue-400">
                            <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-blue-600" /><span className="text-xs text-gray-500 font-semibold uppercase">Propina</span></div>
                            <p className="text-2xl font-bold text-gray-900">${kpis.tips.toFixed(2)}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">100% para el barbero</p>
                        </div>
                        <div className="bg-black p-4 rounded-xl border border-gray-800 shadow-lg border-l-4 border-l-sonblade-gold">
                            <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-sonblade-gold" /><span className="text-xs text-gray-400 font-semibold uppercase">Total a Recibir</span></div>
                            <p className="text-2xl font-black text-white">${kpis.totalCommission.toFixed(2)}</p>
                            {kpis.productCommission > 0 && <p className="text-[10px] text-sonblade-gold/60 font-medium">Incluye ${kpis.productCommission.toFixed(2)} por productos</p>}
                        </div>
                    </div>

                    {/* Commission Progress Bar */}
                    <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-700 mb-3">Progreso de Comisión — {kpis.cuts} cortes</h3>
                        <CommissionBar cuts={kpis.cuts} isFlat50={barber?.commission_type === 'flat_50'} />
                    </div>
                </div>
            )}

            {/* Service Breakdown Table */}
            {serviceBreakdown.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <h3 className="text-sm font-bold text-gray-800 uppercase">Resumen de Servicios</h3>
                    </div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="p-3 text-left text-xs uppercase font-semibold">Tipo de Servicio</th>
                                <th className="p-3 text-center text-xs uppercase font-semibold">Cantidad</th>
                                <th className="p-3 text-right text-xs uppercase font-semibold">Ingresos</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {serviceBreakdown.map(s => (
                                <tr key={s.name} className="hover:bg-gray-50">
                                    <td className="p-3 font-medium text-gray-900">{s.name}</td>
                                    <td className="p-3 text-center font-bold">{s.count}</td>
                                    <td className="p-3 text-right font-bold">${s.revenue.toFixed(2)}</td>
                                </tr>
                            ))}
                            <tr className="bg-gray-50 font-bold">
                                <td className="p-3 text-gray-700">Total</td>
                                <td className="p-3 text-center">{serviceBreakdown.reduce((s, b) => s + b.count, 0)}</td>
                                <td className="p-3 text-right">${svcTotal.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* Movements Table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-800 uppercase">Movimientos ({movements.length})</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
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
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={8} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sonblade-gold" /></td></tr>
                            ) : movements.length === 0 ? (
                                <tr><td colSpan={8} className="p-8 text-center text-gray-400">Sin movimientos en este período</td></tr>
                            ) : movements.map(m => {
                                const d = new Date(m.date);
                                return (
                                    <tr key={m.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-medium">{format(d, 'MMM dd')}</td>
                                        <td className="p-3 text-gray-500">{format(d, 'hh:mm a')}</td>
                                        <td className="p-3">{m.services}</td>
                                        <td className="p-3 text-gray-500">{m.products}</td>
                                        <td className="p-3"><PaymentDetail m={m} /></td>
                                        <td className="p-3 text-right">${m.tip.toFixed(2)}</td>
                                        <td className="p-3 text-right font-bold">${m.total.toFixed(2)}</td>
                                        <td className="p-3 text-right font-bold text-sonblade-gold">${m.commission.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* PIN Change Modal */}
            {isPinModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h2 className="font-bold text-gray-900 flex items-center gap-2"><KeyRound className="h-5 w-5 text-sonblade-gold" /> Cambiar PIN</h2>
                            <button onClick={() => setIsPinModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                        </div>
                        <form onSubmit={handleChangePin} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nuevo PIN</label>
                                <input
                                    type="text"
                                    value={newPin}
                                    onChange={e => setNewPin(e.target.value.replace(/[^0-9]/g, ''))} // only numbers
                                    placeholder="Ej: 4567"
                                    maxLength={6}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none font-mono text-center text-xl tracking-[0.5em]"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-2 text-center">Usa de 4 a 6 dígitos numéricos.</p>
                            </div>
                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={pinSaving || newPin.length < 4}
                                    className="w-full py-3 bg-black text-sonblade-gold rounded-lg hover:bg-gray-800 shadow-md font-bold disabled:opacity-50 transition-all flex justify-center"
                                >
                                    {pinSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Guardar Nuevo PIN'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
