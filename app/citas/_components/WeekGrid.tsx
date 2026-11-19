'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Ban } from 'lucide-react';
import type { Appointment } from '@/types';
import { STATUS_LABELS, isActive, layoutLanes } from '@/lib/appointments/appointments-view';
import {
    SLOT_MINUTES, appointmentSpan, formatClock, formatRange, hourMarks, slotStarts, spanBox, visualSpan, weekGridRange,
} from '@/lib/appointments/calendar-grid';
import { workingWindow, type ScheduleData } from '@/lib/appointments/hours';
import type { TimeOffView } from '@/lib/appointments/time-off';
import { NO_BARBER_COLOR, SUBTLE_BG, SUBTLE_BG_STRONG, TINT_HOVER_PCT, WEEK_SHORT, WEEK_SLOT_PX, money, tintOf } from './agenda-ui';
import { servicesText } from '@/lib/appointments/booking';
import { StatusDot } from './parts';

interface WeekGridProps {
    days: string[];
    todayKey: string;
    nowMinutes: number;
    byDay: Map<string, Appointment[]>;
    schedule: ScheduleData | null;
    offOnDay: (key: string) => TimeOffView[];
    colorOf: (id: string | null | undefined) => string;
    onPickDay: (key: string) => void;
    onOpenAppointment: (appointment: Appointment) => void;
}

const AXIS_PX = 56;

