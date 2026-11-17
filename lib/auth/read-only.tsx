'use client';

import React from 'react';

/**
 * Modo de solo lectura en pantalla para la cuenta de consulta (puesto `viewer`).
 * Solo oculta botones: la regla real vive en la base (RLS y funciones) y en la API,
 * que rechazan cualquier escritura de este puesto aunque alguien llame directo.
 */
type Me = { authenticated?: boolean; user?: { readOnly?: boolean } };

let cached: Promise<boolean> | null = null;

function loadReadOnly(): Promise<boolean> {
    if (!cached) {
        cached = fetch('/api/auth/me', { cache: 'no-store' })
            .then((res) => res.json() as Promise<Me>)
            .then((data) => Boolean(data?.authenticated && data.user?.readOnly))
            .catch(() => false);
        // Se vuelve a preguntar en la siguiente navegación (otra sesión en el mismo navegador).
        cached.finally(() => { setTimeout(() => { cached = null; }, 0); });
    }
    return cached;
}

/** true si la sesión es de consulta. Mientras carga devuelve false (los botones fallarían igual en el servidor). */
export function useReadOnly(): boolean {
    const [readOnly, setReadOnly] = React.useState(false);
    React.useEffect(() => {
        let alive = true;
        loadReadOnly().then((value) => { if (alive) setReadOnly(value); });
        return () => { alive = false; };
    }, []);
    return readOnly;
}

/** Aviso fijo arriba de las pantallas para la cuenta de consulta. */
export function ReadOnlyNotice({ readOnly, children }: { readOnly: boolean; children?: React.ReactNode }) {
    if (!readOnly) return null;
    return (
        <div role="status" className="rounded-lg border border-bos-border bg-bos-surface px-4 py-2 text-sm text-bos-muted">
            <strong className="text-bos-text">Tu cuenta es de consulta.</strong>{' '}
            {children ?? 'Puedes ver toda la información, pero no hacer cambios.'}
        </div>
    );
}
