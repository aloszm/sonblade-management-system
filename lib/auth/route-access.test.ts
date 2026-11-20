import { describe, expect, it } from 'vitest';
import { ADMIN_ONLY_PATHS, canEnter, routeVerdict } from './route-access';

/**
 * Las pruebas de middleware.route-access.test.ts demuestran que el middleware (que usa esta función) se comporta
 * igual que antes de extraerla. Aquí se fijan las reglas por puesto con casos legibles.
 */
const ROLES = ['owner', 'admin', 'viewer', 'receptionist', 'cashier', 'barber'] as const;

describe('canEnter / routeVerdict', () => {
    it('la cuenta principal entra a todo, incluida Configuración y Quién ve qué', () => {
        for (const path of ['/', '/pos', '/barbero', '/liquidaciones', '/equipo', '/configuracion', '/configuracion/reservas', '/configuracion/quien-ve-que']) {
            expect(canEnter('owner', path)).toBe(true);
        }
    });

    it('Configuración es solo de la cuenta principal; la gerencia solo ve Reservas en línea (no se amplía a lo demás)', () => {
        for (const role of ['admin', 'viewer', 'receptionist', 'cashier', 'barber']) {
            expect(canEnter(role, '/configuracion')).toBe(false);
            expect(canEnter(role, '/configuracion/estado')).toBe(false);
            expect(canEnter(role, '/configuracion/quien-ve-que')).toBe(false);
        }
        expect(canEnter('admin', '/configuracion/reservas')).toBe(true);
        expect(canEnter('viewer', '/configuracion/reservas')).toBe(false);
        expect(canEnter('receptionist', '/configuracion/reservas')).toBe(false);
    });

    it('a quien no entra se le dice a dónde lo mandan', () => {
        expect(routeVerdict('barber', '/caja')).toEqual({ allowed: false, reason: 'role', redirectTo: '/barbero' });
        expect(routeVerdict('viewer', '/pos')).toEqual({ allowed: false, reason: 'role', redirectTo: '/' });
        expect(routeVerdict('receptionist', '/barberos/x')).toEqual({ allowed: false, reason: 'role', redirectTo: '/pos' });
        expect(routeVerdict('admin', '/configuracion')).toEqual({ allowed: false, reason: 'owner-only', redirectTo: '/admin' });
        expect(routeVerdict('barber', '/equipo')).toEqual({ allowed: false, reason: 'admin-only', redirectTo: '/pos' });
    });

    it('recepción y caja entran a Inventario (entradas de mercancía) pero no a las demás pantallas de dirección', () => {
        for (const role of ['receptionist', 'cashier']) {
            expect(canEnter(role, '/inventario')).toBe(true);
            expect(canEnter(role, '/inventario/x')).toBe(true);
            for (const path of ADMIN_ONLY_PATHS.filter((p) => p !== '/inventario')) expect(canEnter(role, path)).toBe(false);
        }
        expect(canEnter('barber', '/inventario')).toBe(false);
    });

    it('recibos de pago: solo cuenta principal, gerencia y consulta', () => {
        for (const path of ['/liquidaciones', '/liquidaciones/abc']) {
            expect(ROLES.filter((r) => canEnter(r, path))).toEqual(['owner', 'admin', 'viewer']);
        }
    });

    it('Mi semana: no la ve la consulta; el cobro y Caja: ni consulta (cobro) ni barbero', () => {
        expect(ROLES.filter((r) => canEnter(r, '/barbero'))).toEqual(['owner', 'admin', 'receptionist', 'cashier', 'barber']);
        expect(ROLES.filter((r) => canEnter(r, '/pos'))).toEqual(['owner', 'admin', 'receptionist', 'cashier']);
        expect(ROLES.filter((r) => canEnter(r, '/caja'))).toEqual(['owner', 'admin', 'viewer', 'receptionist', 'cashier']);
    });

    it('los límites de prefijo no se confunden y las APIs no pasan por estas guardas', () => {
        expect(canEnter('barber', '/equipo-hoyx')).toBe(true);
        expect(canEnter('barber', '/api/equipo')).toBe(true);
        expect(canEnter('barber', '/equipo/x')).toBe(false);
        expect(canEnter('barber', '/')).toBe(false);
        expect(canEnter('receptionist', '/')).toBe(false);
        expect(canEnter('viewer', '/')).toBe(true);
    });

    it('recepción y caja (heredado) se comportan igual en todas las pantallas', () => {
        for (const path of ['/', '/pos', '/caja', '/inventario', '/barberos/x', '/liquidaciones', '/gastos', '/configuracion']) {
            expect(canEnter('cashier', path)).toBe(canEnter('receptionist', path));
        }
    });
});
