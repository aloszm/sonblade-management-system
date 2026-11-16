'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import Calendar from './Calendar';
import PickerPopover from './PickerPopover';
import { PICKER_DEFAULT_FIELD, PICKER_TRIGGER } from './DatePicker';
import { clampDay, formatDayLong, formatRangeLabel, normalizeRange, parseDay, rangeShortcuts, todayInBusiness } from '@/lib/ui/date-picker';

export interface DateRange { from: string; to: string; }

export interface DateRangePickerProps {
    value: DateRange;
    onChange: (range: DateRange) => void;
    min?: string;
    max?: string;
    /** Máximo de días que puede abarcar el rango (inclusive). */
    maxDays?: number;
    /** Atajos (Hoy, Esta semana…). Apágalos si la pantalla ya tiene sus propios chips de periodo. */
    shortcuts?: boolean;
    id?: string;
    name?: string;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
}

/** Selector de rango desde–hasta en un solo control: primer clic = desde, segundo = hasta. */
export default function DateRangePicker({
    value, onChange, min, max, maxDays, shortcuts = true, id, name, disabled, placeholder = 'Elige el periodo', className,
    'aria-label': ariaLabel, 'aria-labelledby': labelledBy,
}: DateRangePickerProps) {
    const uid = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<string | null>(null);
    const [error, setError] = useState('');
    const today = useMemo(() => todayInBusiness(), []);
    const [focusKey, setFocusKey] = useState(today);
    const hasValue = !!parseDay(value.from) && !!parseDay(value.to);
    const presets = useMemo(() => rangeShortcuts(today).filter((s) => (!min || s.to >= min) && (!max || s.from <= max)), [today, min, max]);

    const close = () => { setOpen(false); setAnchor(null); setError(''); };
    const apply = (from: string, to: string) => {
        close();
        onChange({ from, to });
        requestAnimationFrame(() => trigger.current?.focus());
    };
    const openPanel = () => {
        setAnchor(null); setError('');
        setFocusKey(clampDay(hasValue ? value.from : today, min, max));
        setOpen(true);
    };
    const pick = (key: string) => {
        if (!anchor) { setAnchor(key); setError(''); return; }
        const r = normalizeRange(anchor, key, maxDays);
        if (!r.ok) { setError(r.error); setAnchor(null); return; }
        apply(r.from, r.to);
    };

    // Mientras se elige, el tramo va del primer clic al día con el foco o el mouse.
    const preview = anchor ? normalizeRange(anchor, focusKey) : null;
    const shown = anchor
        ? { from: preview && preview.ok ? preview.from : anchor, to: preview && preview.ok ? preview.to : anchor }
        : hasValue ? value : { from: undefined, to: undefined };

    return (
        <>
            <button ref={trigger} type="button" id={id} disabled={disabled}
                aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${uid}-panel` : undefined}
                aria-label={ariaLabel} aria-labelledby={labelledBy}
                onClick={() => (open ? close() : openPanel())}
                className={`${PICKER_TRIGGER} ${className ?? PICKER_DEFAULT_FIELD}`}>
                <span className={`truncate ${hasValue ? '' : 'text-bos-muted'}`}>{hasValue ? formatRangeLabel(value.from, value.to) : placeholder}</span>
                <CalendarRange className="h-5 w-5 shrink-0 text-bos-muted" aria-hidden="true" />
            </button>
            {name && <><input type="hidden" name={`${name}_from`} value={hasValue ? value.from : ''} /><input type="hidden" name={`${name}_to`} value={hasValue ? value.to : ''} /></>}
            {open && (
                <PickerPopover anchorRef={trigger} label={ariaLabel ?? 'Elegir periodo'} onClose={close} width={shortcuts ? 340 : 320}>
                    <div id={`${uid}-panel`}>
                        {shortcuts && presets.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                                {presets.map((s) => (
                                    <button key={s.id} type="button" onClick={() => apply(s.from, s.to)}
                                        className="h-11 px-3 rounded-xl border border-bos-border text-sm text-bos-text hover:bg-bos-raised">{s.label}</button>
                                ))}
                            </div>
                        )}
                        <p role="status" className="mb-2 text-sm text-bos-muted">
                            {anchor ? `Desde ${formatDayLong(anchor)}. Elige el último día.` : 'Elige el primer día del periodo.'}
                        </p>
                        {error && <p role="alert" className="mb-2 rounded-xl bg-bos-danger-soft p-2 text-sm text-bos-danger">{error}</p>}
                        <Calendar focusKey={focusKey} onFocusChange={setFocusKey} onPick={pick} onHover={(k) => { if (anchor) setFocusKey(k); }}
                            today={today} min={min} max={max} rangeFrom={shown.from} rangeTo={shown.to} label="Fechas del periodo" />
                        <div className="mt-2 flex justify-end border-t border-bos-border pt-2">
                            <button type="button" onClick={() => { close(); requestAnimationFrame(() => trigger.current?.focus()); }}
                                className="h-11 px-4 rounded-xl text-sm text-bos-muted hover:bg-bos-raised hover:text-bos-text">Cerrar</button>
                        </div>
                    </div>
                </PickerPopover>
            )}
        </>
    );
}
