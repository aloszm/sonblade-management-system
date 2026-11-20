'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { CalendarPlus, CheckCircle2, CircleSlash, Clock, MapPin, MessageCircle, Phone } from 'lucide-react';
import { bookingApi } from '@/lib/booking-ui/api';
import { BUSINESS_FALLBACK, businessWhatsappHref, mapsUrl, phoneHref } from '@/lib/booking-ui/business';
import type { BookingError } from '@/lib/booking-ui/errors';
import { cancelHoursBefore } from '@/lib/booking-ui/format';
import type { BookingDetail, BookingStatus } from '@/lib/booking-ui/types';
import BookingCard from './BookingCard';
import { CancelRule, downloadIcs } from './DoneStep';
import { BusinessHeader, ErrorNote, InfoNote, PRIMARY_BTN, RETRY_BTN, SECONDARY_BTN, Skeleton, StepHeading } from './parts';

// Estado con texto e ícono (no solo color).
const STATUS: Record<BookingStatus, { title: string; tone: string; Icon: typeof CheckCircle2 }> = {
    scheduled: { title: 'Confirmada', tone: 'border-bos-success text-bos-success', Icon: CheckCircle2 },
    cancelled: { title: 'Cancelada', tone: 'border-bos-danger text-bos-danger', Icon: CircleSlash },
    completed: { title: 'Atendida', tone: 'border-bos-control text-bos-text', Icon: CheckCircle2 },
    no_show: { title: 'No asististe', tone: 'border-bos-control text-bos-text', Icon: Clock },
};

/**
 * Página del enlace personal: la cita, su estado y "Cancelar mi cita" (hasta `cancel_until`). Reprogramar aún no
 * existe en la API; cuando exista, su acción va junto a "Cancelar mi cita" (bloque `manage` de abajo).
 */
