'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bookingApi } from '@/lib/booking-ui/api';
import type { BookingError } from '@/lib/booking-ui/errors';
import { formatDayNice } from '@/lib/booking-ui/format';
import type { Availability, BookingBarber, BookingConfig, BookingService } from '@/lib/booking-ui/types';
import { clampDay } from '@/lib/ui/date-picker';
import DayPicker from './DayPicker';
import type { Mode } from './HowStep';
import { Avatar, BackButton, ErrorNote, InfoNote, PRIMARY_BTN, SECONDARY_BTN, Skeleton, StepHeading, StickyBar } from './parts';

export interface Selection { date: string | null; time: string | null; label: string | null; barber: BookingBarber | 'any' | null }

type Slots = { status: 'loading' } | { status: 'error'; error: BookingError } | { status: 'ready'; data: Availability };

export default function WhenStep({ config, service, mode, barber, sel, setSel, notice, refreshKey, onNext, onBack, onSwitchMode }: {
    config: BookingConfig; service: BookingService; mode: Mode; barber: BookingBarber | null;
    sel: Selection; setSel: (s: Selection) => void; notice: string | null; refreshKey: number;
    onNext: () => void; onBack: () => void; onSwitchMode: () => void;
}) {
    const barberId = mode === 'barber' ? barber?.id ?? null : null;
    const [days, setDays] = useState<Map<string, boolean> | null>(null);
    const [daysError, setDaysError] = useState<BookingError | null>(null);
    const [daysTry, setDaysTry] = useState(0);
    const [slots, setSlots] = useState<Slots>({ status: 'loading' });
    const [slotsTry, setSlotsTry] = useState(0);
    const [focusKey, setFocusKey] = useState(() => clampDay(sel.date ?? config.today, config.min_date, config.max_date));
    const hoursRef = useRef<HTMLDivElement>(null);
    const movedFocus = useRef(!!sel.date);

    useEffect(() => {
        let alive = true;
        setDays(null); setDaysError(null);
        bookingApi.days(service.id, barberId, config.min_date, config.max_date).then((r) => {
            if (!alive) return;
            if (!r.ok) { setDaysError(r.error); return; }
            const map = new Map(r.data.days.map((d) => [d.date, d.available]));
            setDays(map);
            if (!movedFocus.current) {
                const first = r.data.days.find((d) => d.available);
                if (first) setFocusKey(first.date);
            }
        });
        return () => { alive = false; };
    }, [service.id, barberId, config.min_date, config.max_date, daysTry, refreshKey]);

    useEffect(() => {
        if (!sel.date) return;
        let alive = true;
        setSlots({ status: 'loading' });
        bookingApi.availability(sel.date, service.id, barberId).then((r) => {
            if (!alive) return;
            setSlots(r.ok ? { status: 'ready', data: r.data } : { status: 'error', error: r.error });
        });
        return () => { alive = false; };
    }, [sel.date, service.id, barberId, slotsTry, refreshKey]);

    const pickDay = (key: string) => {
        movedFocus.current = true;
        setSel({ date: key, time: null, label: null, barber: mode === 'barber' ? barber : null });
        window.setTimeout(() => hoursRef.current?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
    };
    const pickTime = (time: string, label: string) =>
        setSel({ ...sel, time, label, barber: mode === 'barber' ? barber : 'any' });

    const slotData = slots.status === 'ready' ? slots.data : null;
    const currentSlot = useMemo(() => slotData?.slots.find((s) => s.time === sel.time) ?? null, [slotData, sel.time]);
    const ready = !!sel.date && !!sel.time && !!sel.barber && (mode === 'barber' || !!currentSlot);
    const chosenName = sel.barber === 'any' ? null : sel.barber?.name;

    return (
        <section aria-label="Día y hora">
            <BackButton onClick={onBack} />
            <StepHeading focusKey={`when-${mode}`} hint={mode === 'barber' ? undefined : 'Elige el día y la hora; luego, con quién prefieres.'}>
                {mode === 'barber' && barber ? `Cuándo con ${barber.name}` : 'Elige día y hora'}
            </StepHeading>

            {notice && <div className="mb-4"><ErrorNote>{notice}</ErrorNote></div>}
            {daysError && (
                <div className="mb-4"><ErrorNote action={<button type="button" onClick={() => setDaysTry((n) => n + 1)} className="min-h-11 rounded-xl border border-bos-control px-4 text-sm font-medium">Reintentar</button>}>{daysError.message}</ErrorNote></div>
            )}

            <DayPicker focusKey={focusKey} onFocusChange={(k) => { movedFocus.current = true; setFocusKey(k); }} onPick={pickDay}
                today={config.today} min={config.min_date} max={config.max_date} selected={sel.date ?? undefined}
                availability={days} loading={!days && !daysError} label="Día de tu cita" />
            {days && ![...days.values()].some(Boolean) && (
                <div className="mt-3"><InfoNote>No hay horarios libres en los próximos días{mode === 'barber' && barber ? ` con ${barber.name}` : ''}.
                    {mode === 'barber' ? ' Prueba con otro barbero o elige por horario.' : ' Llámanos para ver cómo te acomodamos.'}</InfoNote></div>
            )}

            <div ref={hoursRef} className="mt-6 scroll-mt-4" aria-live="polite">
                {!sel.date ? (
                    <p className="text-sm text-bos-muted">Toca un día resaltado para ver las horas libres.</p>
                ) : (
                    <>
                        <h3 className="mb-3 text-lg font-semibold text-bos-text">{formatDayNice(sel.date, config.today.slice(0, 4))}</h3>
                        {slots.status === 'loading' && (
                            <div className="grid grid-cols-3 gap-2" aria-label="Cargando horarios" role="status">
                                {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-14" />)}
                            </div>
                        )}
                        {slots.status === 'error' && (
                            <ErrorNote action={<button type="button" onClick={() => setSlotsTry((n) => n + 1)} className="min-h-11 rounded-xl border border-bos-control px-4 text-sm font-medium">Reintentar</button>}>{slots.error.message}</ErrorNote>
                        )}
                        {slotData?.closed && <InfoNote>La barbería está cerrada ese día. Prueba con otro.</InfoNote>}
                        {slotData && !slotData.closed && slotData.slots.length === 0 && (
                            <InfoNote>No hay horarios ese día; prueba otro.</InfoNote>
                        )}
                        {slotData && !slotData.closed && slotData.slots.length > 0 && (
                            <fieldset>
                                <legend className="sr-only">Hora de tu cita</legend>
                                <div className="grid grid-cols-3 gap-2">
                                    {slotData.slots.map((s) => (
                                        <label key={s.time} className="relative flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-xl border border-bos-border bg-bos-surface px-1 py-2 text-center transition-colors hover:bg-bos-raised has-[:checked]:border-bos-accent has-[:checked]:bg-bos-accent has-[:checked]:text-bos-on-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bos-accent-text">
                                            <input type="radio" name="slot" value={s.time} checked={sel.time === s.time} onChange={() => pickTime(s.time, s.label)} className="sr-only" />
                                            <span className="text-sm font-semibold">{s.label}</span>
                                            {mode === 'time' && <span className="text-xs">{s.barbers.length === 1 ? '1 barbero' : `${s.barbers.length} barberos`}</span>}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        )}
                        {mode === 'time' && currentSlot && (
                            <fieldset className="mt-5 rounded-2xl border border-bos-border bg-bos-surface p-3">
                                <legend className="px-1 text-sm font-semibold text-bos-text">Libres a las {currentSlot.label}</legend>
                                <div className="mt-1 flex flex-wrap gap-2">
                                    {[{ id: 'any', name: 'Cualquiera' }, ...currentSlot.barbers].map((b) => {
                                        const on = b.id === 'any' ? sel.barber === 'any' : typeof sel.barber === 'object' && sel.barber?.id === b.id;
                                        return (
                                            <label key={b.id} className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-bos-border bg-bos-bg py-1 pl-1.5 pr-4 text-sm font-medium text-bos-text hover:bg-bos-raised has-[:checked]:border-bos-accent has-[:checked]:bg-bos-accent-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bos-accent-text">
                                                <input type="radio" name="slot-barber" value={b.id} checked={on} className="sr-only"
                                                    onChange={() => setSel({ ...sel, barber: b.id === 'any' ? 'any' : (b as BookingBarber) })} />
                                                {b.id === 'any' ? <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-bos-raised text-xs text-bos-muted">*</span> : <Avatar name={b.name} size="sm" />}
                                                {b.name}
                                            </label>
                                        );
                                    })}
                                </div>
                                {sel.barber === 'any' && <p className="mt-2 text-xs text-bos-muted">Te asignamos al barbero que esté libre a esa hora.</p>}
                            </fieldset>
                        )}
                    </>
                )}
            </div>

            <div className="mt-6">
                <button type="button" onClick={onSwitchMode} className={SECONDARY_BTN}>
                    {mode === 'barber' ? 'Mejor elijo por horario' : 'Mejor elijo por barbero'}
                </button>
            </div>

            <StickyBar>
                <button type="button" disabled={!ready} onClick={onNext} className={PRIMARY_BTN}>
                    {ready ? `Continuar · ${sel.label}${chosenName ? ` con ${chosenName}` : ''}` : sel.date ? 'Elige una hora' : 'Elige un día'}
                </button>
            </StickyBar>
        </section>
    );
}
