import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, hasValidCents, parseAmount, sendJson } from './client';

afterEach(() => vi.unstubAllGlobals());
const reply = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body }) as Response));

describe('sendJson (PIN y reglas de dinero)', () => {
    it('201 devuelve el estado y el cuerpo', async () => {
        reply(201, { expense_id: 'e1' });
        await expect(sendJson('/api/expenses', 'POST', {})).resolves.toEqual({ status: 201, data: { expense_id: 'e1' } });
    });
    it('428 needs_pin pide el PIN', async () => {
        reply(428, { error: 'Confirma el gasto con tu PIN.', needs_pin: true });
        await expect(sendJson('/api/expenses', 'POST', {})).rejects.toThrow('Escribe tu PIN para confirmar.');
    });
    it('400 pin_error conserva el mensaje del servidor', async () => {
        reply(400, { error: 'El PIN no es correcto.', pin_error: true });
        await expect(sendJson('/api/expenses', 'POST', {})).rejects.toThrow('El PIN no es correcto.');
    });
    it('409 muestra el motivo en español y 500 un mensaje fijo', async () => {
        reply(409, { error: 'El sobre no tiene saldo suficiente.' });
        await expect(sendJson('/x', 'POST', {})).rejects.toThrow('El sobre no tiene saldo suficiente.');
        reply(500, { error: 'boom' });
        await expect(sendJson('/x', 'POST', {})).rejects.toThrow('Hubo un problema en el servidor.');
    });
    it('sin red devuelve el mensaje de conexión', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        await expect(sendJson('/x', 'POST', {})).rejects.toThrow(/no hay conexión/);
    });
    it('getJson lanza HttpError con el estado', async () => {
        reply(403, { error: 'No tienes permiso.' });
        await expect(getJson('/x')).rejects.toMatchObject({ status: 403 });
    });
});

describe('montos', () => {
    it('parseAmount acepta comas y símbolo; vacío es NaN', () => {
        expect(parseAmount('$1,250.50')).toBe(1250.5);
        expect(parseAmount('')).toBeNaN();
        expect(parseAmount('abc')).toBeNaN();
    });
    it('hasValidCents', () => {
        expect(hasValidCents(10.25)).toBe(true);
        expect(hasValidCents(10.255)).toBe(false);
    });
});
