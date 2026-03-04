'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Plus, Edit2, UserX, UserCheck, Scissors, DollarSign, Award, Loader2, TrendingUp, RefreshCw, KeyRound, Percent } from 'lucide-react';
import CommissionBar from '@/components/CommissionBar';
import type { Barber } from '@/types';

interface BarberLive {
    id: string; name: string; status: string;
    cuts: number; revenue: number; tips: number; rate: number; commission: number;
}

export default function TeamPage() {
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [liveStats, setLiveStats] = useState<BarberLive[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
    const [formData, setFormData] = useState({ name: '', commission_rate: 40, status: 'active', commission_type: 'tiered', pin: '1234' });

    // PIN reset modal
    const [pinModalBarber, setPinModalBarber] = useState<Barber | null>(null);
    const [newPin, setNewPin] = useState('');
    const [pinSaving, setPinSaving] = useState(false);

    const fetchBarbers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/barbers');
            if (res.ok) setBarbers(await res.json());
        } catch (error) { console.error('Failed to fetch barbers', error); }
        finally { setLoading(false); }
    };

    const fetchLiveStats = async () => {
        try {
            const res = await fetch('/api/admin/summary?period=week');
            if (res.ok) {
                const data = await res.json();
                setLiveStats(data.barberSummaries || []);
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchBarbers();
        fetchLiveStats();
        const interval = setInterval(fetchLiveStats, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const method = editingBarber ? 'PATCH' : 'POST';
            const url = editingBarber ? `/api/barbers/${editingBarber.id}` : '/api/barbers';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            if (res.ok) { setIsModalOpen(false); fetchBarbers(); fetchLiveStats(); }
            else { alert('Error al guardar'); }
        } catch (error) { console.error(error); }
    };

    const toggleStatus = async (barber: Barber) => {
        const newStatus = barber.status === 'active' ? 'off' : 'active';
        try {
            await fetch(`/api/barbers/${barber.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
            fetchBarbers();
        } catch (error) { console.error(error); }
    };

    const openModal = (barber?: Barber) => {
        if (barber) {
            setEditingBarber(barber);
            setFormData({ name: barber.name, commission_rate: barber.commission_rate, status: barber.status, commission_type: barber.commission_type || 'tiered', pin: barber.pin || '1234' });
        } else {
            setEditingBarber(null);
            setFormData({ name: '', commission_rate: 40, status: 'active', commission_type: 'tiered', pin: '1234' });
        }
        setIsModalOpen(true);
    };

    const handlePinReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pinModalBarber || newPin.length < 4) { alert('El PIN debe tener al menos 4 dígitos'); return; }
        setPinSaving(true);
        try {
            const res = await fetch(`/api/barbers/${pinModalBarber.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: newPin }),
            });
            if (res.ok) {
                alert(`PIN de ${pinModalBarber.name} actualizado correctamente`);
                setPinModalBarber(null);
                setNewPin('');
                fetchBarbers();
            } else {
                alert('Error al actualizar el PIN');
            }
        } catch (e) { console.error(e); }
        finally { setPinSaving(false); }
    };

    if (loading) return <div className="flex justify-center items-center h-full min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sonblade-gold"></div></div>;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="text-sonblade-gold h-6 w-6" /> Gestión de Equipo</h1>
                    <p className="text-sm text-gray-500 mt-1">Rendimiento en tiempo real · Semana actual</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { fetchBarbers(); fetchLiveStats(); }} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw className="h-4 w-4 text-gray-500" /></button>
                    <button onClick={() => openModal()} className="bg-black text-sonblade-gold px-4 py-2 rounded-lg flex items-center shadow-md font-semibold text-sm">
                        <Plus className="w-4 h-4 mr-2" />Nuevo Barbero
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {barbers.map(barber => {
                    const live = liveStats.find(l => l.id === barber.id);
                    return (
                        <div key={barber.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col relative overflow-hidden hover:border-sonblade-gold/30 transition-colors">
                            <div className={`absolute top-0 left-0 w-full h-1 ${barber.status === 'active' ? 'bg-green-500' : barber.status === 'busy' ? 'bg-orange-500' : 'bg-red-500'}`}></div>

                            <div className="flex items-start justify-between mb-4">
                                <Link href={`/barberos/${barber.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                    <div className="w-12 h-12 bg-gradient-to-br from-black to-gray-700 rounded-full flex items-center justify-center text-xl font-bold text-sonblade-gold ring-2 ring-sonblade-gold/20">
                                        {barber.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg leading-tight">{barber.name}</h3>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase ${barber.status === 'active' ? 'bg-green-100 text-green-700' : barber.status === 'busy' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                            {barber.status}
                                        </span>
                                    </div>
                                </Link>
                            </div>

                            {/* Commission type badge */}
                            <div className="mb-3 flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase px-2 py-1 rounded bg-gray-100 text-gray-600">
                                    <Percent className="inline h-3 w-3 mr-1" />
                                    {barber.commission_type === 'flat_50' ? 'Fijo 50%' : 'Por Metas'}
                                </span>
                            </div>

                            {live && (
                                <div className="mt-auto pt-3 border-t border-gray-50 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-2xl font-black text-gray-900">{live.cuts} <span className="text-xs font-semibold text-gray-400">cortes</span></span>
                                        <span className="text-sm font-bold text-sonblade-gold">${live.revenue.toFixed(0)}</span>
                                    </div>
                                    <CommissionBar cuts={live.cuts} compact isFlat50={barber.commission_type === 'flat_50'} />
                                    <div className="flex justify-between text-[10px] text-gray-400">
                                        <span>Comisión: ${live.commission.toFixed(0)}</span>
                                        <span>{live.rate}%</span>
                                    </div>
                                </div>
                            )}

                            {/* Action buttons - always visible */}
                            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                                <button onClick={() => openModal(barber)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-600 rounded-lg border border-gray-200 transition-colors">
                                    <Edit2 className="w-3.5 h-3.5" /> Editar
                                </button>
                                <button onClick={() => { setPinModalBarber(barber); setNewPin(''); }} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-yellow-50 hover:text-yellow-700 rounded-lg border border-gray-200 transition-colors">
                                    <KeyRound className="w-3.5 h-3.5" /> Reset PIN
                                </button>
                                <button onClick={() => toggleStatus(barber)} className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${barber.status === 'active' ? 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100' : 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100'}`}>
                                    {barber.status === 'active' ? <><UserX className="w-3.5 h-3.5" /> Desact.</> : <><UserCheck className="w-3.5 h-3.5" /> Activar</>}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Edit/Create Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h2 className="text-xl font-bold text-gray-900">{editingBarber ? 'Editar Barbero' : 'Nuevo Barbero'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                                <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none">
                                    <option value="active">Activo</option>
                                    <option value="busy">Ocupado</option>
                                    <option value="off">Inactivo</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <Percent className="inline h-4 w-4 mr-1" />Tipo de Comisión
                                </label>
                                <select value={formData.commission_type} onChange={e => setFormData({ ...formData, commission_type: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none">
                                    <option value="tiered">📈 Por Metas (Según Cortes: 40% → 45% → 50%)</option>
                                    <option value="flat_50">📊 Fijo al 50%</option>
                                </select>
                                <p className="text-xs text-gray-400 mt-1">
                                    {formData.commission_type === 'tiered'
                                        ? '1-24 cortes: 40% | 25-49: 45% | 50+: 50%'
                                        : 'Comisión fija del 50% en todos los servicios'}
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    <KeyRound className="inline h-4 w-4 mr-1" />PIN de Acceso
                                </label>
                                <input type="text" value={formData.pin}
                                    onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/[^0-9]/g, '') })}
                                    placeholder="Ej: 1234" maxLength={6}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none font-mono tracking-widest text-center text-lg" required />
                                <p className="text-xs text-gray-400 mt-1">El barbero usará este código para iniciar sesión (4-6 dígitos).</p>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancelar</button>
                                <button type="submit" className="px-5 py-2.5 bg-black text-sonblade-gold rounded-lg hover:bg-gray-800 shadow-md font-semibold">
                                    {editingBarber ? 'Guardar Cambios' : 'Crear Barbero'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PIN Reset Modal */}
            {pinModalBarber && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-yellow-50">
                            <h2 className="font-bold text-gray-900 flex items-center gap-2">
                                <KeyRound className="h-5 w-5 text-sonblade-gold" /> Resetear PIN
                            </h2>
                            <button onClick={() => setPinModalBarber(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                        </div>
                        <form onSubmit={handlePinReset} className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">
                                Reseteando PIN para <strong className="text-gray-900">{pinModalBarber.name}</strong>
                            </p>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nuevo PIN</label>
                                <input
                                    type="text"
                                    value={newPin}
                                    onChange={e => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder="Ej: 4567"
                                    maxLength={6}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-sonblade-gold focus:border-sonblade-gold outline-none font-mono text-center text-2xl tracking-[0.5em]"
                                    required
                                    autoFocus
                                />
                                <p className="text-xs text-gray-500 mt-2 text-center">Ingresa de 4 a 6 dígitos numéricos.</p>
                            </div>
                            <div className="pt-2 flex gap-3">
                                <button type="button" onClick={() => setPinModalBarber(null)} className="flex-1 px-4 py-3 text-gray-600 hover:bg-gray-100 rounded-lg font-medium border border-gray-200">
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={pinSaving || newPin.length < 4}
                                    className="flex-1 py-3 bg-black text-sonblade-gold rounded-lg hover:bg-gray-800 shadow-md font-bold disabled:opacity-50 transition-all flex justify-center items-center gap-2"
                                >
                                    {pinSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                    {pinSaving ? 'Guardando...' : 'Guardar PIN'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
