'use client';

import React, { useId } from 'react';

export const FIELD_CLASS = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text aria-[invalid=true]:border-bos-danger disabled:opacity-60';
export const LABEL_CLASS = 'block text-[13px] font-medium text-bos-muted mb-1.5';

interface ControlProps {
    id: string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
    className: string;
}

interface FieldOwnProps {
    label: string;
    /** Mensaje de error en español; marca el campo como inválido y se anuncia. */
    error?: string;
    hint?: string;
    className?: string;
    /** Sustituye al input: recibe los atributos que debe llevar el control (select, textarea…). */
    children?: (props: ControlProps) => React.ReactNode;
}

type FieldProps = FieldOwnProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'children' | 'className'>;

/**
 * Campo de formulario: etiqueta asociada, borde con el token `--bos-control` y mensaje de error
 * enlazado con aria-describedby. Por omisión dibuja un <input>.
 */
export default function Field({ label, error, hint, className = '', children, id, ...input }: FieldProps) {
    const auto = useId();
    const inputId = id ?? auto;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
    const controlProps: ControlProps = {
        id: inputId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        className: `${FIELD_CLASS} ${className}`,
    };
    return (
        <div>
            <label htmlFor={inputId} className={LABEL_CLASS}>{label}</label>
            {children ? children(controlProps) : <input {...input} {...controlProps} />}
            {hint && <p id={hintId} className="mt-1.5 text-xs text-bos-muted">{hint}</p>}
            {error && <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-bos-danger">{error}</p>}
        </div>
    );
}
