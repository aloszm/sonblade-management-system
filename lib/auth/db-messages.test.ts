import { describe, expect, it } from 'vitest';
import { isUserFacingDbMessage } from './db-messages';

// Mensajes que redactan las funciones de dinero de la base: deben llegar tal cual a la pantalla.
describe('mensajes de dinero de la base', () => {
    it('la anulación que sacaría más efectivo del que hay explica cuánto hay y cuánto se devolvería', () => {
        expect(isUserFacingDbMessage('No hay suficiente efectivo en caja para devolver esta venta: hay $50.00, se tendrían que devolver $150.00.')).toBe(true);
    });

    it('el nombre de quien recibe el retiro del cierre se pide en español', () => {
        expect(isUserFacingDbMessage('Escribe a quién se entrega el retiro (de 2 a 120 letras).')).toBe(true);
    });
});
