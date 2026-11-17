'use client';

import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    WEEKDAY_LABELS, addMonthsKey, clampDay, endOfMonthKey, formatDayLong, formatMonthTitle, monthGrid,
    moveFocus, startOfMonthKey, type CalendarKey,
} from '@/lib/ui/date-picker';

const NAV_KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

/**
 * Calendario de un mes para elegir día de reserva. Los días con horarios llevan un punto y van en
 * negritas; los demás se ven apagados y no se pueden elegir. Mismo patrón de teclado que components/ui/Calendar.
 */
export default function DayPicker({ focusKey, onFocusChange, onPick, today, min, max, selected, availability, loading, label }: {
    focusKey: string; onFocusChange: (k: string) => void; onPick: (k: string) => void;
    today: string; min: string; max: string; selected?: string;
    availability: Map<string, boolean> | null; loading: boolean; label: string;
}) {
    const gridRef = useRef<HTMLDivElement>(null);
    const keyboard = useRef(false);
    const weeks = monthGrid(focusKey, min, max);
    const prevOff = startOfMonthKey(focusKey) <= min;
    const nextOff = endOfMonthKey(focusKey) >= max;

    useEffect(() => {
        if (!keyboard.current) return;
        gridRef.current?.querySelector<HTMLElement>(`[data-day="${focusKey}"]`)?.focus();
    }, [focusKey]);

    const goMonth = (n: number) => onFocusChange(clampDay(addMonthsKey(focusKey, n), min, max));
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (!NAV_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        keyboard.current = true;
        onFocusChange(moveFocus(focusKey, e.key as CalendarKey, { min, max, shift: e.shiftKey }));
    };
    const arrow = 'inline-flex h-11 w-11 items-center justify-center rounded-xl text-bos-text hover:bg-bos-raised disabled:cursor-not-allowed disabled:text-bos-control disabled:hover:bg-transparent';

    return (
        <div className="rounded-2xl border border-bos-border bg-bos-surface p-3">
            <div className="mb-2 flex items-center justify-between">
                <button type="button" aria-label="Mes anterior" disabled={prevOff} onClick={() => goMonth(-1)} className={arrow}><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
                <div aria-live="polite" className="text-base font-semibold capitalize text-bos-text">{formatMonthTitle(focusKey)}</div>
                <button type="button" aria-label="Mes siguiente" disabled={nextOff} onClick={() => goMonth(1)} className={arrow}><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div ref={gridRef} role="grid" aria-label={`${label}, ${formatMonthTitle(focusKey)}`} aria-busy={loading} onKeyDown={onKeyDown}>
                <div role="row" className="grid grid-cols-7">
                    {WEEKDAY_LABELS.map((d) => (
                        <div key={d} role="columnheader" className="flex h-8 items-center justify-center text-xs font-medium text-bos-muted">{d}</div>
                    ))}
                </div>
                {weeks.map((week) => (
                    <div key={week[0].key} role="row" className="grid grid-cols-7">
                        {week.map((d) => {
                            if (!d.inMonth) return <div key={d.key} role="gridcell" aria-hidden="true" className="h-11" />;
                            const known = availability !== null;
                            const avail = known && availability.get(d.key) === true && !d.disabled;
                            const isSel = d.key === selected;
                            const isToday = d.key === today;
                            const tone = isSel ? 'bg-bos-accent text-bos-on-accent font-semibold'
                                : avail ? 'bg-bos-accent-soft font-semibold text-bos-accent-text hover:bg-bos-raised'
                                : loading && !d.disabled ? 'animate-pulse bg-bos-raised text-bos-muted'
                                : 'text-bos-control';
                            const state = avail ? ', con horarios' : loading && !d.disabled ? '' : ', sin horarios';
                            return (
                                <div key={d.key} role="gridcell" aria-selected={isSel || undefined} className="flex items-center justify-center p-px">
                                    <button type="button" data-day={d.key} tabIndex={d.key === focusKey ? 0 : -1}
                                        aria-disabled={!avail || undefined}
                                        aria-current={isToday ? 'date' : undefined}
                                        aria-label={formatDayLong(d.key) + (isToday ? ', hoy' : '') + state}
                                        onFocus={() => { if (d.key !== focusKey) onFocusChange(d.key); }}
                                        onClick={() => { if (avail) { keyboard.current = false; onPick(d.key); } }}
                                        className={`relative h-11 w-full min-w-11 rounded-xl text-sm ${tone} ${avail ? '' : 'cursor-not-allowed'} ${isToday && !isSel ? 'ring-1 ring-inset ring-bos-accent-text' : ''}`}>
                                        {d.day}
                                        {avail && !isSel && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-bos-accent-text" />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs text-bos-muted">
                <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-bos-accent-soft ring-1 ring-bos-accent" />
                Los días resaltados tienen horarios libres.
            </p>
        </div>
    );
}
