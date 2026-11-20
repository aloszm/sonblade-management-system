import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BookingFlow from './BookingFlow';

const S = {
    corte: { id: 's1', name: 'Corte adulto', category: 'cortes', category_label: 'Cortes', price: 150, variable_price: false, duration_minutes: 30, description: 'Corte a tijera o máquina' },
    barba: { id: 's2', name: 'Barba', category: 'barba', category_label: 'Barba y afeitado', price: 100, variable_price: false, duration_minutes: 30, description: null },
};
const SONIA = { id: 'b0', name: 'Sonia' }, DEYA = { id: 'b1', name: 'Deya' }, DANI = { id: 'b2', name: 'Dani' };
const CONFIG = {
    business: { name: 'Gallo 4:20', address: 'Efeso 2, Iztapalapa', phone: '55 3309 8072' }, timezone: 'America/Mexico_City',
    today: '2026-11-17', min_date: '2026-11-17', max_date: '2026-12-17', services: [S.corte, S.barba], barbers: [SONIA, DEYA, DANI],
    rules: { cancel_hours: 2, max_days_ahead: 30, lead_minutes: 60 }, privacy: { version: '1', url: '/privacidad' },
};
const SLOTS = [
    { time: '11:00', label: '11:00 a. m.', barbers: [DEYA, DANI] },
    { time: '13:30', label: '1:30 p. m.', barbers: [DEYA, DANI] },
    { time: '19:00', label: '7:00 p. m.', barbers: [DANI] },
];
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } }));

