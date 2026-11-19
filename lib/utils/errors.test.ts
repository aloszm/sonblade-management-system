import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, MSG_FORBIDDEN, MSG_GENERIC, MSG_OFFLINE, MSG_SERVER, MSG_SESSION, readJson, toUserMessage } from './errors';

afterEach(() => vi.restoreAllMocks());

describe('toUserMessage', () => {
    it('distingue "sin conexión" del error del servidor', () => {
        expect(toUserMessage(new TypeError('Failed to fetch'))).toBe(MSG_OFFLINE);
        expect(toUserMessage(new HttpError(500))).toBe(MSG_SERVER);
        expect(toUserMessage(new HttpError(503, 'Service Unavailable'))).toBe(MSG_SERVER);
    });
    it('sin red del navegador siempre es "sin conexión"', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        expect(toUserMessage(new HttpError(500))).toBe(MSG_OFFLINE);
    });
    it('sesión y permisos tienen mensaje propio', () => {
        expect(toUserMessage(new HttpError(401))).toBe(MSG_SESSION);
        expect(toUserMessage(new HttpError(403, 'Forbidden'))).toBe(MSG_FORBIDDEN);
    });
    it('conserva el mensaje del servidor solo si está en español', () => {
        expect(toUserMessage(new HttpError(400, 'El teléfono ya está registrado.'))).toBe('El teléfono ya está registrado.');
        expect(toUserMessage(new HttpError(400, 'Bad Request'))).toBe(MSG_GENERIC);
    });
    it('nunca muestra texto técnico en inglés', () => {
        expect(toUserMessage(new Error('Unexpected token < in JSON'))).toBe(MSG_GENERIC);
        expect(toUserMessage(new Error('Error al obtener clientes'))).toBe('Error al obtener clientes');
        expect(toUserMessage('algo')).toBe(MSG_GENERIC);
        expect(toUserMessage(undefined)).toBe(MSG_GENERIC);
    });
});

describe('readJson', () => {
    it('devuelve el cuerpo si la respuesta fue exitosa', async () => {
        const res = { ok: true, status: 200, json: async () => ({ a: 1 }) } as Response;
        await expect(readJson(res)).resolves.toEqual({ a: 1 });
    });
    it('lanza HttpError con el estado y el mensaje del servidor', async () => {
        const res = { ok: false, status: 409, json: async () => ({ error: 'Ya existe un cliente con ese teléfono.' }) } as Response;
        await expect(readJson(res)).rejects.toMatchObject({ status: 409, serverMessage: 'Ya existe un cliente con ese teléfono.' });
    });
});
