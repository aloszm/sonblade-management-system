'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Edit2, UserX, UserCheck, RefreshCw, Clock } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import BarberScheduleModal from '@/components/BarberScheduleModal';
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
    const [formError, setFormError] = useState('');
    const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
    const [scheduleFor, setScheduleFor] = useState<Barber | null>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', status: 'active', canAuthorizeDiscounts: false, isBarber: true });

    const fetchBarbers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/barbers?include_inactive=1&scope=team');
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
        setFormError('');
        try {
            const method = editingBarber ? 'PATCH' : 'POST';
            const url = editingBarber ? `/api/barbers/${editingBarber.id}` : '/api/barbers';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formData.name, phone: formData.phone || null, ...(editingBarber ? { status: formData.status, can_authorize_discounts: formData.canAuthorizeDiscounts } : { is_barber: formData.isBarber }) }) });
            if (res.ok) { setIsModalOpen(false); fetchBarbers(); fetchLiveStats(); }
            else {
                const body = await res.json().catch(() => null);
                setFormError(body?.error || 'Error al guardar');
            }
        } catch (error) { console.error(error); }
    };

    const toggleStatus = async (barber: Barber) => {
        const newStatus = barber.status === 'active' ? 'inactive' : 'active';
        try {
            await fetch(`/api/barbers/${barber.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
            fetchBarbers();
        } catch (error) { console.error(error); }
    };

    const openModal = (barber?: Barber) => {
        setFormError('');
        if (barber) {
            setEditingBarber(barber);
            setFormData({ name: barber.name, phone: (barber as { phone?: string | null }).phone ?? '', status: barber.status === 'active' ? 'active' : 'inactive', canAuthorizeDiscounts: Boolean((barber as { canAuthorizeDiscounts?: boolean }).canAuthorizeDiscounts), isBarber: (barber as { isBarber?: boolean }).isBarber !== false });
        } else {
            setEditingBarber(null);
            setFormData({ name: '', phone: '', status: 'active', canAuthorizeDiscounts: false, isBarber: true });
        }
        setIsModalOpen(true);
    };


    if (loading) return <div className="flex justify-center items-center h-full min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bos-muted"></div></div>;

    const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const pill = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Gestión de equipo</h1>
                    <p className="text-sm text-bos-muted mt-1">Rendimiento en tiempo real · Semana actual</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { fetchBarbers(); fetchLiveStats(); }} aria-label="Actualizar" title="Actualizar" className="h-[52px] w-[52px] inline-flex items-center justify-center border border-bos-border rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised"><RefreshCw className="h-4 w-4" /></button>
                    <button onClick={() => openModal()} className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold flex items-center justify-center gap-2 hover:bg-bos-accent-strong">
                        <Plus className="w-4 h-4" />Agregar persona
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {barbers.map(barber => {
                    const live = liveStats.find(l => l.id === barber.id);
                    const active = barber.status === 'active';
                    return (
                        <div key={barber.id} className="rounded-xl border border-bos-border bg-bos-surface p-5 flex flex-col">
                            <div className="flex items-start justify-between mb-4">
                                <Link href={`/barberos/${barber.id}`} className="flex items-center gap-3 rounded-xl hover:bg-bos-raised -m-1 p-1 transition-colors">
                                    <div aria-hidden="true" className="w-12 h-12 shrink-0 bg-bos-raised border border-bos-border rounded-full flex items-center justify-center font-display text-xl font-semibold text-bos-text">
                                        {barber.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-display font-semibold text-lg leading-tight">{barber.name}</h3>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            <span className={`${pill} ${active ? 'bg-bos-success-soft text-bos-success' : 'bg-bos-raised text-bos-muted border border-bos-border'}`}>
                                                {active ? 'Activo' : 'Inactivo'}
                                            </span>
                                            <span className={`${pill} bg-bos-raised text-bos-muted`}>
                                                {(barber as { isBarber?: boolean }).isBarber === false ? 'Recepción' : 'Barbero'}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            </div>

                            {live && (
                                <div className="mt-auto pt-3 border-t border-bos-border space-y-1">
                                    <div className="flex items-baseline justify-between">
                                        <span className="font-display text-2xl font-semibold tabular-nums">{live.cuts} <span className="text-xs font-medium text-bos-muted">cortes</span></span>
                                        <span className="font-display text-sm font-semibold tabular-nums text-bos-accent-text">${live.revenue.toFixed(0)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-bos-muted">
                                        <span>Comisión: ${live.commission.toFixed(0)}</span>
                                        {live.cuts > 0 && <span>{live.rate}%</span>}
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 pt-4 border-t border-bos-border flex flex-wrap gap-2">
                                <button onClick={() => openModal(barber)} className="flex-1 min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised rounded-xl border border-bos-border transition-colors">
                                    <Edit2 className="w-4 h-4" /> Editar
                                </button>
                                {(barber as { isBarber?: boolean }).isBarber !== false && active && (
                                    <button onClick={() => setScheduleFor(barber)} className="flex-1 min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised rounded-xl border border-bos-border transition-colors">
                                        <Clock className="w-4 h-4" /> Horario
                                    </button>
                                )}
                                <button onClick={() => toggleStatus(barber)} className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 px-3 text-sm font-semibold rounded-xl border border-bos-border transition-colors hover:bg-bos-raised ${active ? 'text-bos-danger' : 'text-bos-success'}`}>
                                    {active ? <><UserX className="w-4 h-4" /> Desactivar</> : <><UserCheck className="w-4 h-4" /> Activar</>}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {scheduleFor && <BarberScheduleModal barber={{ id: scheduleFor.id, name: scheduleFor.name }} onClose={() => setScheduleFor(null)} />}

            {/* Ventana: agregar o editar persona */}
            {isModalOpen && (
                <Modal title={editingBarber ? 'Editar persona' : 'Agregar persona'} onClose={() => setIsModalOpen(false)}>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div>
                            <label htmlFor="team-name" className={label}>Nombre</label>
                            <input id="team-name" type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={field} required />
                        </div>
                        <div>
                            <label htmlFor="team-phone" className={label}>Teléfono (opcional)</label>
                            <input id="team-phone" type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} maxLength={32} className={field} />
                        </div>
                        {!editingBarber && (
                            <div>
                                <label htmlFor="team-kind" className={label}>Puesto</label>
                                <select id="team-kind" value={formData.isBarber ? 'barber' : 'desk'} onChange={e => setFormData({ ...formData, isBarber: e.target.value === 'barber' })} className={field}>
                                    <option value="barber">Barbero (hace servicios y vende productos)</option>
                                    <option value="desk">Recepción (solo vende productos)</option>
                                </select>
                            </div>
                        )}
                        {editingBarber && (
                            <div>
                                <label htmlFor="team-status" className={label}>Estado</label>
                                <select id="team-status" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className={field}>
                                    <option value="active">Activo</option>
                                    <option value="inactive">Inactivo (no aparece para vender)</option>
                                </select>
                            </div>
                        )}
                        {editingBarber && (
                            <label className="flex items-start gap-3 text-sm text-bos-text bg-bos-bg border border-bos-border rounded-xl p-3 cursor-pointer">
                                <input type="checkbox" checked={formData.canAuthorizeDiscounts}
                                    onChange={e => setFormData({ ...formData, canAuthorizeDiscounts: e.target.checked })}
                                    className="mt-0.5 h-5 w-5 accent-[var(--bos-accent)]" />
                                <span><strong>Puede autorizar descuentos.</strong> Aparecerá en la caja como persona que autoriza (requiere que tenga cuenta de acceso).</span>
                            </label>
                        )}
                        <p className="text-xs text-bos-muted bg-bos-bg border border-bos-border rounded-xl p-3">
                            La comisión de cortes es el 50 % del precio antes de descuentos (regla del negocio). Cada persona entra al sistema con su correo y contraseña; el acceso lo crea la administración.
                        </p>
                        {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="min-h-[52px] px-5 border border-bos-border rounded-xl text-bos-text font-semibold hover:bg-bos-raised">Cancelar</button>
                            <button type="submit" className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold hover:bg-bos-accent-strong">
                                {editingBarber ? 'Guardar cambios' : 'Agregar'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
