'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Ban, Calendar, ChevronLeft, ChevronRight, Clock, Loader2, Plus, Receipt, RotateCw, TriangleAlert } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { Appointment, AppointmentStatus, Barber, Client } from '@/types';
import {
    ACTION_LABELS, STATUS_LABELS, canCharge, isActive, loadRange, localDateKey, localDateTimeToIso, nextStatuses,
} from '@/lib/appointments/appointments-view';
import { REQUESTED_VIA, VIA_LABELS, overlapMinutes, type RequestedVia, type TimeOffView } from '@/lib/appointments/time-off';
import { formatHour, minutesToHHMM, workingWindow, type ScheduleData } from '@/lib/appointments/hours';
import {
    DEFAULT_DURATION, addDays, durationOptions, formatClock, nearestOption, reconcileTime, snapDuration, timeOptions, weekDays,
} from '@/lib/appointments/calendar-grid';
import DayGrid from './_components/DayGrid';
import WeekAgenda from './_components/WeekAgenda';
import WeekGrid from './_components/WeekGrid';
import AgendaSkeleton from './_components/AgendaSkeleton';
import { Avatar } from './_components/parts';
import { BARBER_COLORS, NO_BARBER_COLOR, STATUS_STYLE, SUBTLE_BG, longDayTitle, money, tintOf } from './_components/agenda-ui';
import DatePicker from '@/components/ui/DatePicker';
import TimePicker from '@/components/ui/TimePicker';

type View = 'day' | 'week' | 'month';

// En la agenda solo se usan estas acciones: confirmar, marcar que llegó y cancelar.
const UI_ACTIONS: AppointmentStatus[] = ['confirmed', 'checked_in', 'cancelled'];
const actionsFor = (status: AppointmentStatus) => nextStatuses(status).filter((s) => UI_ACTIONS.includes(s));
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const EMPTY_OFF = { barber_id: '', from_date: '', from_time: '08:00', to_date: '', to_time: '22:00', reason: '', requested_date: '', requested_time: '', requested_via: 'whatsapp' as RequestedVia };
const EMPTY_FORM = { client_id: '', customer_name: '', customer_phone: '', barber_id: '', date: '', time: '', duration: DEFAULT_DURATION, service_note: '' };

const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
const fieldLabel = 'block text-[13px] font-medium text-bos-muted mb-1.5';
const primary = 'min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent text-[15px] font-bold hover:brightness-105 disabled:opacity-50 inline-flex items-center justify-center gap-2';
const secondary = 'min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text text-[15px] font-semibold hover:bg-bos-raised inline-flex items-center justify-center gap-2';

const navBtn = 'inline-flex h-11 items-center justify-center text-sm font-medium text-bos-muted transition-colors hover:bg-bos-raised hover:text-bos-text motion-reduce:transition-none';
/** Duración legible de una cita: "30 min", "1 h", "1 h 30 min". */
function durationText(a: Appointment): string {
    const minutes = a.end_at ? Math.round((new Date(a.end_at).getTime() - new Date(a.scheduled_at).getTime()) / 60_000) : a.duration_minutes ?? 0;
    if (!minutes || minutes <= 0) return '';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}
const WIDE_QUERY = '(min-width: 1024px)';
const subscribeWide = (cb: () => void) => { const mq = window.matchMedia(WIDE_QUERY); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); };
/** Computadora (≥ 1024 px): la semana se dibuja como cuadrícula de siete columnas. */
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);

