'use client';

import React, { useState } from 'react';
import { CalendarPlus, Check, Copy, MapPin, MessageCircle } from 'lucide-react';
import { mapsUrl, phoneHref, shareWhatsappHref } from '@/lib/booking-ui/business';
import { cancelHoursBefore, formatDuration, formatInstantInBusiness, formatPrice, formatWhen } from '@/lib/booking-ui/format';
import { buildIcs } from '@/lib/booking-ui/ics';
import type { BookingConfig, BookingSummary } from '@/lib/booking-ui/types';
import BookingCard from './BookingCard';
import { LINK, PRIMARY_BTN, SECONDARY_BTN, StepHeading } from './parts';

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

/** Texto para mandarse la cita a uno mismo por WhatsApp (no se envía nada a la barbería). */
export function shareText(b: BookingSummary, address: string, link: string): string {
    return [
        'Mi cita en Gallo 4:20 Barber Shop',
        `${b.service.name} con ${b.barber.name}`,
        `${formatWhen(b.date, b.label)} (${formatDuration(b.duration_minutes)})`,
        `Precio estimado: ${formatPrice(b.service.price, b.service.variable_price)}`,
        address,
        `Ver o cancelar: ${link}`,
    ].join('\n');
}

/** Regla de cancelación en palabras: "hasta el jueves 26 de noviembre, 3:30 p. m. (2 horas antes)". */
export function CancelRule({ b, phone }: { b: BookingSummary; phone: string }) {
    const hours = cancelHoursBefore(b.date, b.time, b.cancel_until);
    const until = formatInstantInBusiness(b.cancel_until);
    // La hora ya termina en "m." ("3:30 p. m."): solo se agrega el punto si hace falta.
    const tail = hours ? ` (${hours === 1 ? '1 hora' : `${hours} horas`} antes).` : until.endsWith('.') ? '' : '.';
    return (
        <p className="text-base text-bos-text">
            Puedes cancelar en línea hasta el <strong className="font-semibold">{until}</strong>{tail} Después, llámanos al{' '}
            <a href={phoneHref(phone)} className={LINK}>{phone}</a>.
        </p>
    );
}

export default function DoneStep({ config, token, booking, onAnother }: { config: BookingConfig; token: string; booking: BookingSummary; onAnother: () => void }) {
    const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
    const path = `/reservar/${token}`;
    const link = `${window.location.origin}${path}`;
    const copy = async () => { setCopied((await copyText(link)) ? 'yes' : 'no'); };
    return (
        <section aria-labelledby="gr-step-title" className="gr-step">
            <span aria-hidden="true" className="bos-pop mb-3 mt-2 inline-flex h-14 w-14 items-center justify-center rounded-full bg-bos-accent text-bos-on-accent">
                <Check className="h-8 w-8" strokeWidth={2.5} />
            </span>
            <StepHeading focusKey="done" hint={`Tu cita quedó a nombre de ${booking.customer_name}.`}>Listo, te esperamos</StepHeading>

            <BookingCard d={{
                service: booking.service.name, price: booking.service.price, variable: booking.service.variable_price, duration: booking.duration_minutes,
                barber: booking.barber.name, date: booking.date, label: booking.label, address: config.business.address,
            }} />

            <div className="gr-frame mt-5 rounded-2xl bg-bos-surface p-5">
                <h3 className="gr-serif text-xl font-semibold text-bos-text">Guarda tu enlace</h3>
                <p className="mt-1 text-base text-bos-muted">Con él ves o cancelas tu cita. Es la única forma de hacerlo en línea: mándatelo por WhatsApp o cópialo.</p>
                <p className="mt-3 break-all rounded-lg bg-bos-raised px-3 py-2 text-sm text-bos-text">{link}</p>
                <div className="mt-3 space-y-2">
                    <a href={shareWhatsappHref(shareText(booking, config.business.address, link))} target="_blank" rel="noopener noreferrer" className={PRIMARY_BTN}>
                        <MessageCircle className="h-5 w-5" aria-hidden="true" />Enviarme esto por WhatsApp
                    </a>
                    <button type="button" onClick={copy} className={SECONDARY_BTN}>
                        {copied === 'yes' ? <Check className="h-5 w-5" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
                        {copied === 'yes' ? 'Enlace copiado' : 'Copiar enlace'}
                    </button>
                </div>
                <p role="status" className="mt-1 text-sm text-bos-muted">{copied === 'no' ? 'No pudimos copiarlo; mantén presionado el enlace para copiarlo.' : ''}</p>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => downloadIcs(booking, token, config.business)} className={SECONDARY_BTN}>
                    <CalendarPlus className="h-5 w-5" aria-hidden="true" />Agregar a mi calendario
                </button>
                <a href={mapsUrl(config.business.address)} target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}>
                    <MapPin className="h-5 w-5" aria-hidden="true" />Cómo llegar
                </a>
            </div>

            <div className="mt-5"><CancelRule b={booking} phone={config.business.phone} /></div>

            <div className="mt-4 flex flex-wrap gap-x-6">
                <a href={path} className={`${LINK} inline-flex min-h-12 items-center text-base`}>Ver o cancelar mi cita</a>
                <button type="button" onClick={onAnother} className={`${LINK} inline-flex min-h-12 items-center text-base`}>Hacer otra reserva</button>
            </div>
        </section>
    );
}
