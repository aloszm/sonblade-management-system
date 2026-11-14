'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, User, Plus, Loader2, X } from 'lucide-react';
import type { Appointment, AppointmentStatus, Barber, Client } from '@/types';
import {
    ACTION_LABELS, STATUS_LABELS, isActive, localDateKey, localDateTimeToIso, monthRange, nextStatuses,
} from '@/lib/appointments/appointments-view';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
    scheduled: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    checked_in: 'bg-indigo-100 text-indigo-700',
    in_progress: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
    no_show: 'bg-gray-200 text-gray-600',
};
const DURATIONS = [30, 45, 60, 90, 120];
const EMPTY_FORM = { client_id: '', customer_name: '', customer_phone: '', barber_id: '', date: '', time: '', duration: 30, service_note: '' };

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso: string) => localDateKey(new Date(iso));

async function readError(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    return body?.error || fallback;
}

export default function AppointmentsPage() {
    const today = new Date();
    const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState<Date>(today);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [canManage, setCanManage] = useState(false);

    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState('');
    const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
    const [cancelReason, setCancelReason] = useState('');

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const fetchAppointments = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const { from, to } = monthRange(year, month);
            const res = await fetch(`/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(await readError(res, 'No se pudieron cargar las citas.'));
            setAppointments(await res.json());
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar las citas.');
        } finally { setLoading(false); }
    }, [year, month]);

    useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

    useEffect(() => {
        fetch('/api/barbers').then(r => r.json()).then(d => { if (Array.isArray(d)) setBarbers(d); }).catch(() => {});
        fetch('/api/clients').then(r => r.json()).then(d => { if (Array.isArray(d)) setClients(d); }).catch(() => {});
        fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.json())
            .then(me => {
                const manage = me?.user?.role === 'admin' || me?.user?.role === 'recepcion';
                setCanManage(manage);
                // El botón "Nueva Cita" del encabezado llega con ?nueva=1 para abrir el formulario.
                if (manage && new URLSearchParams(window.location.search).get('nueva') === '1') {
                    setForm({ ...EMPTY_FORM, date: localDateKey(new Date()) });
                    setShowModal(true);
                    window.history.replaceState(null, '', '/citas');
                }
            }).catch(() => {});
    }, []);

    const isToday = (d: number) => today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
    const isSelected = (d: number) => selectedDate.getDate() === d && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;

    const selectedStr = localDateKey(selectedDate);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!form.date || !form.time) { setFormError('Fecha y hora son requeridas'); return; }
        if (!form.client_id && form.customer_name.trim().length < 2) {
            setFormError('Elige un cliente o escribe el nombre de quien reserva.');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: form.client_id || null,
                    customer_name: form.client_id ? null : form.customer_name.trim(),
                    customer_phone: form.client_id ? null : (form.customer_phone.trim() || null),
                    barber_id: form.barber_id || null,
                    scheduled_at: localDateTimeToIso(form.date, form.time),
                    duration_minutes: form.duration,
                    service_note: form.service_note.trim() || null,
                }),
            });
            if (!res.ok) throw new Error(await readError(res, 'Error al crear cita'));
            await fetchAppointments();
            setShowModal(false);
            setForm(EMPTY_FORM);
        } catch (err: unknown) {
            setFormError(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
            setSubmitting(false);
        }
    };

    const changeStatus = async (apt: Appointment, status: AppointmentStatus, reason?: string): Promise<boolean> => {
        setActionError('');
        setBusyId(apt.id);
        try {
            const res = await fetch(`/api/appointments/${apt.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, reason: reason ?? null }),
            });
            if (!res.ok) throw new Error(await readError(res, 'No se pudo actualizar la cita.'));
            await fetchAppointments();
            return true;
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'No se pudo actualizar la cita.');
            return false;
        } finally {
            setBusyId(null);
        }
    };

    const confirmCancel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cancelTarget) return;
        if (cancelReason.trim().length < 3) { setActionError('Indica el motivo de la cancelación.'); return; }
        if (await changeStatus(cancelTarget, 'cancelled', cancelReason.trim())) {
            setCancelTarget(null);
            setCancelReason('');
        }
    };

    // Build calendar grid
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];

    for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`empty-${i}`} className="h-24 md:h-32 p-2 border border-gray-100 bg-gray-50/50" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = localDateKey(new Date(year, month, d));
        const dayApts = appointments.filter(a => dayOf(a.scheduled_at) === dateStr);
        days.push(
            <div key={`day-${d}`} data-testid={`day-${dateStr}`} onClick={() => setSelectedDate(new Date(year, month, d))}
                className={`h-24 md:h-32 p-2 border border-gray-100 relative cursor-pointer transition-colors overflow-hidden hover:border-sonblade-gold/50
                ${isSelected(d) ? 'bg-sonblade-gold/5 ring-1 ring-inset ring-sonblade-gold' : 'bg-white hover:bg-gray-50'}`}
            >
                <div className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1
                    ${isToday(d) ? 'bg-sonblade-primary text-white font-bold' : isSelected(d) ? 'bg-sonblade-gold text-black' : 'text-gray-700'}`}>
                    {d}
                </div>
                <div className="space-y-1 overflow-y-auto no-scrollbar max-h-[60px] md:max-h-[80px]">
                    {dayApts.map(apt => (
                        <div key={apt.id}
                            className={`text-[10px] md:text-xs px-1.5 py-1 rounded border truncate ${isActive(apt.status)
                                ? 'bg-sonblade-light text-sonblade-primary border-sonblade-gold/20'
                                : 'bg-gray-100 text-gray-400 border-gray-200 line-through'}`}
                            title={`${timeOf(apt.scheduled_at)} — ${apt.client_name} (${STATUS_LABELS[apt.status]})`}>
                            {timeOf(apt.scheduled_at)} {apt.client_name}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    const totalSlots = days.length > 35 ? 42 : 35;
    for (let i = days.length; i < totalSlots; i++) {
        days.push(<div key={`empty-end-${i}`} className="h-24 md:h-32 p-2 border border-gray-100 bg-gray-50/50" />);
    }

    const selectedApts = appointments.filter(a => dayOf(a.scheduled_at) === selectedStr);

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
                    {canManage && (
                        <button
                            onClick={() => { setForm({ ...EMPTY_FORM, date: selectedStr }); setFormError(''); setShowModal(true); }}
                            className="bg-sonblade-primary text-sonblade-gold px-4 py-2 rounded-lg text-sm font-medium hover:bg-black transition-colors flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" /> Nueva Cita
                        </button>
                    )}
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg shadow-sm">
                        <button aria-label="Mes anterior" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-gray-50 rounded-l-lg border-r border-gray-200">
                            <ChevronLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <div className="px-4 py-2 font-semibold w-40 text-center text-gray-800 capitalize">
                            {monthNames[month]} {year}
                        </div>
                        <button aria-label="Mes siguiente" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-gray-50 rounded-r-lg border-l border-gray-200">
                            <ChevronRight className="h-5 w-5 text-gray-600" />
                        </button>
                    </div>
                </div>
            </div>

            {loadError && <div role="alert" className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{loadError}</div>}

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
            <div className="mt-8 bg-white p-6 rounded-xl border border-gray-200 shadow-sm" data-testid="day-list">
                <h3 className="font-bold text-gray-900 mb-4 capitalize border-b pb-2">
                    Citas del {selectedDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {actionError && !cancelTarget && <div role="alert" className="mb-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{actionError}</div>}
                {selectedApts.length > 0 ? (
                    <div className="space-y-3">
                        {selectedApts.map(apt => (
                            <div key={apt.id} data-testid="appointment" className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="bg-sonblade-gold/20 p-2 rounded-full shrink-0">
                                            <User className="h-4 w-4 text-sonblade-gold" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`font-semibold ${isActive(apt.status) ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{apt.client_name}</p>
                                            <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[apt.status] ?? 'bg-gray-100 text-gray-500'}`}>
                                                    {STATUS_LABELS[apt.status] ?? apt.status}
                                                </span>
                                                <span>· {apt.barber ? apt.barber.name : 'Sin barbero asignado'}</span>
                                                {apt.customer_phone && <span>· {apt.customer_phone}</span>}
                                            </p>
                                            {apt.notes && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{apt.notes}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-gray-600 font-medium whitespace-nowrap text-sm">
                                        <Clock className="h-4 w-4" />
                                        {timeOf(apt.scheduled_at)}{apt.end_at ? ` – ${timeOf(apt.end_at)}` : ''}
                                    </div>
                                </div>
                                {canManage && nextStatuses(apt.status).length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3 pl-11">
                                        {nextStatuses(apt.status).map(next => (
                                            <button key={next} disabled={busyId === apt.id}
                                                onClick={() => {
                                                    if (next === 'cancelled') { setActionError(''); setCancelReason(''); setCancelTarget(apt); }
                                                    else changeStatus(apt, next);
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${next === 'cancelled'
                                                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                                                    : next === 'no_show' ? 'border-gray-300 text-gray-600 hover:bg-gray-100'
                                                    : 'border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'}`}>
                                                {ACTION_LABELS[next]}
                                            </button>
                                        ))}
                                    </div>
                                )}
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
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-5">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5 text-sonblade-gold" /> Nueva Cita
                            </h2>
                            <button aria-label="Cerrar" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-900 bg-gray-100 rounded-full p-1.5 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {formError && <div role="alert" className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{formError}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="apt-date" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Fecha <span className="text-red-500">*</span></label>
                                    <input id="apt-date" type="date" required value={form.date}
                                        onChange={e => setForm({ ...form, date: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                                </div>
                                <div>
                                    <label htmlFor="apt-time" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Hora <span className="text-red-500">*</span></label>
                                    <input id="apt-time" type="time" required value={form.time}
                                        onChange={e => setForm({ ...form, time: e.target.value })}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="apt-duration" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Duración</label>
                                <select id="apt-duration" value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black">
                                    {DURATIONS.map(m => <option key={m} value={m}>{m} minutos</option>)}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="apt-client" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Cliente</label>
                                <select id="apt-client" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black">
                                    <option value="">Cliente no registrado</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                                </select>
                            </div>

                            {!form.client_id && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label htmlFor="apt-name" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Nombre <span className="text-red-500">*</span></label>
                                        <input id="apt-name" type="text" value={form.customer_name} maxLength={120}
                                            onChange={e => setForm({ ...form, customer_name: e.target.value })}
                                            placeholder="Quién reserva"
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                                    </div>
                                    <div>
                                        <label htmlFor="apt-phone" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Teléfono</label>
                                        <input id="apt-phone" type="tel" value={form.customer_phone} maxLength={32}
                                            onChange={e => setForm({ ...form, customer_phone: e.target.value })}
                                            placeholder="Opcional"
                                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label htmlFor="apt-barber" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Barbero</label>
                                <select id="apt-barber" value={form.barber_id} onChange={e => setForm({ ...form, barber_id: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black">
                                    <option value="">Sin barbero asignado</option>
                                    {barbers.filter(b => b.status === 'active').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label htmlFor="apt-note" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Nota / Servicio</label>
                                <input id="apt-note" type="text" value={form.service_note} maxLength={500}
                                    onChange={e => setForm({ ...form, service_note: e.target.value })}
                                    placeholder="Ej. Corte degradado + barba"
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors">
                                    Cerrar
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

            {/* Cancelar cita: no se borra, queda registrada con su motivo */}
            {cancelTarget && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <form onSubmit={confirmCancel} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h2 className="text-lg font-bold mb-1">Cancelar cita</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            {cancelTarget.client_name} · {timeOf(cancelTarget.scheduled_at)}. La cita no se borra: queda registrada como cancelada.
                        </p>
                        {actionError && <div role="alert" className="mb-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">{actionError}</div>}
                        <label htmlFor="cancel-reason" className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Motivo <span className="text-red-500">*</span></label>
                        <textarea id="cancel-reason" value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} maxLength={300} autoFocus
                            placeholder="Ej. El cliente avisó que no puede venir"
                            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black" />
                        <div className="flex gap-3 pt-4">
                            <button type="button" onClick={() => { setCancelTarget(null); setActionError(''); }}
                                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors">
                                Volver
                            </button>
                            <button type="submit" disabled={busyId === cancelTarget.id}
                                className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 transition-colors disabled:opacity-70">
                                Cancelar cita
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
