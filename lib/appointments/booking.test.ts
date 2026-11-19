import { describe, expect, it } from 'vitest';
import { HttpError } from '@/lib/utils/errors';
import { agendaHref, parseAgendaParams, validDayKey } from './agenda-url';
import { roundToSlot, saveErrorMessage, servicesText, summarizeServices } from './booking';

const svc = (id: string, minutes: number, price: number, extra = {}) => ({ id, name: id, price, duration_minutes: minutes, ...extra });

describe('summarizeServices', () => {
    it('suma las duraciones y las redondea hacia arriba a bloques de 30 minutos', () => {
        expect(summarizeServices([svc('a', 30, 150), svc('b', 45, 200)])).toMatchObject({ minutes: 90, price: 350, count: 2 });
        expect(summarizeServices([svc('a', 60, 100), svc('b', 30, 50)]).minutes).toBe(90);
        expect(summarizeServices([svc('a', 30, 100)]).minutes).toBe(30);
    });
    it('sin servicios no hay duración ni precio', () => {
        expect(summarizeServices([])).toMatchObject({ minutes: 0, price: 0, count: 0 });
    });
    it('avisa si algún servicio es de precio libre y acepta precios como texto', () => {
        expect(summarizeServices([svc('a', 30, 0, { variable_price: true }), svc('b', 30, '120.50' as unknown as number)])).toMatchObject({ hasVariablePrice: true, price: 120.5 });
    });
    it('roundToSlot nunca baja de 30', () => {
        expect(roundToSlot(0)).toBe(30);
        expect(roundToSlot(31)).toBe(60);
    });
});

describe('servicesText', () => {
    it('une los servicios y, si no hay, usa la nota', () => {
        expect(servicesText({ services: [{ name: 'Corte' }, { name: 'Barba' }], notes: 'x' })).toBe('Corte + Barba');
        expect(servicesText({ services: [], notes: 'Solo nota' })).toBe('Solo nota');
        expect(servicesText({ notes: null })).toBe('');
    });
});

describe('saveErrorMessage', () => {
    it.each([
        ['Ese barbero ya tiene una cita en ese horario.', /ya tiene una cita en ese horario.*otra hora u otro barbero/],
        ['Dani no estará disponible en ese horario (Cita médica).', /Dani no estará disponible.*Cita médica.*otra hora u otro barbero/],
        ['Solo se reprograma una cita abierta; esta ya fue cerrada o cancelada.', /cerrada o cancelada/],
        ['Esa cita ya se cobró; no se puede reprogramar.', /ya se cobró/],
        ['La operación no se puede realizar en el estado actual.', /agenda cambió/],
    ])('409 «%s» se explica en español', (server, expected) => {
        expect(saveErrorMessage(new HttpError(409, server))).toMatch(expected);
    });
    it('400 por bloque de 30 minutos conserva el texto de la API', () => {
        const text = 'Las citas empiezan en punto o y media (por ejemplo 1:00 o 1:30 p.m.).';
        expect(saveErrorMessage(new HttpError(400, text))).toBe(text);
    });
    it('un fallo de red no muestra texto técnico', () => {
        expect(saveErrorMessage(new TypeError('Failed to fetch'))).toMatch(/conexión/);
    });
});

describe('dirección de la agenda', () => {
    it('lee fecha, barbero, cita, cliente y nueva', () => {
        const q = new URLSearchParams('fecha=2026-11-16&barbero=b1&cita=a1&cliente=c1&nueva=1');
        expect(parseAgendaParams((k) => q.get(k))).toEqual({ fecha: '2026-11-16', barbero: 'b1', cita: 'a1', cliente: 'c1', nueva: true });
    });
    it('ignora fechas que no existen y parámetros vacíos', () => {
        const q = new URLSearchParams('fecha=2026-02-31&barbero=%20');
        expect(parseAgendaParams((k) => q.get(k))).toEqual({ fecha: null, barbero: null, cita: null, cliente: null, nueva: false });
        expect(validDayKey('16/11/2026')).toBeNull();
        expect(validDayKey('2028-02-29')).toBe('2028-02-29');
    });
    it('arma la dirección para compartir', () => {
        expect(agendaHref({ fecha: '2026-11-16', barbero: 'b1' })).toBe('/citas?fecha=2026-11-16&barbero=b1');
        expect(agendaHref({ fecha: '2026-11-16' })).toBe('/citas?fecha=2026-11-16');
        expect(agendaHref({ fecha: 'mal', barbero: null })).toBe('/citas');
        expect(agendaHref()).toBe('/citas');
    });
});
