'use client';

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Appointment, Barber } from '@/types';
import { loadRange } from '@/lib/appointments/appointments-view';
import type { TimeOffView } from '@/lib/appointments/time-off';
import type { ScheduleData } from '@/lib/appointments/hours';
import type { ServiceOption } from '@/lib/appointments/booking';
import { readJson, toUserMessage } from '@/lib/utils/errors';

/** Cada cuánto se vuelve a pedir la agenda (solo con la pestaña visible). */
export const AGENDA_POLL_MS = 30_000;

/** Claves de consulta de la agenda: todas cuelgan de ['agenda'] para refrescarlas juntas. */
export const agendaKeys = {
    all: ['agenda'] as const,
    appointments: (from: string, to: string) => ['agenda', 'appointments', from, to] as const,
    timeOff: (from: string, to: string) => ['agenda', 'time-off', from, to] as const,
    barbers: ['agenda', 'barbers'] as const,
    schedule: ['agenda', 'schedule'] as const,
    me: ['agenda', 'me'] as const,
    services: ['agenda', 'services'] as const,
};

interface MeResponse { user?: { role?: string; readOnly?: boolean; employeeId?: string | null } }

const getJson = async <T,>(url: string): Promise<T> => readJson<T>(await fetch(url, { cache: 'no-store' }));
const STATIC = { staleTime: 5 * 60_000, retry: 0 } as const;

/**
 * Carga de la agenda: citas y ausencias del mes (con sondeo cada 30 s, en pausa si la pestaña está oculta),
 * y los catálogos que necesita la pantalla (barberos, horario, sesión y servicios).
 */
export function useAgendaData(year: number, month: number) {
    const client = useQueryClient();
    const { from, to } = useMemo(() => loadRange(year, month), [year, month]);
    const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const poll = { refetchInterval: AGENDA_POLL_MS, refetchIntervalInBackground: false, staleTime: 10_000 } as const;

    const appointmentsQ = useQuery({ queryKey: agendaKeys.appointments(from, to), queryFn: () => getJson<Appointment[]>(`/api/appointments?${range}`), ...poll });
    const timeOffQ = useQuery({ queryKey: agendaKeys.timeOff(from, to), queryFn: () => getJson<TimeOffView[]>(`/api/time-off?${range}`), ...poll });
    const barbersQ = useQuery({
        queryKey: agendaKeys.barbers, ...STATIC,
        queryFn: async () => { const data = await getJson<unknown>('/api/barbers'); if (!Array.isArray(data)) throw new Error('barbers'); return data as Barber[]; },
    });
    const scheduleQ = useQuery({ queryKey: agendaKeys.schedule, queryFn: () => getJson<ScheduleData>('/api/schedule'), ...STATIC });
    const meQ = useQuery({ queryKey: agendaKeys.me, queryFn: () => getJson<MeResponse>('/api/auth/me'), ...STATIC });

    const role = meQ.data?.user?.role;
    // Gerencia, recepción y la cuenta de consulta ven el teléfono; la de consulta no puede cambiar nada.
    const frontDesk = role === 'admin' || role === 'recepcion';
    const canManage = frontDesk && !meQ.data?.user?.readOnly;
    const ownBarberId = role === 'barber' && meQ.data?.user?.employeeId ? meQ.data.user.employeeId : null;
    // Los servicios solo sirven para agendar: el barbero no agenda.
    const servicesQ = useQuery({
        queryKey: agendaKeys.services, queryFn: () => getJson<ServiceOption[]>('/api/services'), enabled: canManage, ...STATIC,
    });

    const refresh = useCallback(() => client.invalidateQueries({ queryKey: agendaKeys.all, refetchType: 'active' }), [client]);
    const activeServices = useMemo(() => (servicesQ.data ?? []).filter((s) => s.is_active !== false), [servicesQ.data]);

    return {
        appointments: appointmentsQ.data ?? [],
        timeOff: timeOffQ.data ?? [],
        loading: appointmentsQ.isLoading,
        // Sin citas no se puede dibujar la agenda; si falla un sondeo pero ya hay datos, se siguen mostrando.
        loadError: appointmentsQ.isError && !appointmentsQ.data ? toUserMessage(appointmentsQ.error, 'No se pudieron cargar las citas.') : '',
        // Las ausencias no deben impedir ver la agenda: si fallan, se avisa pero las citas se muestran.
        warning: timeOffQ.isError && !timeOffQ.data ? toUserMessage(timeOffQ.error, 'No se pudieron cargar las ausencias.') : '',
        refresh,
        retry: () => appointmentsQ.refetch(),
        barbers: barbersQ.data ?? [],
        barbersState: (barbersQ.isLoading ? 'loading' : barbersQ.isError ? 'error' : 'ok') as 'loading' | 'ok' | 'error',
        schedule: scheduleQ.data ?? null,
        services: activeServices,
        servicesLoading: servicesQ.isLoading,
        meLoaded: !meQ.isLoading,
        canManage,
        canSeePhones: frontDesk,
        /** Gerencia y cuenta principal (pantalla «admin», con escritura): pueden apuntar un producto a «Otra persona». */
        canPickSeller: role === 'admin' && !meQ.data?.user?.readOnly,
        ownBarberId,
    };
}

/**
 * Reloj de la agenda: se renueva cada minuto (la línea de "ahora" y el día de hoy se mantienen al día) y se detiene
 * con la pestaña oculta; al volver a verla se actualiza de inmediato.
 */
export function useNow(): Date {
    return useQuery({
        queryKey: ['agenda', 'clock'], queryFn: () => new Date(), initialData: () => new Date(),
        refetchInterval: 60_000, refetchIntervalInBackground: false, staleTime: 0, structuralSharing: false,
    }).data;
}
