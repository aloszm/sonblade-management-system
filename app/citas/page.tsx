'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ban, ChevronLeft, ChevronRight, Clock, Loader2, Plus, Receipt } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { Appointment, AppointmentStatus, Barber, Client } from '@/types';
import {
    ACTION_LABELS, STATUS_LABELS, canCharge, isActive, layoutLanes, localDateKey, localDateTimeToIso, monthRange, nextStatuses,
} from '@/lib/appointments/appointments-view';
import { REQUESTED_VIA, VIA_LABELS, overlapMinutes, type RequestedVia, type TimeOffView } from '@/lib/appointments/time-off';
import { formatHour, minutesToHHMM, workingWindow, type ScheduleData } from '@/lib/appointments/hours';

const STATUS_STYLE: Record<AppointmentStatus, string> = {
    scheduled: 'bg-bos-raised text-bos-text',
    confirmed: 'bg-bos-accent-soft text-bos-accent-text',
    checked_in: 'bg-bos-success-soft text-bos-success',
    in_progress: 'bg-bos-success-soft text-bos-success',
    completed: 'bg-bos-success-soft text-bos-success',
    cancelled: 'bg-bos-raised text-bos-danger',
    no_show: 'bg-bos-raised text-bos-muted',
};
// En la agenda solo se usan estas acciones: confirmar, marcar que llegó y cancelar.
const UI_ACTIONS: AppointmentStatus[] = ['confirmed', 'checked_in', 'cancelled'];
const actionsFor = (status: AppointmentStatus) => nextStatuses(status).filter((s) => UI_ACTIONS.includes(s));
// Un color discreto por barbero para distinguirlos en el calendario.
// Al menos 3:1 sobre la superficie en modo claro y oscuro (WCAG 1.4.11).
const BARBER_COLORS = ['#A97A2F', '#4F86E0', '#2A9680', '#CC5F7C', '#7F6FD6', '#CC6A30'];
const HOUR_PX = 64; // alto de una hora en la vista por día
// Si el negocio no tiene horario configurado, la vista por día muestra de 8 a.m. a 10 p.m.
// Con horario, se muestra de una hora antes de abrir a una hora después de cerrar.
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 22;
// Rayado para los horarios bloqueados por una ausencia.
const HATCH = 'repeating-linear-gradient(135deg, transparent 0 7px, var(--bos-border) 7px 9px)';
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DURATIONS = [30, 45, 60, 90, 120];
const EMPTY_OFF = { barber_id: '', from_date: '', from_time: '08:00', to_date: '', to_time: '22:00', reason: '', requested_date: '', requested_time: '', requested_via: 'whatsapp' as RequestedVia };
const EMPTY_FORM = { client_id: '', customer_name: '', customer_phone: '', barber_id: '', date: '', time: '', duration: 30, service_note: '' };

