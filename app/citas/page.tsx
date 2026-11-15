'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Loader2, Plus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { Appointment, AppointmentStatus, Barber, Client } from '@/types';
import {
    ACTION_LABELS, STATUS_LABELS, isActive, localDateKey, localDateTimeToIso, monthRange, nextStatuses,
} from '@/lib/appointments/appointments-view';

const STATUS_STYLE: Record<AppointmentStatus, string> = {
    scheduled: 'bg-bos-raised text-bos-text',
    confirmed: 'bg-bos-accent-soft text-bos-accent-text',
    checked_in: 'bg-bos-success-soft text-bos-success',
    in_progress: 'bg-bos-success-soft text-bos-success',
    completed: 'bg-bos-success-soft text-bos-success',
    cancelled: 'bg-bos-raised text-bos-danger',
    no_show: 'bg-bos-raised text-bos-muted',
};
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DURATIONS = [30, 45, 60, 90, 120];
const EMPTY_FORM = { client_id: '', customer_name: '', customer_phone: '', barber_id: '', date: '', time: '', duration: 30, service_note: '' };

const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
const fieldLabel = 'block text-xs font-semibold uppercase tracking-[0.08em] text-bos-muted mb-1.5';
const primary = 'min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent text-[15px] font-bold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-2';
const secondary = 'min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text text-[15px] font-semibold hover:bg-bos-raised inline-flex items-center justify-center gap-2';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso: string) => localDateKey(new Date(iso));

async function readError(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    return body?.error || fallback;
}

