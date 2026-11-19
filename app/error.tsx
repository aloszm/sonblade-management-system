'use client';

import { useEffect } from 'react';
import ErrorState from '@/components/ui/ErrorState';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';

/** Error inesperado en una pantalla: mensaje en español y botón para reintentar. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => { console.error(error); }, [error]);
    return (
        <div className="mx-auto max-w-lg py-10">
            <ErrorState title="Algo salió mal" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={reset} />
        </div>
    );
}
