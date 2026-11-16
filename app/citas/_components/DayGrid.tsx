'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Appointment } from '@/types';
import { STATUS_LABELS, isActive, layoutLanes } from '@/lib/appointments/appointments-view';
import {
    SLOT_MINUTES, appointmentSpan, cardDetail, formatClock, formatRange, gridRange, slotStarts, spanBox, toHHMM, visualSpan, type Span,
} from '@/lib/appointments/calendar-grid';
import { overlapMinutes, type TimeOffView } from '@/lib/appointments/time-off';
import { workingWindow, type ScheduleData } from '@/lib/appointments/hours';
import { HATCH, NO_BARBER_COLOR, SLOT_PX, money } from './agenda-ui';

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

/** En punto: "1 p.m."; y media: "1:30". */
const slotLabel = (minutes: number) => formatClock(minutes, minutes % 60 === 0);

/** Cuadrícula del día: una columna por barbero, líneas cada 30 minutos y cada cita alineada a su inicio y fin. */
export default function DayGrid({ dayKey, todayKey, nowMinutes, appointments, columns, colorOf, schedule, timeOff, canManage, onSlot, onOpenAppointment }: DayGridProps) {
    const narrow = useNarrow();
    const scroller = useRef<HTMLDivElement>(null);
    const [picked, setPicked] = useState<string | null | undefined>(undefined);

    const spans = useMemo(() => appointments.map((a) => ({ a, span: appointmentSpan(a.scheduled_at, a.end_at) })), [appointments]);
    const businessWindow = schedule ? workingWindow(schedule, dayKey) : undefined;
    const closedDay = businessWindow === null;
    const range = useMemo(() => gridRange(businessWindow, spans.map((s) => s.span)), [businessWindow, spans]);
    const slots = useMemo(() => slotStarts(range), [range]);
    const gridHeight = slots.length * SLOT_PX;

    const shown = narrow && columns.length > 1
        ? columns.filter((c) => c.id === (picked !== undefined && columns.some((x) => x.id === picked) ? picked : columns[0].id))
        : columns;

    const dayStart = new Date(`${dayKey}T00:00:00`);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const countOf = (id: string | null) => appointments.filter((a) => (a.barber?.id ?? null) === id && isActive(a.status)).length;

    // Carriles por columna: citas empalmadas lado a lado, calculadas sobre lo que ocupan en la cuadrícula.
    const perColumn = shown.map((c) => {
        const items = spans.filter((s) => (s.a.barber?.id ?? null) === c.id).map((s) => ({ ...s, visual: visualSpan(s.span) }));
        const lanes = layoutLanes(items.map((s) => ({ id: s.a.id, start: s.visual.start, end: s.visual.end })));
        const maxLanes = Math.max(1, ...[...lanes.values()].map((l) => l.lanes));
        return { column: c, items, lanes, maxLanes };
    });
    // Una columna con 3 citas empalmadas se ensancha para que cada tarjeta se siga leyendo.
    const minWidth = (lanes: number) => (narrow ? 0 : Math.max(170, lanes * 104));
    const template = `52px ${perColumn.map((p) => `minmax(${minWidth(p.maxLanes)}px, 1fr)`).join(' ')}`;

    // Al abrir un día: se baja a la hora actual (hoy) o a la primera cita.
    const firstStart = spans.length ? Math.min(...spans.map((s) => visualSpan(s.span).start)) : null;
    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const target = dayKey === todayKey && nowMinutes >= range.start && nowMinutes < range.end ? nowMinutes - SLOT_MINUTES : firstStart !== null ? firstStart : range.start;
        // Si una cita ya empezada cruza esa línea, se sube hasta su inicio para que no quede cortada bajo el encabezado.
        const crossing = spans.map((s) => visualSpan(s.span)).filter((v) => v.start < target && v.end > target).map((v) => v.start);
        const focus = Math.max(range.start, Math.min(target, ...crossing));
        el.scrollTop = spanBox({ start: focus, end: range.end }, range.start, SLOT_PX).top;
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

    return (
        <div>
            {narrow && columns.length > 1 && (
                <div role="group" aria-label="Barbero del día" className="flex gap-2 overflow-x-auto border-b border-bos-border p-2">
                    {columns.map((c) => {
                        const active = shown[0]?.id === c.id;
                        return (
                            <button key={c.id ?? 'none'} type="button" aria-pressed={active} onClick={() => setPicked(c.id)}
                                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium ${active ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted'}`}>
                                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: c.id ? colorOf(c.id) : NO_BARBER_COLOR }} />
                                {c.name}
                                <span className="text-xs tabular-nums">{countOf(c.id)}</span>
                            </button>
                        );
                    })}
                </div>
            )}
            <div ref={scroller} data-testid="day-scroll" className="max-h-[72vh] min-h-[360px] overflow-auto">
                <div style={{ display: 'grid', gridTemplateColumns: template }}>
                    {/* Encabezado fijo: se queda arriba al bajar por el día. */}
                    <div className="sticky left-0 top-0 z-40 border-b border-bos-border bg-bos-surface" />
                    {perColumn.map(({ column: c }) => {
                        const count = countOf(c.id);
                        return (
                            <div key={c.id ?? 'none'} className="sticky top-0 z-30 border-b border-l border-bos-border bg-bos-surface px-3 py-2.5">
                                <p className="flex items-center gap-2 text-sm font-semibold">
                                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.id ? colorOf(c.id) : NO_BARBER_COLOR }} />
                                    <span className="truncate">{c.name}</span>
                                </p>
                                <p className="text-xs text-bos-muted">{count === 0 ? 'Sin citas' : `${count} cita${count === 1 ? '' : 's'}`}</p>
                            </div>
                        );
                    })}

                    {/* Eje de horas: la hora en punto y la media hora. */}
                    <div className="sticky left-0 z-20 bg-bos-surface" style={{ height: gridHeight }}>
                        {slots.map((m) => (
                            <div key={m} style={{ height: SLOT_PX }} className={`pr-2 pt-0.5 text-right text-xs tabular-nums ${m % 60 === 0 ? 'font-medium text-bos-text' : 'text-bos-muted'}`}>
                                {slotLabel(m)}
                            </div>
                        ))}
                    </div>

                    {perColumn.map(({ column: c, items, lanes }) => (
                        <div key={c.id ?? 'none'} data-testid="day-column" className="relative border-l border-bos-border" style={{ height: gridHeight }}>
                            {slots.map((m, i) => {
                                const w = schedule ? workingWindow(schedule, dayKey, c.id) : undefined;
                                const open = w === undefined || (w !== null && m + SLOT_MINUTES > w.open && m < w.close);
                                return (
                                    <button key={m} type="button" disabled={!canManage || !open}
                                        aria-label={canManage && open ? `Agendar con ${c.name} a las ${formatClock(m)}` : undefined}
                                        onClick={() => onSlot(toHHMM(m), c.id ?? '')}
                                        style={{ top: i * SLOT_PX, height: SLOT_PX }}
                                        className={`absolute inset-x-0 border-t ${m % 60 === 0 ? 'border-bos-border' : 'border-dashed border-bos-border/60'} enabled:hover:bg-bos-raised/60 disabled:cursor-default`} />
                                );
                            })}
                            {closedSpans(c.id).map(({ span, label }) => {
                                const box = spanBox(span, range.start, SLOT_PX);
                                return (
                                    <div key={`closed-${span.start}`} data-testid="closed-block" title={label || 'Fuera de horario'}
                                        style={{ ...box, backgroundImage: HATCH }} className="absolute inset-x-0 z-[14] bg-bos-bg/60 px-2 py-1">
                                        {label && <span className="inline-block rounded bg-bos-surface px-1.5 py-0.5 text-xs font-semibold text-bos-muted">{label}</span>}
                                    </div>
                                );
                            })}
                            {c.id && timeOff.filter((t) => t.barber_id === c.id).map((t) => {
                                const part = overlapMinutes(new Date(t.starts_at), new Date(t.ends_at), dayStart, dayEnd);
                                if (!part) return null;
                                const from = Math.max(part.from, range.start);
                                const to = Math.min(part.to, range.end);
                                if (to <= from) return null;
                                return (
                                    <div key={t.id} data-testid="time-off-block" title={`${t.barber_name}: ${t.reason}`}
                                        style={{ ...spanBox({ start: from, end: to }, range.start, SLOT_PX), backgroundImage: HATCH }}
                                        className="pointer-events-none absolute inset-x-0 z-[15] overflow-hidden border-y border-bos-border bg-bos-bg/70 px-2 py-1">
                                        <span className="inline-block max-w-full rounded bg-bos-surface px-1.5 py-0.5 text-xs font-semibold leading-4 text-bos-muted">No disponible · {t.reason}</span>
                                    </div>
                                );
                            })}
                            {dayKey === todayKey && nowMinutes >= range.start && nowMinutes < range.end && (
                                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-[16] h-px bg-bos-danger" style={{ top: spanBox({ start: nowMinutes, end: nowMinutes }, range.start, SLOT_PX).top }} />
                            )}
                            {items.map(({ a, span, visual }) => {
                                const { lane, lanes: laneCount } = lanes.get(a.id) ?? { lane: 0, lanes: 1 };
                                const box = spanBox(visual, range.start, SLOT_PX);
                                const detail = cardDetail(visual);
                                const tall = visual.end - visual.start >= 3 * SLOT_MINUTES;
                                const live = isActive(a.status);
                                const range12 = formatRange(span);
                                const state = a.walk_in ? 'Sin cita' : STATUS_LABELS[a.status];
                                return (
                                    <button key={a.id} type="button" data-testid="day-appointment"
                                        onClick={() => onOpenAppointment(a)}
                                        title={`${range12} · ${a.client_name}${a.notes ? ` · ${a.notes}` : ''}${a.barber ? ` · ${a.barber.name}` : ''} · ${state}`}
                                        style={{
                                            top: box.top + 1, height: box.height - 2, borderLeftColor: c.id ? colorOf(c.id) : NO_BARBER_COLOR,
                                            left: `calc(${(lane / laneCount) * 100}% + 3px)`, width: `calc(${100 / laneCount}% - 6px)`,
                                        }}
                                        className={`absolute z-20 flex flex-col items-stretch justify-start overflow-hidden rounded-md border border-l-[3px] border-bos-border px-2 py-[3px] text-left transition-colors ${a.walk_in ? 'border-dashed' : ''} ${live ? 'bg-bos-raised hover:bg-bos-bg' : 'bg-bos-surface'}`}>
                                        {/* Cancelada: se atenúa con color (no con opacidad) para que se siga leyendo. */}
                                        <span className={`block text-[13px] font-semibold leading-[18px] ${tall ? 'line-clamp-2' : 'truncate'} ${live ? '' : 'text-bos-muted line-through'}`}>{a.client_name}</span>
                                        <span className="block truncate text-xs leading-4 text-bos-muted">{range12} · {state}{a.sale ? ` · ${money(a.sale.total)}` : ''}</span>
                                        {detail.showService && a.notes && <span className="block truncate text-xs leading-4 text-bos-muted">{a.notes}</span>}
                                        {detail.showBarber && <span className="block truncate text-xs leading-4 text-bos-muted">{a.barber ? a.barber.name : 'Sin barbero asignado'}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
