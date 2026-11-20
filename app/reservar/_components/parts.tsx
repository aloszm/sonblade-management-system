'use client';

import Skeleton from '@/components/ui/Skeleton';
import React, { useEffect, useRef } from 'react';
import { AlertCircle, ArrowLeft, Check, Phone } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import ThemeToggle from '@/components/ThemeToggle';
import { phoneHref } from '@/lib/booking-ui/business';
import { initialOf } from '@/lib/booking-ui/format';

export const PRIMARY_BTN = 'inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl bg-bos-accent px-5 text-base font-semibold text-bos-on-accent transition-colors hover:bg-bos-accent-strong disabled:cursor-not-allowed disabled:bg-bos-raised disabled:text-bos-muted';
export const SECONDARY_BTN = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-bos-control px-4 text-base font-medium text-bos-text transition-colors hover:bg-bos-raised disabled:cursor-not-allowed disabled:text-bos-muted';
export const LINK = 'font-medium text-bos-accent-text underline underline-offset-2';

/** Encabezado compacto: marca a la izquierda; llamar y tema a la derecha (siempre a un toque). */
export function BusinessHeader({ phone }: { phone: string }) {
    return (
        <header className="flex items-center gap-3 py-2">
            <BrandLogo className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
                <p className="gr-serif text-xl font-semibold text-bos-text">Gallo 4:20</p>
                <p className="gr-caps text-bos-accent-text">Reserva tu cita</p>
            </div>
            <a href={phoneHref(phone)} aria-label={`Llamar a la barbería, ${phone}`}
                className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-bos-control text-bos-text hover:bg-bos-raised">
                <Phone className="h-5 w-5" aria-hidden="true" />
            </a>
            <ThemeToggle className="h-12 w-12" />
        </header>
    );
}

export const STEP_LABELS = ['Servicio', 'Barbero', 'Día y hora', 'Tus datos'] as const;

/** Progreso discreto: "Atrás" y "Paso 2 de 4" en una sola línea, y cuatro filetes debajo. */
export function Progress({ current, onBack }: { current: number; onBack?: () => void }) {
    return (
        <nav aria-label="Pasos de la reserva" className="mb-4">
            <div className="flex min-h-12 items-center justify-between">
                {onBack ? (
                    <button type="button" onClick={onBack} className="-ml-2 inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 text-base font-medium text-bos-muted hover:text-bos-text">
                        <ArrowLeft className="h-5 w-5" aria-hidden="true" />Atrás
                    </button>
                ) : <span />}
                <p className="text-sm text-bos-muted" aria-hidden="true">Paso {current + 1} de {STEP_LABELS.length}</p>
            </div>
            <ol className="mt-1 flex gap-1.5">
                {STEP_LABELS.map((label, i) => (
                    <li key={label} aria-current={i === current ? 'step' : undefined} className="flex-1">
                        <div className={`h-1 rounded-full ${i <= current ? 'bg-bos-accent' : 'bg-bos-border'}`} />
                        <span className="sr-only">{label}{i < current ? ', listo' : i === current ? ', paso actual' : ''}</span>
                    </li>
                ))}
            </ol>
        </nav>
    );
}

/** Pregunta del paso: recibe el foco al llegar para que el lector de pantalla la anuncie. */
export function StepHeading({ children, hint, focusKey }: { children: React.ReactNode; hint?: React.ReactNode; focusKey: string }) {
    const ref = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        ref.current?.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
    }, [focusKey]);
    return (
        <div className="mb-4">
            <h2 ref={ref} id="gr-step-title" tabIndex={-1} style={{ outline: 'none' }} className="gr-serif text-[1.875rem] font-semibold leading-tight text-bos-text">{children}</h2>
            <div className="gr-rule mt-2" aria-hidden="true"><i /></div>
            {hint && <p className="mt-2 text-base text-bos-muted">{hint}</p>}
        </div>
    );
}

export function BackButton({ onClick, children = 'Atrás' }: { onClick: () => void; children?: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} className="-ml-2 mb-1 inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 text-base font-medium text-bos-muted hover:text-bos-text">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />{children}
        </button>
    );
}

