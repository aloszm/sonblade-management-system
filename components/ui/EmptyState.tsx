import React from 'react';

interface EmptyStateProps {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    /** Botón o enlace para el siguiente paso. */
    action?: React.ReactNode;
}

/** "Todavía no hay nada": explica qué falta y qué hacer, sin culpar a nadie. */
export default function EmptyState({ title, description, icon, action }: EmptyStateProps) {
    return (
        <div role="status" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            {icon && <div aria-hidden="true" className="mb-1 text-bos-muted">{icon}</div>}
            <p className="font-display text-base font-semibold text-bos-text">{title}</p>
            {description && <p className="max-w-sm text-sm text-bos-muted">{description}</p>}
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}
