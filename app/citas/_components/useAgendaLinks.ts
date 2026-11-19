'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import type { Appointment } from '@/types';
import { agendaHref, type AgendaParams } from '@/lib/appointments/agenda-url';
import { localDateKey } from '@/lib/appointments/appointments-view';
import { readJson } from '@/lib/utils/errors';
import type { ClientValue } from './ClientPicker';
import { dayOf } from './agenda-ui';

interface AgendaLinksOptions {
    /** Parámetros de la dirección al abrir la pantalla. */
    initial: AgendaParams;
    /** Ya se sabe quién es la persona (el barbero no agenda). */
    meLoaded: boolean;
    canManage: boolean;
    ownBarberId: string | null;
    visible: Appointment[];
    /** Día y barbero que se reflejan en la dirección. */
    dayKey: string;
    router: { replace: (href: string, options?: { scroll?: boolean }) => void };
    openForm: (date: string, time?: string, barberId?: string, client?: ClientValue) => void;
    openAppointment: (appointment: Appointment) => void;
    goToDay: (key: string) => void;
    showAllBarbers: () => void;
    showDayView: () => void;
}

/**
 * Enlaces a la agenda: al abrir con ?nueva=1, ?cliente=<id> (precarga el cliente en "Nueva cita") o ?cita=<id> (abre su detalle)
 * se hace lo pedido y la dirección queda solo con el día y el barbero.
 */
export function useAgendaLinks(o: AgendaLinksOptions) {
    const toast = useToast();
    const [pendingCita, setPendingCita] = useState<string | null>(null);

    useEffect(() => {
        if (!o.meLoaded) return;
        const { initial } = o;
        const wantsForm = o.canManage && (initial.nueva || initial.cliente);
        const date = initial.fecha ?? localDateKey(new Date());
        const barber = initial.barbero ?? '';
        if (wantsForm && initial.cliente) {
            fetch(`/api/clients/${encodeURIComponent(initial.cliente)}`, { cache: 'no-store' }).then((r) => readJson<{ id: string; name: string; phone: string | null }>(r))
                .then((c) => o.openForm(date, '', barber, { kind: 'client', id: c.id, name: c.name, phone: c.phone ?? null }))
                .catch(() => { toast.error('No se encontró a ese cliente. Búscalo en el formulario.'); o.openForm(date, '', barber); });
        } else if (wantsForm) o.openForm(date, '', barber);
        if (initial.cita) setPendingCita(initial.cita);
        if (initial.nueva || initial.cliente || initial.cita) o.router.replace(agendaHref({ fecha: o.dayKey, barbero: barber }), { scroll: false });
        // Solo una vez, cuando se sabe quién es la persona.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [o.meLoaded]);

    // Se busca la cita para ir a su día y, cuando llega la agenda de ese mes, se abre su detalle.
    useEffect(() => {
        if (!pendingCita) return;
        let live = true;
        fetch(`/api/appointments/${encodeURIComponent(pendingCita)}`, { cache: 'no-store' }).then((r) => readJson<Appointment>(r)).then((apt) => {
            if (!live) return;
            if (o.ownBarberId && apt.barber?.id !== o.ownBarberId) o.showAllBarbers();
            o.showDayView();
            o.goToDay(dayOf(apt.scheduled_at));
        }).catch(() => { if (live) { toast.error('No se encontró esa cita.'); setPendingCita(null); } });
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingCita]);
    useEffect(() => {
        if (!pendingCita) return;
        const found = o.visible.find((a) => a.id === pendingCita);
        if (found) { o.showDayView(); o.goToDay(dayOf(found.scheduled_at)); o.openAppointment(found); setPendingCita(null); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingCita, o.visible]);
}
