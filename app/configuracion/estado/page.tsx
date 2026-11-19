'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

type Status = {
    mode?: 'practice' | 'production';
    commit: string | null;
    environment: string | null;
    lastMigration: string | null;
    adminKey: { configured: boolean; works: boolean; cause: string | null };
    onlineBookingEnabled: boolean | null;
};

const ENVIRONMENTS: Record<string, string> = { production: 'Producción', preview: 'Vista previa', development: 'Desarrollo' };

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
    const color = tone === 'ok' ? 'text-bos-success' : tone === 'bad' ? 'text-bos-danger' : '';
    return (
        <div className="flex flex-col gap-1 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <dt className="text-sm font-medium text-bos-muted">{label}</dt>
            <dd className={`text-[15px] font-semibold sm:text-right ${color}`}>{value}</dd>
        </div>
    );
}

export default function SystemStatusPage() {
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/system-status', { cache: 'no-store' });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo leer el estado del sistema.');
            setStatus(await res.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo leer el estado del sistema.');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-12">
            <header>
                <Link href="/configuracion" className="inline-flex min-h-11 items-center text-sm font-semibold text-bos-accent-text underline underline-offset-4">Volver a Configuración</Link>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Estado del sistema</h1>
                <p className="text-bos-muted text-sm mt-1">Solo para la cuenta principal. Sirve para comprobar que el sistema está bien conectado.</p>
            </header>

            {error && (
                <div role="alert" className="rounded-xl border border-bos-danger bg-bos-surface p-4 text-sm font-semibold text-bos-danger">
                    <p>{error}</p>
                    <button type="button" onClick={() => void load()} className="mt-2 min-h-11 underline underline-offset-4">Reintentar</button>
                </div>
            )}
            {loading && !status && <p role="status" className="flex items-center gap-2 text-sm text-bos-muted"><Loader2 className="h-4 w-4 animate-spin" /> Cargando...</p>}

            {status && (
                <section className="rounded-xl border border-bos-border bg-bos-surface p-5 sm:p-6">
                    <dl className="divide-y divide-bos-border">
                        <Row label="Modo de la publicación" value={status.mode === 'practice' ? 'Práctica (datos simulados, nada es real)' : 'Producción (datos reales)'} tone={status.mode === 'practice' ? 'bad' : undefined} />
                        <Row label="Versión publicada" value={status.commit ?? 'No disponible (no es un despliegue de Vercel)'} />
                        <Row label="Entorno" value={status.environment ? (ENVIRONMENTS[status.environment] ?? status.environment) : 'No disponible'} />
                        <Row label="Última migración de la base incluida en esta versión" value={status.lastMigration ?? 'No disponible'} />
                        <Row label="Llave del servidor"
                            value={status.adminKey.works ? 'Funciona' : (status.adminKey.cause ?? 'No funciona')}
                            tone={status.adminKey.works ? 'ok' : 'bad'} />
                        <Row label="Reservas en línea"
                            value={status.onlineBookingEnabled === null ? 'No se pudo leer' : status.onlineBookingEnabled ? 'Encendidas' : 'Apagadas'} />
                    </dl>
                    <button type="button" onClick={() => void load()} disabled={loading}
                        className="mt-4 min-h-11 rounded-xl border border-bos-border px-4 text-sm font-semibold disabled:opacity-50">
                        {loading ? 'Actualizando...' : 'Actualizar'}
                    </button>
                </section>
            )}
        </div>
    );
}
