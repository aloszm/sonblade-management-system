'use client';

import React from 'react';
import { AlertCircle, RotateCw, WifiOff } from 'lucide-react';
import Button from './Button';

interface ErrorStateProps {
    /** Mensaje ya en español (usa `toUserMessage(err)`); nunca el texto crudo del error. */
    message: string;
    onRetry?: () => void;
    /** Título; por omisión "No se pudo cargar". */
    title?: string;
    /** Muestra el icono de "sin conexión". */
    offline?: boolean;
    className?: string;
}

/** Fallo de carga: dice qué pasó y deja reintentar. Se anuncia a los lectores de pantalla. */
export default function ErrorState({ message, onRetry, title = 'No se pudo cargar', offline = false, className = '' }: ErrorStateProps) {
    const Icon = offline ? WifiOff : AlertCircle;
    return (
        <div role="alert" className={`flex flex-col items-center gap-2 rounded-xl border border-bos-danger bg-bos-danger-soft px-4 py-8 text-center ${className}`}>
            <Icon aria-hidden="true" className="h-6 w-6 text-bos-danger" />
            <p className="font-display text-base font-semibold text-bos-text">{title}</p>
            <p className="max-w-sm text-sm text-bos-text">{message}</p>
            {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
                    <RotateCw aria-hidden="true" className="h-4 w-4" /> Reintentar
                </Button>
            )}
        </div>
    );
}
