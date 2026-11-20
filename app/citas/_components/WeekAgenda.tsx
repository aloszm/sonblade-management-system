'use client';

import React from 'react';
import { Ban } from 'lucide-react';
import type { Appointment } from '@/types';
import { STATUS_LABELS, isActive } from '@/lib/appointments/appointments-view';
import { appointmentSpan, formatRange } from '@/lib/appointments/calendar-grid';
import { formatHour, minutesToHHMM, workingWindow, type ScheduleData } from '@/lib/appointments/hours';
import type { TimeOffView } from '@/lib/appointments/time-off';
import { NO_BARBER_COLOR, TINT_HOVER_PCT, WEEK_SHORT, money, tintOf } from './agenda-ui';
import { servicesText } from '@/lib/appointments/booking';
import { StatusDot } from './parts';

interface WeekAgendaProps {
    days: string[];
    todayKey: string;
    byDay: Map<string, Appointment[]>;
    schedule: ScheduleData | null;
    offOnDay: (key: string) => TimeOffView[];
    colorOf: (id: string | null | undefined) => string;
    onPickDay: (key: string) => void;
    onOpenAppointment: (appointment: Appointment) => void;
}

/**
 * Semana como agenda por día (celular y tableta): un bloque por día con su encabezado pegajoso y sus citas en orden,
 * porque siete columnas no caben en una pantalla chica. Tocar el día abre su cuadrícula; tocar una cita abre su detalle.
 * En computadora se usa WeekGrid.
 */
export default function WeekAgenda({ days, todayKey, byDay, schedule, offOnDay, colorOf, onPickDay, onOpenAppointment }: WeekAgendaProps) {
    return (
        <ul data-testid="week-view" className="bos-fade">
            {days.map((key) => {
                const date = new Date(`${key}T12:00:00`);
                const list = [...(byDay.get(key) ?? [])].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
                const window = schedule ? workingWindow(schedule, key) : undefined;
                const isToday = key === todayKey;
                const off = offOnDay(key);
                const active = list.filter((a) => isActive(a.status)).length;
                const label = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                return (
                    <li key={key} data-testid={`week-day-${key}`} className="border-b border-bos-border last:border-b-0">
                        <button type="button" onClick={() => onPickDay(key)} aria-label={`Ver el día: ${label}`}
                            className={`sticky top-0 z-10 flex w-full items-center gap-3 border-b border-bos-border px-4 py-2.5 text-left backdrop-blur transition-colors hover:bg-bos-raised motion-reduce:transition-none ${isToday ? 'bg-bos-accent-soft' : 'bg-bos-surface'}`}>
                            <span className={`inline-flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none ${isToday ? 'bg-bos-accent text-bos-on-accent' : 'bg-bos-raised text-bos-text'}`}>
                                <span className="text-xs font-medium">{WEEK_SHORT[date.getDay()]}</span>
                                <span className="text-lg font-semibold tabular-nums">{date.getDate()}</span>
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold first-letter:uppercase">{label}</span>
                                <span className="block text-xs text-bos-muted">
                                    {window === null ? 'El negocio cierra' : window ? `${formatHour(minutesToHHMM(window.open))} a ${formatHour(minutesToHHMM(window.close))}` : ''}
                                    {window !== null && active > 0 ? `${window ? ' · ' : ''}${active} cita${active === 1 ? '' : 's'}` : ''}
                                </span>
                            </span>
                            {isToday && <span className="rounded-full bg-bos-surface px-2 py-0.5 text-xs font-semibold text-bos-accent-text">Hoy</span>}
                        </button>
                        <div className="space-y-2 px-4 py-3">
                            {off.length > 0 && (
                                <p className="flex items-start gap-2 rounded-lg border border-dashed border-bos-control px-3 py-2 text-xs text-bos-muted">
                                    <Ban aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>{off.map((t) => `${t.barber_name} no viene (${t.reason})`).join(' · ')}</span>
                                </p>
                            )}
                            {list.length === 0 ? (
                                <p className="py-1 text-sm text-bos-muted">{window === null ? 'Cerrado.' : 'Sin citas.'}</p>
                            ) : (
                                <ul className="grid gap-2 sm:grid-cols-2">
                                    {list.map((a) => {
                                        const live = isActive(a.status) && a.status !== 'no_show';
                                        const color = a.barber ? colorOf(a.barber.id) : NO_BARBER_COLOR;
                                        const range = formatRange(appointmentSpan(a.scheduled_at, a.end_at));
                                        return (
                                            <li key={a.id} className="min-w-0">
                                                <button type="button" data-testid="week-appointment" onClick={() => onOpenAppointment(a)}
                                                    style={{ borderLeftColor: color, ...(live ? { ['--tint' as string]: tintOf(color), ['--tint-h' as string]: tintOf(color, TINT_HOVER_PCT) } : {}) }}
                                                    className={`flex w-full min-w-0 items-start gap-2 rounded-lg border border-l-[4px] px-3 py-2 text-left transition-colors motion-reduce:transition-none ${a.walk_in ? 'border-dashed border-y-bos-control border-r-bos-control' : 'border-y-transparent border-r-transparent'} ${live ? 'bg-[var(--tint)] active:bg-[var(--tint-h)]' : 'bg-bos-surface'}`}>
                                                    <span className="min-w-0 flex-1">
                                                        <span className={`block truncate text-sm font-bold ${live ? 'text-bos-text' : 'text-bos-muted'} ${isActive(a.status) ? '' : 'line-through'}`}>{a.client_name}</span>
                                                        <span className="block truncate text-xs tabular-nums text-bos-muted">{range}{servicesText(a) ? ` · ${servicesText(a)}` : ''}</span>
                                                        <span className="mt-0.5 block truncate text-xs text-bos-muted">{a.barber ? a.barber.name : 'Sin barbero asignado'}{a.sale ? ` · ${money(a.sale.total)}` : ''}</span>
                                                    </span>
                                                    <span className="mt-0.5 flex shrink-0 flex-col items-end gap-1">
                                                        <StatusDot status={a.status} />
                                                        <span className="sr-only">{a.walk_in ? 'Sin cita' : a.online ? `${STATUS_LABELS[a.status]}, reserva en línea` : STATUS_LABELS[a.status]}</span>
                                                        {a.walk_in && <span aria-hidden="true" className="rounded-full border border-dashed border-bos-control px-1.5 text-xs text-bos-text">Sin cita</span>}
                                                        {a.online && <span data-testid="origen-en-linea" aria-hidden="true" className="rounded-full border border-bos-control px-1.5 text-xs text-bos-text">En línea</span>}
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
