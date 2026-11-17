'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { CalendarPlus, MapPin, Phone } from 'lucide-react';
import { bookingApi } from '@/lib/booking-ui/api';
import { BUSINESS_FALLBACK, mapsUrl, phoneHref } from '@/lib/booking-ui/business';
import type { BookingError } from '@/lib/booking-ui/errors';
import { formatInstantInBusiness } from '@/lib/booking-ui/format';
import type { BookingDetail, BookingStatus } from '@/lib/booking-ui/types';
import BookingCard from './BookingCard';
import { downloadIcs } from './DoneStep';
import { BusinessHeader, ErrorNote, InfoNote, PRIMARY_BTN, SECONDARY_BTN, Skeleton, StepHeading } from './parts';

const STATUS_TEXT: Record<BookingStatus, { title: string; tone: string }> = {
    scheduled: { title: 'Reserva confirmada', tone: 'bg-bos-success-soft text-bos-success' },
    cancelled: { title: 'Reserva cancelada', tone: 'bg-bos-danger-soft text-bos-danger' },
    completed: { title: 'Cita atendida', tone: 'bg-bos-raised text-bos-text' },
    no_show: { title: 'No asististe a esta cita', tone: 'bg-bos-raised text-bos-text' },
};

export default function ReservationView({ token }: { token: string }) {
    const [booking, setBooking] = useState<BookingDetail | null>(null);
    const [error, setError] = useState<BookingError | null>(null);
    const [tryN, setTryN] = useState(0);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [cancelError, setCancelError] = useState<BookingError | null>(null);
    const [justCancelled, setJustCancelled] = useState(false);

    useEffect(() => {
        let alive = true;
        setError(null);
        bookingApi.get(token).then((r) => { if (!alive) return; if (r.ok) setBooking(r.data.booking); else setError(r.error); });
        return () => { alive = false; };
    }, [token, tryN]);

    const cancel = async () => {
        setBusy(true); setCancelError(null);
        const r = await bookingApi.cancel(token);
        setBusy(false);
        if (r.ok) { setBooking(r.data.booking); setConfirming(false); setJustCancelled(true); return; }
        if (r.error.kind === 'too_late') { setBooking((b) => (b ? { ...b, can_cancel: false } : b)); setConfirming(false); }
        if (r.error.kind === 'not_found') { setError(r.error); return; }
        setCancelError(r.error);
    };

    const frame = (children: React.ReactNode) => (
        <div className="min-h-dvh bg-bos-bg text-bos-text">
            <div className="mx-auto w-full max-w-[560px] px-4 pb-10">
                <BusinessHeader {...BUSINESS_FALLBACK} />{children}
            </div>
        </div>
    );
    const call = (
        <a href={phoneHref(BUSINESS_FALLBACK.phone)} className={SECONDARY_BTN}><Phone className="h-5 w-5" aria-hidden="true" />Llamar al {BUSINESS_FALLBACK.phone}</a>
    );

    if (error?.kind === 'not_found') {
        return frame(<div className="rounded-2xl border border-bos-border bg-bos-surface p-5">
            <StepHeading focusKey="nf" hint="Puede que el enlace esté incompleto o que ya no exista.">No encontramos esa reserva</StepHeading>
            <div className="space-y-2"><Link href="/reservar" className={PRIMARY_BTN}>Hacer una reserva</Link>{call}</div>
        </div>);
    }
    if (error) {
        return frame(<><ErrorNote action={<button type="button" onClick={() => setTryN((n) => n + 1)} className="min-h-11 rounded-xl border border-bos-control px-4 text-sm font-medium">Reintentar</button>}>{error.message}</ErrorNote><div className="mt-4">{call}</div></>);
    }
    if (!booking) {
        return frame(<div role="status" aria-label="Cargando" className="space-y-3"><Skeleton className="h-9 w-2/3" /><Skeleton className="h-64" /></div>);
    }

    const st = STATUS_TEXT[booking.status];
    const active = booking.status === 'scheduled';
    return frame(<section aria-label="Mi reserva">
        <StepHeading focusKey="view">Mi reserva</StepHeading>
        <p className={`mb-4 inline-block rounded-full px-3 py-1 text-sm font-semibold ${st.tone}`}>{st.title}</p>
        {justCancelled && <div className="mb-4"><InfoNote>Listo, cancelamos tu reserva. Cuando quieras, vuelve a reservar.</InfoNote></div>}
        <BookingCard d={{
            service: booking.service.name, price: booking.service.price, variable: booking.service.variable_price, duration: booking.duration_minutes,
            barber: booking.barber.name, date: booking.date, label: booking.label, name: booking.customer_name,
        }} />

        {active && booking.can_cancel && !confirming && (
            <div className="mt-4 space-y-2">
                <p className="text-sm text-bos-muted">Puedes cancelar hasta el {formatInstantInBusiness(booking.cancel_until)}</p>
                <button type="button" onClick={() => setConfirming(true)} className={SECONDARY_BTN}>Cancelar mi reserva</button>
            </div>
        )}
        {active && booking.can_cancel && confirming && (
            <div role="group" aria-label="Confirmar cancelación" className="mt-4 rounded-2xl border border-bos-danger bg-bos-danger-soft p-4">
                <h3 className="text-base font-semibold text-bos-text">¿Seguro que quieres cancelar?</h3>
                <p className="mt-1 text-sm text-bos-text">Liberamos tu hora para otra persona. Esto no se puede deshacer.</p>
                {cancelError && <div className="mt-3"><ErrorNote>{cancelError.message}</ErrorNote></div>}
                <div className="mt-3 space-y-2">
                    <button type="button" disabled={busy} onClick={cancel} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-bos-danger px-5 text-base font-semibold text-bos-bg disabled:cursor-not-allowed disabled:bg-bos-raised disabled:text-bos-muted">{busy ? 'Cancelando...' : 'Sí, cancelar mi reserva'}</button>
                    <button type="button" disabled={busy} onClick={() => { setConfirming(false); setCancelError(null); }} className={SECONDARY_BTN}>No, conservar mi reserva</button>
                </div>
            </div>
        )}
        {active && !booking.can_cancel && (
            <div className="mt-4 space-y-2"><InfoNote>Ya no se puede cancelar desde aquí. Si no vas a poder venir, llámanos y lo vemos.</InfoNote>{call}</div>
        )}

        {active && (
            <div className="mt-4 space-y-2">
                <button type="button" onClick={() => downloadIcs(booking, token, BUSINESS_FALLBACK)} className={SECONDARY_BTN}><CalendarPlus className="h-5 w-5" aria-hidden="true" />Agregar a mi calendario</button>
                <a href={mapsUrl(BUSINESS_FALLBACK.address)} target="_blank" rel="noopener noreferrer" className={SECONDARY_BTN}><MapPin className="h-5 w-5" aria-hidden="true" />Cómo llegar</a>
            </div>
        )}
        {!active && <div className="mt-4 space-y-2"><Link href="/reservar" className={PRIMARY_BTN}>Hacer una nueva reserva</Link></div>}
    </section>);
}
