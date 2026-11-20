import { describe, expect, it } from 'vitest';
import { ACTION_LABELS, actionLabel, entityLabel } from './labels';

describe('actionLabel', () => {
    it('traduce las acciones técnicas que aparecían en inglés', () => {
        expect(actionLabel('pin_reset_emergency')).toBe('PIN restablecido por emergencia');
        expect(actionLabel('account.migrated_to_pin')).toBe('Cuenta migrada a usuario y PIN');
        expect(actionLabel('employee_weekly_schedule.insert')).toBe('Alta de un horario semanal');
        expect(actionLabel('appointments.update')).toBe('Cambio en una cita');
        expect(actionLabel('public_booking.created')).toBe('Reserva en línea creada');
    });
    it('da un respaldo legible a lo desconocido, sin guiones bajos ni puntos', () => {
        expect(actionLabel('something_new_happened')).toBe('Something new happened');
        expect(actionLabel('gadgets.insert')).toBe('Alta de gadgets');
        expect(actionLabel('')).toBe('Acción registrada');
    });
    it('ninguna frase contiene guiones bajos', () => {
        for (const text of Object.values(ACTION_LABELS)) expect(text).not.toMatch(/[_]/);
    });
});

describe('entityLabel', () => {
    it('traduce y tolera desconocidos y vacíos', () => {
        expect(entityLabel('cash_session')).toBe('Caja');
        expect(entityLabel('weird_thing')).toBe('Weird thing');
        expect(entityLabel(null)).toBe('');
    });
});