/** Barra fija inferior: resumen tocable arriba y la acción principal abajo. Deja su propio espacio al final. */
export function BottomBar({ summary, children }: { summary?: React.ReactNode; children?: React.ReactNode }) {
    if (!summary && !children) return null;
    return (
        <>
            <div className="gr-bar-spacer" aria-hidden="true" />
            <div className="gr-bar" data-testid="booking-bar">
                <div className="mx-auto w-full max-w-[640px] space-y-2">
                    {summary}
                    {children}
                </div>
            </div>
        </>
    );
}

export interface SummaryItem { key: string; label: string; value: string; current?: boolean; onClick: () => void }

/** Resumen vivo: cada dato es un botón que regresa a su paso sin borrar lo demás. */
export function Summary({ items, note }: { items: SummaryItem[]; note?: string }) {
    if (!items.length) return null;
    return (
        <div>
            <p className="sr-only">Tu cita hasta ahora. Toca un dato para cambiarlo.</p>
            <ul className="gr-chips" aria-label="Resumen de tu cita">
                {items.map((it) => (
                    <li key={it.key}>
                        <button type="button" onClick={it.onClick} aria-current={it.current ? 'step' : undefined} aria-label={`Cambiar ${it.label.toLowerCase()}: ${it.value}`}
                            className={`inline-flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-base text-bos-text transition-colors hover:bg-bos-raised ${it.current ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border bg-bos-surface'}`}>
                            <span className="font-semibold">{it.value}</span>
                        </button>
                    </li>
                ))}
            </ul>
            {note && <p className="mt-1 text-sm text-bos-muted">{note}</p>}
        </div>
    );
}

export function ErrorNote({ id, children, action }: { id?: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div id={id} role="alert" className="flex gap-3 rounded-xl border border-bos-danger bg-bos-danger-soft p-3 text-base text-bos-text">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-bos-danger" aria-hidden="true" />
            <div className="min-w-0 flex-1">
                <p>{children}</p>
                {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
            </div>
        </div>
    );
}

export function InfoNote({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div role="status" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-base text-bos-text">
            <div>{children}</div>
            {action && <div className="mt-3 space-y-2">{action}</div>}
        </div>
    );
}

export const RETRY_BTN = 'inline-flex min-h-12 items-center rounded-xl border border-bos-control px-4 text-base font-medium text-bos-text hover:bg-bos-raised';

export { Skeleton };

// Las flechas del teclado también "hacen clic" en un grupo de radios. Para no avanzar solo por recorrer las
// opciones con las flechas, se recuerda cuándo fue la última flecha y ese clic solo selecciona.
let lastArrowAt = 0;
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * Opción de selección única: radio real (flechas para recorrer, espacio o Enter para elegir). Tocarla con el
 * dedo o el ratón la elige y avanza (`onPick(true)`); recorrerla con flechas solo la marca (`onPick(false)`).
 */
export function ChoiceRadio({ name, value, checked, onPick, children, className = '', checkedClass = 'border-bos-accent bg-bos-accent-soft', showCheck = true, disabled, describedBy }: {
    name: string; value: string; checked: boolean; onPick: (advance: boolean) => void; children: React.ReactNode;
    className?: string; checkedClass?: string; showCheck?: boolean; disabled?: boolean; describedBy?: string;
}) {
    return (
        <label className={`relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bos-accent-text ${checked ? checkedClass : 'border-bos-border bg-bos-surface hover:bg-bos-raised'} ${disabled ? 'cursor-not-allowed' : ''} ${className}`}>
            <input type="radio" name={name} value={value} checked={checked} disabled={disabled} aria-describedby={describedBy} className="sr-only"
                onChange={() => onPick(false)}
                onClick={() => { if (Date.now() - lastArrowAt > 80) onPick(true); }}
                onKeyDown={(e) => {
                    if (ARROWS.has(e.key)) lastArrowAt = Date.now();
                    else if (e.key === 'Enter') { e.preventDefault(); onPick(true); }
                }} />
            {children}
            {showCheck && checked && (
                <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bos-accent text-bos-on-accent">
                    <Check className="h-4 w-4" strokeWidth={3} />
                </span>
            )}
        </label>
    );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'sm' }) {
    return (
        <span aria-hidden="true" className={`gr-serif inline-flex shrink-0 items-center justify-center rounded-full bg-bos-accent-soft font-semibold text-bos-accent-text ring-1 ring-bos-accent ${size === 'md' ? 'h-12 w-12 text-xl' : 'h-8 w-8 text-base'}`}>
            {initialOf(name)}
        </span>
    );
}
