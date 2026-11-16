'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PickerPopoverProps {
    anchorRef: React.RefObject<HTMLElement | null>;
    label: string;
    onClose: () => void;
    children: React.ReactNode;
    /** Ancho del panel flotante en computadora (px). En celular ocupa todo el ancho. */
    width?: number;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const GAP = 6;
const MARGIN = 8;

/**
 * Panel de los selectores: diálogo anclado al campo en computadora (voltea hacia arriba si no cabe
 * abajo y nunca se sale de la ventana) y hoja inferior a todo el ancho en celular. Se dibuja en el
 * body para que ningún contenedor con scroll lo recorte. Esc y clic afuera lo cierran; el foco
 * vuelve al disparador.
 */
export default function PickerPopover({ anchorRef, label, onClose, children, width = 320 }: PickerPopoverProps) {
    const panel = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const [sheet, setSheet] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const close = useCallback(() => {
        const anchor = anchorRef.current;
        closeRef.current();
        requestAnimationFrame(() => anchor?.focus());
    }, [anchorRef]);

    const place = useCallback(() => {
        const mobile = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches;
        setSheet(mobile);
        const anchor = anchorRef.current, el = panel.current;
        if (mobile || !anchor || !el) return;
        const r = anchor.getBoundingClientRect();
        const h = el.offsetHeight, w = el.offsetWidth;
        const below = window.innerHeight - r.bottom - GAP - MARGIN;
        const above = r.top - GAP - MARGIN;
        const top = h <= below || below >= above ? r.bottom + GAP : r.top - GAP - h;
        const left = Math.min(Math.max(MARGIN, r.left), Math.max(MARGIN, window.innerWidth - w - MARGIN));
        setPos({ top: Math.max(MARGIN, Math.min(top, window.innerHeight - h - MARGIN)), left });
    }, [anchorRef]);

    useLayoutEffect(() => {
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
    }, [place]);

    // Foco al abrir en el elemento marcado (día, lista) y página de atrás quieta en celular.
    useEffect(() => {
        const t = requestAnimationFrame(() => {
            const target = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current;
            target?.focus();
        });
        return () => cancelAnimationFrame(t);
    }, []);
    useEffect(() => {
        if (!sheet) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [sheet]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); return; }
        if (e.key !== 'Tab' || !panel.current) return;
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    return createPortal(
        <div className="fixed inset-0 z-[80]">
            {/* Fondo: tocarlo cierra. En celular oscurece la página; en computadora es invisible. */}
            <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={close}
                className={`absolute inset-0 cursor-default ${sheet ? 'bg-black/60 bos-fade' : ''}`} />
            <div ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown}
                style={sheet ? undefined : { top: pos?.top ?? 0, left: pos?.left ?? 0, width, visibility: pos ? 'visible' : 'hidden' }}
                className={sheet
                    ? 'absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-bos-border bg-bos-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-bos-text shadow-2xl outline-none bos-sheet'
                    : 'absolute max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-bos-border bg-bos-surface p-3 text-bos-text shadow-2xl outline-none motion-safe:bos-fade'}>
                {children}
            </div>
        </div>,
        document.body,
    );
}
