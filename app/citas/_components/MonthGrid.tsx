'use client';

import React from 'react';
import { Ban } from 'lucide-react';
import type { Appointment } from '@/types';
import { isActive, localDateKey } from '@/lib/appointments/appointments-view';
import type { TimeOffView } from '@/lib/appointments/time-off';
import { NO_BARBER_COLOR, SUBTLE_BG, dayTitle, timeOf, tintOf } from './agenda-ui';

const WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Casillas del mes, de domingo a sábado (como la semana del negocio); `null` = hueco antes o después del mes. */
export function monthCells(year: number, month: number): (number | null)[] {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

interface MonthGridProps {
    year: number;
    month: number;
    todayKey: string;
    byDay: Map<string, Appointment[]>;
    offOnDay: (key: string) => TimeOffView[];
    colorOf: (id: string | null | undefined) => string;
    onOpenDay: (key: string) => void;
}

/** Calendario del mes: cada día muestra sus citas (en computadora) o un contador con puntos de color (en celular). */
export default function MonthGrid({ year, month, todayKey, byDay, offOnDay, colorOf, onOpenDay }: MonthGridProps) {
    return (
        <div key={`${year}-${month}`} aria-label="Calendario del mes" className="bos-fade">
            <div className="grid grid-cols-7 border-b border-bos-border bg-bos-bg">
                {WEEK.map((d) => <div key={d} className="py-3 text-center text-xs font-semibold text-bos-muted"><span className="sm:hidden">{d.slice(0, 1)}</span><span className="hidden sm:inline">{d}</span></div>)}
            </div>
            <div className="grid grid-cols-7">
                {monthCells(year, month).map((d, i) => {
                    if (d === null) return <div key={`e${i}`} className="min-h-[72px] border-b border-r border-bos-border md:min-h-36" style={{ background: SUBTLE_BG }} />;
                    const key = localDateKey(new Date(year, month, d));
                    const list = [...(byDay.get(key) ?? [])].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
                    const active = list.filter((a) => isActive(a.status));
                    const barberDots = [...new Set(active.map((a) => a.barber?.id ?? ''))].slice(0, 4);
                    const isToday = key === todayKey;
                    const off = offOnDay(key);
                    return (
                        <button key={key} type="button" data-testid={`day-${key}`} onClick={() => onOpenDay(key)}
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
    );
}
