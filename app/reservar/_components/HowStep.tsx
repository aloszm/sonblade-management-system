'use client';

import React from 'react';
import { CalendarClock, ChevronRight, UserRound } from 'lucide-react';
import type { BookingService } from '@/lib/booking-ui/types';
import { BackButton, ServiceMeta, StepHeading } from './parts';

export type Mode = 'barber' | 'time';

export default function HowStep({ service, onPick, onBack }: { service: BookingService; onPick: (m: Mode) => void; onBack: () => void }) {
    const card = 'flex min-h-20 w-full items-center gap-4 rounded-2xl border border-bos-border bg-bos-surface p-4 text-left transition-colors hover:bg-bos-raised';
    return (
        <section aria-label="Cómo quieres elegir">
            <BackButton onClick={onBack} />
            <StepHeading focusKey="how">¿Cómo quieres elegir?</StepHeading>
            <p className="mb-4 rounded-xl bg-bos-surface px-3 py-2 text-sm text-bos-muted">
                <span className="font-medium text-bos-text">{service.name}</span> · <ServiceMeta service={service} />
            </p>
            <div className="space-y-3">
                <button type="button" onClick={() => onPick('barber')} className={card}>
                    <UserRound className="h-7 w-7 shrink-0 text-bos-accent-text" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold text-bos-text">Elegir barbero</span>
                        <span className="block text-sm text-bos-muted">Ya sabes con quién; te mostramos sus días y horas libres.</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-bos-muted" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => onPick('time')} className={card}>
                    <CalendarClock className="h-7 w-7 shrink-0 text-bos-accent-text" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold text-bos-text">Elegir horario</span>
                        <span className="block text-sm text-bos-muted">Eliges el día y la hora; te decimos qué barberos están libres.</span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-bos-muted" aria-hidden="true" />
                </button>
            </div>
        </section>
    );
}
