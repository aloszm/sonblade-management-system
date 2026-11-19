'use client';

import React from 'react';
import Modal from './Modal';
import Button from './Button';

interface ConfirmDialogProps {
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** `danger` para acciones destructivas. */
    variant?: 'primary' | 'danger';
    /** Mientras la acción se ejecuta, los botones quedan deshabilitados. */
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Reemplazo de `window.confirm`: ventana propia, con foco atrapado y botones de 44 px o más. */
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'primary', loading = false, onConfirm, onCancel }: ConfirmDialogProps) {
    return (
        <Modal title={title} onClose={onCancel} testId="confirm-dialog">
            <div className="text-[15px] text-bos-text">{message}</div>
            <div className="mt-6 grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
                <Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
            </div>
        </Modal>
    );
}
