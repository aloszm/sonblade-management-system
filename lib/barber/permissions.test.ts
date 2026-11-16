import { describe, expect, it } from 'vitest';
import { CLIENT_CREATE_ROLES, CLIENT_EDIT_ROLES, mayReadBarberStats } from './permissions';

describe('clientes: el barbero agrega, no edita', () => {
    it('el barbero puede crear pero no editar', () => {
        expect(CLIENT_CREATE_ROLES).toContain('barber');
        expect(CLIENT_EDIT_ROLES).not.toContain('barber');
    });
    it('mostrador y dirección siguen pudiendo crear y editar', () => {
        for (const role of ['owner', 'admin', 'cashier', 'receptionist'] as const) {
            expect(CLIENT_CREATE_ROLES).toContain(role);
            expect(CLIENT_EDIT_ROLES).toContain(role);
        }
    });
});

describe('cifras de un barbero: cada quien solo las suyas', () => {
    const DANI = '11111111-1111-4111-8111-111111111111';
    const DEYA = '22222222-2222-4222-8222-222222222222';
    it('un barbero ve las suyas y no las de otro', () => {
        expect(mayReadBarberStats('barber', DANI, DANI)).toBe(true);
        expect(mayReadBarberStats('barber', DANI, DEYA)).toBe(false);
    });
    it('un barbero sin empleado ligado no ve nada', () => {
        expect(mayReadBarberStats('barber', null, DANI)).toBe(false);
    });
    it('dueño y gerencia ven las de cualquiera; recepción no', () => {
        expect(mayReadBarberStats('owner', null, DEYA)).toBe(true);
        expect(mayReadBarberStats('admin', DANI, DEYA)).toBe(true);
        expect(mayReadBarberStats('receptionist', null, DEYA)).toBe(false);
        expect(mayReadBarberStats('cashier', null, DEYA)).toBe(false);
    });
});