/** Semana en cuadrícula para pantallas grandes: siete columnas (domingo a sábado), de 8 a.m. a 10 p.m. en filas. */
export default function WeekGrid({ days, todayKey, nowMinutes, byDay, schedule, offOnDay, colorOf, onPickDay, onOpenAppointment }: WeekGridProps) {
    const scroller = useRef<HTMLDivElement>(null);
    const allSpans = useMemo(() => days.flatMap((k) => (byDay.get(k) ?? []).map((a) => appointmentSpan(a.scheduled_at, a.end_at))), [days, byDay]);
    const range = useMemo(() => weekGridRange(allSpans), [allSpans]);
    const slots = useMemo(() => slotStarts(range), [range]);
    const hours = useMemo(() => hourMarks(range), [range]);
    const gridHeight = slots.length * WEEK_SLOT_PX;
    // Cada día: sus citas con carriles. Un día con 3 citas empalmadas se ensancha para que se sigan leyendo.
    const perDay = useMemo(() => days.map((key) => {
        const list = [...(byDay.get(key) ?? [])].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
        const items = list.map((a) => ({ a, span: appointmentSpan(a.scheduled_at, a.end_at) })).map((s) => ({ ...s, visual: visualSpan(s.span) }));
        const lanes = layoutLanes(items.map((s) => ({ id: s.a.id, start: s.visual.start, end: s.visual.end })));
        const maxLanes = Math.max(1, ...[...lanes.values()].map((l) => l.lanes));
        return { key, items, lanes, maxLanes };
    }), [days, byDay]);
    const hasToday = days.includes(todayKey);
    const nowInRange = hasToday && nowMinutes >= range.start && nowMinutes < range.end;

    // Al abrir: se baja a la hora actual (si la semana incluye hoy) o a la primera cita de la semana.
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const first = allSpans.length ? Math.min(...allSpans.map((s) => visualSpan(s).start)) : range.start;
        const target = nowInRange ? nowMinutes - 60 : first - SLOT_MINUTES;
        el.scrollTop = Math.max(0, spanBox({ start: Math.max(range.start, target), end: range.end }, range.start, WEEK_SLOT_PX).top - 8);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days[0], range.start]);

    return (
        <div data-testid="week-view" className="bos-fade">
            <div ref={scroller} data-testid="week-scroll" className="max-h-[calc(100dvh-17rem)] min-h-[420px] overflow-auto overscroll-contain">
                <div style={{ display: 'grid', gridTemplateColumns: `${AXIS_PX}px ${perDay.map((d) => `minmax(${Math.max(132, Math.min(d.maxLanes, 3) * 84)}px, 1fr)`).join(' ')}` }}>
                    <div className="sticky left-0 top-0 z-40 border-b border-bos-border bg-bos-surface" />
                    {days.map((key) => {
                        const date = new Date(`${key}T12:00:00`);
                        const isToday = key === todayKey;
                        const list = byDay.get(key) ?? [];
                        const count = list.filter((a) => isActive(a.status)).length;
                        const window = schedule ? workingWindow(schedule, key) : undefined;
                        const label = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
                        return (
                            <button key={key} type="button" onClick={() => onPickDay(key)} aria-label={`Ver el día: ${label}`} data-testid={`week-head-${key}`}
                                className="sticky top-0 z-30 flex flex-col items-center gap-0.5 border-b border-l border-bos-border bg-bos-surface px-2 py-2.5 text-center transition-colors hover:bg-bos-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bos-accent motion-reduce:transition-none">
                                <span className="text-xs font-medium text-bos-muted">{WEEK_SHORT[date.getDay()]}</span>
                                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold tabular-nums ${isToday ? 'bg-bos-accent text-bos-on-accent' : 'text-bos-text'}`}>{date.getDate()}</span>
                                <span className="text-xs text-bos-muted">{window === null ? 'Cerrado' : count === 0 ? 'Sin citas' : `${count} cita${count === 1 ? '' : 's'}`}</span>
                            </button>
                        );
                    })}

                    <div className="sticky left-0 z-20 bg-bos-surface" style={{ height: gridHeight }}>
                        {hours.filter((m) => !nowInRange || Math.abs(m - nowMinutes) >= 20).map((m) => (
                            <span key={m} className="absolute right-2 text-xs font-medium tabular-nums text-bos-muted"
                                style={{ top: spanBox({ start: m, end: m }, range.start, WEEK_SLOT_PX).top, transform: m === range.start ? 'translateY(4px)' : 'translateY(-50%)' }}>
                                {formatClock(m)}
                            </span>
                        ))}
                        <span aria-hidden="true" className="absolute right-2 text-xs font-medium tabular-nums text-bos-muted" style={{ top: gridHeight - 20 }}>{formatClock(range.end)}</span>
                        {nowInRange && (
                            <span className="absolute right-1 z-10 -translate-y-1/2 rounded-md bg-bos-danger-soft px-1.5 py-0.5 text-xs font-semibold tabular-nums leading-4 text-bos-danger"
                                style={{ top: spanBox({ start: nowMinutes, end: nowMinutes }, range.start, WEEK_SLOT_PX).top }}>
                                {formatClock(nowMinutes, false)}
                            </span>
                        )}
                    </div>

                    {perDay.map(({ key, items, lanes }) => {
                        const window = schedule ? workingWindow(schedule, key) : undefined;
                        const closed = window === undefined ? [] : window === null ? [range]
                            : [...(window.open > range.start ? [{ start: range.start, end: Math.min(window.open, range.end) }] : []), ...(window.close < range.end ? [{ start: Math.max(window.close, range.start), end: range.end }] : [])];
                        const isToday = key === todayKey;
                        const off = offOnDay(key);
                        return (
                            <div key={key} data-testid={`week-day-${key}`} className="relative border-l border-bos-border" style={{ height: gridHeight, ...(isToday ? { background: 'color-mix(in srgb, var(--bos-accent) 5%, transparent)' } : {}) }}>
                                {slots.map((m, i) => (
                                    <div key={m} aria-hidden="true" className={`absolute inset-x-0 border-t ${m % 60 === 0 ? 'border-bos-border' : 'border-bos-border/40'}`} style={{ top: i * WEEK_SLOT_PX }} />
                                ))}
                                {closed.map((span) => (
                                    <div key={`c${span.start}`} data-testid="closed-block" aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-[14]"
                                        style={{ ...spanBox(span, range.start, WEEK_SLOT_PX), background: SUBTLE_BG }} />
                                ))}
                                {off.map((t) => {
                                    const start = Math.max(range.start, new Date(t.starts_at).getTime() < new Date(`${key}T00:00:00`).getTime() ? 0 : minutesOf(t.starts_at));
                                    const endNext = new Date(t.ends_at).getTime() >= new Date(`${key}T00:00:00`).getTime() + 86_400_000;
                                    const end = Math.min(range.end, endNext ? 1440 : minutesOf(t.ends_at));
                                    if (end <= start) return null;
                                    return (
                                        <div key={t.id} data-testid="time-off-block" title={`${t.barber_name}: ${t.reason}`}
                                            className="absolute right-0 z-[15] flex w-3 items-start justify-center rounded-l-md border-y border-l border-dashed border-bos-control pt-1 text-bos-muted"
                                            style={{ ...spanBox({ start, end }, range.start, WEEK_SLOT_PX), background: SUBTLE_BG_STRONG }}>
                                            <Ban aria-hidden="true" className="h-2.5 w-2.5" />
                                            <span className="sr-only">{t.barber_name} no viene: {t.reason}</span>
                                        </div>
                                    );
                                })}
                                {isToday && nowInRange && (
                                    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-[16] h-0.5 bg-bos-danger" style={{ top: spanBox({ start: nowMinutes, end: nowMinutes }, range.start, WEEK_SLOT_PX).top - 1 }}>
                                        <span className="absolute -left-[5px] -top-[3px] h-2 w-2 rounded-full bg-bos-danger" />
                                    </div>
                                )}
                                <div className="absolute inset-y-0 left-0" style={{ right: off.length > 0 ? 12 : 0 }}>
                                {items.map(({ a, span, visual }) => {
                                    const { lane, lanes: laneCount } = lanes.get(a.id) ?? { lane: 0, lanes: 1 };
                                    const box = spanBox(visual, range.start, WEEK_SLOT_PX);
                                    const slotsHigh = (visual.end - visual.start) / SLOT_MINUTES;
                                    const color = a.barber ? colorOf(a.barber.id) : NO_BARBER_COLOR;
                                    const live = isActive(a.status) && a.status !== 'no_show';
                                    const range12 = formatRange(span);
                                    const state = a.walk_in ? 'Sin cita' : STATUS_LABELS[a.status];
                                    return (
                                        <button key={a.id} type="button" data-testid="week-appointment" onClick={() => onOpenAppointment(a)}
                                            title={`${range12} · ${a.client_name}${servicesText(a) ? ` · ${servicesText(a)}` : ''}${a.barber ? ` · ${a.barber.name}` : ''} · ${state}`}
                                            style={{
                                                top: box.top + 1, height: box.height - 2, borderLeftColor: color,
                                                left: `calc(${(lane / laneCount) * 100}% + 2px)`, width: `calc(${100 / laneCount}% - 4px)`,
                                                ...(live ? { ['--tint' as string]: tintOf(color), ['--tint-h' as string]: tintOf(color, TINT_HOVER_PCT) } : {}),
                                            }}
                                            className={`absolute z-20 flex flex-col items-stretch overflow-hidden rounded-md border border-l-[3px] px-1.5 py-0.5 text-left transition-[box-shadow,background-color] duration-150 hover:z-30 hover:shadow-md focus-visible:z-30 focus-visible:shadow-md motion-reduce:transition-none ${a.walk_in ? 'border-dashed border-y-bos-control border-r-bos-control' : 'border-y-transparent border-r-transparent'} ${live ? 'bg-[var(--tint)] hover:bg-[var(--tint-h)]' : 'bg-bos-surface hover:bg-bos-raised'}`}>
                                            <span className="flex items-center gap-1">
                                                <span className={`min-w-0 flex-1 truncate text-xs font-bold leading-4 ${live ? 'text-bos-text' : 'text-bos-muted'} ${isActive(a.status) ? '' : 'line-through'}`}>{slotsHigh === 1 ? `${formatClock(span.start, false)} ` : ''}{a.client_name}</span>
                                                <StatusDot status={a.status} className="!h-2 !w-2" />
                                            </span>
                                            {slotsHigh >= 2 && <span className="block truncate text-xs leading-4 text-bos-muted">{range12}</span>}
                                            {slotsHigh >= 3 && servicesText(a) && <span className="block truncate text-xs leading-4 text-bos-muted">{servicesText(a)}</span>}
                                            <span className="sr-only">{state}{a.sale ? `, ${money(a.sale.total)}` : ''}</span>
                                        </button>
                                    );
                                })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/** Minuto del día (hora local del dispositivo, igual que el resto de la agenda) de un instante ISO. */
function minutesOf(iso: string): number {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
}
