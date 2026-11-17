'use client';

import React, { useState } from 'react';
import { CalendarPlus, Check, Copy, MapPin, Phone } from 'lucide-react';
import { mapsUrl, phoneHref } from '@/lib/booking-ui/business';
import { formatInstantInBusiness } from '@/lib/booking-ui/format';
import { buildIcs } from '@/lib/booking-ui/ics';
import type { BookingConfig, BookingSummary } from '@/lib/booking-ui/types';
import BookingCard from './BookingCard';
import { SECONDARY_BTN, StepHeading } from './parts';

export function downloadIcs(b: BookingSummary, token: string, business: { address: string }) {
    const ics = buildIcs({
        uid: token, date: b.date, time: b.time, durationMinutes: b.duration_minutes,
        summary: `${b.service.name} en Gallo 4:20`, description: `${b.service.name} con ${b.barber.name}. Gallo 4:20, Barber Shop.`, location: business.address,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'cita-gallo-420.ics';
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* sigue al plan B */ }
    try {
        const t = document.createElement('textarea');
        t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.left = '-10000px';
        document.body.appendChild(t); t.select();
        const ok = document.execCommand('copy'); t.remove(); return ok;
    } catch { return false; }
}

export default function DoneStep({ config, token, booking, onAnother }: { config: BookingConfig; token: string; booking: BookingSummary; onAnother: () => void }) {
    const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
    const link = `${window.location.origin}/reservar/${token}`;
    const copy = async () => { setCopied((await copyText(link)) ? 'yes' : 'no'); };
    return (
        <section aria-label="Reserva confirmada">
            <StepHeading focusKey="done" hint={`Te esperamos, ${booking.customer_name}.`}>Listo, quedó tu reserva</StepHeading>
            <BookingCard thisYear={config.today.slice(0, 4)} d={{
                service: booking.service.name, price: booking.service.price, variable: booking.service.variable_price, duration: booking.duration_minutes,
                barber: booking.barber.name, date: booking.date, label: booking.label,
            }} />
            <p className="mt-4 rounded-xl bg-bos-surface p-3 text-sm text-bos-text">
                Puedes cancelar hasta el <strong className="font-semibold">{formatInstantInBusiness(booking.cancel_until)}</strong>
                <br />Pasado ese momento, llámanos al{' '}
                <a href={phoneHref(config.business.phone)} className="font-medium text-bos-accent-text underline underline-offset-2">{config.business.phone}</a>.
            </p>

            <div className="mt-5 rounded-2xl border border-bos-border bg-bos-surface p-4">
                <h3 className="text-base font-semibold text-bos-text">Tu enlace personal</h3>
                <p className="mt-1 text-sm text-bos-muted">Guárdalo: con él ves o cancelas tu reserva.</p>
                <p className="mt-2 break-all rounded-lg bg-bos-raised px-3 py-2 text-sm text-bos-text">{link}</p>
                <button type="button" onClick={copy} className={`${SECONDARY_BTN} mt-3`}>
                    {copied === 'yes' ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
                    {copied === 'yes' ? 'Enlace copiado' : 'Copiar enlace'}
                </button>
                <p role="status" className="mt-1 text-sm text-bos-muted">{copied === 'no' ? 'No pudimos copiarlo; mantén presionado el enlace para copiarlo.' : ''}</p>
            </div>

            <div className="mt-4 space-y-2">
                <button type="button" onClick={() => downloadIcs(booking, token, config.business)} className={SECONDARY_BTN}>
                    <CalendarPlus className="h-5 w-5" aria-hidden="true" />Agregar a mi calendario
                </button>
                <a href={mapsUrl(config.business.address)} target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}>
                    <MapPin className="h-5 w-5" aria-hidden="true" />Cómo llegar
                </a>
                <a href={phoneHref(config.business.phone)} className={SECONDARY_BTN}>
                    <Phone className="h-5 w-5" aria-hidden="true" />Llamar a la barbería
                </a>
                <a href={`/reservar/${token}`} className={SECONDARY_BTN}>Ver o cancelar mi reserva</a>
            </div>
            <p className="mt-4 text-sm text-bos-muted">{config.business.address}</p>
            <button type="button" onClick={onAnother} className="mt-4 min-h-11 text-sm font-medium text-bos-accent-text underline underline-offset-2">Hacer otra reserva</button>
        </section>
    );
}
