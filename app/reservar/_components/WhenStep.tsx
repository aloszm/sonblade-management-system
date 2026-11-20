'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Phone, Zap } from 'lucide-react';
import { bookingApi } from '@/lib/booking-ui/api';
import { phoneHref } from '@/lib/booking-ui/business';
import type { BookingError } from '@/lib/booking-ui/errors';
import {
    dayRange, formatDayLong, formatDayNice, formatDayShort, groupByDayPart, nextAvailableDay,
} from '@/lib/booking-ui/format';
import type { Availability, BookingConfig, BookingService, DayAvailability } from '@/lib/booking-ui/types';
import { parseDay } from '@/lib/ui/date-picker';
import type { Who } from './BarberStep';
import { ChoiceRadio, ErrorNote, InfoNote, LINK, RETRY_BTN, SECONDARY_BTN, Skeleton, StepHeading } from './parts';

type Slots = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: BookingError } | { status: 'ready'; data: Availability };
interface Earliest { date: string; time: string; label: string }

const WEEKDAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "hoy", "mañana" o el día corto ("jue 26 nov"). */
function relDay(key: string, today: string, tomorrow: string): string {
    return key === today ? 'hoy' : key === tomorrow ? 'mañana' : formatDayShort(key);
}

/**
 * Paso 3: día y hora en la misma pantalla. Arriba lo más pronto disponible (un toque), luego una tira de días
 * y debajo las horas libres por Mañana / Tarde / Noche. Tocar una hora la elige y avanza.
 */
