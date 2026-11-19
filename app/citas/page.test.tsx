import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment } from '@/types';
import { json, mockFetch, renderWithQuery } from './_components/test-utils';

// La dirección que "tiene" la página en cada prueba, y el router con el que se observa router.replace.
let query = '';
const replace = vi.fn();
vi.mock('next/navigation', () => ({
    usePathname: () => '/citas',
    useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
    useSearchParams: () => new URLSearchParams(query),
}));

import AppointmentsPage from './page';

const at = (day: number, h: number, m = 0) => new Date(2030, 2, day, h, m).toISOString();
const APT: Appointment = {
    id: 'a1', client_id: 'c9', barber_id: 'b2', client_name: 'Luis Pérez', customer_phone: '5551234567', barber: { id: 'b2', name: 'Sonny' },
    scheduled_at: at(12, 10), end_at: at(12, 11, 30), duration_minutes: 90, status: 'scheduled', notes: 'Corte adulto + Ritual de barba', created_at: at(1, 8),
    walk_in: false, sale: null,
    services: [{ service_id: 's1', name: 'Corte adulto', price: 150, duration_minutes: 30 }, { service_id: 's2', name: 'Ritual de barba', price: 200, duration_minutes: 45 }],
};
const BARBERS = [{ id: 'b1', name: 'Deya', status: 'active' }, { id: 'b2', name: 'Sonny', status: 'active' }];
const SERVICES = [{ id: 's1', name: 'Corte adulto', price: 150, duration_minutes: 30, category: 'cortes', is_active: true }];
const ADMIN = { authenticated: true, user: { role: 'admin', name: 'Recepción', id: 'u1' } };
const BARBER = { authenticated: true, user: { role: 'barber', name: 'Deya', id: 'u2', employeeId: 'b1' } };

function routes(me: unknown, appointment: Appointment = APT) {
    return mockFetch([
        ['/api/auth/me', () => json(me)],
        ['/api/barbers', () => json(BARBERS)],
        ['/api/schedule', () => json({ error: 'sin horario' }, 500)],
        ['/api/services', () => json(SERVICES)],
        ['/api/time-off', () => json([])],
        [/\/api\/clients\/c9$/, () => json({ id: 'c9', name: 'Luis Pérez', phone: '5551234567' })],
        [/\/api\/appointments\/a1$/, () => json(appointment)],
        ['/api/appointments?', () => json([appointment])],
    ]);
}

beforeEach(() => {
    replace.mockReset();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => { vi.unstubAllGlobals(); query = ''; });

const openPage = async () => {
    const view = renderWithQuery(<AppointmentsPage />);
    await waitFor(() => expect(screen.queryByTestId('agenda-loading')).not.toBeInTheDocument());
    return view;
};

describe('Agenda: parámetros de la dirección', () => {
    it('?fecha= y ?barbero= abren ese día con ese barbero, y se piden las citas de ese mes', async () => {
        query = 'fecha=2030-03-12&barbero=b2';
        const fetchMock = routes(ADMIN);
        await openPage();
        expect(screen.getByTestId('calendar-label')).toHaveTextContent('Martes 12 de marzo');
        expect(screen.getByRole('button', { name: /Sonny/, pressed: true })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Todos/, pressed: false })).toBeInTheDocument();
        const call = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.startsWith('/api/appointments?'))!;
        const params = new URL(call, 'http://x').searchParams;
        expect(new Date(params.get('from')!).getTime()).toBeLessThanOrEqual(new Date(2030, 2, 1).getTime());
        expect(new Date(params.get('to')!).getTime()).toBeGreaterThanOrEqual(new Date(2030, 3, 1).getTime());
        // Con solo ?fecha=&barbero= no se abre ninguna ventana ni se reescribe la dirección.
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(replace).not.toHaveBeenCalled();
    });

    it('un ?barbero= que no existe se ignora y una ?fecha= inválida cae en hoy', async () => {
        query = 'fecha=2030-02-31&barbero=nadie';
        routes(ADMIN);
        await openPage();
        expect(screen.getByRole('button', { name: /Todos/, pressed: true })).toBeInTheDocument();
        expect(screen.getByTestId('calendar-label')).not.toHaveTextContent('marzo');
    });

    it('al cambiar de día o de barbero se refleja en la dirección con router.replace', async () => {
        query = 'fecha=2030-03-12&barbero=b2';
        routes(ADMIN);
        await openPage();
        fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
        expect(replace).toHaveBeenLastCalledWith('/citas?fecha=2030-03-13&barbero=b2', { scroll: false });
        fireEvent.click(screen.getByRole('button', { name: /Deya/ }));
        expect(replace).toHaveBeenLastCalledWith('/citas?fecha=2030-03-13&barbero=b1', { scroll: false });
        fireEvent.click(screen.getByRole('button', { name: /Todos/ }));
        expect(replace).toHaveBeenLastCalledWith('/citas?fecha=2030-03-13', { scroll: false });
    });

    it('?cita= abre el detalle de esa cita con sus servicios, "Cobrar", "Reprogramar" y el enlace al cliente', async () => {
        query = 'cita=a1';
        routes(ADMIN);
        await openPage();
        const dialog = await screen.findByTestId('day-modal');
        expect(within(dialog).getByText('Luis Pérez')).toBeInTheDocument();
        const services = within(dialog).getByTestId('appointment-services');
        expect(services).toHaveTextContent('Corte adulto');
        expect(services).toHaveTextContent('Ritual de barba');
        expect(within(dialog).getByTestId('charge-appointment')).toHaveAttribute('href', '/pos?cita=a1');
        expect(within(dialog).getByTestId('client-link')).toHaveAttribute('href', '/clientes/c9');
        expect(within(dialog).getByRole('button', { name: /Reprogramar/ })).toBeInTheDocument();
        // La dirección queda solo con el día y el barbero (sin ?cita=).
        expect(replace).toHaveBeenLastCalledWith('/citas?fecha=2030-03-12', { scroll: false });
        expect(screen.getByTestId('calendar-label')).toHaveTextContent('Martes 12 de marzo');
    });

    it('?cliente= abre "Nueva cita" con ese cliente ya elegido', async () => {
        query = 'cliente=c9&fecha=2030-03-12';
        routes(ADMIN);
        await openPage();
        const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' });
        expect(await within(dialog).findByTestId('client-selected')).toHaveTextContent('Luis Pérez');
        expect(replace).toHaveBeenCalledWith('/citas?fecha=2030-03-12', { scroll: false });
    });

    it('?nueva=1 abre "Nueva cita" sin cliente', async () => {
        query = 'nueva=1';
        routes(ADMIN);
        await openPage();
        const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' });
        expect(within(dialog).getByRole('combobox', { name: 'Cliente' })).toBeInTheDocument();
    });
});

