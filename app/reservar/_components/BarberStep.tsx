'use client';

import React from 'react';
import { Users } from 'lucide-react';
import type { BookingBarber } from '@/lib/booking-ui/types';
import { Avatar, ChoiceRadio, StepHeading } from './parts';

export type Who = BookingBarber | 'any';

/**
 * Paso 2: con quién. "Cualquier barbero disponible" va primero y destacado (es lo que da más horarios);
 * tocar una opción la elige y avanza.
 */
export default function BarberStep({ barbers, who, onPick }: {
    barbers: BookingBarber[]; who: Who | null; onPick: (w: Who, advance: boolean) => void;
}) {
    const isAny = who === 'any';
    return (
        <section aria-labelledby="gr-step-title" className="gr-step">
            <StepHeading focusKey="barber">¿Con quién?</StepHeading>
            <fieldset>
                <legend className="sr-only">Barbero</legend>
                <ChoiceRadio name="barber" value="any" checked={isAny} onPick={(adv) => onPick('any', adv)} className="min-h-20 p-4"
                    checkedClass="border-bos-accent bg-bos-accent-soft">
                    <span aria-hidden="true" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bos-accent text-bos-on-accent">
                        <Users className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-lg font-semibold text-bos-text">Cualquier barbero disponible</span>
                        <span className="block text-sm text-bos-muted">Te atiende quien esté libre. Así ves más horarios.</span>
                    </span>
                </ChoiceRadio>
                {barbers.length > 0 && <p className="gr-caps mb-2 mt-6 text-bos-accent-text" aria-hidden="true">O elige a tu barbero</p>}
                <div className="space-y-2">
                    {barbers.map((b) => (
                        <ChoiceRadio key={b.id} name="barber" value={b.id} checked={!isAny && who?.id === b.id} onPick={(adv) => onPick(b, adv)} className="min-h-16">
                            <Avatar name={b.name} />
                            <span className="min-w-0 flex-1 text-lg font-medium text-bos-text">{b.name}</span>
                        </ChoiceRadio>
                    ))}
                </div>
            </fieldset>
        </section>
    );
}
