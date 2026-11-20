import React from 'react';
import { CalendarDays, Clock, MapPin, Scissors, User, Wallet } from 'lucide-react';
import { formatDuration, formatPrice, formatWhen } from '@/lib/booking-ui/format';

export interface CardData {
    service: string; price: number; variable: boolean; duration: number;
    barber: string; date: string; label: string; address?: string; name?: string;
}

/** La tarjeta de la cita: qué, con quién, cuándo, dónde, cuánto dura y precio estimado. */
export default function BookingCard({ d, children }: { d: CardData; children?: React.ReactNode }) {
    const row = 'flex items-start gap-3 py-3';
    const icon = 'mt-0.5 h-5 w-5 shrink-0 text-bos-accent-text';
    const dt = 'text-sm text-bos-muted';
    const dd = 'text-base font-semibold text-bos-text';
    return (
        <div className="gr-frame rounded-2xl bg-bos-surface px-5 py-2">
            {children}
            <dl className="divide-y divide-bos-border">
                <div className={row}><Scissors className={icon} aria-hidden="true" />
                    <div><dt className={dt}>Qué</dt><dd className={dd}>{d.service}</dd></div></div>
                <div className={row}><User className={icon} aria-hidden="true" />
                    <div><dt className={dt}>Con quién</dt><dd className={dd}>{d.barber}</dd></div></div>
                <div className={row}><CalendarDays className={icon} aria-hidden="true" />
                    <div><dt className={dt}>Cuándo</dt><dd className={dd}>{formatWhen(d.date, d.label)}</dd></div></div>
                {d.address && <div className={row}><MapPin className={icon} aria-hidden="true" />
                    <div><dt className={dt}>Dónde</dt><dd className={dd}>{d.address}</dd></div></div>}
                <div className={row}><Clock className={icon} aria-hidden="true" />
                    <div><dt className={dt}>Cuánto dura</dt><dd className={dd}>{formatDuration(d.duration)}</dd></div></div>
                <div className={row}><Wallet className={icon} aria-hidden="true" />
                    <div><dt className={dt}>Precio estimado</dt><dd className={`${dd} ${d.variable ? '' : 'gr-num text-xl'}`}>{formatPrice(d.price, d.variable)}</dd></div></div>
                {d.name && <div className={row}><User className={icon} aria-hidden="true" />
                    <div><dt className={dt}>A nombre de</dt><dd className={dd}>{d.name}</dd></div></div>}
            </dl>
        </div>
    );
}
