'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Estilos ya usados en la app (ver app/reservar y las pantallas de citas, caja y gastos). */
const VARIANTS: Record<ButtonVariant, string> = {
    primary: 'bg-bos-accent text-bos-on-accent font-bold hover:bg-bos-accent-strong disabled:bg-bos-raised disabled:text-bos-muted',
    secondary: 'border border-bos-control text-bos-text font-semibold hover:bg-bos-raised disabled:text-bos-muted',
    danger: 'bg-bos-danger text-bos-bg font-bold hover:brightness-105 disabled:bg-bos-raised disabled:text-bos-muted',
    ghost: 'text-bos-muted font-medium hover:bg-bos-raised hover:text-bos-text disabled:opacity-60',
};

/** Todos miden al menos 44 px de alto: el mínimo táctil en celular. */
const SIZES: Record<ButtonSize, string> = {
    sm: 'min-h-11 px-4 text-sm',
    md: 'min-h-12 px-5 text-[15px]',
    lg: 'min-h-[52px] px-5 text-[15px]',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Mientras guarda: se deshabilita (evita el doble clic) y muestra un indicador de progreso. */
    loading?: boolean;
    /** Texto que se muestra en lugar del contenido mientras `loading` (opcional). */
    loadingText?: string;
    fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'primary', size = 'lg', loading = false, loadingText, fullWidth = false, disabled, className = '', type = 'button', children, ...rest },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={`inline-flex items-center justify-center gap-2 rounded-xl transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
            {...rest}
        >
            {loading && <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 motion-safe:animate-spin" />}
            {loading && loadingText ? loadingText : children}
        </button>
    );
});

export default Button;
