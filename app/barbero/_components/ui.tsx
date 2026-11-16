import React from 'react';
import { RotateCw } from 'lucide-react';

export const card = 'rounded-xl border border-bos-border bg-bos-surface';
export const label = 'text-[13px] font-medium text-bos-muted';
export const sectionTitle = 'font-display text-xl font-semibold';

/** Centavos enteros a pesos: "$1,240" o "$1,240.50". */
export function moneyC(cents: number): string {
    const pesos = cents / 100;
    return `${cents < 0 ? '-' : ''}$${Math.abs(pesos).toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(pesos) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Pesos redondeados, para las barras donde caben pocas cifras. */
export const moneyWhole = (cents: number) => `$${Math.round(cents / 100).toLocaleString('es-MX')}`;

export const timeOf = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone });
export const dayOf = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone });

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Esqueleto: bloque que late mientras llegan los datos (quieto si la persona pide menos movimiento). */
export function Skeleton({ className = '' }: { className?: string }) {
    return <div aria-hidden="true" className={`rounded-lg bg-bos-raised motion-safe:animate-pulse ${className}`} />;
}

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
