'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Línea informativa del cierre de caja: a qué sobre entra el apartado. Solo la ven quienes pueden consultar sobres:
 * si la API responde 403 (recepción) o falla, no se dibuja nada y el cierre sigue igual.
 */
export default function EnvelopeNote({ className = '' }: { className?: string }) {
    const [name, setName] = useState<string | null>(null);
    useEffect(() => {
        let alive = true;
        fetch('/api/envelopes', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data: { envelopes?: { name: string; is_default?: boolean }[] } | null) => {
                const list = Array.isArray(data?.envelopes) ? data.envelopes : [];
                const target = list.find((e) => e.is_default) ?? list[0];
                if (alive && target) setName(target.name);
            })
            .catch(() => undefined);
        return () => { alive = false; };
    }, []);
    if (!name) return null;
    return (
        <p data-testid="envelope-note" className={`text-sm text-bos-muted ${className}`}>
            Este apartado entra al sobre «{name}». <Link href="/sobres" className="font-semibold text-bos-accent-text underline underline-offset-2">Ver sobres</Link>
        </p>
    );
}
