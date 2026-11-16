'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import Calendar from './Calendar';
import PickerPopover from './PickerPopover';
import { clampDay, formatDayLabel, isDayDisabled, parseDay, todayInBusiness } from '@/lib/ui/date-picker';

export interface DatePickerProps {
    /** Día 'AAAA-MM-DD' (o vacío). Mismo contrato que `<input type="date">`. */
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    id?: string;
    name?: string;
    required?: boolean;
    disabled?: boolean;
    /** Muestra «Borrar» para dejar la fecha vacía (campos opcionales). */
    clearable?: boolean;
    placeholder?: string;
    className?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}

export const PICKER_TRIGGER =
    'flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed';
export const PICKER_DEFAULT_FIELD =
    'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text';

/** Selector de fecha con calendario propio, en español y accesible (patrón de diálogo APG). */
export default function DatePicker({
    value, onChange, min, max, id, name, disabled, clearable, placeholder = 'Elige la fecha', className,
    'aria-label': ariaLabel, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy,
}: DatePickerProps) {
    const uid = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const today = useMemo(() => todayInBusiness(), []);
    const [focusKey, setFocusKey] = useState(today);
    const valid = parseDay(value) ? value : '';

    const openPanel = () => {
        setFocusKey(clampDay(valid || today, min, max));
        setOpen(true);
    };
    const pick = (key: string) => {
        setOpen(false);
        onChange(key);
        requestAnimationFrame(() => trigger.current?.focus());
    };

    return (
        <>
            <button ref={trigger} type="button" id={id} disabled={disabled}
                aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${uid}-panel` : undefined}
                aria-label={ariaLabel} aria-labelledby={labelledBy} aria-describedby={describedBy}
                onClick={() => (open ? setOpen(false) : openPanel())}
                className={`${PICKER_TRIGGER} ${className ?? PICKER_DEFAULT_FIELD}`}>
                <span className={`truncate ${valid ? '' : 'text-bos-muted'}`}>{valid ? formatDayLabel(valid) : placeholder}</span>
                <CalendarDays className="h-5 w-5 shrink-0 text-bos-muted" aria-hidden="true" />
            </button>
            {name && <input type="hidden" name={name} value={valid} />}
            {open && (
                <PickerPopover anchorRef={trigger} label={ariaLabel ?? 'Elegir fecha'} onClose={() => setOpen(false)}>
                    <div id={`${uid}-panel`}>
                        <Calendar focusKey={focusKey} onFocusChange={setFocusKey} onPick={pick} today={today}
                            min={min} max={max} selected={valid} label="Fechas" />
                        <div className="mt-2 flex items-center justify-between border-t border-bos-border pt-2">
                            <button type="button" disabled={isDayDisabled(today, min, max)} onClick={() => pick(today)}
                                className="h-11 px-4 rounded-xl text-sm font-medium text-bos-accent-text hover:bg-bos-raised disabled:text-bos-control disabled:cursor-not-allowed">Hoy</button>
                            {clearable && valid && (
                                <button type="button" onClick={() => pick('')}
                                    className="h-11 px-4 rounded-xl text-sm text-bos-muted hover:bg-bos-raised hover:text-bos-text">Borrar</button>
                            )}
                            <button type="button" onClick={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }}
                                className="h-11 px-4 rounded-xl text-sm text-bos-muted hover:bg-bos-raised hover:text-bos-text">Cerrar</button>
                        </div>
                    </div>
                </PickerPopover>
            )}
        </>
    );
}