describe('Agenda: reprogramar desde el detalle', () => {
    it('abre el formulario precargado y, ante un 409 de empalme, explica por qué no se pudo', async () => {
        query = 'cita=a1';
        const fetchMock = mockFetch([
            ['/api/auth/me', () => json(ADMIN)], ['/api/barbers', () => json(BARBERS)], ['/api/schedule', () => json({}, 500)],
            ['/api/services', () => json(SERVICES)], ['/api/time-off', () => json([])],
            [/\/api\/appointments\/a1$/, (_u, init) => (init?.method === 'PUT' ? json({ error: 'Ese barbero ya tiene una cita en ese horario.' }, 409) : json(APT))],
            ['/api/appointments?', () => json([APT])],
        ]);
        await openPage();
        fireEvent.click(await screen.findByRole('button', { name: /Reprogramar/ }));
        const form = await screen.findByRole('dialog', { name: 'Reprogramar cita' });
        expect(within(form).getByLabelText('Barbero')).toHaveValue('b2');
        fireEvent.click(within(form).getByRole('button', { name: 'Guardar cambios' }));
        expect(await within(form).findByTestId('form-error')).toHaveTextContent('Ese barbero ya tiene una cita en ese horario. Elige otra hora u otro barbero.');
        expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(true);
    });
});

describe('Agenda: barbero (solo lectura)', () => {
    it('ve la agenda pero sin botones para agendar, ausencias, sin cita, reprogramar ni cobrar', async () => {
        query = 'cita=a1';
        const fetchMock = routes(BARBER, { ...APT, barber: { id: 'b1', name: 'Deya' }, barber_id: 'b1', customer_phone: null });
        await openPage();
        const dialog = await screen.findByTestId('day-modal');
        expect(within(dialog).getByText('Luis Pérez')).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /Reprogramar/ })).not.toBeInTheDocument();
        expect(within(dialog).queryByTestId('charge-appointment')).not.toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: /Confirmar|Llegó|Cancelar/ })).not.toBeInTheDocument();
        expect(within(dialog).queryByText('Teléfono')).not.toBeInTheDocument();
        // No ve precios de los servicios.
        expect(within(dialog).getByTestId('appointment-services')).not.toHaveTextContent('$');
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByTestId('day-modal')).not.toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Nueva cita' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Ausencia' })).not.toBeInTheDocument();
        expect(screen.queryByTestId('walk-in')).not.toBeInTheDocument();
        expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
        // No pide la lista de servicios (solo sirve para agendar) ni abre el formulario con ?nueva=1.
        expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/api/services'))).toBe(false);
    });

    it('?nueva=1 no abre el formulario para un barbero', async () => {
        query = 'nueva=1';
        routes(BARBER);
        await openPage();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});

describe('Agenda: recepción', () => {
    it('muestra "Nueva cita", "Ausencia" y "Sin cita" (enlace al cobro)', async () => {
        routes(ADMIN);
        await openPage();
        expect(screen.getByRole('button', { name: 'Nueva cita' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ausencia' })).toBeInTheDocument();
        // El cobro (usePOS) solo entiende ?cita=; por eso "Sin cita" abre /pos y el barbero se elige allí.
        expect(screen.getByTestId('walk-in')).toHaveAttribute('href', '/pos');
    });

    it('la agenda se actualiza sola cada 30 s y no sondea con la pestaña oculta', async () => {
        const { client } = (routes(ADMIN), await openPage());
        const queries = client.getQueryCache().findAll({ queryKey: ['agenda', 'appointments'] });
        expect(queries).toHaveLength(1);
        const polling = (q: { options: unknown }) => q.options as { refetchInterval?: number; refetchIntervalInBackground?: boolean };
        expect(polling(queries[0]).refetchInterval).toBe(30_000);
        expect(polling(queries[0]).refetchIntervalInBackground).toBe(false);
        expect(polling(client.getQueryCache().findAll({ queryKey: ['agenda', 'time-off'] })[0]).refetchInterval).toBe(30_000);
    });
});
