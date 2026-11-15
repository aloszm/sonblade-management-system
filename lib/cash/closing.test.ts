import { describe, expect, it } from 'vitest';
import { breakdownTotal, compactBreakdown, proposeSplit, withdrawnFor } from './closing';

describe('conteo por billetes y monedas', () => {
    it('suma sin errores de centavos', () => {
        expect(breakdownTotal({ '500': 2, '200': 3, '100': 2, '50': 1 })).toBe(1850);
        expect(breakdownTotal({ '0.5': 3, '1': 2 })).toBe(3.5);
        expect(breakdownTotal({})).toBe(0);
    });

    it('guarda solo lo que se contó', () => {
        expect(compactBreakdown({ '500': 2, '200': 0, '0.5': 1 })).toEqual({ '500': 2, '0.5': 1 });
    });
});

describe('reparto del cierre', () => {
    it('deja el fondo, separa el apartado y retira el resto', () => {
        expect(proposeSplit(1850, 500, 600)).toEqual({ float: 500, reserve: 600, withdrawn: 750 });
    });

    it('si no alcanza, primero el fondo y luego el apartado', () => {
        expect(proposeSplit(300, 500, 600)).toEqual({ float: 300, reserve: 0, withdrawn: 0 });
        expect(proposeSplit(800, 500, 600)).toEqual({ float: 500, reserve: 300, withdrawn: 0 });
    });

    it('con montos elegidos a mano calcula el retiro o avisa que no cuadra', () => {
        expect(withdrawnFor(1200, 400, 500)).toBe(300);
        expect(withdrawnFor(1200, 900, 500)).toBeNull();
    });
});
