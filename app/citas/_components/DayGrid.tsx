'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Ban, Plus } from 'lucide-react';
import type { Appointment } from '@/types';
import { STATUS_LABELS, isActive, layoutLanes } from '@/lib/appointments/appointments-view';
import {
    SLOT_MINUTES, appointmentSpan, cardDetail, formatClock, formatRange, gridRange, hourMarks, slotStarts, spanBox, toHHMM, visualSpan, type Span,
} from '@/lib/appointments/calendar-grid';
import { overlapMinutes, type TimeOffView } from '@/lib/appointments/time-off';
import { workingWindow, type ScheduleData } from '@/lib/appointments/hours';
import { NO_BARBER_COLOR, SLOT_PX, SUBTLE_BG, SUBTLE_BG_STRONG, TINT_HOVER_PCT, money, tintOf } from './agenda-ui';
import { servicesText } from '@/lib/appointments/booking';
import { Avatar, StatusChip, StatusDot } from './parts';

export interface DayColumn { id: string | null; name: string }

interface DayGridProps {
    dayKey: string;
    todayKey: string;
    nowMinutes: number;
    /** Citas del día (ya filtradas por barbero si hay filtro). */
    appointments: Appointment[];
    columns: DayColumn[];
    colorOf: (id: string | null | undefined) => string;
    schedule: ScheduleData | null;
    /** Ausencias vigentes (no canceladas). */
    timeOff: TimeOffView[];
    canManage: boolean;
    onSlot: (time: string, barberId: string) => void;
    onOpenAppointment: (appointment: Appointment) => void;
    /** Columna con la que abre el selector de celular (la del barbero que entra); por omisión, la primera. */
    defaultColumnId?: string | null;
}

const NARROW_QUERY = '(max-width: 767px)';
const subscribeNarrow = (cb: () => void) => {
    const mq = window.matchMedia(NARROW_QUERY);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
};
/** En celular el día se ve de un barbero a la vez; en pantallas grandes, una columna por barbero. */
function useNarrow(): boolean {
    return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_QUERY).matches, () => false);
}

/** El fantasma de la cita se alcanza a ver antes de abrir el formulario, salvo que la persona pida menos movimiento. */
const GHOST_MS = 180;
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const AXIS_PX = 60;

