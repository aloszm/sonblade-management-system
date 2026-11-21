'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquarePlus } from 'lucide-react';
import FeedbackComposer from '@/components/feedback/FeedbackComposer';
import { useNavUser } from '@/hooks/useNavUser';
import { refreshFeedbackCounters } from '@/hooks/useFeedbackCounters';
import { deviceFromWidth, screenForPath } from '@/lib/feedback/model';

/**
 * Acceso a "¿Qué mejorarías?" desde cualquier pantalla interna. Va en el ENCABEZADO (no flota), así nunca tapa el
 * botón de cobrar ni la barra inferior del celular. Solo con sesión y PIN definitivo; el AppShell no lo dibuja en la
 * página pública, /reservar ni /login (no tienen encabezado interno).
 */
export default function FeedbackButton() {
    const user = useNavUser();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    if (!user || user.mustChangePin) return null;
    const screen = screenForPath(pathname);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
                aria-label="Escribir un comentario o sugerencia" title="¿Qué mejorarías?" data-testid="feedback-open"
                className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2 text-bos-muted hover:bg-bos-raised hover:text-bos-text md:px-3">
                <MessageSquarePlus aria-hidden="true" className="h-5 w-5" />
                <span className="hidden text-sm font-medium lg:inline">Comentar</span>
            </button>
            {open && (
                <FeedbackComposer
                    screen={screen}
                    device={deviceFromWidth(typeof window === 'undefined' ? null : window.innerWidth)}
                    onClose={() => setOpen(false)}
                    onSent={() => refreshFeedbackCounters()}
                />
            )}
        </>
    );
}
