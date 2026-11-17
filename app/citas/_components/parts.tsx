import React from 'react';
import type { AppointmentStatus } from '@/types';
import { STATUS_LABELS } from '@/lib/appointments/appointments-view';
import { STATUS_DOT, STATUS_STYLE, initialOf, tintOf } from './agenda-ui';

/** Avatar de inicial en el color del barbero: fondo tintado y anillo del color; la letra va en el texto normal (no color sobre color). */
export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
    return (
        <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-bos-text"
            style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: tintOf(color, 24), boxShadow: `inset 0 0 0 1.5px ${color}` }}>
            {initialOf(name)}
        </span>
    );
}

/** Punto de estado compacto; el nombre del estado va aparte para quien lee con lector de pantalla. */
export function StatusDot({ status, className = '' }: { status: AppointmentStatus; className?: string }) {
    return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[status]} ${className}`} />;
}

/** Chip pequeño con el estado (texto en los tokens de cada estado, con su propio fondo). */
export function StatusChip({ status, label, className = '' }: { status: AppointmentStatus; label?: string; className?: string }) {
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold leading-4 ${STATUS_STYLE[status]} ${className}`}>
            <StatusDot status={status} className="!h-1.5 !w-1.5" />
            {label ?? STATUS_LABELS[status]}
        </span>
    );
}
