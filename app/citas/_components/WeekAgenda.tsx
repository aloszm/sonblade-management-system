'use client';

import React from 'react';
import type { Appointment } from '@/types';
import { STATUS_LABELS, isActive } from '@/lib/appointments/appointments-view';
import { appointmentSpan, formatRange } from '@/lib/appointments/calendar-grid';
import { formatHour, minutesToHHMM, workingWindow, type ScheduleData } from '@/lib/appointments/hours';
import type { TimeOffView } from '@/lib/appointments/time-off';
import { NO_BARBER_COLOR, WEEK_SHORT, money } from './agenda-ui';

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
 * Semana como agenda compacta: un renglón por día con sus citas en orden, en vez de siete columnas
 * que no caben en un celular. Tocar el día abre su cuadrícula; tocar una cita abre su detalle.
 */
export default function WeekAgenda({ days, todayKey, byDay, schedule, offOnDay, colorOf, onPickDay, onOpenAppointment }: WeekAgendaProps) {
    return (
        <ul data-testid="week-view" className="divide-y divide-bos-border">
            {days.map((key) => {
                const date = new Date(`${key}T12:00:00`);
                const list = [...(byDay.get(key) ?? [])].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
                const window = schedule ? workingWindow(schedule, key) : undefined;
                const isToday = key === todayKey;
                const off = offOnDay(key);
                const active = list.filter((a) => isActive(a.status)).length;
                const label = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                return (
                    <li key={key} data-testid={`week-day-${key}`} className="grid gap-3 p-3 md:grid-cols-[148px_minmax(0,1fr)] md:p-4">
                        <button type="button" onClick={() => onPickDay(key)} aria-label={`Ver el día: ${label}`}
                            className="flex items-center gap-3 rounded-xl p-1 text-left hover:bg-bos-raised md:flex-col md:items-start md:gap-0.5">
                            <span className={`inline-flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none ${isToday ? 'bg-bos-accent text-bos-on-accent' : 'bg-bos-raised text-bos-text'}`}>
                                <span className="text-[11px] font-medium uppercase">{WEEK_SHORT[date.getDay()]}</span>
                                <span className="text-lg font-semibold tabular-nums">{date.getDate()}</span>
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold first-letter:uppercase md:mt-1">{label}</span>
                                <span className="block text-xs text-bos-muted">
                                    {window === null ? 'El negocio cierra' : window ? `${formatHour(minutesToHHMM(window.open))} a ${formatHour(minutesToHHMM(window.close))}` : ''}
                                    {window !== null && active > 0 ? `${window ? ' · ' : ''}${active} cita${active === 1 ? '' : 's'}` : ''}
                                </span>
                            </span>
                        </button>
                        <div className="min-w-0 space-y-2">
                            {off.length > 0 && (
                                <p className="rounded-lg border border-dashed border-bos-border px-3 py-1.5 text-xs text-bos-muted">
                                    {off.map((t) => `${t.barber_name} no viene (${t.reason})`).join(' · ')}
                                </p>
                            )}
                            {list.length === 0 ? (
                                <p className="py-2 text-sm text-bos-muted">{window === null ? 'Cerrado.' : 'Sin citas.'}</p>
                            ) : (
                                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                    {list.map((a) => {
                                        const live = isActive(a.status);
                                        const range = formatRange(appointmentSpan(a.scheduled_at, a.end_at));
                                        return (
                                            <li key={a.id} className="min-w-0">
                                                <button type="button" data-testid="week-appointment" onClick={() => onOpenAppointment(a)}
                                                    style={{ borderLeftColor: a.barber ? colorOf(a.barber.id) : NO_BARBER_COLOR }}
                                                    className={`block w-full min-w-0 rounded-lg border border-l-[3px] border-bos-border px-3 py-2 text-left ${a.walk_in ? 'border-dashed' : ''} ${live ? 'bg-bos-raised hover:bg-bos-bg' : 'bg-bos-surface'}`}>
                                                    <span className={`block truncate text-sm font-semibold ${live ? '' : 'text-bos-muted line-through'}`}>{a.client_name}</span>
                                                    <span className="block truncate text-xs tabular-nums text-bos-muted">{range} · {a.walk_in ? 'Sin cita' : STATUS_LABELS[a.status]}{a.sale ? ` · ${money(a.sale.total)}` : ''}</span>
                                                    <span className="block truncate text-xs text-bos-muted">{[a.notes, a.barber ? a.barber.name : 'Sin barbero asignado'].filter(Boolean).join(' · ')}</span>
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
