import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActive, localDateKey, localDateTimeToIso, monthRange, nextStatuses, toAppointmentView } from './appointments-view';

afterEach(() => vi.unstubAllEnvs());

describe('fechas locales de la agenda', () => {
    it('una cita de las 8:00 pm en México pertenece a ese día, no al siguiente', () => {
        vi.stubEnv('TZ', 'America/Mexico_City');
        const stored = new Date('2026-11-17T02:00:00Z'); // lunes 16, 8:00 pm en CDMX
        expect(localDateKey(stored)).toBe('2026-11-16');
        expect(stored.toISOString().slice(0, 10)).toBe('2026-11-17'); // lo que hacía la pantalla antes
    });

    it('convierte fecha y hora del dispositivo al instante correcto', () => {
        vi.stubEnv('TZ', 'America/Mexico_City');
        expect(localDateTimeToIso('2026-11-16', '20:00')).toBe('2026-11-17T02:00:00.000Z');
    });

    it('el mes abarca de la medianoche local del día 1 a la del mes siguiente', () => {
        vi.stubEnv('TZ', 'America/Mexico_City');
        expect(monthRange(2026, 10)).toEqual({ from: '2026-11-01T06:00:00.000Z', to: '2026-12-01T06:00:00.000Z' });
    });
});

describe('estados de una cita', () => {
    it('ofrece solo las transiciones que la base permite', () => {
        expect(nextStatuses('scheduled')).toEqual(['confirmed', 'checked_in', 'no_show', 'cancelled']);
        expect(nextStatuses('in_progress')).toEqual(['completed']);
        expect(nextStatuses('cancelled')).toEqual([]);
        expect(nextStatuses('completed')).toEqual([]);
    });

    it('cancelada y no llegó liberan el horario', () => {
        expect(isActive('cancelled')).toBe(false);
        expect(isActive('no_show')).toBe(false);
        expect(isActive('confirmed')).toBe(true);
    });
});

describe('toAppointmentView', () => {
    const base = {
        id: 'a1', client_id: 'c1', assigned_employee_id: 'e1', customer_name: 'Nombre capturado', customer_phone: null,
        scheduled_start_at: '2026-11-17T02:00:00+00:00', scheduled_end_at: '2026-11-17T02:45:00+00:00',
        status: 'scheduled' as const, notes: 'Corte + barba', created_at: '2026-11-14T00:00:00+00:00',
    };

    it('usa el nombre del cliente registrado, el barbero, la nota y la duración', () => {
        const view = toAppointmentView({ ...base, clients: { id: 'c1', full_name: 'Juan Pérez' }, employees: { id: 'e1', display_name: 'Deya' } });
        expect(view.client_name).toBe('Juan Pérez');
        expect(view.barber).toEqual({ id: 'e1', name: 'Deya' });
        expect(view.notes).toBe('Corte + barba');
        expect(view.duration_minutes).toBe(45);
    });

    it('sin cliente registrado ni barbero usa el nombre capturado', () => {
        const view = toAppointmentView({ ...base, client_id: null, assigned_employee_id: null, clients: null, employees: null });
        expect(view.client_name).toBe('Nombre capturado');
        expect(view.barber).toBeNull();
    });
});