export default function ReservationView({ token }: { token: string }) {
    const [booking, setBooking] = useState<BookingDetail | null>(null);
    const [error, setError] = useState<BookingError | null>(null);
    const [tryN, setTryN] = useState(0);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [cancelError, setCancelError] = useState<BookingError | null>(null);
    const [justCancelled, setJustCancelled] = useState(false);
    const confirmRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        let alive = true;
        setError(null);
        bookingApi.get(token).then((r) => { if (!alive) return; if (r.ok) setBooking(r.data.booking); else setError(r.error); });
        return () => { alive = false; };
    }, [token, tryN]);
    useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

    const cancel = async () => {
        setBusy(true); setCancelError(null);
        const r = await bookingApi.cancel(token);
        setBusy(false);
        if (r.ok) { setBooking(r.data.booking); setConfirming(false); setJustCancelled(true); return; }
        if (r.error.kind === 'too_late') { setBooking((b) => (b ? { ...b, can_cancel: false } : b)); setConfirming(false); }
        if (r.error.kind === 'not_found') { setError(r.error); return; }
        setCancelError(r.error);
    };

    const b = BUSINESS_FALLBACK;
    const frame = (children: React.ReactNode) => (
        <div className="min-h-dvh bg-bos-bg text-bos-text">
            <div className="mx-auto w-full max-w-[640px] px-4 pb-10">
                <BusinessHeader phone={b.phone} />{children}
            </div>
        </div>
    );
    const contact = (
        <div className="grid gap-2 sm:grid-cols-2">
            <a href={phoneHref(b.phone)} className={SECONDARY_BTN}><Phone className="h-5 w-5" aria-hidden="true" />Llamar al {b.phone}</a>
            <a href={businessWhatsappHref(b.phone, 'Hola, tengo una cita en Gallo 4:20 y necesito ayuda.')} target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}><MessageCircle className="h-5 w-5" aria-hidden="true" />Escribir por WhatsApp</a>
        </div>
    );

    if (error?.kind === 'not_found') {
        return frame(<section aria-label="Mi reserva" className="gr-step mt-4">
            <StepHeading focusKey="nf" hint="Puede que el enlace esté incompleto o que ya no exista. Revisa que lo hayas copiado completo.">No encontramos esa cita</StepHeading>
            <div className="space-y-2"><Link href="/reservar" className={PRIMARY_BTN}>Hacer una reserva</Link>{contact}</div>
        </section>);
    }
    if (error) {
        return frame(<div className="mt-4 space-y-4"><ErrorNote action={<button type="button" onClick={() => setTryN((n) => n + 1)} className={RETRY_BTN}>Reintentar</button>}>{error.message}</ErrorNote>{contact}</div>);
    }
    if (!booking) {
        return frame(<div role="status" aria-label="Cargando" className="mt-4 space-y-3"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-8 w-28 rounded-full" /><Skeleton className="h-80 rounded-2xl" /></div>);
    }

    const st = STATUS[booking.status];
    const active = booking.status === 'scheduled';
    const cancelHours = cancelHoursBefore(booking.date, booking.time, booking.cancel_until);
    return frame(<section aria-label="Mi reserva" className="gr-step mt-2">
        <StepHeading focusKey="view">Tu cita</StepHeading>
        <p className={`-mt-2 mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-base font-semibold ${st.tone}`}>
            <st.Icon className="h-4 w-4" aria-hidden="true" />{st.title}
        </p>
        {justCancelled && <div className="mb-4"><InfoNote>Listo, cancelamos tu cita y liberamos la hora. Cuando quieras, vuelve a reservar.</InfoNote></div>}
        <BookingCard d={{
            service: booking.service.name, price: booking.service.price, variable: booking.service.variable_price, duration: booking.duration_minutes,
            barber: booking.barber.name, date: booking.date, label: booking.label, address: b.address, name: booking.customer_name,
        }} />

        {active && (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => downloadIcs(booking, token, b)} className={SECONDARY_BTN}><CalendarPlus className="h-5 w-5" aria-hidden="true" />Agregar a mi calendario</button>
                <a href={mapsUrl(b.address)} target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}><MapPin className="h-5 w-5" aria-hidden="true" />Cómo llegar</a>
            </div>
        )}

        {/* manage: aquí irá "Cambiar día u hora" cuando la API lo permita. */}
        {active && booking.can_cancel && !confirming && (
            <div className="mt-6 space-y-3 border-t border-bos-border pt-5">
                <CancelRule b={booking} phone={b.phone} />
                <button type="button" onClick={() => setConfirming(true)} className={SECONDARY_BTN}>Cancelar mi cita</button>
            </div>
        )}
        {active && booking.can_cancel && confirming && (
            <div role="group" aria-labelledby="gr-confirm-title" className="mt-6 rounded-2xl border border-bos-danger bg-bos-danger-soft p-4">
                <h3 id="gr-confirm-title" ref={confirmRef} tabIndex={-1} className="text-lg font-semibold text-bos-text focus:outline-none">¿Seguro que quieres cancelar?</h3>
                <p className="mt-1 text-base text-bos-text">Liberamos tu hora para alguien más. No se puede deshacer.</p>
                {cancelError && <div className="mt-3"><ErrorNote>{cancelError.message}</ErrorNote></div>}
                <div className="mt-3 space-y-2">
                    <button type="button" disabled={busy} onClick={cancel} className="inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-xl bg-bos-danger px-5 text-base font-semibold text-bos-bg disabled:cursor-not-allowed disabled:bg-bos-raised disabled:text-bos-muted">{busy ? 'Cancelando…' : 'Sí, cancelar mi cita'}</button>
                    <button type="button" disabled={busy} onClick={() => { setConfirming(false); setCancelError(null); }} className={SECONDARY_BTN}>No, conservar mi cita</button>
                </div>
            </div>
        )}
        {active && !booking.can_cancel && (
            <div className="mt-6 space-y-3 border-t border-bos-border pt-5">
                <InfoNote>Ya no se puede cancelar en línea{cancelHours ? ` (se puede hasta ${cancelHours === 1 ? '1 hora' : `${cancelHours} horas`} antes)` : ''}. Si no vas a poder venir, llámanos o escríbenos y lo vemos.</InfoNote>
                {contact}
            </div>
        )}
        {!active && <div className="mt-6 space-y-2"><Link href="/reservar" className={PRIMARY_BTN}>Hacer una nueva reserva</Link></div>}
    </section>);
}
