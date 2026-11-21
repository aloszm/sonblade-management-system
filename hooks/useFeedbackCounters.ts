'use client';

import React from 'react';
import type { FeedbackCounters } from '@/lib/feedback/model';

/**
 * Contadores de "Comentarios" para el menú, el encabezado y "Más". Una sola petición compartida por pantalla
 * (varias piezas lo usan a la vez) y se vuelve a pedir cuando algo cambia (`refreshFeedbackCounters()`).
 * Son un aviso discreto: si fallan, no se muestra nada.
 */
const EVENT = 'bos:feedback-changed';
let pending: Promise<FeedbackCounters | null> | null = null;

function load(): Promise<FeedbackCounters | null> {
    if (!pending) {
        pending = fetch('/api/feedback/counters', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() as Promise<FeedbackCounters> : null))
            .catch(() => null);
        // Se puede volver a pedir en la siguiente pantalla.
        void pending.finally(() => { setTimeout(() => { pending = null; }, 1000); });
    }
    return pending;
}

/** Avisa a los contadores que algo cambió (se envió, se respondió o se vio un comentario). */
export function refreshFeedbackCounters(): void {
    pending = null;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/** `enabled` en false (sin sesión o con PIN temporal) no pide nada. */
export function useFeedbackCounters(enabled: boolean): FeedbackCounters | null {
    const [counters, setCounters] = React.useState<FeedbackCounters | null>(null);
    React.useEffect(() => {
        if (!enabled) { setCounters(null); return; }
        let alive = true;
        const run = () => { void load().then((c) => { if (alive) setCounters(c); }); };
        run();
        window.addEventListener(EVENT, run);
        return () => { alive = false; window.removeEventListener(EVENT, run); };
    }, [enabled]);
    return counters;
}

/** Qué mostrar junto a "Comentarios": número de nuevos (cuenta principal) o un punto (respuesta sin ver). */
export function feedbackBadge(counters: FeedbackCounters | null): { count: number; dot: boolean; label: string } | null {
    if (!counters) return null;
    const count = counters.new_count ?? 0;
    const dot = counters.unseen_updates > 0;
    if (count <= 0 && !dot) return null;
    const parts = [];
    if (count > 0) parts.push(count === 1 ? '1 comentario nuevo' : `${count} comentarios nuevos`);
    if (dot) parts.push(counters.unseen_updates === 1 ? '1 respuesta sin ver' : `${counters.unseen_updates} respuestas sin ver`);
    return { count, dot, label: parts.join(', ') };
}
