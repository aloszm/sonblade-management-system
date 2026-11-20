'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageCircle, PhoneOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Modal from '@/components/ui/Modal';
import Skeleton from '@/components/ui/Skeleton';
import type { Appointment } from '@/types';
import { servicesText } from '@/lib/appointments/booking';
import { sentLabel } from '@/lib/notifications/sent-label';
import { formatTime } from '@/lib/utils/dates';
import { isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';
import { longDayTitle } from './agenda-ui';
import { WaFallbackLink, useWhatsAppSend } from './whatsapp';

export type TomorrowAppointment = Appointment & { has_valid_phone: boolean; reminder_sent: boolean };
interface TomorrowResponse { day: string; timezone: string; appointments: TomorrowAppointment[] }

export const tomorrowKey = ['agenda', 'tomorrow'] as const;

/** Citas de mañana (agendadas o confirmadas, sin cobrar) con su estado de recordatorio. Solo para quien manda mensajes. */
export function useTomorrowReminders(enabled: boolean) {
    return useQuery({
        queryKey: tomorrowKey, enabled, staleTime: 10_000, refetchInterval: 60_000, refetchIntervalInBackground: false,
        queryFn: async () => readJson<TomorrowResponse>(await fetch('/api/appointments?recordatorios=manana', { cache: 'no-store' })),
    });
}

/** Cuántas faltan por avisar: sin recordatorio y con teléfono válido (las que no tienen teléfono no se pueden despachar). */
export function pendingCount(rows: TomorrowAppointment[] | undefined): number {
    return (rows ?? []).filter((a) => !a.reminder_sent && a.has_valid_phone).length;
}

/** Por avisar (por hora), después las que no tienen teléfono y al final las ya enviadas. */
export function sortReminders(rows: TomorrowAppointment[]): TomorrowAppointment[] {
    const rank = (a: TomorrowAppointment) => (a.reminder_sent ? 2 : a.has_valid_phone ? 0 : 1);
    return [...rows].sort((a, b) => rank(a) - rank(b) || a.scheduled_at.localeCompare(b.scheduled_at));
}

function Row({ apt, timeZone, onSent }: { apt: TomorrowAppointment; timeZone: string; onSent: () => void | Promise<void> }) {
    const wa = useWhatsAppSend(onSent);
    const reminder = apt.notifications?.reminder ?? null;
    const detail = [servicesText(apt), apt.barber?.name].filter(Boolean).join(' · ');
    return (
        <li data-testid="tomorrow-row" className="rounded-xl border border-bos-border bg-bos-bg p-3">
            <div className="flex items-start gap-3">
                <span className="w-[5.5rem] shrink-0 whitespace-nowrap pt-0.5 text-[15px] font-semibold tabular-nums">{formatTime(apt.scheduled_at, timeZone)}</span>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{apt.client_name}</p>
                    {detail && <p className="text-sm text-bos-muted">{detail}</p>}
                </div>
            </div>
            <div className="mt-3">
                {apt.reminder_sent && reminder ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p data-testid="tomorrow-sent" className="inline-flex items-center gap-2 text-sm font-medium text-bos-success">
                            <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" /> {sentLabel(reminder)}
                        </p>
                        <Button variant="ghost" size="sm" loading={wa.busy === 'recordatorio'} loadingText="Abriendo…" aria-label={`Volver a enviar el recordatorio a ${apt.client_name}`}
                            onClick={() => { void wa.send(apt.id, 'recordatorio'); }}>Enviar otra vez</Button>
                    </div>
                ) : !apt.has_valid_phone ? (
                    <p data-testid="tomorrow-no-phone" className="inline-flex items-center gap-2 text-sm font-medium text-bos-muted">
                        <PhoneOff aria-hidden="true" className="h-4 w-4 shrink-0" /> Sin teléfono registrado. Agrégalo en su ficha.
                    </p>
                ) : (
                    <Button variant="primary" size="md" fullWidth loading={wa.busy === 'recordatorio'} loadingText="Abriendo…" aria-label={`Enviar recordatorio a ${apt.client_name}`}
                        onClick={() => { void wa.send(apt.id, 'recordatorio'); }}>
                        <MessageCircle aria-hidden="true" className="h-5 w-5" /> Enviar recordatorio
                    </Button>
                )}
            </div>
            {wa.error && <p role="alert" className="mt-2 text-sm font-medium text-bos-danger">{wa.error}</p>}
            {wa.link && <div className="mt-2"><WaFallbackLink href={wa.link} /></div>}
        </li>
    );
}

/** Lista «Citas de mañana»: pensada para mandar todos los recordatorios en un par de minutos desde el celular. */
export default function TomorrowReminders({ onClose, onChanged }: { onClose: () => void; onChanged: () => void | Promise<void> }) {
    const client = useQueryClient();
    const query = useTomorrowReminders(true);
    const data = query.data;
    const refresh = async () => { await client.invalidateQueries({ queryKey: tomorrowKey }); await onChanged(); };
    const rows = sortReminders(data?.appointments ?? []);
    const pending = pendingCount(data?.appointments);
    const subtitle = data ? `${longDayTitle(data.day)} · ${pending === 0 ? 'nada pendiente' : pending === 1 ? '1 pendiente' : `${pending} pendientes`}` : undefined;

    return (
        <Modal title="Citas de mañana" subtitle={subtitle} onClose={onClose} size="lg" testId="tomorrow-modal">
            {query.isLoading ? (
                <div role="status" aria-busy="true" className="space-y-3">
                    <span className="sr-only">Cargando las citas de mañana…</span>
                    <Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
                </div>
            ) : query.isError || !data ? (
                <ErrorState title="No se pudieron cargar las citas de mañana" message={toUserMessage(query.error)} offline={isOfflineError(query.error)} onRetry={() => query.refetch()} />
            ) : rows.length === 0 ? (
                <EmptyState title="Mañana no hay citas por avisar" description="Aquí aparecen las citas de mañana que siguen agendadas o confirmadas." />
            ) : (
                <>
                    <ul className="space-y-3">
                        {rows.map((a) => <Row key={a.id} apt={a} timeZone={data.timezone} onSent={refresh} />)}
                    </ul>
                    <p className="mt-4 text-xs text-bos-muted">Cada botón abre tu WhatsApp con el mensaje listo; el sistema anota que lo abriste, no puede saber si se envió.</p>
                </>
            )}
        </Modal>
    );
}
