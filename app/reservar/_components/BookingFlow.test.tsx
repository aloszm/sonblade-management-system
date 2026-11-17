import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import BookingFlow from './BookingFlow';

const S = {
    corte: { id: 's1', name: 'Corte adulto', category: 'cortes', category_label: 'Cortes', price: 150, variable_price: false, duration_minutes: 30, description: 'Corte a tijera o máquina' },
    barba: { id: 's2', name: 'Barba', category: 'barba', category_label: 'Barba y afeitado', price: 100, variable_price: false, duration_minutes: 30, description: null },
};
const DEYA = { id: 'b1', name: 'Deya' }, DANI = { id: 'b2', name: 'Dani' };
const CONFIG = {
    business: { name: 'Gallo 4:20', address: 'Efeso 2, Iztapalapa', phone: '55 3309 8072' }, timezone: 'America/Mexico_City',
    today: '2026-11-17', min_date: '2026-11-17', max_date: '2026-12-17', services: [S.corte, S.barba], barbers: [DEYA, DANI],
    rules: { cancel_hours: 2, max_days_ahead: 30, lead_minutes: 60 }, privacy: { version: '1', url: '/privacidad' },
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }));

function mockApi(post: () => Promise<Response>) {
    const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/config')) return json(CONFIG);
        if (url.includes('/days')) return json({ days: [{ date: '2026-11-18', available: true }, { date: '2026-11-19', available: false }] });
        if (url.includes('/availability')) return json({ date: '2026-11-18', closed: false, slots: [{ time: '13:30', label: '1:30 p. m.', barbers: [DEYA, DANI] }] });
        if (init?.method === 'POST') return post();
        return json({});
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

async function reachDetails() {
    render(<BookingFlow />);
    fireEvent.click(await screen.findByLabelText(/Corte adulto/));
    fireEvent.click(screen.getByRole('button', { name: /Continuar con Corte adulto/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Elegir horario/ }));
    fireEvent.click(await screen.findByRole('button', { name: /miércoles 18 de noviembre de 2026, con horarios/ }));
    fireEvent.click(await screen.findByLabelText(/1:30 p\. m\./));
    fireEvent.click(screen.getByLabelText(/Dani$/));
    fireEvent.click(screen.getByRole('button', { name: /Continuar · 1:30 p\. m\. con Dani/ }));
    await screen.findByRole('heading', { name: 'Tus datos' });
}

const fill = () => {
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Juan Pérez' } });
    fireEvent.change(screen.getByLabelText(/Tu teléfono/), { target: { value: '55 1234 5678' } });
    fireEvent.click(screen.getByLabelText(/He leído el/));
};

describe('flujo de reserva', () => {
    beforeEach(() => { window.scrollTo = vi.fn(); });
    afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

    it('flujo feliz: elegir horario, datos y confirmación', async () => {
        const fn = mockApi(() => json({ token: 'tok123', booking: {
            date: '2026-11-18', time: '13:30', label: '1:30 p. m.', duration_minutes: 30, service: { name: 'Corte adulto', price: 150, variable_price: false },
            barber: { name: 'Dani' }, customer_name: 'Juan Pérez', status: 'scheduled', cancel_until: '2026-11-18T17:30:00.000Z' } }, 201));
        await reachDetails();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
        await screen.findByRole('heading', { name: /Listo, quedó tu reserva/ });
        expect(screen.getByText(/\/reservar\/tok123/)).toBeInTheDocument();
        const post = fn.mock.calls.find(([, i]) => i?.method === 'POST')!;
        expect(JSON.parse(String(post[1]!.body))).toEqual({
            service_id: 's1', barber_id: 'b2', date: '2026-11-18', time: '13:30', name: 'Juan Pérez', phone: '5512345678', accept_privacy: true, website: '',
        });
    });

    it('hora tomada: regresa a las horas con aviso y vuelve a consultar', async () => {
        const fn = mockApi(() => json({ error: 'Esa hora ya no está disponible', code: 'slot_taken' }, 409));
        await reachDetails();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
        expect(await screen.findByText(/Esa hora ya la tomaron/)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Elige día y hora/ })).toBeInTheDocument();
        await waitFor(() => expect(fn.mock.calls.filter(([u]) => String(u).includes('/availability')).length).toBeGreaterThan(1));
    });

    it('sin la casilla de privacidad no envía y avisa en el campo', async () => {
        const fn = mockApi(() => json({}, 201));
        await reachDetails();
        fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Juan' } });
        fireEvent.change(screen.getByLabelText(/Tu teléfono/), { target: { value: '5512345678' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
        expect(await screen.findByText('Marca la casilla para poder reservar.')).toBeInTheDocument();
        expect(fn.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
    });

    it('429 muestra cuánto esperar', async () => {
        mockApi(() => json({ error: 'x' }, 429, { 'Retry-After': '90' }));
        await reachDetails();
        fill();
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
        expect(await screen.findByText(/2 minutos/, { selector: 'p' })).toBeInTheDocument();
    });

    it('reservas apagadas: página amable con el teléfono', async () => {
        vi.stubGlobal('fetch', vi.fn(() => json({ enabled: false })));
        render(<BookingFlow />);
        expect(await screen.findByText(/agendamos por teléfono/)).toBeInTheDocument();
    });

    it('sin conexión al cargar ofrece reintentar', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fail'))));
        render(<BookingFlow />);
        expect(await screen.findByText(/No hay conexión/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    });
});
