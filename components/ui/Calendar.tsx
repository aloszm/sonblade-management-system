'use client';

import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
    WEEKDAY_LABELS, addMonthsKey, clampDay, endOfMonthKey, formatDayLong, formatMonthTitle, monthGrid,
    moveFocus, startOfMonthKey, type CalendarKey,
} from '@/lib/ui/date-picker';

export interface CalendarProps {
    /** Día con el foco; también decide qué mes se muestra. */
    focusKey: string;
    onFocusChange: (key: string) => void;
    onPick: (key: string) => void;
    today: string;
    min?: string;
    max?: string;
    selected?: string;
    /** Rango resaltado (inclusive). */
    rangeFrom?: string;
    rangeTo?: string;
    /** Título accesible de la cuadrícula. */
    label: string;
    /** Pasar el mouse por un día (para previsualizar un rango). */
    onHover?: (key: string) => void;
}

const NAV_KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

/** Mes en cuadrícula (semana de domingo a sábado) con navegación por teclado del patrón APG. */
export default function Calendar({ focusKey, onFocusChange, onPick, today, min, max, selected, rangeFrom, rangeTo, label, onHover }: CalendarProps) {
    const gridRef = useRef<HTMLDivElement>(null);
    const keyboard = useRef(false);
    const weeks = monthGrid(focusKey, min, max);
    const monthStart = startOfMonthKey(focusKey), monthEnd = endOfMonthKey(focusKey);
    const prevOff = !!min && monthStart <= min;
    const nextOff = !!max && monthEnd >= max;

    // Tras mover con el teclado, el foco real sigue al día activo.
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

    const arrow = 'h-11 w-11 inline-flex items-center justify-center rounded-xl text-bos-text hover:bg-bos-raised disabled:text-bos-control disabled:hover:bg-transparent disabled:cursor-not-allowed';

    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <button type="button" aria-label="Mes anterior" disabled={prevOff} onClick={() => goMonth(-1)} className={arrow}><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
                <div aria-live="polite" className="text-base font-semibold capitalize text-bos-text">{formatMonthTitle(focusKey)}</div>
                <button type="button" aria-label="Mes siguiente" disabled={nextOff} onClick={() => goMonth(1)} className={arrow}><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div ref={gridRef} role="grid" aria-label={`${label}, ${formatMonthTitle(focusKey)}`} onKeyDown={onKeyDown}>
                <div role="row" className="grid grid-cols-7">
                    {WEEKDAY_LABELS.map((d) => (
                        <div key={d} role="columnheader" className="h-8 flex items-center justify-center text-xs font-medium uppercase text-bos-muted">{d}</div>
                    ))}
                </div>
                {weeks.map((week) => (
                    <div key={week[0].key} role="row" className="grid grid-cols-7">
                        {week.map((d) => {
                            const isSel = d.key === selected;
                            const inRange = !!rangeFrom && !!rangeTo && d.key >= rangeFrom && d.key <= rangeTo;
                            const edge = d.key === rangeFrom || d.key === rangeTo;
                            const isToday = d.key === today;
                            const tone = isSel || edge
                                ? 'bg-bos-accent text-bos-on-accent font-semibold'
                                : inRange ? 'bg-bos-accent-soft text-bos-accent-text'
                                : d.disabled ? 'text-bos-control'
                                : d.inMonth ? 'text-bos-text hover:bg-bos-raised' : 'text-bos-muted hover:bg-bos-raised';
                            const band = inRange && !(isSel || edge) ? 'rounded-none' : 'rounded-xl';
                            return (
                                <div key={d.key} role="gridcell" aria-selected={isSel || edge || inRange ? true : undefined} className="flex items-center justify-center p-px">
                                    <button type="button" data-day={d.key} tabIndex={d.key === focusKey ? 0 : -1}
                                        data-autofocus={d.key === focusKey ? '' : undefined}
                                        aria-disabled={d.disabled || undefined}
                                        aria-current={isToday ? 'date' : undefined}
                                        aria-label={formatDayLong(d.key) + (isToday ? ', hoy' : '')}
                                        onMouseEnter={() => onHover?.(d.key)}
                                        onFocus={() => { if (d.key !== focusKey) onFocusChange(d.key); }}
                                        onClick={() => { if (!d.disabled) { keyboard.current = false; onPick(d.key); } }}
                                        className={`h-11 w-full min-w-11 text-sm ${band} ${tone} ${isToday && !isSel && !edge ? 'ring-1 ring-inset ring-bos-accent-text' : ''} ${d.disabled ? 'cursor-not-allowed line-through' : ''}`}>
                                        {d.day}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
