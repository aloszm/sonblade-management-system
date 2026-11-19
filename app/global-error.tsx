'use client';

import './globals.css';

/** Último recurso: falló el diseño raíz. Debe traer su propio <html> y <body>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="es" data-theme="dark">
            <body className="flex min-h-screen items-center justify-center bg-bos-bg p-4 font-sans text-bos-text antialiased">
                <div role="alert" className="max-w-sm rounded-xl border border-bos-danger bg-bos-danger-soft p-6 text-center">
                    <h1 className="font-display text-xl font-semibold">Algo salió mal</h1>
                    <p className="mt-2 text-sm">La aplicación tuvo un problema inesperado. Inténtalo de nuevo; si sigue igual, avisa a gerencia.</p>
                    <button type="button" onClick={reset}
                        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-bos-control px-4 text-sm font-semibold hover:bg-bos-raised">
                        Reintentar
                    </button>
                </div>
            </body>
        </html>
    );
}
