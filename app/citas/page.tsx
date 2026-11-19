'use client';

import React, { Suspense, useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import type { Appointment, AppointmentStatus } from '@/types';
import { localDateKey } from '@/lib/appointments/appointments-view';
import { agendaHref, parseAgendaParams } from '@/lib/appointments/agenda-url';
import { overlapMinutes, type TimeOffView } from '@/lib/appointments/time-off';
import { formatHour, minutesToHHMM, workingWindow } from '@/lib/appointments/hours';
import { addDays, weekDays } from '@/lib/appointments/calendar-grid';
import { readJson, toUserMessage } from '@/lib/utils/errors';
import DayGrid from './_components/DayGrid';
import WeekAgenda from './_components/WeekAgenda';
import WeekGrid from './_components/WeekGrid';
import MonthGrid, { monthCells } from './_components/MonthGrid';
import AgendaSkeleton from './_components/AgendaSkeleton';
import AgendaToolbar, { type AgendaView } from './_components/AgendaToolbar';
import AppointmentForm, { type AppointmentFormInitial } from './_components/AppointmentForm';
import DayModal from './_components/DayModal';
import { ReasonModal, TimeOffFormModal, TimeOffList } from './_components/TimeOffModals';
import type { ClientValue } from './_components/ClientPicker';
import { useAgendaData, useNow } from './_components/useAgendaData';
import { useAgendaLinks } from './_components/useAgendaLinks';
import { BARBER_COLORS, MONTHS, NO_BARBER_COLOR, dayOf, longDayTitle, timeOf, weekRangeTitle } from './_components/agenda-ui';

const WIDE_QUERY = '(min-width: 1024px)';
const subscribeWide = (cb: () => void) => { const mq = window.matchMedia(WIDE_QUERY); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); };
/** Computadora (≥ 1024 px): la semana se dibuja como cuadrícula de siete columnas. */
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);

type FormState = { mode: 'create'; initial: AppointmentFormInitial } | { mode: 'reschedule'; appointment: Appointment };

// useSearchParams exige un límite Suspense para que la página se pueda compilar.
export default function AppointmentsPage() {
    return <Suspense fallback={<AgendaSkeleton view="day" />}><AgendaScreen /></Suspense>;
}