export default function WhenStep({ config, service, who, date, time, notice, refreshKey, onPickDay, onPickTime, onChangeBarber, onAnyBarber }: {
    config: BookingConfig; service: BookingService; who: Who; date: string | null; time: string | null;
    notice: string | null; refreshKey: number;
    onPickDay: (date: string) => void; onPickTime: (time: string, label: string, advance: boolean, date?: string) => void;
    onChangeBarber: () => void; onAnyBarber: () => void;
}) {
    const barberId = who === 'any' ? null : who.id;
    const barberName = who === 'any' ? null : who.name;
    const [days, setDays] = useState<DayAvailability[] | null>(null);
    const [daysError, setDaysError] = useState<BookingError | null>(null);
    const [daysTry, setDaysTry] = useState(0);
    const [slots, setSlots] = useState<Slots>({ status: 'idle' });
    const [slotsTry, setSlotsTry] = useState(0);
    const [earliest, setEarliest] = useState<Earliest | null>(null);
    const stripRef = useRef<HTMLDivElement>(null);
    const dateRef = useRef(date);
    dateRef.current = date;
    const pickDayRef = useRef(onPickDay);
    pickDayRef.current = onPickDay;

    const allDays = useMemo(() => dayRange(config.min_date, config.max_date), [config.min_date, config.max_date]);
    const tomorrow = allDays[allDays.indexOf(config.today) + 1] ?? '';

    useEffect(() => {
        let alive = true;
        setDays(null); setDaysError(null); setEarliest(null);
        bookingApi.days(service.id, barberId, config.min_date, config.max_date).then((r) => {
            if (!alive) return;
            if (!r.ok) { setDaysError(r.error); return; }
            const list = r.data.days ?? [];
            setDays(list);
            // Sin día elegido (o fuera de la ventana), se abre el primero con horas: así lo más pronto ya está a la vista.
            const current = dateRef.current;
            const first = list.find((d) => d.available)?.date;
            if (first && (!current || current < config.min_date || current > config.max_date)) pickDayRef.current(first);
        });
        return () => { alive = false; };
    }, [service.id, barberId, config.min_date, config.max_date, daysTry, refreshKey]);

    useEffect(() => {
        if (!date) { setSlots({ status: 'idle' }); return; }
        let alive = true;
        setSlots({ status: 'loading' });
        bookingApi.availability(date, service.id, barberId).then((r) => {
            if (!alive) return;
            setSlots(r.ok ? { status: 'ready', data: r.data } : { status: 'error', error: r.error });
        });
        return () => { alive = false; };
    }, [date, service.id, barberId, slotsTry, refreshKey]);

    const firstAvailable = days?.find((d) => d.available)?.date ?? null;
    const slotData = slots.status === 'ready' ? slots.data : null;
    const freeSlots = useMemo(() => (slotData && !slotData.closed ? slotData.slots : []), [slotData]);

    // Lo más pronto: la primera hora del primer día con horas (se conoce al cargar ese día).
    useEffect(() => {
        if (!earliest && date && date === firstAvailable && freeSlots.length) {
            setEarliest({ date, time: freeSlots[0].time, label: freeSlots[0].label });
        }
    }, [earliest, date, firstAvailable, freeSlots]);

    // La tira se desliza para dejar el día elegido a la vista (sin mover la página).
    useEffect(() => {
        const strip = stripRef.current;
        const el = date ? strip?.querySelector<HTMLElement>(`[data-day="${date}"]`) : null;
        if (strip && el) strip.scrollLeft = Math.max(0, el.offsetLeft - strip.offsetLeft - 16);
    }, [date, days]);

    const availMap = useMemo(() => new Map((days ?? []).map((d) => [d.date, d.available])), [days]);
    const next = days && date ? nextAvailableDay(days, date) : null;
    const noDaysAtAll = !!days && !firstAvailable;
    const groups = groupByDayPart(freeSlots);
    const thisYear = config.today.slice(0, 4);

    const liveText = !date || !slotData ? ''
        : slotData.closed || freeSlots.length === 0 ? `${formatDayNice(date, thisYear)}: sin horas libres.`
        : `${formatDayNice(date, thisYear)}: ${freeSlots.length === 1 ? '1 hora libre' : `${freeSlots.length} horas libres`}.`;

    return (
        <section aria-labelledby="gr-step-title" className="gr-step">
            <StepHeading focusKey="when" hint={
                <>Con <strong className="font-semibold text-bos-text">{barberName ?? 'cualquier barbero'}</strong>{' · '}
                    <button type="button" onClick={onChangeBarber} className={`${LINK} inline-flex min-h-12 items-center`}>cambiar</button></>
            }>¿Cuándo?</StepHeading>

            {notice && <div className="mb-4"><ErrorNote>{notice}</ErrorNote></div>}
            <p className="sr-only" aria-live="polite">{liveText}</p>

            {daysError && (
                <div className="mb-4"><ErrorNote action={<button type="button" onClick={() => setDaysTry((n) => n + 1)} className={RETRY_BTN}>Reintentar</button>}>{daysError.message}</ErrorNote></div>
            )}

            {earliest && !noDaysAtAll && (
                <button type="button" onClick={() => onPickTime(earliest.time, earliest.label, true, earliest.date)}
                    className="mb-4 flex min-h-14 w-full items-center gap-3 rounded-xl border border-bos-accent bg-bos-accent-soft px-3 py-2 text-left hover:bg-bos-raised">
                    <Zap className="h-5 w-5 shrink-0 text-bos-accent-text" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-base text-bos-text">
                        <span className="text-bos-muted">Lo más pronto: </span>
                        <span className="font-semibold">{relDay(earliest.date, config.today, tomorrow)} · {earliest.label}</span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-bos-accent-text" aria-hidden="true" />
                </button>
            )}

            {noDaysAtAll ? (
                <InfoNote action={<>
                    {barberName && <button type="button" onClick={onAnyBarber} className={SECONDARY_BTN}>Ver horarios con cualquier barbero</button>}
                    <a href={phoneHref(config.business.phone)} className={SECONDARY_BTN}><Phone className="h-5 w-5" aria-hidden="true" />Llamar al {config.business.phone}</a>
                </>}>
                    No quedan horas libres en los próximos {config.rules.max_days_ahead} días{barberName ? ` con ${barberName}` : ''}.
                </InfoNote>
            ) : (
                <fieldset className="min-w-0">
                    <legend className="sr-only">Día</legend>
                    <div className="mb-2 hidden min-h-6 items-center justify-between sm:flex">
                        <p aria-hidden="true" className="gr-caps text-bos-accent-text">Día</p>
                        {/* Con ratón no hay deslizamiento: flechas para recorrer la tira (en celular se desliza con el dedo). */}
                        <span className="flex gap-2">
                            <button type="button" aria-label="Días anteriores" onClick={() => stripRef.current?.scrollBy({ left: -320 })} className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-bos-border text-bos-text hover:bg-bos-raised"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
                            <button type="button" aria-label="Más días" onClick={() => stripRef.current?.scrollBy({ left: 320 })} className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-bos-border text-bos-text hover:bg-bos-raised"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
                        </span>
                    </div>
                    {!days && !daysError ? (
                        <div className="flex gap-2 overflow-hidden" role="status" aria-label="Cargando días">
                            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[4.75rem] w-16 shrink-0 rounded-xl" />)}
                        </div>
                    ) : (
                        <div ref={stripRef} className="gr-strip">
                            {allDays.map((key) => {
                                const d = parseDay(key)!;
                                const on = availMap.get(key) === true;
                                const sel = key === date;
                                const tag = key === config.today ? 'hoy' : key === tomorrow ? 'mañana' : MONTH[d.getMonth()];
                                return (
                                    <label key={key} data-day={key}
                                        className={`flex h-[4.75rem] w-16 flex-col items-center justify-center rounded-xl border text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bos-accent-text ${sel ? 'border-bos-accent bg-bos-accent text-bos-on-accent' : on ? 'cursor-pointer border-bos-border bg-bos-surface text-bos-text hover:bg-bos-raised' : 'gr-off cursor-not-allowed border-dashed border-bos-border text-bos-muted opacity-60'}`}>
                                        <input type="radio" name="day" value={key} checked={sel} disabled={!on && !sel} className="sr-only"
                                            aria-label={`${formatDayLong(key)}${key === config.today ? ', hoy' : ''}${on ? '' : ', sin horas'}`}
                                            onChange={() => onPickDay(key)} />
                                        <span aria-hidden="true" className="text-xs font-medium">{WEEKDAY[d.getDay()]}</span>
                                        <span aria-hidden="true" className="gr-num gr-daynum text-2xl font-semibold leading-tight">{d.getDate()}</span>
                                        <span aria-hidden="true" className="text-xs">{tag}</span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </fieldset>
            )}

            {date && !noDaysAtAll && (
                <div className="mt-4">
                    <h3 className="sr-only mb-2 text-base font-semibold text-bos-text sm:not-sr-only">{formatDayNice(date, thisYear)}</h3>
                    {slots.status === 'loading' && (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="status" aria-label="Cargando horas">
                            {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
                        </div>
                    )}
                    {slots.status === 'error' && (
                        <ErrorNote action={<button type="button" onClick={() => setSlotsTry((n) => n + 1)} className={RETRY_BTN}>Reintentar</button>}>{slots.error.message}</ErrorNote>
                    )}
                    {slotData && freeSlots.length === 0 && (
                        <InfoNote action={next ? (
                            <button type="button" onClick={() => onPickDay(next)} className={SECONDARY_BTN}>
                                Ver el {formatDayShort(next)}<ArrowRight className="h-5 w-5" aria-hidden="true" />
                            </button>
                        ) : (
                            <a href={phoneHref(config.business.phone)} className={SECONDARY_BTN}><Phone className="h-5 w-5" aria-hidden="true" />Llamar al {config.business.phone}</a>
                        )}>
                            {slotData.closed ? 'Ese día no abrimos.' : `Ese día ya no quedan horas${barberName ? ` con ${barberName}` : ''}.`}
                            {next ? ' El siguiente con horas es el ' + formatDayShort(next) + '.' : ''}
                        </InfoNote>
                    )}
                    {freeSlots.length > 0 && (
                        <fieldset className="min-w-0">
                            <legend className="sr-only">Hora</legend>
                            <div className="space-y-4">
                                {groups.map((g) => (
                                    <div key={g.part} role="group" aria-label={g.part}>
                                        <p aria-hidden="true" className="gr-caps mb-2 text-bos-muted">{g.part}</p>
                                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                            {g.slots.map((s) => {
                                                const sel = time === s.time;
                                                return (
                                                    <ChoiceRadio key={s.time} name="slot" value={s.time} checked={sel} showCheck={false}
                                                        onPick={(adv) => onPickTime(s.time, s.label, adv)}
                                                        className="min-h-14 justify-center px-1 py-2 text-center"
                                                        checkedClass="border-bos-accent bg-bos-accent ring-2 ring-bos-accent ring-offset-2 ring-offset-bos-bg">
                                                        <span className={`text-base font-semibold ${sel ? 'text-bos-on-accent' : 'text-bos-text'}`}>{s.label}</span>
                                                    </ChoiceRadio>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </fieldset>
                    )}
                </div>
            )}
        </section>
    );
}
