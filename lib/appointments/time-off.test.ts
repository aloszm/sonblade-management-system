import { describe, expect, it } from 'vitest';
import { overlapMinutes, toTimeOffView, type TimeOffRow } from './time-off';
import { canCharge } from './appointments-view';
import { isUserFacingDbMessage } from '@/lib/auth/db-messages';

describe('ausencias', () => {
    const day = new Date('2026-11-15T00:00:00');
    const next = new Date('2026-11-16T00:00:00');

    it('recorta la ausencia al día que se está viendo', () => {
        expect(overlapMinutes(new Date('2026-11-15T10:00:00'), new Date('2026-11-15T12:30:00'), day, next)).toEqual({ from: 600, to: 750 });
        // Empieza el día anterior y termina a las 9 a.m.
        expect(overlapMinutes(new Date('2026-11-14T15:00:00'), new Date('2026-11-15T09:00:00'), day, next)).toEqual({ from: 0, to: 540 });
        expect(overlapMinutes(new Date('2026-11-16T10:00:00'), new Date('2026-11-16T12:00:00'), day, next)).toBeNull();
    });

    it('arma la vista con nombres y la cancelación', () => {
        const row: TimeOffRow = {
            id: 't1', employee_id: 'e1', starts_at: 'a', ends_at: 'b', reason: 'Cita médica', requested_at: 'r', requested_via: 'whatsapp',
            created_by: 'u1', created_at: 'c', cancelled_at: 'x', cancelled_by: 'u2', cancel_reason: 'Sí viene',
        };
        const view = toTimeOffView(row, new Map([['e1', 'Dani']]), new Map([['u1', 'Dago'], ['u2', 'Sonia']]));
        expect(view.barber_name).toBe('Dani');
        expect(view.created_by_name).toBe('Dago');
        expect(view.cancelled).toEqual({ at: 'x', by_name: 'Sonia', reason: 'Sí viene' });
        expect(toTimeOffView({ ...row, requested_via: 'paloma' }, new Map(), new Map()).requested_via).toBe('otro');
    });
});

describe('cobro desde la agenda', () => {
    it('solo se cobra una cita viva y sin venta', () => {
        expect(canCharge({ status: 'checked_in', sale: null })).toBe(true);
        expect(canCharge({ status: 'checked_in', sale: { id: 's1', total: 200 } })).toBe(false);
        expect(canCharge({ status: 'cancelled', sale: null })).toBe(false);
        expect(canCharge({ status: 'completed', sale: null })).toBe(false);
    });
});

describe('mensajes de la base', () => {
    it('muestra las reglas escritas en español y oculta los mensajes técnicos', () => {
        expect(isUserFacingDbMessage('Dani no estará disponible en ese horario (Cita médica).')).toBe(true);
        expect(isUserFacingDbMessage('Esa cita ya se cobró.')).toBe(true);
        expect(isUserFacingDbMessage('conflicting key value violates exclusion constraint "appointments_no_barber_overlap"')).toBe(false);
        expect(isUserFacingDbMessage('Client does not belong to this business')).toBe(false);
    });
});
