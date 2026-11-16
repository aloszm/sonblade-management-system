'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import PickerPopover from './PickerPopover';
import { PICKER_DEFAULT_FIELD, PICKER_TRIGGER } from './DatePicker';
import { formatTime12, nearestOptionIndex, nowTimeInBusiness, timeOptions, timeToMinutes, withValue, type TimeOption } from '@/lib/ui/date-picker';

export interface TimePickerProps {
    /** 'HH:MM' de 24 horas (o vacío). */
    value: string;
    onChange: (value: string) => void;
    /** Minutos entre opciones; 30 por omisión. Se ignora si pasas `options`. */
    step?: number;
    min?: string;
    max?: string;
    /** Lista exacta de horas permitidas (por ejemplo, según el horario del día). */
    options?: TimeOption[];
    id?: string;
    name?: string;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    'aria-describedby'?: string;
}

/** Selector de hora en lista de 12 horas (valor de 24 horas), con teclado de listbox. */
export default function TimePicker({
    value, onChange, step = 30, min, max, options: given, id, name, disabled, placeholder = 'Elige la hora', className,
    'aria-label': ariaLabel, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy,
}: TimePickerProps) {
    const uid = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLUListElement>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const options = useMemo(() => given ?? withValue(timeOptions(step, min, max), timeToMinutes(value) !== null ? value : ''), [given, step, min, max, value]);
    const current = options.find((o) => o.value === value);
    const text = current?.label ?? (timeToMinutes(value) !== null ? formatTime12(value) : '');

    const openPanel = () => {
        const sel = options.findIndex((o) => o.value === value);
        setActive(sel >= 0 ? sel : Math.max(0, nearestOptionIndex(options, nowTimeInBusiness())));
        setOpen(true);
    };
    const pick = (i: number) => {
        const o = options[i];
        setOpen(false);
        if (o) onChange(o.value);
        requestAnimationFrame(() => trigger.current?.focus());
    };

    // Al abrir centra la opción activa; después solo la mantiene a la vista.
    const centered = useRef(false);
    useEffect(() => { if (!open) centered.current = false; }, [open]);
    useEffect(() => {
        const ul = list.current;
        const el = ul?.children[active] as HTMLElement | undefined;
        if (!open || !ul || !el) return;
        const u = ul.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (!centered.current) {
            centered.current = true;
            ul.scrollTop += r.top - u.top - (u.height - r.height) / 2;
        } else if (r.top < u.top) ul.scrollTop += r.top - u.top;
        else if (r.bottom > u.bottom) ul.scrollTop += r.bottom - u.bottom;
    }, [open, active]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        const last = options.length - 1;
        const go = (n: number) => { e.preventDefault(); setActive(Math.max(0, Math.min(last, n))); };
        switch (e.key) {
            case 'ArrowDown': go(active + 1); break;
            case 'ArrowUp': go(active - 1); break;
            case 'PageDown': go(active + 6); break;
            case 'PageUp': go(active - 6); break;
            case 'Home': go(0); break;
            case 'End': go(last); break;
            case 'Enter': case ' ': e.preventDefault(); pick(active); break;
        }
    };

    return (
        <>
            <button ref={trigger} type="button" id={id} disabled={disabled}
                aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${uid}-panel` : undefined}
                aria-label={ariaLabel} aria-labelledby={labelledBy} aria-describedby={describedBy}
                onClick={() => (open ? setOpen(false) : openPanel())}
                className={`${PICKER_TRIGGER} ${className ?? PICKER_DEFAULT_FIELD}`}>
                <span className={`truncate ${text ? '' : 'text-bos-muted'}`}>{text || placeholder}</span>
                <Clock className="h-5 w-5 shrink-0 text-bos-muted" aria-hidden="true" />
            </button>
            {name && <input type="hidden" name={name} value={value} />}
            {open && (
                <PickerPopover anchorRef={trigger} label={ariaLabel ?? 'Elegir hora'} onClose={() => setOpen(false)} width={220}>
                    <ul ref={list} id={`${uid}-panel`} role="listbox" tabIndex={0} data-autofocus
                        aria-label={ariaLabel ?? 'Horas'} aria-activedescendant={options.length ? `${uid}-o${active}` : undefined}
                        onKeyDown={onKeyDown}
                        className="max-h-72 overflow-y-auto rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-bos-accent-text">
                        {options.length === 0 && <li role="presentation" className="px-3 py-3 text-sm text-bos-muted">Sin horas disponibles</li>}
                        {options.map((o, i) => {
                            const sel = o.value === value;
                            return (
                                <li key={o.value} id={`${uid}-o${i}`} role="option" aria-selected={sel} data-value={o.value}
                                    onClick={() => pick(i)} onMouseMove={() => { if (i !== active) setActive(i); }}
                                    className={`flex h-11 cursor-pointer items-center rounded-xl px-3 text-base ${sel ? 'bg-bos-accent text-bos-on-accent font-semibold' : i === active ? 'bg-bos-raised text-bos-text' : 'text-bos-text'}`}>
                                    {o.label}
                                </li>
                            );
                        })}
                    </ul>
                </PickerPopover>
            )}
        </>
    );
}