export default function AppointmentsPage() {
    const [today] = useState(() => new Date());
    const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [canManage, setCanManage] = useState(false);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [clients, setClients] = useState<Client[]>([]);

    const [openDay, setOpenDay] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState('');
    const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
    const [cancelReason, setCancelReason] = useState('');

    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const todayKey = localDateKey(today);

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
                    setShowForm(true);
                    window.history.replaceState(null, '', '/citas');
                }
            }).catch(() => {});
    }, []);

    const byDay = useMemo(() => {
        const map = new Map<string, Appointment[]>();
        for (const a of appointments) {
            const key = dayOf(a.scheduled_at);
            map.set(key, [...(map.get(key) ?? []), a]);
        }
        return map;
    }, [appointments]);

    const openForm = (date: string) => {
        setForm({ ...EMPTY_FORM, date });
        setFormError('');
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!form.date || !form.time) { setFormError('Elige la fecha y la hora.'); return; }
        if (!form.client_id && form.customer_name.trim().length < 2) { setFormError('Elige un cliente o escribe el nombre de quien reserva.'); return; }
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
            if (!res.ok) throw new Error(await readError(res, 'No se pudo guardar la cita.'));
            await fetchAppointments();
            setShowForm(false);
            setOpenDay(form.date);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'No se pudo guardar la cita.');
        } finally { setSubmitting(false); }
    };

    const changeStatus = async (apt: Appointment, status: AppointmentStatus, reason?: string): Promise<boolean> => {
        setActionError('');
        setBusyId(apt.id);
        try {
            const res = await fetch(`/api/appointments/${apt.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, reason: reason ?? null }),
            });
            if (!res.ok) throw new Error(await readError(res, 'No se pudo actualizar la cita.'));
            await fetchAppointments();
            return true;
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'No se pudo actualizar la cita.');
            return false;
        } finally { setBusyId(null); }
    };

    const confirmCancel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cancelTarget) return;
        if (cancelReason.trim().length < 3) { setActionError('Escribe el motivo de la cancelación.'); return; }
        if (await changeStatus(cancelTarget, 'cancelled', cancelReason.trim())) { setCancelTarget(null); setCancelReason(''); }
    };

    // Cuadrícula del mes: de domingo a sábado, como la semana del negocio.
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);

    const dayTitle = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const dayList = openDay ? (byDay.get(openDay) ?? []) : [];

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-bold">Agenda</h1>
                    <p className="text-sm text-bos-muted">Toca un día para ver sus citas.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center rounded-xl border border-bos-border bg-bos-surface">
                        <button type="button" aria-label="Mes anterior" onClick={() => setCursor(new Date(year, month - 1, 1))}
                            className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-text"><ChevronLeft className="h-5 w-5" /></button>
                        <span className="w-40 text-center font-semibold" data-testid="calendar-month">{MONTHS[month]} {year}</span>
                        <button type="button" aria-label="Mes siguiente" onClick={() => setCursor(new Date(year, month + 1, 1))}
                            className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-text"><ChevronRight className="h-5 w-5" /></button>
                    </div>
                    {canManage && (
                        <button type="button" onClick={() => openForm(todayKey)} className={primary}><Plus className="h-5 w-5" /> Nueva cita</button>
                    )}
                </div>
            </header>

            {loadError && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-bos-danger">{loadError}</p>}

            <section aria-label="Calendario" className="rounded-2xl border border-bos-border bg-bos-surface overflow-hidden">
                <div className="grid grid-cols-7 border-b border-bos-border">
                    {WEEK.map((d) => <div key={d} className="py-3 text-center text-xs font-semibold uppercase tracking-[0.08em] text-bos-muted">{d}</div>)}
                </div>
                {loading ? (
                    <div className="flex items-center justify-center h-80"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>
                ) : (
                    <div className="grid grid-cols-7">
                        {cells.map((d, i) => {
                            if (d === null) return <div key={`e${i}`} className="min-h-24 md:min-h-32 border-b border-r border-bos-border bg-bos-bg/40" />;
                            const key = localDateKey(new Date(year, month, d));
                            const list = byDay.get(key) ?? [];
                            const active = list.filter((a) => isActive(a.status));
                            const isToday = key === todayKey;
                            return (
                                <button key={key} type="button" data-testid={`day-${key}`} onClick={() => { setActionError(''); setOpenDay(key); }}
                                    aria-label={`${dayTitle(key)}: ${active.length === 0 ? 'sin citas' : `${active.length} cita${active.length === 1 ? '' : 's'}`}`}
                                    className="min-h-24 md:min-h-32 p-2 border-b border-r border-bos-border text-left align-top hover:bg-bos-raised transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bos-accent">
                                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-bos-accent text-bos-on-accent' : 'text-bos-text'}`}>{d}</span>
                                    <span className="hidden md:flex flex-col gap-1 mt-1">
                                        {list.slice(0, 3).map((a) => (
                                            <span key={a.id} className={`truncate rounded-md px-1.5 py-0.5 text-xs ${isActive(a.status) ? 'bg-bos-raised text-bos-text' : 'text-bos-muted line-through'}`}>
                                                {timeOf(a.scheduled_at)} {a.client_name}
                                            </span>
                                        ))}
                                        {list.length > 3 && <span className="text-xs text-bos-muted px-1.5">+{list.length - 3} más</span>}
                                    </span>
                                    {active.length > 0 && (
                                        <span className="md:hidden mt-1 inline-flex min-w-6 h-6 px-1.5 items-center justify-center rounded-full bg-bos-accent-soft text-xs font-bold text-bos-accent-text">{active.length}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Citas del día: ventana flotante */}
            {openDay && !showForm && !cancelTarget && (
                <Modal title={dayTitle(openDay)} subtitle={dayList.length === 0 ? 'Sin citas' : `${dayList.length} cita${dayList.length === 1 ? '' : 's'}`}
                    onClose={() => setOpenDay(null)} size="lg" testId="day-modal">
                    {actionError && <p role="alert" className="mb-3 rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{actionError}</p>}
                    {dayList.length === 0 ? (
                        <p className="py-8 text-center text-bos-muted">No hay citas este día.</p>
                    ) : (
                        <ul className="space-y-3">
                            {dayList.map((apt) => (
                                <li key={apt.id} data-testid="appointment" className="rounded-2xl border border-bos-border p-4">
                                    <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                                        <div className="min-w-0">
                                            <p className={`text-[15px] font-semibold ${isActive(apt.status) ? '' : 'text-bos-muted line-through'}`}>{apt.client_name}</p>
                                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-bos-muted">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[apt.status]}`}>{STATUS_LABELS[apt.status]}</span>
                                                <span>{apt.barber ? apt.barber.name : 'Sin barbero asignado'}</span>
                                                {apt.customer_phone && <span>· {apt.customer_phone}</span>}
                                            </p>
                                            {apt.notes && <p className="mt-2 text-sm text-bos-muted whitespace-pre-line">{apt.notes}</p>}
                                        </div>
                                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[15px] font-semibold tabular-nums">
                                            <Clock aria-hidden="true" className="h-4 w-4 text-bos-muted" />
                                            {timeOf(apt.scheduled_at)}{apt.end_at ? ` – ${timeOf(apt.end_at)}` : ''}
                                        </span>
                                    </div>
                                    {canManage && nextStatuses(apt.status).length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {nextStatuses(apt.status).map((next) => (
                                                <button key={next} type="button" disabled={busyId === apt.id}
                                                    onClick={() => { if (next === 'cancelled') { setActionError(''); setCancelReason(''); setCancelTarget(apt); } else changeStatus(apt, next); }}
                                                    className={`min-h-11 px-4 rounded-xl border text-sm font-semibold disabled:opacity-50 ${next === 'cancelled' ? 'border-bos-border text-bos-danger hover:bg-bos-raised' : 'border-bos-border text-bos-text hover:bg-bos-raised'}`}>
                                                    {ACTION_LABELS[next]}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {canManage && (
                        <button type="button" onClick={() => openForm(openDay)} className={`${secondary} w-full mt-5`}><Plus className="h-5 w-5" /> Agendar en este día</button>
                    )}
                </Modal>
            )}

            {/* Nueva cita */}
            {showForm && (
                <Modal title="Nueva cita" onClose={() => setShowForm(false)}>
                    {formError && <p role="alert" className="mb-4 rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{formError}</p>}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="apt-date" className={fieldLabel}>Fecha</label>
                                <input id="apt-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={field} />
                            </div>
                            <div>
                                <label htmlFor="apt-time" className={fieldLabel}>Hora</label>
                                <input id="apt-time" type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={field} />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="apt-barber" className={fieldLabel}>Barbero</label>
                            <select id="apt-barber" value={form.barber_id} onChange={(e) => setForm({ ...form, barber_id: e.target.value })} className={field}>
                                <option value="">Sin barbero asignado</option>
                                {barbers.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="apt-duration" className={fieldLabel}>Duración</label>
                            <select id="apt-duration" value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} className={field}>
                                {DURATIONS.map((m) => <option key={m} value={m}>{m} minutos</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="apt-client" className={fieldLabel}>Cliente</label>
                            <select id="apt-client" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className={field}>
                                <option value="">Cliente no registrado</option>
                                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                            </select>
                        </div>
                        {!form.client_id && (
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="apt-name" className={fieldLabel}>Nombre</label>
                                    <input id="apt-name" type="text" maxLength={120} placeholder="Quién reserva" value={form.customer_name}
                                        onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="apt-phone" className={fieldLabel}>Teléfono</label>
                                    <input id="apt-phone" type="tel" maxLength={32} placeholder="Opcional" value={form.customer_phone}
                                        onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className={field} />
                                </div>
                            </div>
                        )}
                        <div>
                            <label htmlFor="apt-note" className={fieldLabel}>Nota o servicio</label>
                            <input id="apt-note" type="text" maxLength={500} placeholder="Ej. Corte degradado + barba" value={form.service_note}
                                onChange={(e) => setForm({ ...form, service_note: e.target.value })} className={field} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button type="button" onClick={() => setShowForm(false)} className={secondary}>Cancelar</button>
                            <button type="submit" disabled={submitting} className={primary}>{submitting && <Loader2 className="h-5 w-5 animate-spin" />} Guardar cita</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Cancelar cita: no se borra, queda registrada con su motivo */}
            {cancelTarget && (
                <Modal title="Cancelar cita" subtitle={`${cancelTarget.client_name} · ${timeOf(cancelTarget.scheduled_at)}`} onClose={() => { setCancelTarget(null); setActionError(''); }}>
                    <form onSubmit={confirmCancel} className="space-y-4">
                        <p className="text-sm text-bos-muted">La cita no se borra: queda registrada como cancelada, con su motivo.</p>
                        {actionError && <p role="alert" className="rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{actionError}</p>}
                        <div>
                            <label htmlFor="cancel-reason" className={fieldLabel}>Motivo</label>
                            <textarea id="cancel-reason" rows={3} maxLength={300} autoFocus placeholder="Ej. El cliente avisó que no puede venir"
                                value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                                className="w-full px-3 py-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => { setCancelTarget(null); setActionError(''); }} className={secondary}>Volver</button>
                            <button type="submit" disabled={busyId === cancelTarget.id} className="min-h-[52px] rounded-xl bg-bos-danger text-bos-bg text-[15px] font-bold disabled:opacity-50">Cancelar cita</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