/** Cuadrícula del día: una columna por barbero, de 8 a.m. a 10 p.m., líneas cada 30 minutos y cada cita alineada a su inicio y fin. */
export default function DayGrid({ dayKey, todayKey, nowMinutes, appointments, columns, colorOf, schedule, timeOff, canManage, onSlot, onOpenAppointment, defaultColumnId }: DayGridProps) {
    const narrow = useNarrow();
    const scroller = useRef<HTMLDivElement>(null);
    const [picked, setPicked] = useState<string | null | undefined>(undefined);
    const [ghost, setGhost] = useState<{ col: string; minutes: number } | null>(null);
    const ghostTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(ghostTimer.current), []);

    const spans = useMemo(() => appointments.map((a) => ({ a, span: appointmentSpan(a.scheduled_at, a.end_at) })), [appointments]);
    const businessWindow = schedule ? workingWindow(schedule, dayKey) : undefined;
    const closedDay = businessWindow === null;
    const range = useMemo(() => gridRange(businessWindow, spans.map((s) => s.span)), [businessWindow, spans]);
    const slots = useMemo(() => slotStarts(range), [range]);
    const hours = useMemo(() => hourMarks(range), [range]);
    const gridHeight = slots.length * SLOT_PX;
    const isToday = dayKey === todayKey;
    const nowInRange = isToday && nowMinutes >= range.start && nowMinutes < range.end;

    const fallbackId = defaultColumnId && columns.some((x) => x.id === defaultColumnId) ? defaultColumnId : columns[0]?.id;
    const shown = narrow && columns.length > 1
        ? columns.filter((c) => c.id === (picked !== undefined && columns.some((x) => x.id === picked) ? picked : fallbackId))
        : columns;

    const dayStart = new Date(`${dayKey}T00:00:00`);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const countOf = (id: string | null) => appointments.filter((a) => (a.barber?.id ?? null) === id && isActive(a.status)).length;
    const colorFor = (id: string | null) => (id ? colorOf(id) : NO_BARBER_COLOR);

    // Carriles por columna: citas empalmadas lado a lado, calculadas sobre lo que ocupan en la cuadrícula.
    const perColumn = shown.map((c) => {
        const items = spans.filter((s) => (s.a.barber?.id ?? null) === c.id).map((s) => ({ ...s, visual: visualSpan(s.span) }));
        const lanes = layoutLanes(items.map((s) => ({ id: s.a.id, start: s.visual.start, end: s.visual.end })));
        const maxLanes = Math.max(1, ...[...lanes.values()].map((l) => l.lanes));
        return { column: c, items, lanes, maxLanes };
    });
    // Una columna con 3 citas empalmadas se ensancha para que cada tarjeta se siga leyendo.
    const minWidth = (lanes: number) => (narrow ? 0 : Math.max(180, lanes * 112));
    const template = `${AXIS_PX}px ${perColumn.map((p) => `minmax(${minWidth(p.maxLanes)}px, 1fr)`).join(' ')}`;

    // Al abrir un día: se baja a la hora actual (hoy) o a la primera cita.
    const firstStart = spans.length ? Math.min(...spans.map((s) => visualSpan(s.span).start)) : null;
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const target = isToday && nowMinutes >= range.start && nowMinutes < range.end ? nowMinutes - SLOT_MINUTES : firstStart !== null ? firstStart : range.start;
        // Si una cita ya empezada cruza esa línea, se sube hasta su inicio para que no quede cortada bajo el encabezado.
        const crossing = spans.map((s) => visualSpan(s.span)).filter((v) => v.start < target && v.end > target).map((v) => v.start);
        const focus = Math.max(range.start, Math.min(target, ...crossing));
        el.scrollTop = Math.max(0, spanBox({ start: focus, end: range.end }, range.start, SLOT_PX).top - 8);
        // Solo al cambiar de día o de barbero visible: no mover la vista cuando llegan datos nuevos.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dayKey, narrow, picked, range.start]);

    const closedSpans = (barberId: string | null): { span: Span; label: string }[] => {
        if (!schedule) return [];
        const w = workingWindow(schedule, dayKey, barberId);
        if (w === undefined) return [];
        if (w === null) return [{ span: range, label: closedDay ? 'El negocio cierra' : 'Descansa' }];
        return [
            ...(w.open > range.start ? [{ span: { start: range.start, end: Math.min(w.open, range.end) }, label: '' }] : []),
            ...(w.close < range.end ? [{ span: { start: Math.max(w.close, range.start), end: range.end }, label: '' }] : []),
        ];
    };

    const pickSlot = (minutes: number, columnId: string | null) => {
        const fire = () => { setGhost(null); onSlot(toHHMM(minutes), columnId ?? ''); };
        if (prefersReducedMotion()) { fire(); return; }
        setGhost({ col: columnId ?? 'none', minutes });
        clearTimeout(ghostTimer.current);
        ghostTimer.current = setTimeout(fire, GHOST_MS);
    };

    return (
        <div>
            {narrow && columns.length > 1 && (
                <div role="group" aria-label="Barbero del día" className="flex gap-2 overflow-x-auto border-b border-bos-border px-3 py-2.5">
                    {columns.map((c) => {
                        const active = shown[0]?.id === c.id;
                        return (
                            <button key={c.id ?? 'none'} type="button" aria-pressed={active} onClick={() => setPicked(c.id)}
                                className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-sm font-medium transition-colors motion-reduce:transition-none ${active ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`}>
                                <Avatar name={c.name} color={colorFor(c.id)} size={30} />
                                {c.name}
                                <span className="text-xs tabular-nums">{countOf(c.id)}</span>
                            </button>
                        );
                    })}
                </div>
            )}
            <div key={dayKey} className="bos-fade">
                <div ref={scroller} data-testid="day-scroll" className="max-h-[calc(100dvh-17rem)] min-h-[420px] overflow-auto overscroll-contain">
                    <div style={{ display: 'grid', gridTemplateColumns: template }}>
                        {/* Encabezado fijo por barbero: se queda arriba al bajar por el día. */}
                        <div className="sticky left-0 top-0 z-40 border-b border-bos-border bg-bos-surface" />
                        {perColumn.map(({ column: c }) => {
                            const count = countOf(c.id);
                            return (
                                <div key={c.id ?? 'none'} className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-l border-bos-border bg-bos-surface px-3 py-2.5"
                                    style={isToday ? { boxShadow: 'inset 0 2px 0 var(--bos-accent)' } : undefined}>
                                    <Avatar name={c.name} color={colorFor(c.id)} size={34} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold leading-5">{c.name}</p>
                                        <p className="text-xs leading-4 text-bos-muted">{count === 0 ? 'Sin citas' : `${count} cita${count === 1 ? '' : 's'}`}</p>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Eje de horas: solo la hora en punto lleva etiqueta; la media hora es una línea tenue. */}
                        <div className="sticky left-0 z-20 bg-bos-surface" style={{ height: gridHeight }}>
                            {hours.filter((m) => !nowInRange || Math.abs(m - nowMinutes) >= 20).map((m) => (
                                <span key={m} className="absolute right-2.5 text-xs font-medium tabular-nums text-bos-muted"
                                    style={{ top: spanBox({ start: m, end: m }, range.start, SLOT_PX).top, transform: m === range.start ? 'translateY(4px)' : 'translateY(-50%)' }}>
                                    {formatClock(m)}
                                </span>
                            ))}
                            <span aria-hidden="true" className="absolute right-2.5 text-xs font-medium tabular-nums text-bos-muted" style={{ top: gridHeight - 20 }}>{formatClock(range.end)}</span>
                            {nowInRange && (
                                <span data-testid="now-label" className="absolute right-1 z-10 -translate-y-1/2 rounded-md bg-bos-danger-soft px-1.5 py-0.5 text-xs font-semibold tabular-nums leading-4 text-bos-danger"
                                    style={{ top: spanBox({ start: nowMinutes, end: nowMinutes }, range.start, SLOT_PX).top }}>
                                    {formatClock(nowMinutes, false)}
                                </span>
                            )}
                        </div>

                        {perColumn.map(({ column: c, items, lanes }, colIndex) => {
                            const colKey = c.id ?? 'none';
                            const color = colorFor(c.id);
                            return (
                                <div key={colKey} data-testid="day-column" className="relative border-l border-bos-border" style={{ height: gridHeight }}>
                                    {slots.map((m, i) => {
                                        const w = schedule ? workingWindow(schedule, dayKey, c.id) : undefined;
                                        const open = w === undefined || (w !== null && m + SLOT_MINUTES > w.open && m < w.close);
                                        // Un hueco tapado por una cita (aunque sea en parte) no se agenda desde la cuadrícula: el clic caería en la cita.
                                        const covered = items.some(({ visual }) => visual.start < m + SLOT_MINUTES && visual.end > m);
                                        const canBook = canManage && open && !covered;
                                        return (
                                            <button key={m} type="button" disabled={!canBook} aria-hidden={canBook ? undefined : true} tabIndex={canBook ? undefined : -1}
                                                aria-label={canBook ? `Agendar con ${c.name} a las ${formatClock(m)}` : undefined}
                                                onClick={() => pickSlot(m, c.id)}
                                                style={{ top: i * SLOT_PX, height: SLOT_PX }}
                                                className={`group absolute inset-x-0 border-t focus-visible:outline-none ${m % 60 === 0 ? 'border-bos-border' : 'border-bos-border/50'} disabled:cursor-default`}>
                                                {canBook && (
                                                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-1 inset-y-[3px] hidden items-center justify-start rounded-lg border border-dashed border-bos-accent bg-bos-accent-soft pl-2 text-bos-accent-text group-hover:flex group-focus-visible:flex">
                                                        <Plus className="h-4 w-4" />
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                    {ghost && ghost.col === colKey && (
                                        <div aria-hidden="true" data-testid="slot-ghost" className="pointer-events-none absolute inset-x-1 z-[18] flex items-center gap-1.5 rounded-lg border-2 border-dashed border-bos-accent bg-bos-accent-soft px-2 text-xs font-semibold text-bos-accent-text"
                                            style={{ top: spanBox({ start: ghost.minutes, end: ghost.minutes + SLOT_MINUTES }, range.start, SLOT_PX).top + 2, height: SLOT_PX - 4 }}>
                                            <Plus className="h-3.5 w-3.5" /> {formatClock(ghost.minutes)}
                                        </div>
                                    )}
                                    {closedSpans(c.id).map(({ span, label }) => (
                                        <div key={`closed-${span.start}`} data-testid="closed-block" title={label || 'Fuera de horario'}
                                            style={{ ...spanBox(span, range.start, SLOT_PX), background: SUBTLE_BG }} className="pointer-events-none absolute inset-x-0 z-[14] px-2 py-1.5">
                                            {label && <span className="inline-block rounded-full border border-bos-border bg-bos-surface px-2 py-0.5 text-xs font-medium text-bos-muted">{label}</span>}
                                        </div>
                                    ))}
                                    {c.id && timeOff.filter((t) => t.barber_id === c.id).map((t) => {
                                        const part = overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), dayStart, dayEnd);
                                        if (!part) return null;
                                        const from = Math.max(part.from, range.start);
                                        const to = Math.min(part.to, range.end);
                                        if (to <= from) return null;
                                        return (
                                            <div key={t.id} data-testid="time-off-block" title={`${t.barber_name}: ${t.reason}`}
                                                style={{ ...spanBox({ start: from, end: to }, range.start, SLOT_PX), background: SUBTLE_BG_STRONG }}
                                                className="pointer-events-none absolute inset-x-1 z-[15] overflow-hidden rounded-lg border border-dashed border-bos-control px-2.5 py-2">
                                                <p className="flex items-center gap-1.5 text-xs font-semibold leading-4 text-bos-text"><Ban aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> No disponible</p>
                                                <p className="mt-0.5 text-xs leading-4 text-bos-muted">{t.reason}</p>
                                            </div>
                                        );
                                    })}
                                    {nowInRange && (
                                        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-[16] h-0.5 bg-bos-danger" style={{ top: spanBox({ start: nowMinutes, end: nowMinutes }, range.start, SLOT_PX).top - 1 }}>
                                            {colIndex === 0 && <span className="absolute -left-[5px] -top-[3px] h-2 w-2 rounded-full bg-bos-danger" />}
                                        </div>
                                    )}
                                    {items.map(({ a, span, visual }) => {
                                        const { lane, lanes: laneCount } = lanes.get(a.id) ?? { lane: 0, lanes: 1 };
                                        const box = spanBox(visual, range.start, SLOT_PX);
                                        const detail = cardDetail(visual);
                                        const tall = visual.end - visual.start >= 3 * SLOT_MINUTES;
                                        const live = isActive(a.status) && a.status !== 'no_show';
                                        const range12 = formatRange(span);
                                        const state = a.walk_in ? 'Sin cita' : STATUS_LABELS[a.status];
                                        return (
                                            <button key={a.id} type="button" data-testid="day-appointment"
                                                onClick={() => onOpenAppointment(a)}
                                                title={`${range12} · ${a.client_name}${servicesText(a) ? ` · ${servicesText(a)}` : ''}${a.barber ? ` · ${a.barber.name}` : ''} · ${state}`}
                                                style={{
                                                    top: box.top + 2, height: box.height - 4, borderLeftColor: color,
                                                    left: `calc(${(lane / laneCount) * 100}% + 4px)`, width: `calc(${100 / laneCount}% - 8px)`,
                                                    ...(live ? { ['--tint' as string]: tintOf(color), ['--tint-h' as string]: tintOf(color, TINT_HOVER_PCT) } : {}),
                                                }}
                                                className={`absolute z-20 flex flex-col items-stretch justify-start gap-px overflow-hidden rounded-lg border border-l-[4px] px-2.5 py-1 text-left transition-[box-shadow,transform,background-color] duration-150 hover:z-30 hover:-translate-y-px hover:shadow-md focus-visible:z-30 focus-visible:-translate-y-px focus-visible:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${a.walk_in ? 'border-dashed border-y-bos-control border-r-bos-control' : 'border-y-transparent border-r-transparent'} ${live ? 'bg-[var(--tint)] hover:bg-[var(--tint-h)]' : 'bg-bos-surface hover:bg-bos-raised'}`}>
                                                <span className="flex items-start gap-1.5">
                                                    {/* Cancelada: se atenúa con color (no con opacidad) para que se siga leyendo. */}
                                                    <span className={`min-w-0 flex-1 text-[13px] font-bold leading-[18px] ${tall ? 'line-clamp-2' : 'truncate'} ${isActive(a.status) && a.status !== 'no_show' ? 'text-bos-text' : 'text-bos-muted'} ${isActive(a.status) ? '' : 'line-through'}`}>{a.client_name}</span>
                                                    <StatusDot status={a.status} className="mt-1" />
                                                </span>
                                                <span className="block truncate text-xs leading-4 text-bos-muted">{range12}{detail.showService && servicesText(a) ? ` · ${servicesText(a)}` : ''}</span>
                                                {(detail.showService || a.walk_in) && (a.walk_in || a.status !== 'scheduled' || a.sale) && (
                                                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                                        {a.status !== 'scheduled' && <StatusChip status={a.status} />}
                                                        {a.walk_in && <span className="inline-flex rounded-full border border-dashed border-bos-control px-2 py-0.5 text-xs font-semibold leading-4 text-bos-text">Sin cita</span>}
                                                        {a.sale && <span className="text-xs font-semibold tabular-nums text-bos-text">{money(a.sale.total)}</span>}
                                                    </span>
                                                )}
                                                <span className="sr-only">{state}{a.sale ? `, ${money(a.sale.total)}` : ''}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
