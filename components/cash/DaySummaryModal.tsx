'use client';

import React, { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import DaySummaryView from '@/components/cash/DaySummaryView';
import Modal from '@/components/ui/Modal';

/** Ventana con el resumen completo del día (la misma pantalla de /caja/resumen). */
export function DaySummaryModal({ onClose }: { onClose: () => void }) {
    return (
        <Modal title="Resumen del día" size="lg" onClose={onClose} testId="day-summary-modal">
            <DaySummaryView headingAs="h2" printViaPage />
        </Modal>
    );
}

/** Botón «Resumen del día»: abre la ventana sin salir de la pantalla. */
export default function DaySummaryButton({ variant = 'primary', className = '' }: { variant?: 'primary' | 'outline'; className?: string }) {
    const [open, setOpen] = useState(false);
    const style = variant === 'primary'
        ? 'bg-bos-accent text-bos-on-accent font-bold hover:bg-bos-accent-strong'
        : 'border-2 border-bos-accent text-bos-accent-text font-bold hover:bg-bos-accent-soft';
    return (
        <>
            <button type="button" data-testid="open-day-summary" onClick={() => setOpen(true)}
                className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] ${style} ${className}`}>
                <ClipboardList aria-hidden="true" className="h-5 w-5" /> Resumen del día
            </button>
            {open && <DaySummaryModal onClose={() => setOpen(false)} />}
        </>
    );
}
