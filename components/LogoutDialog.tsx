'use client';

import React, { useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toUserMessage } from '@/lib/utils/errors';

/**
 * Confirmación única para "Salir" (menú lateral, encabezado y menú del celular).
 * Cierra la sesión en el servidor y lleva a /login; si falla, lo dice sin salir.
 */
export default function LogoutDialog({ onCancel, onLoggedOut }: { onCancel: () => void; onLoggedOut?: () => void }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const logout = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await fetch('/api/auth/login', { method: 'DELETE' });
            if (!res.ok) throw new Error('logout');
            if (onLoggedOut) onLoggedOut(); else window.location.href = '/login';
        } catch (e) {
            setError(toUserMessage(e, 'No se pudo cerrar la sesión. Inténtalo de nuevo.'));
            setBusy(false);
        }
    };

    return (
        <ConfirmDialog
            title="Cerrar sesión"
            message={<>
                <p>¿Quieres cerrar tu sesión?</p>
                {error && <p role="alert" className="mt-3 text-sm font-medium text-bos-danger">{error}</p>}
            </>}
            confirmLabel="Salir"
            loading={busy}
            onConfirm={logout}
            onCancel={onCancel}
        />
    );
}
