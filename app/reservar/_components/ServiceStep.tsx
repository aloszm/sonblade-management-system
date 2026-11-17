'use client';

import React from 'react';
import { groupByCategory } from '@/lib/booking-ui/format';
import type { BookingService } from '@/lib/booking-ui/types';
import { PRIMARY_BTN, RadioCard, ServiceMeta, StepHeading, StickyBar } from './parts';

export default function ServiceStep({ services, serviceId, onSelect, onNext }: {
    services: BookingService[]; serviceId: string | null; onSelect: (id: string) => void; onNext: () => void;
}) {
    const groups = groupByCategory(services);
    const chosen = services.find((s) => s.id === serviceId);
    return (
        <section aria-label="Servicio">
            <StepHeading focusKey="service" hint="Elige lo que te vas a hacer. Si quieres varias cosas, el paquete te sale mejor.">¿Qué te vamos a hacer?</StepHeading>
            <div className="space-y-6">
                {groups.map((g) => (
                    <fieldset key={g.category}>
                        <legend className="mb-2 text-sm font-semibold text-bos-accent-text">{g.label}</legend>
                        <div className="space-y-2">
                            {g.services.map((s) => (
                                <RadioCard key={s.id} name="service" value={s.id} checked={s.id === serviceId} onChange={() => onSelect(s.id)} className="items-start">
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-medium text-bos-text">{s.name}</span>
                                        {s.description && <span className="mt-0.5 block text-sm text-bos-muted">{s.description}</span>}
                                        <span className="mt-1 block text-sm font-medium text-bos-text"><ServiceMeta service={s} /></span>
                                    </span>
                                </RadioCard>
                            ))}
                        </div>
                    </fieldset>
                ))}
            </div>
            <StickyBar>
                <button type="button" disabled={!chosen} onClick={onNext} className={PRIMARY_BTN}>
                    {chosen ? `Continuar con ${chosen.name}` : 'Elige un servicio'}
                </button>
            </StickyBar>
        </section>
    );
}
