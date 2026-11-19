import { STATUS_LABELS, type AppointmentStatus } from '@/lib/appointments/appointments-view';

/** Estado de una venta, en español. */
export const SALE_STATUS_LABELS: Record<string, string> = {
    open: 'Abierta',
    partially_paid: 'Pago parcial',
    paid: 'Pagada',
    cancelled: 'Anulada',
    partially_refunded: 'Reembolso parcial',
    refunded: 'Reembolsada',
};

/** Estado de una fila del historial (cita o venta), en español. */
export function historyStatusLabel(kind: 'appointment' | 'sale', status: string): string {
    if (kind === 'sale') return SALE_STATUS_LABELS[status] ?? status;
    return STATUS_LABELS[status as AppointmentStatus] ?? status;
}

export const SOURCE_LABELS: Record<string, string> = { appointment: 'Cita', walk_in: 'Sin cita', online: 'Reserva en línea' };

export type ClientFormValues = { name: string; phone: string; email: string };
export type ClientFormErrors = Partial<Record<keyof ClientFormValues, string>>;
export const EMPTY_CLIENT_FORM: ClientFormValues = { name: '', phone: '', email: '' };

/** Validación por campo del alta de cliente (el servidor la vuelve a validar). */
export function validateClientForm(form: ClientFormValues): ClientFormErrors {
    const errors: ClientFormErrors = {};
    if (form.name.trim().length < 2) errors.name = 'Escribe el nombre del cliente (mínimo 2 letras).';
    const digits = form.phone.replace(/\D/g, '');
    // El teléfono es opcional (regla del negocio); si se escribe, debe ser válido.
    if (form.phone.trim() && (digits.length < 10 || digits.length > 15)) errors.phone = 'El teléfono debe tener entre 10 y 15 dígitos.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'El correo no es válido.';
    return errors;
}
