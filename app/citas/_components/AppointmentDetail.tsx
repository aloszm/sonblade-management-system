'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarClock, Clock, Receipt } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { Appointment, AppointmentStatus } from '@/types';
import { ACTION_LABELS, STATUS_LABELS, canCharge, isActive, nextStatuses } from '@/lib/appointments/appointments-view';
import { formatClock } from '@/lib/appointments/calendar-grid';
import { formatDuration } from '@/lib/services/categories';
import { servicesText } from '@/lib/appointments/booking';
import { Avatar } from './parts';
import { NO_BARBER_COLOR, STATUS_STYLE, money } from './agenda-ui';

// En la agenda solo se usan estas acciones: confirmar, marcar que llegó y cancelar.
const UI_ACTIONS: AppointmentStatus[] = ['confirmed', 'checked_in', 'cancelled'];
const actionsFor = (status: AppointmentStatus) => nextStatuses(status).filter((s) => UI_ACTIONS.includes(s));

const timeOf = (iso: string) => { const d = new Date(iso); return formatClock(d.getHours() * 60 + d.getMinutes()); };

/** Duración legible de una cita: "30 min", "1 h", "1 h 30 min". */
function durationText(a: Appointment): string {
    const minutes = a.end_at ? Math.round((new Date(a.end_at).getTime() - new Date(a.scheduled_at).getTime()) / 60_000) : a.duration_minutes ?? 0;
    return minutes > 0 ? formatDuration(minutes) : '';
}

interface AppointmentDetailProps {
    apt: Appointment;
    barberColor: string | undefined;
    /** Quien agenda (gerencia y recepción): ve las acciones. El barbero y la cuenta de consulta solo leen. */
    canManage: boolean;
    canSeePhones: boolean;
    /** El barbero no ve importes. */
    showPrices: boolean;
    busy: boolean;
    onStatus: (apt: Appointment, status: AppointmentStatus) => void;
    onCancel: (apt: Appointment) => void;
    onReschedule: (apt: Appointment) => void;
}

/** Detalle de una cita: cliente, horario, barbero, servicios y las acciones que le tocan a quien la mira. */
export default function AppointmentDetail({ apt, barberColor, canManage, canSeePhones, showPrices, busy, onStatus, onCancel, onReschedule }: AppointmentDetailProps) {
    const open = canCharge(apt);
    const actions = actionsFor(apt.status);
    const services = apt.services ?? [];
    const names = servicesText(apt);
    const total = services.reduce((sum, s) => sum + s.price, 0);
    return (
        <li data-testid="appointment" className="bos-fade overflow-hidden rounded-2xl border border-bos-border bg-bos-surface">
            <div className="flex">
                <span aria-hidden="true" className="w-1.5 shrink-0" style={{ background: barberColor ?? NO_BARBER_COLOR }} />
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
                                {apt.barber ? <><Avatar name={apt.barber.name} color={barberColor ?? NO_BARBER_COLOR} size={24} /> {apt.barber.name}</> : 'Sin barbero asignado'}
                            </dd>
                        </div>
                        {canSeePhones && apt.customer_phone && (
                            <div>
                                <dt className="text-xs font-medium text-bos-muted">Teléfono</dt>
                                <dd className="mt-1 font-medium tabular-nums">{apt.customer_phone}</dd>
                            </div>
                        )}
                        {apt.client_id && (
                            <div>
                                <dt className="text-xs font-medium text-bos-muted">Cliente</dt>
                                <dd className="mt-1"><Link href={`/clientes/${apt.client_id}`} data-testid="client-link" className="inline-flex min-h-11 items-center font-semibold text-bos-accent-text hover:underline">Ver ficha del cliente</Link></dd>
                            </div>
                        )}
                        {services.length > 0 && (
                            <div className="sm:col-span-2" data-testid="appointment-services">
                                <dt className="text-xs font-medium text-bos-muted">Servicios</dt>
                                <dd className="mt-1">
                                    <ul className="space-y-0.5">
                                        {services.map((s) => (
                                            <li key={`${s.service_id}-${s.name}`} className="flex justify-between gap-3">
                                                <span>{s.name}</span>
                                                <span className="shrink-0 tabular-nums text-bos-muted">{formatDuration(s.duration_minutes)}{showPrices ? ` · ${money(s.price)}` : ''}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    {showPrices && services.length > 1 && <p className="mt-1 text-right font-semibold tabular-nums">Estimado: {money(total)}</p>}
                                </dd>
                            </div>
                        )}
                        {apt.notes && (services.length === 0 || apt.notes !== names) && (
                            <div className="sm:col-span-2">
                                <dt className="text-xs font-medium text-bos-muted">{services.length ? 'Nota' : 'Servicio o nota'}</dt>
                                <dd className="mt-1 whitespace-pre-line">{apt.notes}</dd>
                            </div>
                        )}
                    </dl>
                    {apt.sale && (
                        <Link href={`/ticket/${apt.sale.id}`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-bos-success hover:underline">
                            <Receipt aria-hidden="true" className="h-4 w-4" /> Cobrada · {money(apt.sale.total)} · Ver ticket
                        </Link>
                    )}
                    {canManage && (actions.length > 0 || open) && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-bos-border pt-4">
                            {open && (
                                <Link href={`/pos?cita=${apt.id}`} data-testid="charge-appointment"
                                    className="inline-flex min-h-11 items-center rounded-xl bg-bos-accent px-4 text-sm font-bold text-bos-on-accent hover:brightness-105">Cobrar</Link>
                            )}
                            {open && (
                                <Button variant="secondary" size="sm" onClick={() => onReschedule(apt)} disabled={busy} data-testid="reschedule-appointment">
                                    <CalendarClock aria-hidden="true" className="h-4 w-4" /> Reprogramar
                                </Button>
                            )}
                            {actions.map((next) => (
                                <Button key={next} variant="secondary" size="sm" disabled={busy} className={next === 'cancelled' ? 'text-bos-danger' : ''}
                                    onClick={() => (next === 'cancelled' ? onCancel(apt) : onStatus(apt, next))}>
                                    {ACTION_LABELS[next]}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}