const timeOf = (iso: string) => { const d = new Date(iso); return formatClock(d.getHours() * 60 + d.getMinutes()); };
const dayOf = (iso: string) => localDateKey(new Date(iso));
const dateTimeOf = (iso: string) => new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const nowParts = () => { const d = new Date(); return { date: localDateKey(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }; };

async function readError(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    return body?.error || fallback;
}

export default function AppointmentsPage() {
    const wide = useWide();
    const [today] = useState(() => new Date());
    // El reloj avanza cada minuto: la línea de "ahora" y el día de hoy se mantienen al día.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
    const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
    const [view, setView] = useState<View>('day');
    const [pickedBarber, setPickedBarber] = useState('');
    const [dayKey, setDayKey] = useState(() => localDateKey(today));
    const [onlyApt, setOnlyApt] = useState<string | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    // loadError: no se pudieron cargar las citas (la agenda no se puede dibujar). warning: falló algo secundario (ausencias).
    const [loadError, setLoadError] = useState('');
    const [warning, setWarning] = useState('');
    const [barbersState, setBarbersState] = useState<'loading' | 'ok' | 'error'>('loading');
    const [canManage, setCanManage] = useState(false);
    // Barbero: la agenda es de solo lectura. Arranca en sus citas y puede ver las de toda la barbería.
    const [meLoaded, setMeLoaded] = useState(false);
    const [ownBarberId, setOwnBarberId] = useState<string | null>(null);
    const [scope, setScope] = useState<'mine' | 'all'>('mine');
    const readOnly = ownBarberId !== null;
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
    const todayKey = localDateKey(now);

    const fetchAppointments = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        setWarning('');
        try {
            const { from, to } = loadRange(year, month);
            const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            const [res, offRes] = await Promise.all([
                fetch(`/api/appointments?${range}`, { cache: 'no-store' }),
                fetch(`/api/time-off?${range}`, { cache: 'no-store' }),
            ]);
            if (!res.ok) throw new Error(await readError(res, 'No se pudieron cargar las citas.'));
            setAppointments(await res.json());
            // Las ausencias no deben impedir ver la agenda: si fallan, se avisa pero las citas se muestran.
            if (offRes.ok) setTimeOff(await offRes.json());
            else setWarning(await readError(offRes, 'No se pudieron cargar las ausencias.'));
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar las citas.');
        } finally { setLoading(false); }
    }, [year, month]);

    useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

    useEffect(() => {
        fetch('/api/barbers').then(r => r.json()).then(d => { if (Array.isArray(d)) { setBarbers(d); setBarbersState('ok'); } else setBarbersState('error'); }).catch(() => setBarbersState('error'));
        fetch('/api/schedule', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (d) setSchedule(d); }).catch(() => {});
        fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.json())
            .then(me => {
                const manage = me?.user?.role === 'admin' || me?.user?.role === 'recepcion';
                setCanManage(manage);
                // La lista de clientes solo sirve para agendar: el barbero no agenda.
                if (manage) fetch('/api/clients').then(r => r.json()).then(d => { if (Array.isArray(d)) setClients(d); }).catch(() => {});
                if (me?.user?.role === 'barber' && me.user.employeeId) setOwnBarberId(me.user.employeeId);
                // El botón "Nueva Cita" del encabezado llega con ?nueva=1 para abrir el formulario.
                if (manage && new URLSearchParams(window.location.search).get('nueva') === '1') {
                    setForm({ ...EMPTY_FORM, date: localDateKey(new Date()) });
                    setShowForm(true);
                    window.history.replaceState(null, '', '/citas');
                }
            }).catch(() => {}).finally(() => setMeLoaded(true));
    }, []);

    const activeBarbers = useMemo(() => barbers.filter((b) => b.status === 'active'), [barbers]);
    const colorOf = useCallback((id: string | null | undefined) => {
        const i = activeBarbers.findIndex((b) => b.id === id);
        return i < 0 ? NO_BARBER_COLOR : BARBER_COLORS[i % BARBER_COLORS.length];
    }, [activeBarbers]);
    // Un barbero ve por omisión solo lo suyo; "Toda la barbería" quita el filtro.
    const barberFilter = readOnly ? (scope === 'mine' ? ownBarberId ?? '' : '') : pickedBarber;
    const setBarberFilter = setPickedBarber;
    // El barbero no ve cobros: aunque la base no se los entregue, aquí tampoco se muestran.
    const visible = useMemo(() => {
        const rows = barberFilter ? appointments.filter((a) => a.barber?.id === barberFilter) : appointments;
        return readOnly ? rows.map((a) => ({ ...a, sale: null })) : rows;
    }, [appointments, barberFilter, readOnly]);

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
    const shiftDay = (delta: number) => goToDay(addDays(dayKey, delta));
    // Al pasar de Mes a Día o Semana se muestra el mes que se estaba viendo, no un día de otro mes sin citas cargadas.
    const changeView = (next: View) => {
        if (next !== 'month' && new Date(`${dayKey}T12:00:00`).getMonth() !== month) {
            goToDay(today.getMonth() === month && today.getFullYear() === year ? todayKey : localDateKey(new Date(year, month, 1)));
        }
        setView(next);
    };

    // Horas disponibles del formulario: de 30 en 30 dentro del horario del día (y del barbero, si lo hay).
    const windowFor = (date: string, barberId: string) => (schedule && date ? workingWindow(schedule, date, barberId || null) : undefined);
    const formWindow = windowFor(form.date, form.barber_id);
    const formTimes = timeOptions(formWindow, form.duration);
    const formDurations = durationOptions(form.duration);
    const formClosed = formWindow === null;
    // Cada cambio revisa que la hora elegida siga cabiendo (otro día, otro barbero o una duración más larga).
    const updateForm = (patch: Partial<typeof EMPTY_FORM>) => setForm((prev) => {
        const next = { ...prev, ...patch };
        return { ...next, time: reconcileTime(next.time, timeOptions(windowFor(next.date, next.barber_id), next.duration)) };
    });

    const openForm = (date: string, time = '', barberId = '') => {
        // Tocar 12:00 en un día que abre a las 12:30 agenda a las 12:30.
        setForm({ ...EMPTY_FORM, date, time: time ? nearestOption(time, timeOptions(windowFor(date, barberId), DEFAULT_DURATION)) : '', barber_id: barberId });
        setFormError('');
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!form.date || !form.time) { setFormError(formClosed ? 'El negocio cierra ese día. Elige otra fecha.' : 'Elige la fecha y la hora.'); return; }
        if (!formTimes.some((o) => o.value === form.time)) { setFormError('Elige una hora disponible dentro del horario.'); return; }
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
                    duration_minutes: snapDuration(form.duration),
                    service_note: form.service_note.trim() || null,
                }),
            });
            if (!res.ok) throw new Error(await readError(res, 'No se pudo guardar la cita.'));
            await fetchAppointments();
            setShowForm(false);
            if (view === 'month') setOpenDay(form.date);
            else if (form.date !== dayKey) goToDay(form.date);
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
    // Horario del día: el del negocio (o el más amplio de los barberos si no hay del negocio).
    const businessWindow = schedule ? workingWindow(schedule, dayKey) : undefined;
    const dayStart = new Date(`${dayKey}T00:00:00`);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const liveOff = timeOff.filter((t) => !t.cancelled);
    const dayOff = timeOff.filter((t) => overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), dayStart, dayEnd)
        && (!barberFilter || t.barber_id === barberFilter));
    const offOnDay = (key: string) => {
        const s = new Date(`${key}T00:00:00`); const e = new Date(s); e.setDate(e.getDate() + 1);
        return liveOff.filter((t) => overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), s, e) && (!barberFilter || t.barber_id === barberFilter));
    };
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const weekKeys = weekDays(dayKey);
    const weekTitle = () => {
        const first = new Date(`${weekKeys[0]}T12:00:00`);
        const last = new Date(`${weekKeys[6]}T12:00:00`);
        const lastText = last.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
        return first.getMonth() === last.getMonth() ? `${first.getDate()} – ${lastText}` : `${first.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })} – ${lastText}`;
    };
    const openAppointment = (a: Appointment) => { setActionError(''); setOnlyApt(a.id); setOpenDay(dayOf(a.scheduled_at)); };
    const rangeAppointments = view === 'week' ? weekKeys.reduce((n, k) => n + (byDay.get(k)?.length ?? 0), 0)
        : view === 'day' ? dayAppointments.length : cells.reduce<number>((n, d) => n + (d ? (byDay.get(localDateKey(new Date(year, month, d)))?.length ?? 0) : 0), 0);
    const emptyNote = view === 'day' ? 'No hay citas este día.' : view === 'week' ? 'No hay citas esta semana.' : 'No hay citas este mes.';
    const waiting = loading || !meLoaded || (view === 'day' && barbersState === 'loading');

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-3 lg:flex-nowrap">
                <div className="order-1 min-w-[200px] flex-1 basis-0">
                    <p className="flex items-center gap-2 text-xs font-semibold text-bos-accent-text">Agenda
                        {view === 'day' && dayKey === todayKey && <span className="rounded-full bg-bos-accent-soft px-2 py-0.5 text-xs font-semibold text-bos-accent-text">Hoy</span>}
                    </p>
                    <h1 data-testid="calendar-label" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-xl font-semibold leading-tight tracking-tight sm:text-3xl">
                        <span key={`${view}-${dayKey}-${month}`} className="bos-fade">{view === 'day' ? longDayTitle(dayKey) : view === 'week' ? weekTitle() : `${MONTHS[month]} ${year}`}</span>
                    </h1>
                    {view === 'day' && schedule && businessWindow !== undefined && (
                        <p className="mt-0.5 text-sm text-bos-muted" data-testid="day-hours">
                            {businessWindow === null ? 'El negocio cierra este día' : `Abierto de ${formatHour(minutesToHHMM(businessWindow.open))} a ${formatHour(minutesToHHMM(businessWindow.close))}`}
                        </p>
                    )}
                </div>
                <div className="order-3 flex shrink-0 items-center rounded-xl border border-bos-border bg-bos-surface">
                    <button type="button" aria-label={view === 'day' ? 'Día anterior' : view === 'week' ? 'Semana anterior' : 'Mes anterior'}
                        onClick={() => (view === 'day' ? shiftDay(-1) : view === 'week' ? shiftDay(-7) : setCursor(new Date(year, month - 1, 1)))}
                        className={`${navBtn} w-10 rounded-l-xl sm:w-11`}><ChevronLeft className="h-5 w-5" /></button>
                    <button type="button" onClick={() => { goToDay(todayKey); setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); }}
                        className={`${navBtn} border-x border-bos-border px-3.5 font-semibold text-bos-text`}>Hoy</button>
                    <button type="button" aria-label={view === 'day' ? 'Día siguiente' : view === 'week' ? 'Semana siguiente' : 'Mes siguiente'}
                        onClick={() => (view === 'day' ? shiftDay(1) : view === 'week' ? shiftDay(7) : setCursor(new Date(year, month + 1, 1)))}
                        className={`${navBtn} w-10 rounded-r-xl sm:w-11`}><ChevronRight className="h-5 w-5" /></button>
                </div>
                <div role="group" aria-label="Vista" className="order-4 flex min-w-[190px] flex-1 basis-0 rounded-xl bg-bos-raised p-1 lg:order-2 lg:flex-none lg:basis-auto">
                    {([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']] as const).map(([id, text]) => (
                        <button key={id} type="button" aria-pressed={view === id} onClick={() => changeView(id)}
                            className={`h-9 flex-1 rounded-lg px-2 text-sm lg:px-4 font-medium transition-colors motion-reduce:transition-none lg:flex-none ${view === id ? 'bg-bos-surface font-semibold text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>{text}</button>
                    ))}
                </div>
                {canManage && (
                    <div className="order-2 flex gap-2 lg:order-5">
                        <button type="button" aria-label="Ausencia" onClick={() => openOff(barberFilter, view === 'day' ? dayKey : todayKey)} className={`${secondary} !min-h-11 !px-0 w-11 sm:!px-4 sm:w-auto`}><Ban className="h-5 w-5" /> <span className="hidden sm:inline">Ausencia</span></button>
                        <button type="button" aria-label="Nueva cita" onClick={() => openForm(view === 'day' ? dayKey : todayKey, '', barberFilter)} className={`${primary} !min-h-11 !px-0 w-11 sm:!px-4 sm:w-auto`}><Plus className="h-5 w-5" /> <span className="hidden sm:inline">Nueva cita</span></button>
                    </div>
                )}
            </header>

            {/* Barbero: agenda de solo lectura, con su calendario por omisión y el de toda la barbería. */}
            {readOnly && (
                <div className="space-y-2">
                    <div role="group" aria-label="Qué agenda ver" data-testid="agenda-scope" className="grid grid-cols-2 gap-1 rounded-xl bg-bos-raised p-1 sm:inline-grid sm:grid-cols-[auto_auto]">
                        {([['mine', 'Mis citas'], ['all', 'Toda la barbería']] as const).map(([id, text]) => (
                            <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)}
                                className={`min-h-11 rounded-lg px-4 text-[15px] font-semibold transition-colors motion-reduce:transition-none ${scope === id ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>{text}</button>
                        ))}
                    </div>
                    <p className="text-sm text-bos-muted">Solo lectura. Para agendar o cambiar una cita, habla con recepción.</p>
                </div>
            )}

            {/* En celular la vista por día ya trae su propio selector de barbero dentro de la cuadrícula. */}
            <div role="group" aria-label="Barbero" className={`${readOnly ? 'hidden' : view === 'day' ? 'hidden md:flex' : 'flex'} gap-2 overflow-x-auto md:flex-wrap md:overflow-visible`}>
                {[{ id: '', name: 'Todos' }, ...activeBarbers].map((b) => (
                    <button key={b.id || 'all'} type="button" aria-pressed={barberFilter === b.id} onClick={() => setBarberFilter(b.id)}
                        className={`inline-flex h-10 max-w-full shrink-0 items-center gap-2 rounded-full border text-sm font-medium transition-colors motion-reduce:transition-none ${b.id ? 'pl-1.5 pr-3.5' : 'px-4'} ${barberFilter === b.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:bg-bos-raised hover:text-bos-text'}`}>
                        {b.id && <Avatar name={b.name} color={colorOf(b.id)} size={28} />}
                        <span className="truncate">{b.name}</span>
                    </button>
                ))}
            </div>

            {warning && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-bos-danger">{warning}</p>}

            <section aria-label={view === 'day' ? 'Agenda del día por barbero' : view === 'week' ? 'Agenda de la semana' : 'Calendario'}
                data-testid={view === 'day' ? 'day-view' : view === 'week' ? 'week-agenda' : undefined} className="overflow-clip rounded-2xl border border-bos-border bg-bos-surface shadow-sm">
                {waiting ? (
                    <AgendaSkeleton view={view} />
                ) : loadError ? (
                    <div role="alert" data-testid="agenda-error" className="bos-fade flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
                        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-bos-danger-soft text-bos-danger"><TriangleAlert aria-hidden="true" className="h-6 w-6" /></span>
                        <p className="font-semibold text-bos-danger">No se pudo cargar la agenda.</p>
                        <p className="max-w-md text-sm text-bos-muted">{loadError}</p>
                        <button type="button" onClick={() => fetchAppointments()} className={secondary}><RotateCw className="h-5 w-5" /> Reintentar</button>
                    </div>
                ) : (
                    <>
                        {rangeAppointments === 0 && (
                            <p data-testid="agenda-empty" className="flex items-center gap-3 border-b border-bos-border bg-bos-raised px-4 py-3 text-sm text-bos-muted">
                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bos-surface text-bos-muted"><Calendar aria-hidden="true" className="h-4 w-4" /></span>
                                <span>{emptyNote}{canManage && view === 'day' ? ' Toca una hora libre para agendar.' : ''}</span>
                            </p>
                        )}
                        {view === 'day' && (barbersState === 'error' ? (
                            <p role="alert" className="p-10 text-center text-bos-danger">No se pudieron cargar los barberos. Recarga la página para intentar de nuevo.</p>
                        ) : columns.length === 0 ? (
                            <p className="p-10 text-center text-bos-muted">No hay barberos activos.</p>
                        ) : (
                            <DayGrid dayKey={dayKey} todayKey={todayKey} nowMinutes={nowMinutes} appointments={dayAppointments} columns={columns}
                                colorOf={colorOf} schedule={schedule} timeOff={liveOff} canManage={canManage} defaultColumnId={ownBarberId}
                                onSlot={(time, barberId) => openForm(dayKey, time, barberId)} onOpenAppointment={openAppointment} />
                        ))}
                        {view === 'week' && (wide ? (
                            <WeekGrid key={weekKeys[0]} days={weekKeys} todayKey={todayKey} nowMinutes={nowMinutes} byDay={byDay} schedule={schedule} offOnDay={offOnDay} colorOf={colorOf}
                                onPickDay={(key) => { goToDay(key); setView('day'); }} onOpenAppointment={openAppointment} />
                        ) : (
                            <WeekAgenda key={weekKeys[0]} days={weekKeys} todayKey={todayKey} byDay={byDay} schedule={schedule} offOnDay={offOnDay} colorOf={colorOf}
                                onPickDay={(key) => { goToDay(key); setView('day'); }} onOpenAppointment={openAppointment} />
                        ))}
                        {view === 'month' && (
                            <div key={`${year}-${month}`} aria-label="Calendario del mes" className="bos-fade">
                                <div className="grid grid-cols-7 border-b border-bos-border bg-bos-bg">
                                    {WEEK.map((d) => <div key={d} className="py-3 text-center text-xs font-semibold text-bos-muted"><span className="sm:hidden">{d.slice(0, 1)}</span><span className="hidden sm:inline">{d}</span></div>)}
                                </div>
                                <div className="grid grid-cols-7">
                                    {cells.map((d, i) => {
                                        if (d === null) return <div key={`e${i}`} className="min-h-[72px] border-b border-r border-bos-border md:min-h-36" style={{ background: SUBTLE_BG }} />;
                                        const key = localDateKey(new Date(year, month, d));
                                        const list = [...(byDay.get(key) ?? [])].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
                                        const active = list.filter((a) => isActive(a.status));
                                        const barberDots = [...new Set(active.map((a) => a.barber?.id ?? ''))].slice(0, 4);
                                        const isToday = key === todayKey;
                                        const off = offOnDay(key);
                                        return (
                                            <button key={key} type="button" data-testid={`day-${key}`} onClick={() => { setActionError(''); setOnlyApt(null); setOpenDay(key); }}
                                                aria-label={`${dayTitle(key)}: ${active.length === 0 ? 'sin citas' : `${active.length} cita${active.length === 1 ? '' : 's'}`}`}
                                                className={`flex min-h-[72px] min-w-0 flex-col items-center gap-1.5 border-b border-r border-bos-border p-1.5 text-left align-top transition-colors hover:bg-bos-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bos-accent motion-reduce:transition-none md:min-h-36 md:items-stretch md:p-2.5 ${isToday ? 'bg-bos-accent-soft' : ''}`}>
                                                <span className="flex items-center md:block">
                                                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${isToday ? 'bg-bos-accent text-bos-on-accent' : 'text-bos-text'}`}>{d}</span>
                                                    {off.length > 0 && (
                                                        <span className="ml-1 hidden text-xs text-bos-muted md:inline">· {off.map((t) => t.barber_name).join(', ')} no viene</span>
                                                    )}
                                                </span>
                                                <span className="hidden min-w-0 flex-col gap-1 md:flex">
                                                    {list.slice(0, 3).map((a) => {
                                                        const color = a.barber ? colorOf(a.barber.id) : NO_BARBER_COLOR;
                                                        const live = isActive(a.status) && a.status !== 'no_show';
                                                        return (
                                                            <span key={a.id} style={{ borderLeftColor: color, ...(live ? { background: tintOf(color) } : {}) }}
                                                                className={`flex items-center gap-1.5 truncate rounded-md border-l-[3px] px-1.5 py-0.5 text-xs leading-4 ${live ? 'text-bos-text' : 'bg-bos-raised text-bos-muted'} ${isActive(a.status) ? '' : 'line-through'}`}>
                                                                <span className="shrink-0 font-semibold tabular-nums">{timeOf(a.scheduled_at)}</span>
                                                                <span className="truncate">{a.client_name}</span>
                                                            </span>
                                                        );
                                                    })}
                                                    {list.length > 3 && <span className="px-1.5 text-xs font-medium text-bos-muted">+{list.length - 3} más</span>}
                                                </span>
                                                {active.length > 0 && (
                                                    <span className="flex items-center gap-1 md:hidden">
                                                        {barberDots.map((id) => <span key={id || 'none'} aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: id ? colorOf(id) : NO_BARBER_COLOR }} />)}
                                                        <span className="text-xs font-semibold tabular-nums text-bos-text">{active.length}</span>
                                                    </span>
                                                )}
                                                {off.length > 0 && <Ban aria-hidden="true" className="h-3 w-3 text-bos-muted md:hidden" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </section>

            {view === 'day' && dayOff.length > 0 && (
                <section aria-label="Ausencias del día" data-testid="time-off-list" className="rounded-xl border border-bos-border bg-bos-surface p-4">
                    <h2 className="text-[15px] font-semibold">Ausencias</h2>
                    <ul className="mt-3 divide-y divide-bos-border">
                        {dayOff.map((t) => (
                            <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 text-sm">
                                    <p className={`font-semibold ${t.cancelled ? 'line-through text-bos-muted' : ''}`}>{t.barber_name} · {t.reason}</p>
                                    <p className="text-bos-muted">De {dateTimeOf(t.starts_at)} a {dateTimeOf(t.ends_at)}</p>
                                    <p className="text-bos-muted">Avisó {dateTimeOf(t.requested_at)} por {VIA_LABELS[t.requested_via]} · Registró {t.created_by_name} el {dateTimeOf(t.created_at)}</p>
                                    {t.cancelled && <p className="text-bos-muted">Cancelada por {t.cancelled.by_name} el {dateTimeOf(t.cancelled.at)}: {t.cancelled.reason}</p>}
                                </div>
                                {canManage && !t.cancelled && (
                                    <button type="button" onClick={() => { setActionError(''); setOffCancelReason(''); setOffCancel(t); }}
                                        className="min-h-11 rounded-xl border border-bos-border px-4 text-sm font-semibold text-bos-danger hover:bg-bos-raised">Cancelar ausencia</button>
                                )}
                            </li>
                        ))}
                    </ul>
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
                                <li key={apt.id} data-testid="appointment" className="bos-fade overflow-hidden rounded-2xl border border-bos-border bg-bos-surface">
                                    <div className="flex">
                                        <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background: apt.barber ? colorOf(apt.barber.id) : NO_BARBER_COLOR }} />
                                        <div className="min-w-0 flex-1 p-4 sm:p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className={`min-w-0 text-lg font-semibold leading-snug ${isActive(apt.status) ? '' : 'text-bos-muted line-through'}`}>{apt.client_name}</p>
                                                <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[apt.status]}`}>{STATUS_LABELS[apt.status]}</span>
                                                    {apt.walk_in && <span className="rounded-full border border-dashed border-bos-control px-2.5 py-0.5 text-xs font-semibold">Sin cita</span>}
                                                </span>
                                            </div>
                                            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold tabular-nums">
                                                <Clock aria-hidden="true" className="h-4 w-4 text-bos-muted" />
                                                {timeOf(apt.scheduled_at)}{apt.end_at ? ` – ${timeOf(apt.end_at)}` : ''}
                                                {durationText(apt) && <span className="rounded-md bg-bos-raised px-1.5 py-0.5 text-xs font-medium text-bos-muted">{durationText(apt)}</span>}
                                            </p>
                                            <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
                                                <div>
                                                    <dt className="text-xs font-medium text-bos-muted">Barbero</dt>
                                                    <dd className="mt-1 flex items-center gap-2 font-medium">
                                                        {apt.barber ? <><Avatar name={apt.barber.name} color={colorOf(apt.barber.id)} size={24} /> {apt.barber.name}</> : 'Sin barbero asignado'}
                                                    </dd>
                                                </div>
                                                {canManage && apt.customer_phone && (
                                                    <div>
                                                        <dt className="text-xs font-medium text-bos-muted">Teléfono</dt>
                                                        <dd className="mt-1 font-medium tabular-nums">{apt.customer_phone}</dd>
                                                    </div>
                                                )}
                                                {apt.notes && (
                                                    <div className="sm:col-span-2">
                                                        <dt className="text-xs font-medium text-bos-muted">Servicio o nota</dt>
                                                        <dd className="mt-1 whitespace-pre-line">{apt.notes}</dd>
                                                    </div>
                                                )}
                                            </dl>
                                            {apt.sale && (
                                                <Link href={`/ticket/${apt.sale.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-bos-success hover:underline">
                                                    <Receipt aria-hidden="true" className="h-4 w-4" /> Cobrada · {money(apt.sale.total)} · Ver ticket
                                                </Link>
                                            )}
                                            {canManage && (actionsFor(apt.status).length > 0 || canCharge(apt)) && (
                                                <div className="mt-4 flex flex-wrap gap-2 border-t border-bos-border pt-4">
                                                    {canCharge(apt) && (
                                                        <Link href={`/pos?cita=${apt.id}`} data-testid="charge-appointment"
                                                            className="inline-flex min-h-11 items-center rounded-xl bg-bos-accent px-4 text-sm font-bold text-bos-on-accent hover:brightness-105">Cobrar</Link>
                                                    )}
                                                    {actionsFor(apt.status).map((next) => (
                                                        <button key={next} type="button" disabled={busyId === apt.id}
                                                            onClick={() => { if (next === 'cancelled') { setActionError(''); setCancelReason(''); setCancelTarget(apt); } else changeStatus(apt, next); }}
                                                            className={`min-h-11 rounded-xl border px-4 text-sm font-semibold hover:bg-bos-raised disabled:opacity-50 ${next === 'cancelled' ? 'border-bos-border text-bos-danger' : 'border-bos-border text-bos-text'}`}>
                                                            {ACTION_LABELS[next]}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
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
                                <DatePicker id="apt-date" required value={form.date} onChange={(v) => updateForm({ date: v })} className={field} />
                            </div>
                            <div>
                                <label htmlFor="apt-time" className={fieldLabel}>Hora</label>
                                <TimePicker id="apt-time" required value={form.time} disabled={formClosed} options={formTimes}
                                    placeholder={formClosed ? 'Cerrado' : 'Elige la hora'} onChange={(v) => updateForm({ time: v })} className={field} />
                            </div>
                        </div>
                        {formClosed && <p role="status" className="-mt-1 text-sm text-bos-danger">El negocio cierra ese día (o el barbero no trabaja). Elige otra fecha.</p>}
                        <div>
                            <label htmlFor="apt-barber" className={fieldLabel}>Barbero</label>
                            <select id="apt-barber" value={form.barber_id} onChange={(e) => updateForm({ barber_id: e.target.value })} className={field}>
                                <option value="">Sin barbero asignado</option>
                                {barbers.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="apt-duration" className={fieldLabel}>Duración</label>
                            <select id="apt-duration" value={form.duration} onChange={(e) => updateForm({ duration: Number(e.target.value) })} className={field}>
                                {formDurations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                                    <DatePicker id="off-from-date" required value={offForm.from_date} onChange={(v) => setOffForm({ ...offForm, from_date: v, to_date: offForm.to_date < v ? v : offForm.to_date })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="off-from-time" className={fieldLabel}>Hora</label>
                                    <TimePicker id="off-from-time" required step={30} value={offForm.from_time} onChange={(v) => setOffForm({ ...offForm, from_time: v })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="off-to-date" className={fieldLabel}>Hasta</label>
                                    <DatePicker id="off-to-date" required value={offForm.to_date} onChange={(v) => setOffForm({ ...offForm, to_date: v })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="off-to-time" className={fieldLabel}>Hora</label>
                                    <TimePicker id="off-to-time" required step={30} value={offForm.to_time} onChange={(v) => setOffForm({ ...offForm, to_time: v })} className={field} />
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
                                    <DatePicker id="off-req-date" required value={offForm.requested_date} onChange={(v) => setOffForm({ ...offForm, requested_date: v })} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="off-req-time" className={fieldLabel}>Hora del aviso</label>
                                    <TimePicker id="off-req-time" required step={30} value={offForm.requested_time} onChange={(v) => setOffForm({ ...offForm, requested_time: v })} className={field} />
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
