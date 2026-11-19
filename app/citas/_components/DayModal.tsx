'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { Appointment, AppointmentStatus } from '@/types';
import AppointmentDetail from './AppointmentDetail';
import { dayTitle } from './agenda-ui';

interface DayModalProps {
    day: string;
    /** Solo una cita (se abrió desde la cuadrícula o con ?cita=); si no, todas las del día. */
    single: boolean;
    appointments: Appointment[];
    actionError: string;
    busyId: string | null;
    colorOf: (id: string | null | undefined) => string;
    canManage: boolean;
    canSeePhones: boolean;
    showPrices: boolean;
    onClose: () => void;
    onStatus: (apt: Appointment, status: AppointmentStatus) => void;
    onCancel: (apt: Appointment) => void;
    onReschedule: (apt: Appointment) => void;
    onNewHere: (day: string) => void;
}

/** Ventana flotante con las citas de un día, o con el detalle de una sola. */
export default function DayModal(p: DayModalProps) {
    const count = p.appointments.length;
    return (
        <Modal title={dayTitle(p.day)} subtitle={p.single ? undefined : count === 0 ? 'Sin citas' : `${count} cita${count === 1 ? '' : 's'}`}
            onClose={p.onClose} size="lg" testId="day-modal">
            {p.actionError && <p role="alert" className="mb-3 rounded-xl bg-bos-raised p-3 text-sm text-bos-danger">{p.actionError}</p>}
            {count === 0 ? (
                <p className="py-8 text-center text-bos-muted">No hay citas este día.</p>
            ) : (
                <ul className="space-y-3">
                    {p.appointments.map((apt) => (
                        <AppointmentDetail key={apt.id} apt={apt} barberColor={apt.barber ? p.colorOf(apt.barber.id) : undefined}
                            canManage={p.canManage} canSeePhones={p.canSeePhones} showPrices={p.showPrices} busy={p.busyId === apt.id}
                            onStatus={p.onStatus} onCancel={p.onCancel} onReschedule={p.onReschedule} />
                    ))}
                </ul>
            )}
            {p.canManage && !p.single && (
                <Button variant="secondary" fullWidth className="mt-5" onClick={() => p.onNewHere(p.day)}><Plus className="h-5 w-5" /> Agendar en este día</Button>
            )}
        </Modal>
    );
}
