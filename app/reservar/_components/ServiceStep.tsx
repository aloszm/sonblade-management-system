'use client';

import React from 'react';
import { formatDuration, formatPrice, groupByCategory } from '@/lib/booking-ui/format';
import type { BookingService } from '@/lib/booking-ui/types';
import { ChoiceRadio, StepHeading } from './parts';

/** Paso 1: una sola decisión. Tocar un servicio lo elige y avanza. */
export default function ServiceStep({ services, serviceId, onPick }: {
    services: BookingService[]; serviceId: string | null; onPick: (id: string, advance: boolean) => void;
}) {
    const groups = groupByCategory(services);
    return (
        <section aria-labelledby="gr-step-title" className="gr-step">
            <StepHeading focusKey="service" hint="Toca uno y seguimos.">¿Qué te hacemos?</StepHeading>
            {services.length === 0 && <p className="text-base text-bos-muted">Por ahora no hay servicios para reservar en línea. Llámanos y te atendemos.</p>}
            <div className="space-y-6">
                {groups.map((g) => (
                    <fieldset key={g.category}>
                        <legend className="gr-caps mb-2 text-bos-accent-text">{g.label}</legend>
                        <div className="space-y-2">
                            {g.services.map((s) => (
                                <ChoiceRadio key={s.id} name="service" value={s.id} checked={s.id === serviceId} onPick={(adv) => onPick(s.id, adv)} className="min-h-16">
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-base font-semibold text-bos-text">{s.name}</span>
                                        {s.description && <span className="mt-0.5 block text-sm text-bos-muted">{s.description}</span>}
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className={`block ${s.variable_price ? 'text-sm' : 'gr-num text-xl font-semibold'} text-bos-accent-text`}>{formatPrice(s.price, s.variable_price)}</span>
                                        <span className="block text-sm text-bos-muted">{formatDuration(s.duration_minutes)}</span>
                                    </span>
                                </ChoiceRadio>
                            ))}
                        </div>
                    </fieldset>
                ))}
            </div>
        </section>
    );
}