function AgendaScreen() {
    const wide = useWide();
    const router = useRouter();
    const toast = useToast();
    const search = useSearchParams();
    // Lo que trae la dirección al abrir la pantalla (?fecha, ?barbero, ?cita, ?cliente, ?nueva); se lee una sola vez.
    const [initial] = useState(() => parseAgendaParams((name) => search.get(name)));
    const [today] = useState(() => new Date());
    const now = useNow();
    const [cursor, setCursor] = useState(() => { const d = new Date(`${initial.fecha ?? localDateKey(today)}T12:00:00`); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [view, setView] = useState<AgendaView>('day');
    const [pickedBarber, setPickedBarber] = useState(initial.barbero ?? '');
    const [dayKey, setDayKey] = useState(() => initial.fecha ?? localDateKey(today));
    const [onlyApt, setOnlyApt] = useState<string | null>(null);
    const [openDay, setOpenDay] = useState<string | null>(null);
    // Barbero: la agenda es de solo lectura. Arranca en sus citas y puede ver las de toda la barbería.
    const [scope, setScope] = useState<'mine' | 'all'>('mine');
    const [formState, setFormState] = useState<FormState | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [actionError, setActionError] = useState('');
    const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
    const [offForm, setOffForm] = useState<{ barberId: string; date: string } | null>(null);
    const [offCancel, setOffCancel] = useState<TimeOffView | null>(null);

    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const todayKey = localDateKey(now);
    const data = useAgendaData(year, month);
    const { canManage, ownBarberId, schedule, refresh } = data;
    const readOnly = ownBarberId !== null;

    const activeBarbers = useMemo(() => data.barbers.filter((b) => b.status === 'active'), [data.barbers]);
    const colorOf = useCallback((id: string | null | undefined) => {
        const i = activeBarbers.findIndex((b) => b.id === id);
        return i < 0 ? NO_BARBER_COLOR : BARBER_COLORS[i % BARBER_COLORS.length];
    }, [activeBarbers]);
    // Un barbero ve por omisión solo lo suyo; "Toda la barbería" quita el filtro. Un ?barbero= desconocido se ignora.
    const knownPick = data.barbersState !== 'ok' || activeBarbers.some((b) => b.id === pickedBarber) ? pickedBarber : '';
    const barberFilter = readOnly ? (scope === 'mine' ? ownBarberId ?? '' : '') : knownPick;
    // El barbero no ve cobros: aunque la base no se los entregue, aquí tampoco se muestran.
    const visible = useMemo(() => {
        const rows = barberFilter ? data.appointments.filter((a) => a.barber?.id === barberFilter) : data.appointments;
        return readOnly ? rows.map((a) => ({ ...a, sale: null })) : rows;
    }, [data.appointments, barberFilter, readOnly]);
    const byDay = useMemo(() => {
        const map = new Map<string, Appointment[]>();
        for (const a of visible) { const key = dayOf(a.scheduled_at); map.set(key, [...(map.get(key) ?? []), a]); }
        return map;
    }, [visible]);

    // El día y el barbero se reflejan en la dirección (sin sumar pasos al historial) para poder compartirla.
    const syncUrl = useCallback((day: string, barber: string) => router.replace(agendaHref({ fecha: day, barbero: barber }), { scroll: false }), [router]);
    // Ir a un día: si cae en otro mes, se cargan las citas de ese mes.
    const goToDay = (key: string) => {
        setDayKey(key);
        const d = new Date(`${key}T12:00:00`);
        if (d.getFullYear() !== year || d.getMonth() !== month) setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
        syncUrl(key, knownPick);
    };
    const pickBarber = (id: string) => { setPickedBarber(id); syncUrl(dayKey, id); };
    const shiftDay = (delta: number) => goToDay(addDays(dayKey, delta));
    // Al pasar de Mes a Día o Semana se muestra el mes que se estaba viendo, no un día de otro mes sin citas cargadas.
    const changeView = (next: AgendaView) => {
        if (next !== 'month' && new Date(`${dayKey}T12:00:00`).getMonth() !== month) {
            goToDay(today.getMonth() === month && today.getFullYear() === year ? todayKey : localDateKey(new Date(year, month, 1)));
        }
        setView(next);
    };
    const shift = (delta: -1 | 1) => (view === 'day' ? shiftDay(delta) : view === 'week' ? shiftDay(delta * 7) : setCursor(new Date(year, month + delta, 1)));

    const openAppointment = (a: Appointment) => { setActionError(''); setOnlyApt(a.id); setOpenDay(dayOf(a.scheduled_at)); };
    const openForm = (date: string, time = '', barberId = '', client?: ClientValue) => { setActionError(''); setFormState({ mode: 'create', initial: { date, time, barberId, client } }); };

    useAgendaLinks({ initial, meLoaded: data.meLoaded, canManage, ownBarberId, visible, dayKey, router, openForm, openAppointment, goToDay,
        showAllBarbers: () => setScope('all'), showDayView: () => setView('day') });

    const changeStatus = async (apt: Appointment, status: AppointmentStatus, reason?: string): Promise<boolean> => {
        setActionError('');
        setBusyId(apt.id);
        try {
            await readJson(await fetch(`/api/appointments/${apt.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reason: reason ?? null }),
            }));
            await refresh();
            return true;
        } catch (err) {
            setActionError(toUserMessage(err, 'No se pudo actualizar la cita.'));
            return false;
        } finally { setBusyId(null); }
    };
    const confirmOffCancel = async (reason: string) => {
        if (!offCancel) return;
        setActionError('');
        setBusyId(offCancel.id);
        try {
            await readJson(await fetch(`/api/time-off/${offCancel.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) }));
            await refresh();
            setOffCancel(null);
        } catch (err) {
            setActionError(toUserMessage(err, 'No se pudo cancelar la ausencia.'));
        } finally { setBusyId(null); }
    };
    const onSaved = async (_saved: Appointment, date: string) => {
        const rescheduled = formState?.mode === 'reschedule';
        await refresh();
        setFormState(null);
        if (rescheduled) { setOpenDay(null); setOnlyApt(null); toast.success('Cita reprogramada.'); }
        if (view === 'month' && !rescheduled) setOpenDay(date);
        else if (date !== dayKey) goToDay(date);
    };

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
    const liveOff = data.timeOff.filter((t) => !t.cancelled);
    const dayOff = data.timeOff.filter((t) => overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), dayStart, dayEnd) && (!barberFilter || t.barber_id === barberFilter));
    const offOnDay = (key: string) => {
        const s = new Date(`${key}T00:00:00`); const e = new Date(s); e.setDate(e.getDate() + 1);
        return liveOff.filter((t) => overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), s, e) && (!barberFilter || t.barber_id === barberFilter));
    };
    const weekKeys = weekDays(dayKey);
    const rangeAppointments = view === 'week' ? weekKeys.reduce((n, k) => n + (byDay.get(k)?.length ?? 0), 0)
        : view === 'day' ? dayAppointments.length : monthCells(year, month).reduce<number>((n, d) => n + (d ? (byDay.get(localDateKey(new Date(year, month, d)))?.length ?? 0) : 0), 0);
    const emptyNote = view === 'day' ? 'No hay citas este día.' : view === 'week' ? 'No hay citas esta semana.' : 'No hay citas este mes.';
    const waiting = data.loading || !data.meLoaded || (view === 'day' && data.barbersState === 'loading');
    const dayAll = openDay ? (byDay.get(openDay) ?? []) : [];
    const dayList = onlyApt ? dayAll.filter((a) => a.id === onlyApt) : dayAll;
    const pickDay = (key: string) => { goToDay(key); setView('day'); };
    const nothingOpen = !formState && !cancelTarget && !offForm && !offCancel;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <AgendaToolbar view={view} isToday={dayKey === todayKey} canManage={canManage} readOnly={readOnly} scope={scope} barberFilter={barberFilter}
                title={view === 'day' ? longDayTitle(dayKey) : view === 'week' ? weekRangeTitle(weekKeys) : `${MONTHS[month]} ${year}`} titleKey={`${view}-${dayKey}-${month}`}
                hoursNote={view === 'day' && schedule && businessWindow !== undefined
                    ? (businessWindow === null ? 'El negocio cierra este día' : `Abierto de ${formatHour(minutesToHHMM(businessWindow.open))} a ${formatHour(minutesToHHMM(businessWindow.close))}`) : null}
                barbers={activeBarbers} colorOf={colorOf} onScope={setScope} onBarber={pickBarber} onShift={shift} onView={changeView}
                onToday={() => { goToDay(todayKey); setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); }}
                onNewAppointment={() => openForm(view === 'day' ? dayKey : todayKey, '', barberFilter)}
                onNewTimeOff={() => setOffForm({ barberId: barberFilter, date: view === 'day' ? dayKey : todayKey })} />

            {data.warning && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-bos-danger">{data.warning}</p>}

            <section aria-label={view === 'day' ? 'Agenda del día por barbero' : view === 'week' ? 'Agenda de la semana' : 'Calendario'}
                data-testid={view === 'day' ? 'day-view' : view === 'week' ? 'week-agenda' : undefined} className="overflow-clip rounded-2xl border border-bos-border bg-bos-surface shadow-sm">
                {waiting ? (
                    <AgendaSkeleton view={view} />
                ) : data.loadError ? (
                    <div data-testid="agenda-error" className="bos-fade p-4"><ErrorState title="No se pudo cargar la agenda" message={data.loadError} onRetry={data.retry} /></div>
                ) : (
                    <>
                        {rangeAppointments === 0 && (
                            <p data-testid="agenda-empty" className="flex items-center gap-3 border-b border-bos-border bg-bos-raised px-4 py-3 text-sm text-bos-muted">
                                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bos-surface text-bos-muted"><Calendar aria-hidden="true" className="h-4 w-4" /></span>
                                <span>{emptyNote}{canManage && view === 'day' ? ' Toca una hora libre para agendar.' : ''}</span>
                            </p>
                        )}
                        {view === 'day' && (data.barbersState === 'error' ? (
                            <p role="alert" className="p-10 text-center text-bos-danger">No se pudieron cargar los barberos. Recarga la página para intentar de nuevo.</p>
                        ) : columns.length === 0 ? (
                            <p className="p-10 text-center text-bos-muted">No hay barberos activos.</p>
                        ) : (
                            <DayGrid dayKey={dayKey} todayKey={todayKey} nowMinutes={now.getHours() * 60 + now.getMinutes()} appointments={dayAppointments} columns={columns}
                                colorOf={colorOf} schedule={schedule} timeOff={liveOff} canManage={canManage} defaultColumnId={ownBarberId}
                                onSlot={(time, barberId) => openForm(dayKey, time, barberId)} onOpenAppointment={openAppointment} />
                        ))}
                        {view === 'week' && (wide ? (
                            <WeekGrid key={weekKeys[0]} days={weekKeys} todayKey={todayKey} nowMinutes={now.getHours() * 60 + now.getMinutes()} byDay={byDay} schedule={schedule}
                                offOnDay={offOnDay} colorOf={colorOf} onPickDay={pickDay} onOpenAppointment={openAppointment} />
                        ) : (
                            <WeekAgenda key={weekKeys[0]} days={weekKeys} todayKey={todayKey} byDay={byDay} schedule={schedule} offOnDay={offOnDay} colorOf={colorOf}
                                onPickDay={pickDay} onOpenAppointment={openAppointment} />
                        ))}
                        {view === 'month' && (
                            <MonthGrid year={year} month={month} todayKey={todayKey} byDay={byDay} offOnDay={offOnDay} colorOf={colorOf}
                                onOpenDay={(key) => { setActionError(''); setOnlyApt(null); setOpenDay(key); }} />
                        )}
                    </>
                )}
            </section>

            {view === 'day' && dayOff.length > 0 && <TimeOffList items={dayOff} canManage={canManage} onCancel={(t) => { setActionError(''); setOffCancel(t); }} />}

            {openDay && nothingOpen && (
                <DayModal day={openDay} single={!!onlyApt} appointments={dayList} actionError={actionError} busyId={busyId} colorOf={colorOf}
                    canManage={canManage} canSeePhones={data.canSeePhones} showPrices={!readOnly}
                    onClose={() => { setOpenDay(null); setOnlyApt(null); }}
                    onStatus={(apt, status) => { void changeStatus(apt, status); }}
                    onCancel={(apt) => { setActionError(''); setCancelTarget(apt); }}
                    onReschedule={(apt) => { setActionError(''); setFormState({ mode: 'reschedule', appointment: apt }); }}
                    onNewHere={(day) => openForm(day)} />
            )}

            {formState && (
                <AppointmentForm key={formState.mode === 'reschedule' ? formState.appointment.id : 'new'} mode={formState.mode}
                    appointment={formState.mode === 'reschedule' ? formState.appointment : undefined}
                    initial={formState.mode === 'create' ? formState.initial : { date: dayKey }}
                    barbers={activeBarbers} services={data.services} servicesLoading={data.servicesLoading} schedule={schedule}
                    onClose={() => setFormState(null)} onSaved={onSaved} />
            )}

            {cancelTarget && (
                <ReasonModal id="cancel-reason" title="Cancelar cita" subtitle={`${cancelTarget.client_name} · ${timeOf(cancelTarget.scheduled_at)}`}
                    intro="La cita no se borra: queda registrada como cancelada, con su motivo." multiline placeholder="Ej. El cliente avisó que no puede venir"
                    confirmLabel="Cancelar cita" tooShort="Escribe el motivo de la cancelación." busy={busyId === cancelTarget.id} error={actionError}
                    onClose={() => { setCancelTarget(null); setActionError(''); }}
                    onSubmit={async (reason) => { if (await changeStatus(cancelTarget, 'cancelled', reason)) setCancelTarget(null); }} />
            )}

            {offForm && <TimeOffFormModal barbers={activeBarbers} initial={offForm} onClose={() => setOffForm(null)} onSaved={refresh} />}

            {offCancel && (
                <ReasonModal id="off-cancel-reason" title="Cancelar ausencia" subtitle={`${offCancel.barber_name} · ${offCancel.reason}`}
                    intro="El horario vuelve a quedar libre. La ausencia no se borra: queda como cancelada, con su motivo." placeholder="Ej. Sí va a venir"
                    confirmLabel="Cancelar ausencia" tooShort="Escribe por qué se cancela la ausencia." busy={busyId === offCancel.id} error={actionError}
                    onClose={() => { setOffCancel(null); setActionError(''); }} onSubmit={confirmOffCancel} />
            )}
        </div>
    );
}
