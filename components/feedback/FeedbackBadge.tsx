import React from 'react';

/**
 * Aviso discreto junto a "Comentarios": número de comentarios nuevos (cuenta principal) o un punto cuando hay una
 * respuesta sin ver. `label` es lo que escucha el lector de pantalla.
 */
export default function FeedbackBadge({ badge, className = '' }: { badge: { count: number; dot: boolean; label: string } | null; className?: string }) {
    if (!badge) return null;
    if (badge.count > 0) {
        return (
            <span data-testid="feedback-badge" className={`inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-bos-accent px-1.5 text-[11px] font-bold leading-none text-bos-on-accent ${className}`}>
                <span aria-hidden="true">{badge.count > 99 ? '99+' : badge.count}</span>
                <span className="sr-only">{badge.label}</span>
            </span>
        );
    }
    return (
        <span data-testid="feedback-badge" className={`inline-flex h-2.5 w-2.5 rounded-full bg-bos-accent ${className}`}>
            <span className="sr-only">{badge.label}</span>
        </span>
    );
}