interface MockOpts { days?: { date: string; available: boolean }[]; slots?: (date: string) => unknown[] }
function mockApi(post: () => Promise<Response>, opts: MockOpts = {}) {
    const days = opts.days ?? [{ date: '2026-11-17', available: false }, { date: '2026-11-18', available: true }, { date: '2026-11-19', available: false }, { date: '2026-11-20', available: true }];
    const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/config')) return json(CONFIG);
        if (url.includes('/days')) return json({ days });
        if (url.includes('/availability')) {
            const date = new URL(url, 'http://x').searchParams.get('date')!;
            return json({ date, closed: false, slots: opts.slots ? opts.slots(date) : SLOTS });
        }
        if (init?.method === 'POST') return post();
        return json({});
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

const CREATED = { token: 'tok123', booking: {
    date: '2026-11-18', time: '13:30', label: '1:30 p. m.', duration_minutes: 30, service: { name: 'Corte adulto', price: 150, variable_price: false },
    barber: { name: 'Dani' }, customer_name: 'Juan Pérez', status: 'scheduled', cancel_until: '2026-11-18T17:30:00.000Z' } };

const tapService = async (name = /Corte adulto/) => fireEvent.click(await screen.findByLabelText(name));
const tapBarber = async (name: RegExp | string) => fireEvent.click(await screen.findByRole('radio', { name }));
const tapHour = async (label: RegExp) => fireEvent.click(await screen.findByRole('radio', { name: label }));

async function reachDetails(barber: RegExp | string = 'Dani') {
    render(<BookingFlow />);
    await tapService();
    await screen.findByRole('heading', { name: '¿Con quién?' });
    await tapBarber(barber);
    await screen.findByRole('heading', { name: '¿Cuándo?' });
    await tapHour(/1:30 p\. m\./);
    await screen.findByRole('heading', { name: '¿A nombre de quién?' });
}

const fill = () => {
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Juan Pérez' } });
    fireEvent.change(screen.getByLabelText(/Tu teléfono/), { target: { value: '55 1234 5678' } });
    fireEvent.click(screen.getByLabelText(/He leído el/));
};
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar cita' }));

describe('flujo de reserva', () => {
    beforeEach(() => { window.scrollTo = vi.fn(); window.history.replaceState(null, ''); });
    // «Atrás» usa el historial (avisa en otra vuelta del ciclo) y las flechas ignoran clics por 80 ms: se deja pasar ese tiempo.
    afterEach(async () => { cleanup(); await new Promise((r) => setTimeout(r, 120)); vi.unstubAllGlobals(); });

    it('flujo feliz: tocar avanza (servicio → barbero → hora), datos y confirmación', async () => {
        const fn = mockApi(() => json(CREATED, 201));
        await reachDetails();
        // El resumen vivo muestra lo elegido y se puede tocar.
        const bar = screen.getByTestId('booking-bar');
        expect(within(bar).getByRole('button', { name: /Cambiar servicio: Corte adulto · 30 min · \$150/ })).toBeInTheDocument();
        expect(within(bar).getByRole('button', { name: /Cambiar barbero: Dani/ })).toBeInTheDocument();
        expect(within(bar).getByRole('button', { name: /Cambiar cuándo: mié 18 nov · 1:30 p\. m\./ })).toBeInTheDocument();
        fill();
        confirm();
        await screen.findByRole('heading', { name: 'Listo, te esperamos' });
        expect(screen.getByText(/\/reservar\/tok123/)).toBeInTheDocument();
        expect(screen.getByText('mié 18 nov · 1:30 p. m.')).toBeInTheDocument();
        const wa = screen.getByRole('link', { name: /Enviarme esto por WhatsApp/ });
        expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
        expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('/reservar/tok123');
        expect(screen.getByRole('button', { name: /Agregar a mi calendario/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Cómo llegar/ })).toBeInTheDocument();
        const post = fn.mock.calls.find(([, i]) => i?.method === 'POST')!;
        expect(JSON.parse(String(post[1]!.body))).toEqual({
            service_id: 's1', barber_id: 'b2', date: '2026-11-18', time: '13:30', name: 'Juan Pérez', phone: '5512345678', accept_privacy: true, website: '',
        });
    });

    it('«Cualquier barbero» va primero y manda barber_id nulo; abre el primer día con horas y agrupa Mañana/Tarde/Noche', async () => {
        const fn = mockApi(() => json(CREATED, 201));
        render(<BookingFlow />);
        await tapService();
        const radios = await screen.findAllByRole('radio');
        expect(radios[0]).toHaveAccessibleName(/Cualquier barbero disponible/);
        fireEvent.click(radios[0]);
        await screen.findByRole('heading', { name: '¿Cuándo?' });
        expect(await screen.findByRole('radio', { name: /miércoles 18 de noviembre de 2026$/ })).toBeChecked();
        expect(screen.getByRole('radio', { name: /martes 17 de noviembre de 2026, hoy, sin horas/ })).toBeDisabled();
        expect(await screen.findByRole('group', { name: 'Mañana' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Tarde' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Noche' })).toBeInTheDocument();
        // Lo más pronto, en un toque.
        fireEvent.click(await screen.findByRole('button', { name: /Lo más pronto.*11:00 a\. m\./ }));
        await screen.findByRole('heading', { name: '¿A nombre de quién?' });
        fill();
        confirm();
        await screen.findByRole('heading', { name: 'Listo, te esperamos' });
        const post = fn.mock.calls.find(([, i]) => i?.method === 'POST')!;
        expect(JSON.parse(String(post[1]!.body))).toMatchObject({ barber_id: null, date: '2026-11-18', time: '11:00' });
    });

    it('la lista de barberos muestra solo nombres, sin títulos internos', async () => {
        mockApi(() => json({}, 201));
        render(<BookingFlow />);
        await tapService();
        await screen.findByRole('heading', { name: '¿Con quién?' });
        const group = screen.getByRole('group', { name: 'Barbero' });
        expect(group.textContent).not.toMatch(/gerente|encargad|due[ñn]|admin|recepci/i);
        // Cada opción es solo el nombre (la inicial del círculo es decorativa): nada de "Barbera", insignias ni puestos.
        for (const b of [SONIA, DEYA, DANI]) {
            const radio = within(group).getByRole('radio', { name: b.name });
            expect(radio.closest('label')!.textContent).toBe(`${b.name[0]}${b.name}`);
        }
    });

    it('volver atrás conserva lo elegido (servicio, barbero, hora y datos)', async () => {
        mockApi(() => json(CREATED, 201));
        await reachDetails();
        fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Juan' } });
        fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
        await screen.findByRole('heading', { name: '¿Cuándo?' });
        expect(await screen.findByRole('radio', { name: /1:30 p\. m\./ })).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
        await screen.findByRole('heading', { name: '¿Con quién?' });
        expect(screen.getByRole('radio', { name: 'Dani' })).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
        await screen.findByRole('heading', { name: '¿Qué te hacemos?' });
        expect(screen.getByRole('radio', { name: /Corte adulto/ })).toBeChecked();
        // Seguir lleva directo a lo que falta (aquí, nada: a los datos), sin volver a elegir.
        fireEvent.click(screen.getByRole('button', { name: 'Seguir' }));
        await screen.findByRole('heading', { name: '¿A nombre de quién?' });
        expect(screen.getByLabelText('Tu nombre')).toHaveValue('Juan');
    });

    it('el resumen lleva al paso a corregir; cambiar el barbero solo quita la hora', async () => {
        mockApi(() => json(CREATED, 201));
        await reachDetails();
        fireEvent.click(within(screen.getByTestId('booking-bar')).getByRole('button', { name: /Cambiar barbero/ }));
        await screen.findByRole('heading', { name: '¿Con quién?' });
        await tapBarber('Deya');
        await screen.findByRole('heading', { name: '¿Cuándo?' });
        expect(screen.getByRole('button', { name: /Cambiar servicio: Corte adulto/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Cambiar cuándo/ })).toBeNull();
        expect(await screen.findByRole('radio', { name: /miércoles 18 de noviembre de 2026$/ })).toBeChecked();
    });

    it('el foco va al título de cada paso al cambiar', async () => {
        mockApi(() => json({}, 201));
        render(<BookingFlow />);
        await waitFor(() => expect(screen.getByRole('heading', { name: '¿Qué te hacemos?' })).toHaveFocus());
        await tapService();
        await waitFor(() => expect(screen.getByRole('heading', { name: '¿Con quién?' })).toHaveFocus());
        await tapBarber('Deya');
        await waitFor(() => expect(screen.getByRole('heading', { name: '¿Cuándo?' })).toHaveFocus());
    });

    it('con las flechas del teclado solo marca; Enter elige y avanza', async () => {
        mockApi(() => json({}, 201));
        render(<BookingFlow />);
        const corte = await screen.findByLabelText(/Corte adulto/);
        fireEvent.keyDown(corte, { key: 'ArrowDown' });
        fireEvent.click(corte);
        expect(screen.getByRole('heading', { name: '¿Qué te hacemos?' })).toBeInTheDocument();
        fireEvent.keyDown(corte, { key: 'Enter' });
        await screen.findByRole('heading', { name: '¿Con quién?' });
    });

    it('hora tomada (409): regresa a las horas conservando todo, lo explica y vuelve a consultar', async () => {
        const fn = mockApi(() => json({ error: 'Esa hora ya no está disponible', code: 'slot_taken' }, 409));
        await reachDetails();
        fill();
        confirm();
        expect(await screen.findByText(/Esa hora ya la tomaron/)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '¿Cuándo?' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Cambiar barbero: Dani/ })).toBeInTheDocument();
        expect(await screen.findByRole('radio', { name: /miércoles 18 de noviembre de 2026$/ })).toBeChecked();
        await waitFor(() => expect(fn.mock.calls.filter(([u]) => String(u).includes('/availability')).length).toBeGreaterThan(1));
        // Al elegir otra hora, los datos siguen ahí.
        await tapHour(/7:00 p\. m\./);
        await screen.findByRole('heading', { name: '¿A nombre de quién?' });
        expect(screen.getByLabelText('Tu nombre')).toHaveValue('Juan Pérez');
    });

    it('sin la casilla de privacidad no envía y avisa en el campo', async () => {
        const fn = mockApi(() => json({}, 201));
        await reachDetails();
        fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Juan' } });
        fireEvent.change(screen.getByLabelText(/Tu teléfono/), { target: { value: '5512345678' } });
        confirm();
        expect(await screen.findByText('Marca la casilla para poder reservar.')).toBeInTheDocument();
        expect(fn.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
    });

    it('teléfono: se valida al salir del campo, con aria-invalid y mensaje ligado', async () => {
        const fn = mockApi(() => json({}, 201));
        await reachDetails();
        const phone = screen.getByLabelText(/Tu teléfono/);
        expect(phone).toHaveAttribute('inputmode', 'tel');
        expect(phone).toHaveAttribute('autocomplete', 'tel-national');
        fireEvent.change(phone, { target: { value: '55 12' } });
        expect(phone).toHaveAttribute('aria-invalid', 'false');
        fireEvent.blur(phone);
        const msg = await screen.findByText('El teléfono debe tener 10 dígitos, con lada.');
        expect(phone).toHaveAttribute('aria-invalid', 'true');
        expect(phone.getAttribute('aria-describedby')).toContain(msg.id);
        fireEvent.change(phone, { target: { value: '55 1234 5678' } });
        expect(phone).toHaveAttribute('aria-invalid', 'false');
        expect(fn.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
    });

    it('límite de intentos (429): dice cuánto esperar, bloquea el botón y ofrece llamar', async () => {
        mockApi(() => json({ error: 'x' }, 429, { 'Retry-After': '90' }));
        await reachDetails();
        fill();
        confirm();
        expect(await screen.findByText(/2 minutos/, { selector: 'p' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Espera/ })).toBeDisabled();
        expect(screen.getByRole('link', { name: /Llámanos al 55 3309 8072/ })).toHaveAttribute('href', 'tel:5533098072');
    });

    it('día sin horas: lo dice y ofrece el siguiente día con horas en un toque', async () => {
        mockApi(() => json({}, 201), { slots: (d) => (d === '2026-11-18' ? [] : SLOTS) });
        render(<BookingFlow />);
        await tapService();
        await tapBarber('Deya');
        expect(await screen.findByText(/Ese día ya no quedan horas con Deya/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Ver el vie 20 nov/ }));
        expect(await screen.findByRole('radio', { name: /viernes 20 de noviembre de 2026$/ })).toBeChecked();
        expect(await screen.findByLabelText(/1:30 p\. m\./)).toBeInTheDocument();
    });

    it('sin días libres con ese barbero: ofrece cualquier barbero o llamar', async () => {
        mockApi(() => json({}, 201), { days: [{ date: '2026-11-18', available: false }] });
        render(<BookingFlow initialBarber="deya" />);
        await tapService();
        expect(await screen.findByText(/No quedan horas libres en los próximos 30 días con Deya/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Llamar al 55 3309 8072/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Ver horarios con cualquier barbero/ }));
        await waitFor(() => expect(screen.getByRole('heading', { name: '¿Cuándo?' }).parentElement).toHaveTextContent(/Con cualquier barbero/));
    });

    it('reservas apagadas: página digna con WhatsApp y llamar', async () => {
        vi.stubGlobal('fetch', vi.fn(() => json({ enabled: false })));
        render(<BookingFlow />);
        expect(await screen.findByRole('heading', { name: /Por ahora agendamos por WhatsApp o por teléfono/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Agenda por WhatsApp/ })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\/525533098072\?text=/));
        expect(screen.getByRole('link', { name: /Llamar al 55 3309 8072/ })).toHaveAttribute('href', 'tel:5533098072');
    });

    it('sin conexión al cargar ofrece reintentar', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fail'))));
        render(<BookingFlow />);
        expect(await screen.findByText(/No hay conexión/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    });

    it('sin conexión al pedir las horas: avisa y reintenta sin perder lo elegido', async () => {
        let fail = true;
        const base = mockApi(() => json({}, 201));
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => (String(input).includes('/availability') && fail ? Promise.reject(new TypeError('x')) : base(input, init))));
        render(<BookingFlow />);
        await tapService();
        await tapBarber('Deya');
        expect(await screen.findByText(/No hay conexión/)).toBeInTheDocument();
        fail = false;
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
        expect(await screen.findByLabelText(/1:30 p\. m\./)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Cambiar barbero: Deya/ })).toBeInTheDocument();
    });

    describe('enlace corto por barbero (?barbero=)', () => {
        it('salta el paso del barbero y muestra «Con Deya · cambiar» (sin importar mayúsculas)', async () => {
            mockApi(() => json({}, 201));
            render(<BookingFlow initialBarber="DEYA" />);
            await tapService();
            const h = await screen.findByRole('heading', { name: '¿Cuándo?' });
            expect(h.parentElement).toHaveTextContent('Con Deya · cambiar');
            expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'cambiar' }));
            await screen.findByRole('heading', { name: '¿Con quién?' });
            expect(screen.getByRole('radio', { name: 'Deya' })).toBeChecked();
        });

        it('si el nombre no existe lo ignora en silencio', async () => {
            mockApi(() => json({}, 201));
            render(<BookingFlow initialBarber="nadie" />);
            await tapService();
            await screen.findByRole('heading', { name: '¿Con quién?' });
            expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);
        });

        it('con reservas apagadas ignora el parámetro', async () => {
            vi.stubGlobal('fetch', vi.fn(() => json({ enabled: false })));
            render(<BookingFlow initialBarber="dani" />);
            expect(await screen.findByText(/agendamos por WhatsApp o por teléfono/)).toBeInTheDocument();
        });
    });
});
