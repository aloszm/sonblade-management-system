'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, User, Plus, Loader2, X } from 'lucide-react';
import type { Appointment, Barber, Client } from '@/types';

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
}

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente', confirmed: 'Confirmada', done: 'Completada', cancelled: 'Cancelada'
};
const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    done: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
};

export default function AppointmentsPage() {
    const today = new Date();
    const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState<Date>(today);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [form, setForm] = useState({ client_id: '', barber_id: '', date: '', time: '', service_note: '' });
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const fetchAppointments = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/appointments?year=${year}&month=${month}`);
            if (res.ok) setAppointments(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [year, month]);

    useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

    useEffect(() => {
        fetch('/api/barbers').then(r => r.json()).then(d => { if (Array.isArray(d)) setBarbers(d); }).catch(() => {});
        fetch('/api/clients').then(r => r.json()).then(d => { if (Array.isArray(d)) setClients(d); }).catch(() => {});
    }, []);

    const isToday = (d: number) => today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
    const isSelected = (d: number) => selectedDate.getDate() === d && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;

    const selectedStr = selectedDate.toISOString().split('T')[0];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!form.date || !form.time) { setFormError('Fecha y hora son requeridas'); return; }
        setSubmitting(true);
        try {
            const scheduled_at = new Date(`${form.date}T${form.time}`).toISOString();
            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: form.client_id || null,
                    barber_id: form.barber_id || null,
                    scheduled_at,
                    service_note: form.service_note || null,
                }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Error al crear cita');
            await fetchAppointments();
            setShowModal(false);
            setForm({ client_id: '', barber_id: '', date: '', time: '', service_note: '' });
        } catch (err: unknown) {
            setFormError(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
            setSubmitting(false);
        }
    };

    // Build calendar grid
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`empty-${i}`} className="h-24 md:h-32 p-2 border border-gray-100 bg-gray-50/50" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayApts = appointments.filter(a => a.scheduled_at.startsWith(dateStr));
        days.push(
            <div key={`day-${d}`} onClick={() => setSelectedDate(new Date(year, month, d))}
                className={`h-24 md:h-32 p-2 border border-gray-100 relative cursor-pointer transition-colors overflow-hidden hover:border-sonblade-gold/50
                ${isSelected(d) ? 'bg-sonblade-gold/5 ring-1 ring-inset ring-sonblade-gold' : 'bg-white hover:bg-gray-50'}`}
            >
                <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1
                    ${isToday(d) ? 'bg-sonblade-primary text-white font-bold' : isSelected(d) ? 'bg-sonblade-gold text-black' : 'text-gray-700'}`}>
                    {d}
                </div>
                <div className="space-y-1 overflow-y-auto no-scrollbar max-h-[60px] md:max-h-[80px]">
                    {dayApts.map(apt => (
                        <div key={apt.id} className="text-[10px] md:text-xs px-1.5 py-1 rounded bg-sonblade-light text-sonblade-primary border border-sonblade-gold/20 truncate"
                            title={`${apt.client_name} — ${new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}>
                            {new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {apt.client_name}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    const totalSlots = days.length > 35 ? 42 : 35;
    for (let i = 0; i < totalSlots - days.length; i++) {
        days.push(<div key={`empty-end-${i}`} className="h-24 md:h-32 p-2 border border-gray-100 bg-gray-50/50" />);
    }

    const selectedApts = appointments.filter(a => a.scheduled_at.startsWith(selectedStr));

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <CalendarIcon className="h-6 w-6 text-sonblade-gold" /> Calendario
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gestiona las reservas de tus clientes</p>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => { setForm({ client_id: '', barber_id: '', date: selectedStr, time: '', service_note: '' }); setFormError(''); setShowModal(true); }}
                        className="bg-sonblade-primary text-sonblade-gold px-4 py-2 rounded-lg text-sm font-medium hover:bg-black transition-colors flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" /> Nueva Cita
                    </button>
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm">
                        <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-gray-50 rounded-l-lg border-r border-gray-200">
                            <ChevronLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <div className="px-4 py-2 font-semibold w-40 text-center text-gray-800 capitalize">
                            {monthNames[month]} {year}
                        </div>
                        <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-gray-50 rounded-r-lg border-l border-gray-200">
                            <ChevronRight className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
                    {weekDays.map((day, i) => (
                        <div key={day} className={`text-center py-3 text-xs font-bold uppercase tracking-wider ${i === 0 ? 'text-red-500' : 'text-gray-500'}`}>
                            {day}
                        </div>
                    ))}
                </div>
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="h-8 w-8 animate-spin text-sonblade-gold" />
                    </div>
                ) : (
                    <div className="grid grid-cols-7">{days}</div>
                )}
            </div>

            {/* Appointments for selected day */}
            <div className="mt-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 capitalize border-b pb-2">
                    Citas del {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {selectedApts.length > 0 ? (
                    <div className="space-y-3">
                        {selectedApts.map(apt => (
                            <div key={apt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="bg-sonblade-gold/20 p-2 rounded-full">
                                        <User className="h-4 w-4 text-sonblade-gold" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-900">{apt.client_name}</p>
                                        <p className="text-xs text-gray-500 flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[apt.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                                {STATUS_LABELS[apt.status] ?? apt.status}
                                            </span>
                                            {apt.barber && <span>· {(apt.barber as any).name}</span>}
                                            {apt.service_note && <span>· {apt.service_note}</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 text-gray-600 font-medium">
                                    <Clock className="h-4 w-4" />
                                    {new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-500 text-sm italic">No hay citas programadas para este día.</p>
                )}
            </div>

            {/* Nueva Cita Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5 text-sonblade-gold" /> Nueva Cita
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-900 bg-gray-100 rounded-full p-1.5 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {formError && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{formError}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Fecha <span className="text-red-500">*</span></label>
                                    <input type="date" required value={form.date}
                                        onChange={e => setForm({ ...form, date: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Hora <span className="text-red-500">*</span></label>
                                    <input type="time" required value={form.time}
                                        onChange={e => setForm({ ...form, time: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Cliente</label>
                                <select value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black">
                                    <option value="">Sin cliente específico</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Barbero</label>
                                <select value={form.barber_id} onChange={e => setForm({ ...form, barber_id: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black">
                                    <option value="">Sin barbero asignado</option>
                                    {barbers.filter(b => b.status === 'active').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Nota / Servicio</label>
                                <input type="text" value={form.service_note}
                                    onChange={e => setForm({ ...form, service_note: e.target.value })}
                                    placeholder="Ej. Corte degradado + barba"
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={submitting}
                                    className="flex-1 px-4 py-2.5 bg-black text-sonblade-gold font-bold text-sm rounded-xl hover:bg-gray-900 transition-colors disabled:opacity-70 flex items-center justify-center gap-2">
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar Cita'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
