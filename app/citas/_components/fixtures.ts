// Citas de ejemplo para las pruebas de la agenda (no se incluyen en la aplicación).
import type { Appointment } from '@/types';
import type { AppointmentProductLine, AppointmentProducts } from '@/lib/appointments/extras';

export const LINE: AppointmentProductLine = {
    id: 'l1', appointment_id: 'a1', product_id: 'p1', name: 'Prueba cera', quantity: 2, unit_price: 150, product_active: true,
    tracks_inventory: true, stock: 5, short_stock: false, seller_employee_id: 'e-deya', seller_name: 'Deya', added_by: 'u-deya',
    added_by_name: 'Deya', added_at: '2026-11-20T15:00:00Z', updated_at: null,
};

export const PRODUCTS_OPEN: AppointmentProducts = {
    barber: { id: 'e-deya', name: 'Deya' }, session_employee: { id: 'e-dago', name: 'Dago' }, open: true, can_edit: true, can_choose_seller: true, lines: [],
};

export function appointment(overrides: Partial<Appointment> = {}): Appointment {
    return {
        id: 'a1', client_id: null, barber_id: 'e-deya', client_name: 'Prueba Luis', customer_phone: '5551112233', barber: { id: 'e-deya', name: 'Deya' },
        scheduled_at: '2026-11-21T19:00:00Z', end_at: '2026-11-21T19:30:00Z', duration_minutes: 30, status: 'scheduled', notes: null,
        created_at: '2026-11-20T10:00:00Z', walk_in: false, online: false, sale: null,
        services: [{ service_id: 'sv1', name: 'Corte', price: 200, duration_minutes: 30 }],
        notifications: { confirmation: null, reminder: null },
        products: { ...PRODUCTS_OPEN, lines: [] },
        ...overrides,
    };
}
