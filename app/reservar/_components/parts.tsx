'use client';

import Skeleton from '@/components/ui/Skeleton';
import React, { useEffect, useRef } from 'react';
import { AlertCircle, ArrowLeft, Phone } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { phoneHref } from '@/lib/booking-ui/business';
import { formatDuration, formatPrice, initialOf } from '@/lib/booking-ui/format';
import type { BookingService } from '@/lib/booking-ui/types';

export const PRIMARY_BTN = 'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bos-accent px-5 text-base font-semibold text-bos-on-accent transition-colors hover:bg-bos-accent-strong disabled:cursor-not-allowed disabled:bg-bos-raised disabled:text-bos-muted';
export const SECONDARY_BTN = 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-bos-control px-4 text-base font-medium text-bos-text transition-colors hover:bg-bos-raised disabled:cursor-not-allowed disabled:text-bos-muted';

export function BusinessHeader({ name, address, phone }: { name: string; address: string; phone: string }) {
    return (
        <header className="flex items-start gap-3 pb-5 pt-5">
            <BrandLogo className="h-14 w-14 shrink-0" />
            <div className="min-w-0 flex-1">
                <h1 className="font-display text-xl font-semibold leading-tight text-bos-text">{name}</h1>
                <p className="mt-0.5 text-sm text-bos-muted">{address}</p>
                <a href={phoneHref(phone)} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-bos-accent-text underline-offset-2 hover:underline">
                    <Phone className="h-4 w-4" aria-hidden="true" />{phone}
                </a>
            </div>
            <ThemeToggle />
        </header>
    );
}

export const STEP_LABELS = ['Servicio', 'Horario', 'Tus datos', 'Listo'] as const;

export function Stepper({ current }: { current: number }) {
    return (
        <nav aria-label="Pasos de la reserva" className="mb-5">
            <ol className="flex gap-1.5">
                {STEP_LABELS.map((label, i) => (
                    <li key={label} aria-current={i === current ? 'step' : undefined} className="flex-1">
                        <div className={`h-1.5 rounded-full ${i <= current ? 'bg-bos-accent' : 'bg-bos-border'}`} />
                        <span className="sr-only">{label}{i < current ? ', completado' : i === current ? ', paso actual' : ''}</span>
                    </li>
                ))}
            </ol>
            <p className="mt-2 text-sm text-bos-muted" aria-hidden="true">Paso {current + 1} de {STEP_LABELS.length} · <span className="font-medium text-bos-text">{STEP_LABELS[current]}</span></p>
        </nav>
    );
}

/** Encabezado del paso: recibe el foco al llegar para que el lector de pantalla lo anuncie. */
export function StepHeading({ children, hint, focusKey }: { children: React.ReactNode; hint?: string; focusKey: string }) {
    const ref = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        ref.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
    }, [focusKey]);
    return (
        <div className="mb-4">
            <h2 ref={ref} tabIndex={-1} style={{ outline: 'none' }} className="font-display text-2xl font-semibold text-bos-text">{children}</h2>
            {hint && <p className="mt-1 text-sm text-bos-muted">{hint}</p>}
        </div>
    );
}

export function BackButton({ onClick, children = 'Atrás' }: { onClick: () => void; children?: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-bos-muted hover:text-bos-text">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />{children}
        </button>
    );
}

export function StickyBar({ children }: { children: React.ReactNode }) {
    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-bos-border bg-bos-bg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {children}
        </div>
    );
}

export function ErrorNote({ id, children, action }: { id?: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div id={id} role="alert" className="flex gap-3 rounded-xl border border-bos-danger bg-bos-danger-soft p-3 text-sm text-bos-text">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-bos-danger" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p>{children}</p>
                {action && <div className="mt-2">{action}</div>}
            </div>
        </div>
    );
}

export function InfoNote({ children }: { children: React.ReactNode }) {
    return <div role="status" className="rounded-xl border border-bos-border bg-bos-surface p-3 text-sm text-bos-muted">{children}</div>;
}

export { Skeleton };

/** Opción de una lista de selección única: radio real (flechas y espacio funcionan) con tarjeta. */
export function RadioCard({ name, value, checked, onChange, children, className = '' }: {
    name: string; value: string; checked: boolean; onChange: () => void; children: React.ReactNode; className?: string;
}) {
    return (
        <label className={`relative flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-bos-border bg-bos-surface p-3 transition-colors hover:bg-bos-raised has-[:checked]:border-bos-accent has-[:checked]:bg-bos-accent-soft has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bos-accent-text ${className}`}>
            <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
            {children}
        </label>
    );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'sm' }) {
    return (
        <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-bos-accent-soft font-semibold text-bos-accent-text ring-1 ring-bos-accent ${size === 'md' ? 'h-11 w-11 text-lg' : 'h-7 w-7 text-sm'}`}>
            {initialOf(name)}
        </span>
    );
}

export function ServiceMeta({ service }: { service: Pick<BookingService, 'duration_minutes' | 'price' | 'variable_price'> }) {
    return <>{formatDuration(service.duration_minutes)} · {formatPrice(service.price, service.variable_price)}</>;
}
