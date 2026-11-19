'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type ToastKind = 'success' | 'error';
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastApi {
    success: (message: string) => void;
    error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DISMISS_MS = 5000;

/** Avisos breves ("Guardado", "No se pudo guardar"). Los errores se anuncian con role="alert". */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([]);
    const next = useRef(1);
    const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

    const dismiss = useCallback((id: number) => {
        const t = timers.current.get(id);
        if (t) clearTimeout(t);
        timers.current.delete(id);
        setItems((list) => list.filter((i) => i.id !== id));
    }, []);

    const push = useCallback((kind: ToastKind, message: string) => {
        const id = next.current++;
        setItems((list) => [...list.slice(-2), { id, kind, message }]);
        timers.current.set(id, setTimeout(() => dismiss(id), DISMISS_MS));
    }, [dismiss]);

    useEffect(() => {
        const map = timers.current;
        return () => { map.forEach(clearTimeout); map.clear(); };
    }, []);

    const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m) }), [push]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {items.map((t) => (
                    <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
                        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-bos-surface p-3 text-sm text-bos-text shadow-lg bos-rise ${t.kind === 'error' ? 'border-bos-danger' : 'border-bos-success'}`}>
                        {t.kind === 'error'
                            ? <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-bos-danger" />
                            : <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-bos-success" />}
                        <p className="min-w-0 flex-1">{t.message}</p>
                        <button type="button" aria-label="Cerrar aviso" onClick={() => dismiss(t.id)}
                            className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-bos-muted hover:text-bos-text">
                            <X aria-hidden="true" className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

/** Sin proveedor (p. ej. en una prueba aislada) los avisos se ignoran en vez de romper la pantalla. */
const NOOP: ToastApi = { success: () => {}, error: () => {} };
export function useToast(): ToastApi {
    return useContext(ToastContext) ?? NOOP;
}
