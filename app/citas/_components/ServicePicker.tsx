'use client';

import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { formatDuration, groupServices } from '@/lib/services/categories';
import { summarizeServices, type ServiceOption } from '@/lib/appointments/booking';
import { formatMoney } from '@/lib/utils/money';

interface ServicePickerProps {
    services: ServiceOption[];
    selected: string[];
    onChange: (ids: string[]) => void;
    /** Mientras llega el catálogo de servicios. */
    loading?: boolean;
}

/**
 * Servicios de la cita, agrupados por categoría como en el cobro. Se puede elegir más de uno;
 * debajo se muestra la duración total (en bloques de 30 min) y el precio estimado.
 */
export default function ServicePicker({ services, selected, onChange, loading }: ServicePickerProps) {
    const groups = useMemo(() => groupServices(services), [services]);
    const chosen = services.filter((s) => selected.includes(s.id));
    const summary = summarizeServices(chosen);
    const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

    return (
        <fieldset className="min-w-0">
            <legend className="mb-1.5 block text-[13px] font-medium text-bos-muted">Servicios</legend>
            {loading && services.length === 0 ? (
                <p role="status" className="text-sm text-bos-muted">Cargando servicios…</p>
            ) : services.length === 0 ? (
                <p className="text-sm text-bos-muted">No hay servicios activos. Puedes agendar con una nota.</p>
            ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-bos-control bg-bos-bg p-2" data-testid="service-groups">
                    {groups.map((group) => (
                        <div key={group.category} role="group" aria-label={group.label}>
                            <p className="px-2 pb-1 pt-1 text-xs font-semibold text-bos-muted">{group.label}</p>
                            <ul>
                                {group.items.map((s) => {
                                    const on = selected.includes(s.id);
                                    return (
                                        <li key={s.id}>
                                            <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-bos-raised ${on ? 'bg-bos-accent-soft' : ''}`}>
                                                <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="peer sr-only" />
                                                <span aria-hidden="true" className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bos-accent ${on ? 'border-bos-accent bg-bos-accent text-bos-on-accent' : 'border-bos-control'}`}>
                                                    {on && <Check className="h-3.5 w-3.5" />}
                                                </span>
                                                <span className="min-w-0 flex-1 text-[15px] font-medium">{s.name}</span>
                                                <span className="shrink-0 text-xs tabular-nums text-bos-muted">{formatDuration(s.duration_minutes ?? 30)} · {s.variable_price ? 'precio libre' : formatMoney(s.price)}</span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
            <div aria-live="polite" data-testid="services-summary" className="mt-2 text-sm">
                {summary.count > 0 ? (
                    <p className="font-semibold">
                        Duración total: <span data-testid="services-duration">{formatDuration(summary.minutes)}</span>
                        {' · '}Precio estimado: <span data-testid="services-price">{formatMoney(summary.price)}</span>
                        {summary.hasVariablePrice && <span className="font-normal text-bos-muted"> (más los servicios de precio libre)</span>}
                    </p>
                ) : services.length > 0 ? (
                    <p className="rounded-lg bg-bos-raised px-3 py-2 text-bos-muted">Conviene elegir al menos un servicio: así la cita ocupa el tiempo correcto y se sabe cuánto se cobrará. Si no, queda solo con la nota.</p>
                ) : null}
            </div>
        </fieldset>
    );
}
