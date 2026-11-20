'use client';

import React from 'react';

interface SwitchProps {
    /** Texto que describe qué enciende o apaga el interruptor (lo leen los lectores de pantalla). */
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
    /** Texto de estado que se dibuja junto al interruptor ("Encendidas" / "Apagadas"). */
    stateText?: string;
    'aria-describedby'?: string;
}

/**
 * Interruptor de encendido y apagado. Mide 56 px de alto (objetivo táctil) y no depende solo del color:
 * el estado también se escribe y la perilla cambia de lado.
 */
export default function Switch({ label, checked, onChange, disabled = false, id, stateText, 'aria-describedby': describedBy }: SwitchProps) {
    return (
        <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} aria-describedby={describedBy}
            disabled={disabled} onClick={() => onChange(!checked)}
            className="inline-flex min-h-14 items-center gap-4 rounded-2xl text-left disabled:cursor-not-allowed disabled:opacity-70">
            <span aria-hidden="true"
                className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border-2 transition-colors motion-reduce:transition-none ${checked ? 'border-bos-success bg-bos-success' : 'border-bos-control bg-bos-raised'}`}>
                <span className={`absolute h-6 w-6 rounded-full shadow transition-all motion-reduce:transition-none ${checked ? 'left-[34px] bg-bos-bg' : 'left-1 bg-bos-muted'}`} />
            </span>
            {stateText && <span className="text-lg font-semibold text-bos-text">{stateText}</span>}
        </button>
    );
}