const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
const fieldLabel = 'block text-[13px] font-medium text-bos-muted mb-1.5';
const primary = 'min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent text-[15px] font-bold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-2';
const secondary = 'min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text text-[15px] font-semibold hover:bg-bos-raised inline-flex items-center justify-center gap-2';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso: string) => localDateKey(new Date(iso));
const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const dateTimeOf = (iso: string) => new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const nowParts = () => { const d = new Date(); return { date: localDateKey(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }; };

async function readError(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    return body?.error || fallback;
}

export default function AppointmentsPage() {
    const [today] = useState(() => new Date());
    const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
    const [view, setView] = useState<'month' | 'day'>('day');
    const [barberFilter, setBarberFilter] = useState('');
    const [dayKey, setDayKey] = useState(() => localDateKey(today));
    const [onlyApt, setOnlyApt] = useState<string | null>(null);
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
    const [timeOff, setTimeOff] = useState<TimeOffView[]>([]);
    const [schedule, setSchedule] = useState<ScheduleData | null>(null);
    const [showOff, setShowOff] = useState(false);
    const [offForm, setOffForm] = useState(EMPTY_OFF);
    const [offError, setOffError] = useState('');
    const [offConflicts, setOffConflicts] = useState<{ id: string; customer_name: string; starts_at: string }[] | null>(null);
    const [offCancel, setOffCancel] = useState<TimeOffView | null>(null);
    const [offCancelReason, setOffCancelReason] = useState('');

    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const todayKey = localDateKey(today);

    const fetchAppointments = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const { from, to } = monthRange(year, month);
            const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const [res, offRes] = await Promise.all([
                fetch(`/api/appointments?${range}`, { cache: 'no-store' }),
                fetch(`/api/time-off?${range}`, { cache: 'no-store' }),
            ]);
            if (!res.ok) throw new Error(await readError(res, 'No se pudieron cargar las citas.'));
            setAppointments(await res.json());
            // Las ausencias no deben impedir ver la agenda: si fallan, se avisa pero las citas se muestran.
            if (offRes.ok) setTimeOff(await offRes.json());
            else setLoadError(await readError(offRes, 'No se pudieron cargar las ausencias.'));
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar las citas.');
        } finally { setLoading(false); }
    }, [year, month]);

    useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

    useEffect(() => {
        fetch('/api/barbers').then(r => r.json()).then(d => { if (Array.isArray(d)) setBarbers(d); }).catch(() => {});
        fetch('/api/schedule', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setSchedule(d); }).catch(() => {});
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

    const activeBarbers = useMemo(() => barbers.filter((b) => b.status === 'active'), [barbers]);
    const colorOf = useCallback((id: string | null | undefined) => {
        const i = activeBarbers.findIndex((b) => b.id === id);
        return i < 0 ? 'var(--bos-muted)' : BARBER_COLORS[i % BARBER_COLORS.length];
    }, [activeBarbers]);
    const visible = useMemo(() => (barberFilter ? appointments.filter((a) => a.barber?.id === barberFilter) : appointments), [appointments, barberFilter]);

    const byDay = useMemo(() => {
        const map = new Map<string, Appointment[]>();
        for (const a of visible) {
            const key = dayOf(a.scheduled_at);
            map.set(key, [...(map.get(key) ?? []), a]);
        }
        return map;
    }, [visible]);

    // Ir a un día: si cae en otro mes, se cargan las citas de ese mes.
    const goToDay = (key: string) => {
        setDayKey(key);
        const d = new Date(`${key}T12:00:00`);
        if (d.getFullYear() !== year || d.getMonth() !== month) setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    };
    const shiftDay = (delta: number) => {
        const d = new Date(`${dayKey}T12:00:00`);
        d.setDate(d.getDate() + delta);
        goToDay(localDateKey(d));
    };

    const openForm = (date: string, time = '', barberId = '') => {
        setForm({ ...EMPTY_FORM, date, time, barber_id: barberId });
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
            if (view === 'month') setOpenDay(form.date);
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

    const openOff = (barberId = '', date = dayKey) => {
        const now = nowParts();
        setOffForm({ ...EMPTY_OFF, barber_id: barberId, from_date: date, to_date: date, requested_date: now.date, requested_time: now.time });
        setOffError('');
        setOffConflicts(null);
        setShowOff(true);
    };

    const submitOff = async (e: React.FormEvent) => {
        e.preventDefault();
        setOffError('');
        if (!offForm.barber_id) { setOffError('Elige al barbero.'); return; }
        if (offForm.reason.trim().length < 3) { setOffError('Escribe el motivo de la ausencia.'); return; }
        const startsAt = localDateTimeToIso(offForm.from_date, offForm.from_time);
        const endsAt = localDateTimeToIso(offForm.to_date, offForm.to_time);
        if (new Date(endsAt) <= new Date(startsAt)) { setOffError('La hora de fin debe ser después del inicio.'); return; }
        setSubmitting(true);
        try {
            const res = await fetch('/api/time-off', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    barber_id: offForm.barber_id, starts_at: startsAt, ends_at: endsAt, reason: offForm.reason.trim(),
                    requested_at: localDateTimeToIso(offForm.requested_date, offForm.requested_time), requested_via: offForm.requested_via,
                }),
            });
            if (!res.ok) throw new Error(await readError(res, 'No se pudo registrar la ausencia.'));
            const body = await res.json() as { conflicts?: { id: string; customer_name: string; starts_at: string }[] };
            await fetchAppointments();
            // Si había citas dentro del bloqueo se muestran para reagendarlas; si no, se cierra.
            if (body.conflicts && body.conflicts.length > 0) setOffConflicts(body.conflicts);
            else setShowOff(false);
        } catch (err) {
            setOffError(err instanceof Error ? err.message : 'No se pudo registrar la ausencia.');
        } finally { setSubmitting(false); }
    };

    const confirmOffCancel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!offCancel) return;
        if (offCancelReason.trim().length < 3) { setActionError('Escribe por qué se cancela la ausencia.'); return; }
        setBusyId(offCancel.id);
        try {
            const res = await fetch(`/api/time-off/${offCancel.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: offCancelReason.trim() }),
            });
            if (!res.ok) throw new Error(await readError(res, 'No se pudo cancelar la ausencia.'));
            await fetchAppointments();
            setOffCancel(null);
            setOffCancelReason('');
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'No se pudo cancelar la ausencia.');
        } finally { setBusyId(null); }
    };

    // Cuadrícula del mes: de domingo a sábado, como la semana del negocio.
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);

    const dayTitle = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    const dayAll = openDay ? (byDay.get(openDay) ?? []) : [];
    const dayList = onlyApt ? dayAll.filter((a) => a.id === onlyApt) : dayAll;

    // Vista por día: una columna por barbero (o solo el elegido) y otra si hay citas sin barbero.
    const dayAppointments = byDay.get(dayKey) ?? [];
    const columns = [
        ...(barberFilter ? activeBarbers.filter((b) => b.id === barberFilter) : activeBarbers).map((b) => ({ id: b.id as string | null, name: b.name })),
        ...(!barberFilter && dayAppointments.some((a) => !a.barber) ? [{ id: null, name: 'Sin asignar' }] : []),
    ];
    const minutesOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
    // Horario del día: el del negocio (o el más amplio de los barberos si no hay del negocio).
    const businessWindow = schedule ? workingWindow(schedule, dayKey) : undefined;
    const startHour = businessWindow ? Math.max(0, Math.floor(businessWindow.open / 60) - 1) : DEFAULT_START_HOUR;
    const endHour = businessWindow ? Math.min(24, Math.ceil(businessWindow.close / 60) + 1) : DEFAULT_END_HOUR;
    const closedDay = businessWindow === null;
    // Tramos cerrados de una columna (antes de abrir, después de cerrar, o el día completo si descansa).
    const closedSpans = (barberId: string | null): { from: number; to: number; label: string }[] => {
        if (!schedule) return [];
        const w = workingWindow(schedule, dayKey, barberId);
        if (w === undefined) return [];
        if (w === null) return [{ from: startHour * 60, to: endHour * 60, label: closedDay ? 'El negocio cierra' : 'Descansa' }];
        return [
            ...(w.open > startHour * 60 ? [{ from: startHour * 60, to: w.open, label: '' }] : []),
            ...(w.close < endHour * 60 ? [{ from: w.close, to: endHour * 60, label: '' }] : []),
        ];
    };
    const hoursRange = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
    const endOf = (a: Appointment) => (a.end_at ? minutesOf(a.end_at) : minutesOf(a.scheduled_at) + 30);
    // Fuera del horario visible: no se dibujan en la cuadrícula, pero se avisan para no perderlas.
    const outOfHours = dayAppointments.filter((a) => minutesOf(a.scheduled_at) < startHour * 60 || minutesOf(a.scheduled_at) >= endHour * 60);
    const dayStart = new Date(`${dayKey}T00:00:00`);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const liveOff = timeOff.filter((t) => !t.cancelled);
    const dayOff = timeOff.filter((t) => overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), dayStart, dayEnd)
        && (!barberFilter || t.barber_id === barberFilter));
    const offOnDay = (key: string) => {
        const s = new Date(`${key}T00:00:00`); const e = new Date(s); e.setDate(e.getDate() + 1);
        return liveOff.filter((t) => overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), s, e) && (!barberFilter || t.barber_id === barberFilter));
    };
    const nowMinutes = today.getHours() * 60 + today.getMinutes();

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Agenda</h1>
                    <p className="text-sm text-bos-muted first-letter:uppercase" data-testid="calendar-label">
                        {view === 'day' ? dayTitle(dayKey) : `${MONTHS[month]} ${year}`}
                    </p>
                    {view === 'day' && schedule && businessWindow !== undefined && (
                        <p className="text-sm text-bos-muted" data-testid="day-hours">
                            {businessWindow === null ? 'El negocio cierra este día' : `Abierto de ${formatHour(minutesToHHMM(businessWindow.open))} a ${formatHour(minutesToHHMM(businessWindow.close))}`}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div role="group" aria-label="Vista" className="flex p-1 rounded-lg bg-bos-raised">
                        {([['day', 'Día'], ['month', 'Mes']] as const).map(([id, text]) => (
                            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
                                className={`h-9 px-4 rounded-md text-sm font-medium transition-colors ${view === id ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>{text}</button>
                        ))}
                    </div>
                    <div className="flex items-center rounded-lg border border-bos-border bg-bos-surface">
                        <button type="button" aria-label={view === 'day' ? 'Día anterior' : 'Mes anterior'}
                            onClick={() => (view === 'day' ? shiftDay(-1) : setCursor(new Date(year, month - 1, 1)))}
                            className="h-10 w-10 inline-flex items-center justify-center text-bos-muted hover:text-bos-text"><ChevronLeft className="h-5 w-5" /></button>
                        <button type="button" onClick={() => { goToDay(todayKey); setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); }}
                            className="h-10 px-3 text-sm font-medium text-bos-text hover:bg-bos-raised">Hoy</button>
                        <button type="button" aria-label={view === 'day' ? 'Día siguiente' : 'Mes siguiente'}
                            onClick={() => (view === 'day' ? shiftDay(1) : setCursor(new Date(year, month + 1, 1)))}
                            className="h-10 w-10 inline-flex items-center justify-center text-bos-muted hover:text-bos-text"><ChevronRight className="h-5 w-5" /></button>
                    </div>
                    {canManage && (
                        <button type="button" onClick={() => openOff(barberFilter, view === 'day' ? dayKey : todayKey)} className={secondary}><Ban className="h-5 w-5" /> Ausencia</button>
                    )}
                    {canManage && (
                        <button type="button" onClick={() => openForm(view === 'day' ? dayKey : todayKey, '', barberFilter)} className={primary}><Plus className="h-5 w-5" /> Nueva cita</button>
                    )}
                </div>
            </header>

            <div role="group" aria-label="Barbero" className="flex flex-wrap gap-2">
                {[{ id: '', name: 'Todos' }, ...activeBarbers].map((b) => (
                    <button key={b.id || 'all'} type="button" aria-pressed={barberFilter === b.id} onClick={() => setBarberFilter(b.id)}
                        className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-sm font-medium transition-colors ${barberFilter === b.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`}>
                        {b.id && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: colorOf(b.id) }} />}
                        {b.name}
                    </button>
                ))}
            </div>

            {loadError && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-bos-danger">{loadError}</p>}

            {view === 'day' && !loading && outOfHours.length > 0 && (
                <button type="button" data-testid="out-of-hours" onClick={() => { setActionError(''); setOnlyApt(null); setOpenDay(dayKey); }}
                    className="w-full rounded-xl border border-bos-border bg-bos-surface p-3 text-left text-sm hover:bg-bos-raised">
                    <span className="font-semibold">{outOfHours.length} cita{outOfHours.length === 1 ? '' : 's'} fuera del horario visible</span>{' '}
                    <span className="text-bos-muted">({outOfHours.map((a) => `${timeOf(a.scheduled_at)} ${a.client_name}`).join(', ')}) · Ver</span>
                </button>
            )}

            {view === 'day' && (
                <section aria-label="Agenda del día por barbero" data-testid="day-view" className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-80"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>
                    ) : columns.length === 0 ? (
                        <p className="p-10 text-center text-bos-muted">No hay barberos activos.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="min-w-[560px]" style={{ display: 'grid', gridTemplateColumns: `56px repeat(${columns.length}, minmax(160px, 1fr))` }}>
                                <div className="sticky left-0 z-10 bg-bos-surface border-b border-bos-border" />
                                {columns.map((c) => {
                                    const count = dayAppointments.filter((a) => (a.barber?.id ?? null) === c.id && isActive(a.status)).length;
                                    return (
                                        <div key={c.id ?? 'none'} className="px-3 py-3 border-b border-l border-bos-border">
                                            <p className="flex items-center gap-2 text-sm font-semibold">
                                                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: c.id ? colorOf(c.id) : 'var(--bos-muted)' }} />{c.name}
                                            </p>
                                            <p className="text-xs text-bos-muted">{count === 0 ? 'Sin citas' : `${count} cita${count === 1 ? '' : 's'}`}</p>
                                        </div>
                                    );
                                })}

                                <div className="sticky left-0 z-10 bg-bos-surface">
                                    {hoursRange.map((h) => (
                                        <div key={h} style={{ height: HOUR_PX }} className="pr-2 text-right text-xs text-bos-muted tabular-nums -translate-y-2">
                                            {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'a.m.' : 'p.m.'}
                                        </div>
                                    ))}
                                </div>
                                {columns.map((c) => (
                                    <div key={c.id ?? 'none'} className="relative border-l border-bos-border" style={{ height: hoursRange.length * HOUR_PX }}>
                                        {hoursRange.map((h) => (
                                            <button key={h} type="button" disabled={!canManage}
                                                aria-label={canManage ? `Agendar con ${c.name} a las ${h}:00` : undefined}
                                                onClick={() => {
                                                    // Si abre a media hora (12:30), la cita empieza a la hora de apertura.
                                                    const w = schedule ? workingWindow(schedule, dayKey, c.id) : undefined;
                                                    openForm(dayKey, minutesToHHMM(w ? Math.max(h * 60, w.open) : h * 60), c.id ?? '');
                                                }}
                                                style={{ top: (h - startHour) * HOUR_PX, height: HOUR_PX }}
                                                className="absolute inset-x-0 border-t border-bos-border/60 enabled:hover:bg-bos-raised/60 disabled:cursor-default" />
                                        ))}
                                        {closedSpans(c.id).map((span) => (
                                            <div key={`closed-${span.from}`} data-testid="closed-block" title={span.label || 'Fuera de horario'}
                                                style={{ top: ((span.from - startHour * 60) / 60) * HOUR_PX, height: ((span.to - span.from) / 60) * HOUR_PX, backgroundImage: HATCH }}
                                                className="absolute inset-x-0 z-[14] bg-bos-bg/60 px-2 py-1">
                                                {span.label && <span className="inline-block rounded bg-bos-surface px-1.5 py-0.5 text-xs font-semibold text-bos-muted">{span.label}</span>}
                                            </div>
                                        ))}
                                        {c.id && liveOff.filter((t) => t.barber_id === c.id).map((t) => {
                                            const span = overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), dayStart, dayEnd);
                                            if (!span) return null;
                                            const from = Math.max(span.from, startHour * 60);
                                            const to = Math.min(span.to, endHour * 60);
                                            if (to <= from) return null;
                                            return (
                                                <div key={t.id} data-testid="time-off-block" title={`${t.barber_name}: ${t.reason}`}
                                                    style={{ top: ((from - startHour * 60) / 60) * HOUR_PX, height: ((to - from) / 60) * HOUR_PX, backgroundImage: HATCH }}
                                                    className="absolute inset-x-0 z-[15] bg-bos-bg/70 border-y border-bos-border px-2 py-1 pointer-events-none">
                                                    <span className="inline-block rounded bg-bos-surface px-1.5 py-0.5 text-xs font-semibold text-bos-muted">No disponible · {t.reason}</span>
                                                </div>
                                            );
                                        })}
                                        {dayKey === todayKey && nowMinutes >= startHour * 60 && nowMinutes < endHour * 60 && (
                                            <div aria-hidden="true" className="absolute inset-x-0 h-px bg-bos-danger z-10" style={{ top: ((nowMinutes - startHour * 60) / 60) * HOUR_PX }} />
                                        )}
                                        {(() => {
                                            const inColumn = dayAppointments.filter((a) => (a.barber?.id ?? null) === c.id && !outOfHours.includes(a));
                                            // La tarjeta mide al menos 30 px; se usa ese alto para decidir si dos se enciman.
                                            const lanes = layoutLanes(inColumn.map((a) => ({ id: a.id, start: minutesOf(a.scheduled_at), end: Math.max(Math.min(endOf(a), endHour * 60), minutesOf(a.scheduled_at) + 30) })));
                                            return inColumn.map((a) => {
                                            const start = minutesOf(a.scheduled_at);
                                            const end = Math.min(endOf(a), endHour * 60);
                                            const { lane, lanes: laneCount } = lanes.get(a.id) ?? { lane: 0, lanes: 1 };
                                            const top = ((start - startHour * 60) / 60) * HOUR_PX;
                                            const height = Math.max(((end - start) / 60) * HOUR_PX - 2, 30);
                                            const live = isActive(a.status);
                                            return (
                                                <button key={a.id} type="button" data-testid="day-appointment"
                                                    onClick={() => { setActionError(''); setOnlyApt(a.id); setOpenDay(dayKey); }}
                                                    style={{ top: top + 1, height, borderLeftColor: c.id ? colorOf(c.id) : 'var(--bos-muted)',
                                                        left: `calc(${(lane / laneCount) * 100}% + 4px)`, width: `calc(${100 / laneCount}% - 8px)` }}
                                                    className={`absolute z-20 overflow-hidden rounded-md border border-bos-border border-l-[3px] px-2 py-1 text-left transition-colors ${a.walk_in ? 'border-dashed' : ''} ${live ? 'bg-bos-raised hover:bg-bos-bg' : 'bg-bos-surface'}`}>
                                                    {/* Cancelada: se atenúa con color (no con opacidad) para que se siga leyendo. */}
                                                    <span className={`block truncate text-[13px] font-semibold ${live ? '' : 'line-through text-bos-muted'}`}>{a.client_name}</span>
                                                    <span className="block truncate text-xs text-bos-muted">
                                                        {timeOf(a.scheduled_at)} · {a.walk_in ? 'Sin cita' : STATUS_LABELS[a.status]}{a.sale ? ` · ${money(a.sale.total)}` : ''}
                                                    </span>
                                                </button>
                                            );
                                            });
                                        })()}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {view === 'day' && dayOff.length > 0 && (
                <section aria-label="Ausencias del día" data-testid="time-off-list" className="rounded-xl border border-bos-border bg-bos-surface p-4">
                    <h2 className="text-[15px] font-semibold">Ausencias</h2>
                    <ul className="mt-3 divide-y divide-bos-border">
                        {dayOff.map((t) => (
                            <li key={t.id} className="py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                <div className="min-w-0 text-sm">
                                    <p className={`font-semibold ${t.cancelled ? 'line-through text-bos-muted' : ''}`}>{t.barber_name} · {t.reason}</p>
                                    <p className="text-bos-muted">De {dateTimeOf(t.starts_at)} a {dateTimeOf(t.ends_at)}</p>
                                    <p className="text-bos-muted">Avisó {dateTimeOf(t.requested_at)} por {VIA_LABELS[t.requested_via]} · Registró {t.created_by_name} el {dateTimeOf(t.created_at)}</p>
                                    {t.cancelled && <p className="text-bos-muted">Cancelada por {t.cancelled.by_name} el {dateTimeOf(t.cancelled.at)}: {t.cancelled.reason}</p>}
                                </div>
                                {canManage && !t.cancelled && (
                                    <button type="button" onClick={() => { setActionError(''); setOffCancelReason(''); setOffCancel(t); }}
                                        className="min-h-11 px-4 rounded-xl border border-bos-border text-sm font-semibold text-bos-danger hover:bg-bos-raised">Cancelar ausencia</button>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {view === 'month' && (
            <section aria-label="Calendario" className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                <div className="grid grid-cols-7 border-b border-bos-border">
                    {WEEK.map((d) => <div key={d} className="py-3 text-center text-[13px] font-medium text-bos-muted">{d}</div>)}
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
                                    {offOnDay(key).length > 0 && (
                                        <span className="ml-1 hidden md:inline text-xs text-bos-muted">· {offOnDay(key).map((t) => t.barber_name).join(', ')} no viene</span>
                                    )}
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
            )}

            {/* Citas del día: ventana flotante */}
            {openDay && !showForm && !cancelTarget && !showOff && !offCancel && (
                <Modal title={dayTitle(openDay)} subtitle={onlyApt ? undefined : dayList.length === 0 ? 'Sin citas' : `${dayList.length} cita${dayList.length === 1 ? '' : 's'}`}
                    onClose={() => { setOpenDay(null); setOnlyApt(null); }} size="lg" testId="day-modal">
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
                                                {apt.walk_in && <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-dashed border-bos-border">Sin cita</span>}
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
                                    {apt.sale && (
                                        <Link href={`/ticket/${apt.sale.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-bos-success hover:underline">
                                            <Receipt aria-hidden="true" className="h-4 w-4" /> Cobrada · {money(apt.sale.total)} · Ver ticket
                                        </Link>
                                    )}
                                    {canManage && (actionsFor(apt.status).length > 0 || canCharge(apt)) && (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {canCharge(apt) && (
                                                <Link href={`/pos?cita=${apt.id}`} data-testid="charge-appointment"
                                                    className="min-h-11 px-4 rounded-xl bg-bos-accent text-bos-on-accent text-sm font-bold inline-flex items-center hover:brightness-105">Cobrar</Link>
                                            )}
                                            {actionsFor(apt.status).map((next) => (
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
                    {canManage && !onlyApt && (
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
                                className="w-full px-3 py-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => { setCancelTarget(null); setActionError(''); }} className={secondary}>Volver</button>
                            <button type="submit" disabled={busyId === cancelTarget.id} className="min-h-[52px] rounded-xl bg-bos-danger text-bos-bg text-[15px] font-bold disabled:opacity-50">Cancelar cita</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Registrar ausencia: bloquea la agenda del barbero y queda el registro de quién, cuándo y por qué */}
            {showOff && (
                <Modal title={offConflicts ? 'Ausencia registrada' : 'Registrar ausencia'} onClose={() => setShowOff(false)}>
                    {offConflicts ? (
                        <div className="space-y-4" data-testid="time-off-conflicts">
                            <p className="text-sm">El horario quedó bloqueado. Estas citas ya estaban agendadas en ese tiempo; avisa al cliente y reagéndalas o cancélalas:</p>
                            <ul className="space-y-2">
                                {offConflicts.map((c) => (
                                    <li key={c.id} className="rounded-xl border border-bos-border p-3 text-sm"><span className="font-semibold">{c.customer_name}</span> · {dateTimeOf(c.starts_at)}</li>
                                ))}
                            </ul>
                            <button type="button" onClick={() => setShowOff(false)} className={`${primary} w-full`}>Entendido</button>
                        </div>
                    ) : (
                        <form onSubmit={submitOff} className="space-y-4">
                            {offError && <p role="alert" className="rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{offError}</p>}
                            <div>
                                <label htmlFor="off-barber" className={fieldLabel}>Barbero</label>
                                <select id="off-barber" value={offForm.barber_id} onChange={(e) => setOffForm({ ...offForm, barber_id: e.target.value })} className={field}>
                                    <option value="">Elige al barbero</option>
                                    {activeBarbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="off-from-date" className={fieldLabel}>Desde</label>
                                    <input id="off-from-date" type="date" required value={offForm.from_date} onChange={(e) => setOffForm({ ...offForm, from_date: e.target.value, to_date: offForm.to_date < e.target.value ? e.target.value : offForm.to_date })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="off-from-time" className={fieldLabel}>Hora</label>
                                    <input id="off-from-time" type="time" required value={offForm.from_time} onChange={(e) => setOffForm({ ...offForm, from_time: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="off-to-date" className={fieldLabel}>Hasta</label>
                                    <input id="off-to-date" type="date" required value={offForm.to_date} onChange={(e) => setOffForm({ ...offForm, to_date: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="off-to-time" className={fieldLabel}>Hora</label>
                                    <input id="off-to-time" type="time" required value={offForm.to_time} onChange={(e) => setOffForm({ ...offForm, to_time: e.target.value })} className={field} />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="off-reason" className={fieldLabel}>Motivo</label>
                                <input id="off-reason" type="text" maxLength={300} placeholder="Ej. Cita médica" value={offForm.reason}
                                    onChange={(e) => setOffForm({ ...offForm, reason: e.target.value })} className={field} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="off-req-date" className={fieldLabel}>Cuándo avisó</label>
                                    <input id="off-req-date" type="date" required value={offForm.requested_date} onChange={(e) => setOffForm({ ...offForm, requested_date: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="off-req-time" className={fieldLabel}>Hora del aviso</label>
                                    <input id="off-req-time" type="time" required value={offForm.requested_time} onChange={(e) => setOffForm({ ...offForm, requested_time: e.target.value })} className={field} />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="off-via" className={fieldLabel}>Cómo avisó</label>
                                <select id="off-via" value={offForm.requested_via} onChange={(e) => setOffForm({ ...offForm, requested_via: e.target.value as RequestedVia })} className={field}>
                                    {REQUESTED_VIA.map((v) => <option key={v} value={v}>{VIA_LABELS[v]}</option>)}
                                </select>
                            </div>
                            <p className="text-sm text-bos-muted">Queda registrado quién lo anotó y a qué hora. No se borra: si cambia de planes, se cancela con su motivo.</p>
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button type="button" onClick={() => setShowOff(false)} className={secondary}>Cancelar</button>
                                <button type="submit" disabled={submitting} className={primary}>{submitting && <Loader2 className="h-5 w-5 animate-spin" />} Bloquear horario</button>
                            </div>
                        </form>
                    )}
                </Modal>
            )}

            {offCancel && (
                <Modal title="Cancelar ausencia" subtitle={`${offCancel.barber_name} · ${offCancel.reason}`} onClose={() => { setOffCancel(null); setActionError(''); }}>
                    <form onSubmit={confirmOffCancel} className="space-y-4">
                        <p className="text-sm text-bos-muted">El horario vuelve a quedar libre. La ausencia no se borra: queda como cancelada, con su motivo.</p>
                        {actionError && <p role="alert" className="rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{actionError}</p>}
                        <div>
                            <label htmlFor="off-cancel-reason" className={fieldLabel}>Motivo</label>
                            <input id="off-cancel-reason" type="text" maxLength={300} autoFocus placeholder="Ej. Sí va a venir" value={offCancelReason}
                                onChange={(e) => setOffCancelReason(e.target.value)} className={field} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => { setOffCancel(null); setActionError(''); }} className={secondary}>Volver</button>
                            <button type="submit" disabled={busyId === offCancel.id} className="min-h-[52px] rounded-xl bg-bos-danger text-bos-bg text-[15px] font-bold disabled:opacity-50">Cancelar ausencia</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
