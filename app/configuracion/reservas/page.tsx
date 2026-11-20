'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { getJson } from '@/lib/money/client';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import type { BookingSettingsView } from '@/lib/booking/settings-view';
import BookingSettingsForm from './_components/BookingSettingsForm';

const KEY = ['booking-settings'] as const;

/** Reservas en línea: dueño y gerencia la ven; solo la cuenta principal puede cambiarla. */
export default function BookingSettingsPage() {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: KEY,
        queryFn: () => getJson<{ settings: BookingSettingsView; can_edit: boolean }>('/api/booking-settings'),
    });

    return (
        <div className="mx-auto max-w-3xl space-y-6 pb-12">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Reservas en línea</h1>
                <p className="mt-1 text-sm text-bos-muted">Enciende o apaga la reserva desde la página pública y ajusta sus reglas.</p>
                <Link href="/configuracion" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-bos-accent-text underline underline-offset-4">Volver a Configuración</Link>
            </header>

            {query.isLoading ? (
                <div role="status" aria-busy="true" className="space-y-4">
                    <span className="sr-only">Cargando las reservas en línea…</span>
                    <Skeleton className="h-48 w-full" />
                    <Skeleton className="h-64 w-full" />
                </div>
            ) : query.isError || !query.data ? (
                <ErrorState title="No se pudieron cargar las reservas en línea" message={toUserMessage(query.error)} offline={isOfflineError(query.error)} onRetry={() => query.refetch()} />
            ) : (
                <BookingSettingsForm key={`${query.data.settings.last_changed_at ?? 'nuevo'}-${query.data.settings.enabled}`} settings={query.data.settings} canEdit={query.data.can_edit}
                    onSaved={(settings) => { client.setQueryData(KEY, { settings, can_edit: true }); void client.invalidateQueries({ queryKey: KEY }); }} />
            )}
        </div>
    );
}
