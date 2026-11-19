import Skeleton from '@/components/ui/Skeleton';
import React from 'react';
import { RotateCw } from 'lucide-react';
import { formatDate, formatTime } from '@/lib/utils/dates';
import { formatMoney } from '@/lib/utils/money';

export const card = 'rounded-xl border border-bos-border bg-bos-surface';
export const label = 'text-[13px] font-medium text-bos-muted';
export const sectionTitle = 'font-display text-xl font-semibold';

/** Centavos enteros a pesos: "$1,240" o "$1,240.50". */
export function moneyC(cents: number): string {
    return formatMoney(cents / 100);
}

/** Pesos redondeados, para las barras donde caben pocas cifras. */
export const moneyWhole = (cents: number) => formatMoney(Math.round(cents / 100));

export const timeOf = (iso: string, timeZone: string) => formatTime(iso, timeZone);
export const dayOf = (iso: string, timeZone: string) => formatDate(iso, timeZone, { year: false });

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Esqueleto: bloque que late mientras llegan los datos (quieto si la persona pide menos movimiento). */
export { Skeleton };

export function SectionSkeleton({ title, rows = 3 }: { title: string; rows?: number }) {
    return (
        <section aria-busy="true" aria-label={`${title}: cargando`} className={`${card} space-y-4 p-4 sm:p-6`}>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-14 w-full" />
            {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}
        </section>
    );
}

export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div role="alert" className={`${card} flex flex-col items-start gap-3 p-4 sm:p-6`}>
            <p className="text-[15px] font-semibold text-bos-danger">{message}</p>
            <button type="button" onClick={onRetry}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-bos-border px-4 text-[15px] font-semibold text-bos-text hover:bg-bos-raised">
                <RotateCw aria-hidden="true" className="h-4 w-4" /> Reintentar
            </button>
        </div>
    );
}

/** Cambio contra el periodo anterior, con signo y color. */
export function Delta({ value, text, versus }: { value: number; text: string; versus: string }) {
    const tone = value > 0 ? 'text-bos-success' : value < 0 ? 'text-bos-danger' : 'text-bos-muted';
    const mark = value > 0 ? '▲' : value < 0 ? '▼' : '=';
    return (
        <p className="text-sm text-bos-muted">
            <span className={`font-semibold tabular-nums ${tone}`}><span aria-hidden="true">{mark} </span>{text}</span> {versus}
        </p>
    );
}
