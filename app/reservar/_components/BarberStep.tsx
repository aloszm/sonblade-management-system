'use client';

import React from 'react';
import type { BookingBarber } from '@/lib/booking-ui/types';
import { Avatar, BackButton, PRIMARY_BTN, RadioCard, StepHeading, StickyBar } from './parts';

export default function BarberStep({ barbers, barberId, onSelect, onNext, onBack }: {
    barbers: BookingBarber[]; barberId: string | null; onSelect: (id: string) => void; onNext: () => void; onBack: () => void;
}) {
    const chosen = barbers.find((b) => b.id === barberId);
    return (
        <section aria-label="Barbero">
            <BackButton onClick={onBack} />
            <StepHeading focusKey="barber">¿Con quién?</StepHeading>
            <fieldset>
                <legend className="sr-only">Barbero</legend>
                <div className="space-y-2">
                    {barbers.map((b) => (
                        <RadioCard key={b.id} name="barber" value={b.id} checked={b.id === barberId} onChange={() => onSelect(b.id)}>
                            <Avatar name={b.name} />
                            <span className="text-base font-medium text-bos-text">{b.name}</span>
                        </RadioCard>
                    ))}
                </div>
            </fieldset>
            <StickyBar>
                <button type="button" disabled={!chosen} onClick={onNext} className={PRIMARY_BTN}>
                    {chosen ? `Ver días de ${chosen.name}` : 'Elige un barbero'}
                </button>
            </StickyBar>
        </section>
    );
}
