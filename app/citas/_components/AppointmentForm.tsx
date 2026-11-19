'use client';

import React, { useMemo, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import DatePicker from '@/components/ui/DatePicker';
import TimePicker from '@/components/ui/TimePicker';
import type { Appointment, Barber } from '@/types';
import { localDateKey, localDateTimeToIso } from '@/lib/appointments/appointments-view';
import { DEFAULT_DURATION, durationOptions, formatClock, nearestOption, reconcileTime, timeOptions } from '@/lib/appointments/calendar-grid';
import { workingWindow, type ScheduleData } from '@/lib/appointments/hours';
import { roundToSlot, saveErrorMessage, summarizeServices, type ServiceOption } from '@/lib/appointments/booking';
import { readJson } from '@/lib/utils/errors';
import ClientPicker, { NO_CLIENT, type ClientValue } from './ClientPicker';
import ServicePicker from './ServicePicker';

export interface AppointmentFormInitial {
    date: string;
    time?: string;
    barberId?: string;
    client?: ClientValue;
}

interface AppointmentFormProps {
    /** `create` agenda una cita nueva; `reschedule` mueve una cita abierta (fecha, hora, barbero y servicios). */
    mode: 'create' | 'reschedule';
    /** La cita que se reprograma (solo en `reschedule`). */
    appointment?: Appointment;
    initial: AppointmentFormInitial;
    barbers: Barber[];
    services: ServiceOption[];
    servicesLoading?: boolean;
    schedule: ScheduleData | null;
    onClose: () => void;
    /** Se llama con la cita ya guardada, antes de cerrar la ventana. */
    onSaved: (appointment: Appointment, date: string) => void | Promise<void>;
}

interface FormState {
    date: string; time: string; barberId: string; duration: number; serviceIds: string[]; client: ClientValue; note: string;
}

const hhmmOf = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `cita-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

export default function AppointmentForm({ mode, appointment, initial, barbers, services, servicesLoading, schedule, onClose, onSaved }: AppointmentFormProps) {
    const reschedule = mode === 'reschedule' && appointment;
    const originalDate = reschedule ? localDateKey(new Date(appointment.scheduled_at)) : '';
    const originalTime = reschedule ? hhmmOf(appointment.scheduled_at) : '';
    // Una misma llave por formulario: si se toca "Guardar" dos veces, la base crea una sola cita.
    const idempotencyKey = useRef<string>(newKey());
    const windowFor = (date: string, barberId: string) => (schedule && date ? workingWindow(schedule, date, barberId || null) : undefined);
    const catalog = useMemo(() => new Set(services.map((s) => s.id)), [services]);

    const [form, setForm] = useState<FormState>(() => {
        if (reschedule) {
            return {
                date: originalDate, time: originalTime, barberId: appointment.barber?.id ?? '', serviceIds: appointment.services.map((s) => s.service_id),
                duration: roundToSlot(appointment.duration_minutes ?? DEFAULT_DURATION), client: NO_CLIENT, note: '',
            };
        }
        const barberId = initial.barberId ?? '';
        return {
            date: initial.date,
            // Tocar 12:00 en un día que abre a las 12:30 agenda a las 12:30.
            time: initial.time ? nearestOption(initial.time, timeOptions(windowFor(initial.date, barberId), DEFAULT_DURATION)) : '',
            barberId, duration: DEFAULT_DURATION, serviceIds: [], client: initial.client ?? NO_CLIENT, note: '',
        };
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Servicios que siguen activos en el catálogo (uno dado de baja desde que se agendó no se reenvía).
    const serviceIds = catalog.size > 0 ? form.serviceIds.filter((id) => catalog.has(id)) : form.serviceIds;
    const summary = summarizeServices(services.filter((s) => serviceIds.includes(s.id)));
    const duration = summary.count > 0 ? summary.minutes : form.duration;
    const legacyTime = reschedule && form.date === originalDate ? originalTime : undefined;
    const optionsFor = (date: string, barberId: string, minutes: number) => timeOptions(windowFor(date, barberId), minutes, date === originalDate ? legacyTime : undefined);
    const times = optionsFor(form.date, form.barberId, duration);
    const closed = windowFor(form.date, form.barberId) === null;

    // Cada cambio revisa que la hora elegida siga cabiendo (otro día, otro barbero o una duración más larga).
    const update = (patch: Partial<FormState>) => setForm((prev) => {
        const next = { ...prev, ...patch };
        const ids = catalog.size > 0 ? next.serviceIds.filter((id) => catalog.has(id)) : next.serviceIds;
        const minutes = ids.length > 0 ? summarizeServices(services.filter((s) => ids.includes(s.id))).minutes : next.duration;
        return { ...next, time: reconcileTime(next.time, timeOptions(windowFor(next.date, next.barberId), minutes, next.date === originalDate && reschedule ? originalTime : undefined)) };
    });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setError('');
        if (!form.date || !form.time) { setError(closed ? 'El negocio cierra ese día. Elige otra fecha.' : 'Elige la fecha y la hora.'); return; }
        if (!times.some((o) => o.value === form.time)) { setError('Elige una hora disponible dentro del horario.'); return; }
        const client = form.client;
        if (!reschedule && client.kind === 'none') { setError('Busca un cliente, elige "Cliente sin registrar" o crea uno nuevo.'); return; }
        if (!reschedule && client.kind === 'free' && client.name.trim().length < 2) { setError('Escribe el nombre de quien reserva.'); return; }
        setSubmitting(true);
        try {
            const scheduledAt = localDateTimeToIso(form.date, form.time);
            let saved: Appointment;
            if (reschedule) {
                const moved = form.date !== originalDate || form.time !== originalTime;
                const res = await fetch(`/api/appointments/${appointment.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        // Solo se manda la hora si cambió: una cita antigua con hora fuera de bloque no se rechaza por eso.
                        ...(moved ? { scheduled_at: scheduledAt } : {}),
                        ...(form.barberId ? { barber_id: form.barberId } : {}),
                        ...(serviceIds.length > 0 ? { service_ids: serviceIds } : { duration_minutes: roundToSlot(form.duration) }),
                    }),
                });
                saved = await readJson<Appointment>(res);
            } else {
                const res = await fetch('/api/appointments', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: client.kind === 'client' ? client.id : null,
                        customer_name: client.kind === 'free' ? client.name.trim() : null,
                        customer_phone: client.kind === 'free' ? (client.phone.trim() || null) : null,
                        barber_id: form.barberId || null,
                        scheduled_at: scheduledAt,
                        ...(serviceIds.length > 0 ? { service_ids: serviceIds } : { duration_minutes: roundToSlot(form.duration) }),
                        service_note: form.note.trim() || null,
                        idempotency_key: idempotencyKey.current,
                    }),
                });
                saved = await readJson<Appointment>(res);
            }
            await onSaved(saved, form.date);
        } catch (err) {
            setError(saveErrorMessage(err, reschedule ? 'No se pudo reprogramar la cita.' : 'No se pudo guardar la cita.'));
        } finally { setSubmitting(false); }
    };

    const title = reschedule ? 'Reprogramar cita' : 'Nueva cita';
    return (
        <Modal title={title} subtitle={reschedule ? `${appointment.client_name} · ${formatClock(Number(originalTime.slice(0, 2)) * 60 + Number(originalTime.slice(3)))}` : undefined} onClose={onClose} size="lg" testId="appointment-form">
            {error && <p role="alert" data-testid="form-error" className="mb-4 rounded-xl bg-bos-raised p-3 text-sm font-medium text-bos-danger">{error}</p>}
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Fecha" id="apt-date">
                        {(p) => <DatePicker id={p.id} className={p.className} aria-describedby={p['aria-describedby']} required value={form.date} onChange={(v) => update({ date: v })} />}
                    </Field>
                    <Field label="Hora" id="apt-time">
                        {(p) => <TimePicker id={p.id} className={p.className} aria-describedby={p['aria-describedby']} required value={form.time} disabled={closed} options={times}
                            placeholder={closed ? 'Cerrado' : 'Elige la hora'} onChange={(v) => update({ time: v })} />}
                    </Field>
                </div>
                {closed && <p role="status" className="-mt-1 text-sm text-bos-danger">El negocio cierra ese día (o el barbero no trabaja). Elige otra fecha.</p>}
                <Field label="Barbero" id="apt-barber">
                    {(p) => (
                        <select {...p} value={form.barberId} onChange={(e) => update({ barberId: e.target.value })}>
                            <option value="">Sin barbero asignado</option>
                            {barbers.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    )}
                </Field>
                <ServicePicker services={services} selected={serviceIds} onChange={(ids) => update({ serviceIds: ids })} loading={servicesLoading} />
                {summary.count === 0 && (
                    <Field label="Duración" id="apt-duration">
                        {(p) => (
                            <select {...p} value={form.duration} onChange={(e) => update({ duration: Number(e.target.value) })}>
                                {durationOptions(form.duration).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        )}
                    </Field>
                )}
                {reschedule ? (
                    <p className="text-sm text-bos-muted">Cliente: <span className="font-semibold text-bos-text">{appointment.client_name}</span>. Solo cambian el horario, el barbero y los servicios.</p>
                ) : (
                    <>
                        <ClientPicker value={form.client} onChange={(client) => update({ client })} />
                        <Field label="Nota" id="apt-note" type="text" maxLength={500} placeholder="Ej. Corte degradado + barba" value={form.note} onChange={(e) => update({ note: e.target.value })} />
                    </>
                )}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" loading={submitting}>{reschedule ? 'Guardar cambios' : 'Guardar cita'}</Button>
                </div>
            </form>
        </Modal>
    );
}
