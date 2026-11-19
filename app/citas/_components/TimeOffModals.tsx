'use client';

import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import DatePicker from '@/components/ui/DatePicker';
import TimePicker from '@/components/ui/TimePicker';
import type { Barber } from '@/types';
import { localDateKey, localDateTimeToIso } from '@/lib/appointments/appointments-view';
import { REQUESTED_VIA, VIA_LABELS, type RequestedVia, type TimeOffView } from '@/lib/appointments/time-off';
import { BUSINESS_TIME_ZONE, formatDateTime } from '@/lib/utils/dates';
import { readJson, toUserMessage } from '@/lib/utils/errors';

const dateTimeOf = (iso: string) => formatDateTime(iso, BUSINESS_TIME_ZONE, { year: false });
const nowParts = () => { const d = new Date(); return { date: localDateKey(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }; };
const textArea = 'w-full px-3 py-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted';

type Conflict = { id: string; customer_name: string; starts_at: string };

interface OffFormProps {
    barbers: Barber[];
    initial: { barberId: string; date: string };
    onClose: () => void;
    /** Ya guardada: la agenda se vuelve a cargar. */
    onSaved: () => Promise<unknown> | void;
}

/** Registrar ausencia: bloquea la agenda del barbero y queda el registro de quién, cuándo y por qué. */
export function TimeOffFormModal({ barbers, initial, onClose, onSaved }: OffFormProps) {
    const [form, setForm] = useState(() => {
        const now = nowParts();
        return {
            barber_id: initial.barberId, from_date: initial.date, from_time: '08:00', to_date: initial.date, to_time: '22:00', reason: '',
            requested_date: now.date, requested_time: now.time, requested_via: 'whatsapp' as RequestedVia,
        };
    });
    const [error, setError] = useState('');
    const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!form.barber_id) { setError('Elige al barbero.'); return; }
        if (form.reason.trim().length < 3) { setError('Escribe el motivo de la ausencia.'); return; }
        const startsAt = localDateTimeToIso(form.from_date, form.from_time);
        const endsAt = localDateTimeToIso(form.to_date, form.to_time);
        if (new Date(endsAt) <= new Date(startsAt)) { setError('La hora de fin debe ser después del inicio.'); return; }
        setSubmitting(true);
        try {
            const res = await fetch('/api/time-off', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    barber_id: form.barber_id, starts_at: startsAt, ends_at: endsAt, reason: form.reason.trim(),
                    requested_at: localDateTimeToIso(form.requested_date, form.requested_time), requested_via: form.requested_via,
                }),
            });
            const body = await readJson<{ conflicts?: Conflict[] }>(res);
            await onSaved();
            // Si había citas dentro del bloqueo se muestran para reagendarlas; si no, se cierra.
            if (body.conflicts && body.conflicts.length > 0) setConflicts(body.conflicts);
            else onClose();
        } catch (err) {
            setError(toUserMessage(err, 'No se pudo registrar la ausencia.'));
        } finally { setSubmitting(false); }
    };

    return (
        <Modal title={conflicts ? 'Ausencia registrada' : 'Registrar ausencia'} onClose={onClose}>
            {conflicts ? (
                <div className="space-y-4" data-testid="time-off-conflicts">
                    <p className="text-sm">El horario quedó bloqueado. Estas citas ya estaban agendadas en ese tiempo; avisa al cliente y reagéndalas o cancélalas:</p>
                    <ul className="space-y-2">
                        {conflicts.map((c) => (
                            <li key={c.id} className="rounded-xl border border-bos-border p-3 text-sm"><span className="font-semibold">{c.customer_name}</span> · {dateTimeOf(c.starts_at)}</li>
                        ))}
                    </ul>
                    <Button fullWidth onClick={onClose}>Entendido</Button>
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-4">
                    {error && <p role="alert" className="rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{error}</p>}
                    <Field label="Barbero" id="off-barber">
                        {(p) => (
                            <select {...p} value={form.barber_id} onChange={(e) => setForm({ ...form, barber_id: e.target.value })}>
                                <option value="">Elige al barbero</option>
                                {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        )}
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Desde" id="off-from-date">
                            {(p) => <DatePicker id={p.id} className={p.className} required value={form.from_date} onChange={(v) => setForm({ ...form, from_date: v, to_date: form.to_date < v ? v : form.to_date })} />}
                        </Field>
                        <Field label="Hora" id="off-from-time">
                            {(p) => <TimePicker id={p.id} className={p.className} required step={30} value={form.from_time} onChange={(v) => setForm({ ...form, from_time: v })} />}
                        </Field>
                        <Field label="Hasta" id="off-to-date">
                            {(p) => <DatePicker id={p.id} className={p.className} required value={form.to_date} onChange={(v) => setForm({ ...form, to_date: v })} />}
                        </Field>
                        <Field label="Hora" id="off-to-time">
                            {(p) => <TimePicker id={p.id} className={p.className} required step={30} value={form.to_time} onChange={(v) => setForm({ ...form, to_time: v })} />}
                        </Field>
                    </div>
                    <Field label="Motivo" id="off-reason" type="text" maxLength={300} placeholder="Ej. Cita médica" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Cuándo avisó" id="off-req-date">
                            {(p) => <DatePicker id={p.id} className={p.className} required value={form.requested_date} onChange={(v) => setForm({ ...form, requested_date: v })} />}
                        </Field>
                        <Field label="Hora del aviso" id="off-req-time">
                            {(p) => <TimePicker id={p.id} className={p.className} required step={30} value={form.requested_time} onChange={(v) => setForm({ ...form, requested_time: v })} />}
                        </Field>
                    </div>
                    <Field label="Cómo avisó" id="off-via">
                        {(p) => (
                            <select {...p} value={form.requested_via} onChange={(e) => setForm({ ...form, requested_via: e.target.value as RequestedVia })}>
                                {REQUESTED_VIA.map((v) => <option key={v} value={v}>{VIA_LABELS[v]}</option>)}
                            </select>
                        )}
                    </Field>
                    <p className="text-sm text-bos-muted">Queda registrado quién lo anotó y a qué hora. No se borra: si cambia de planes, se cancela con su motivo.</p>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" loading={submitting}>Bloquear horario</Button>
                    </div>
                </form>
            )}
        </Modal>
    );
}

interface ReasonModalProps {
    title: string;
    subtitle: string;
    intro: string;
    /** `textarea` para citas (motivo largo), `input` para ausencias. */
    multiline?: boolean;
    placeholder: string;
    confirmLabel: string;
    /** Mensaje cuando el motivo tiene menos de 3 letras. */
    tooShort: string;
    busy: boolean;
    error: string;
    onClose: () => void;
    /** Recibe el motivo ya validado (3 letras o más). */
    onSubmit: (reason: string) => void;
    id: string;
}

/** Ventana que pide el motivo antes de cancelar algo que no se borra (cita o ausencia). */
export function ReasonModal({ title, subtitle, intro, multiline, placeholder, confirmLabel, tooShort, busy, error, onClose, onSubmit, id }: ReasonModalProps) {
    const [reason, setReason] = useState('');
    const [local, setLocal] = useState('');
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (reason.trim().length < 3) { setLocal(tooShort); return; }
        setLocal('');
        onSubmit(reason.trim());
    };
    const shown = local || error;
    return (
        <Modal title={title} subtitle={subtitle} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <p className="text-sm text-bos-muted">{intro}</p>
                {shown && <p role="alert" className="rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{shown}</p>}
                {multiline ? (
                    <Field label="Motivo" id={id}>
                        {(p) => <textarea {...p} className={textArea} rows={3} maxLength={300} autoFocus placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />}
                    </Field>
                ) : (
                    <Field label="Motivo" id={id} type="text" maxLength={300} autoFocus placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Button variant="secondary" onClick={onClose}>Volver</Button>
                    <Button type="submit" variant="danger" loading={busy}>{confirmLabel}</Button>
                </div>
            </form>
        </Modal>
    );
}

/** Ausencias del día (vista por día), con el registro de quién, cuándo y por qué. */
export function TimeOffList({ items, canManage, onCancel }: { items: TimeOffView[]; canManage: boolean; onCancel: (t: TimeOffView) => void }) {
    return (
        <section aria-label="Ausencias del día" data-testid="time-off-list" className="rounded-xl border border-bos-border bg-bos-surface p-4">
            <h2 className="text-[15px] font-semibold">Ausencias</h2>
            <ul className="mt-3 divide-y divide-bos-border">
                {items.map((t) => (
                    <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 text-sm">
                            <p className={`font-semibold ${t.cancelled ? 'line-through text-bos-muted' : ''}`}>{t.barber_name} · {t.reason}</p>
                            <p className="text-bos-muted">De {dateTimeOf(t.starts_at)} a {dateTimeOf(t.ends_at)}</p>
                            <p className="text-bos-muted">Avisó {dateTimeOf(t.requested_at)} por {VIA_LABELS[t.requested_via]} · Registró {t.created_by_name} el {dateTimeOf(t.created_at)}</p>
                            {t.cancelled && <p className="text-bos-muted">Cancelada por {t.cancelled.by_name} el {dateTimeOf(t.cancelled.at)}: {t.cancelled.reason}</p>}
                        </div>
                        {canManage && !t.cancelled && (
                            <Button variant="secondary" size="sm" className="text-bos-danger" onClick={() => onCancel(t)}>Cancelar ausencia</Button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
