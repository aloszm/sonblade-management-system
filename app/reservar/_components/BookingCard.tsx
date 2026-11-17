import React from 'react';
import { CalendarDays, Clock, Scissors, User } from 'lucide-react';
import { formatDayNice, formatDuration, formatPrice } from '@/lib/booking-ui/format';

export interface CardData {
    service: string; price: number; variable: boolean; duration: number;
    barber: string; date: string; label: string; name?: string;
}

/** Resumen de una cita: lo mismo antes de confirmar, al confirmar y al ver la reserva. */
export default function BookingCard({ d, thisYear }: { d: CardData; thisYear?: string }) {
    const row = 'flex items-start gap-3 py-2.5';
    const icon = 'mt-0.5 h-5 w-5 shrink-0 text-bos-accent-text';
    return (
        <dl className="divide-y divide-bos-border rounded-2xl border border-bos-border bg-bos-surface px-4">
            <div className={row}><Scissors className={icon} aria-hidden="true" />
                <div><dt className="text-sm text-bos-muted">Servicio</dt><dd className="font-medium text-bos-text">{d.service}</dd>
                    <dd className="text-sm text-bos-muted">{formatDuration(d.duration)} · {formatPrice(d.price, d.variable)}</dd></div></div>
            <div className={row}><User className={icon} aria-hidden="true" />
                <div><dt className="text-sm text-bos-muted">Barbero</dt><dd className="font-medium text-bos-text">{d.barber}</dd></div></div>
            <div className={row}><CalendarDays className={icon} aria-hidden="true" />
                <div><dt className="text-sm text-bos-muted">Día</dt><dd className="font-medium text-bos-text">{formatDayNice(d.date, thisYear)}</dd></div></div>
            <div className={row}><Clock className={icon} aria-hidden="true" />
                <div><dt className="text-sm text-bos-muted">Hora</dt><dd className="font-medium text-bos-text">{d.label}</dd></div></div>
            {d.name && <div className={row}><User className={icon} aria-hidden="true" />
                <div><dt className="text-sm text-bos-muted">A nombre de</dt><dd className="font-medium text-bos-text">{d.name}</dd></div></div>}
        </dl>
    );
}
