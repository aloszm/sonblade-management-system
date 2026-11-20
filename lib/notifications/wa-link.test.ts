import { describe, expect, it } from 'vitest';
import { buildWaNotification, waLink, waMessage, waPhone } from './wa-link';

const BUSINESS = { name: 'Gallo 4:20', address: 'Efeso 2, Lomas Estrella 2da Sección, Iztapalapa, 09890, CDMX', phone: '55 3309 8072' };
// Sábado 21 de noviembre de 2026, 3:30 p. m. en la Ciudad de México (UTC-6).
const APPT = { clientName: 'Prueba Cliente', services: ['Corte clásico', 'Barba'], startsAt: '2026-11-21T21:30:00Z', barberName: 'Deya' };

describe('waPhone', () => {
    it('normaliza números mexicanos de 10 dígitos a 52XXXXXXXXXX', () => {
        expect(waPhone('55 1234 5678')).toBe('525512345678');
        expect(waPhone('+52 (55) 1234-5678')).toBe('525512345678');
        expect(waPhone('+521 55 1234 5678')).toBe('525512345678');
        expect(waPhone('5512345678')).toBe('525512345678');
    });
    it('devuelve null si no es válido', () => {
        for (const bad of [null, undefined, '', '123', '55123456789', '5555555555', '55-ABCD-5678', 5512345678]) {
            expect(waPhone(bad)).toBeNull();
        }
    });
});

describe('waMessage', () => {
    it('confirmación con servicios, día, hora, barbero, dirección y teléfono del negocio', () => {
        const text = waMessage('confirmacion', APPT, BUSINESS, 'America/Mexico_City');
        expect(text).toContain('Hola, Prueba Cliente. Te confirmamos tu cita en Gallo 4:20:');
        expect(text).toContain('• Servicio: Corte clásico + Barba');
        expect(text).toContain('• Día: sáb 21 nov');
        expect(text).toContain('• Hora: 3:30 p. m.');
        expect(text).toContain('• Barbero: Deya');
        expect(text).toContain(`• Dirección: ${BUSINESS.address}`);
        expect(text).toContain('55 3309 8072');
        expect(text).not.toMatch(/reservar\/|token/i);
    });
    it('recordatorio con su propio texto; sin barbero ni servicios omite esas líneas', () => {
        const text = waMessage('recordatorio', { ...APPT, services: [], barberName: null }, BUSINESS, 'America/Mexico_City');
        expect(text).toContain('Te recordamos tu cita en Gallo 4:20');
        expect(text).not.toContain('Servicio:');
        expect(text).not.toContain('Barbero:');
        expect(text).toContain('Si no puedes venir');
    });
    it('nombre vacío usa "cliente" y limpia espacios', () => {
        expect(waMessage('confirmacion', { ...APPT, clientName: '   ' }, BUSINESS)).toContain('Hola, cliente.');
        expect(waMessage('confirmacion', { ...APPT, clientName: ' Prueba \n Uno ' }, BUSINESS)).toContain('Hola, Prueba Uno.');
    });
});

describe('waLink / buildWaNotification', () => {
    it('arma el enlace con el texto codificado', () => {
        const url = waLink('55 1234 5678', 'Hola & adiós\n¿sí?');
        expect(url).toBe(`https://wa.me/525512345678?text=${encodeURIComponent('Hola & adiós\n¿sí?')}`);
        expect(decodeURIComponent(new URL(url!).searchParams.get('text')!)).toBe('Hola & adiós\n¿sí?');
    });
    it('sin teléfono válido no hay enlace', () => {
        expect(buildWaNotification('recordatorio', '123', APPT, BUSINESS)).toBeNull();
    });
    it('con teléfono válido devuelve enlace y mensaje', () => {
        const built = buildWaNotification('confirmacion', '5512345678', APPT, BUSINESS, 'America/Mexico_City');
        expect(built?.url.startsWith('https://wa.me/525512345678?text=')).toBe(true);
        expect(built?.message).toContain('Corte clásico');
    });
});
