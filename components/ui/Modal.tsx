'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

interface ModalProps {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
    /** Ancho máximo en pantallas grandes. En celular ocupa todo el ancho y sale desde abajo. */
    size?: 'md' | 'lg';
    testId?: string;
}

/**
 * Ventana flotante de BarberOS. Se cierra al tocar afuera, con Esc o con la X; mientras está abierta
 * la página de atrás no se desplaza y el foco queda dentro de la ventana.
 */
export default function Modal({ title, subtitle, onClose, children, size = 'md', testId }: ModalProps) {
    const titleId = useId();
    const panel = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    // Se dibuja sobre toda la pantalla (fuera del contenido animado) para no quedar recortada.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => panel.current?.focus());
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { closeRef.current(); return; }
            if (e.key !== 'Tab') return;
            // Foco atrapado: Tab y Mayús+Tab dan la vuelta dentro de la ventana (aria-modal no lo hace solo).
            const box = panel.current;
            if (!box) return;
            const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
                .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
            if (items.length === 0) { e.preventDefault(); box.focus(); return; }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (!active || !box.contains(active) || active === box) {
                e.preventDefault();
                (e.shiftKey ? last : first).focus();
            } else if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus?.();
        };
    }, []);

    if (!mounted) return null;
    return createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" data-testid={testId}>
            {/* Fondo: tocarlo cierra la ventana. */}
            <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={onClose}
                data-testid="modal-backdrop" className="absolute inset-0 bg-black/60 cursor-default bos-fade" />
            <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
                className={`relative w-full ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-bos-border bg-bos-surface text-bos-text p-6 outline-none bos-sheet`}>
                <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="min-w-0">
                        <h2 id={titleId} className="font-display text-xl font-semibold first-letter:uppercase">{title}</h2>
                        {subtitle && <p className="mt-0.5 text-sm text-bos-muted">{subtitle}</p>}
                    </div>
                    <button type="button" aria-label="Cerrar" onClick={onClose}
                        className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                {children}
            </div>
        </div>,
        document.body,
    );
}
