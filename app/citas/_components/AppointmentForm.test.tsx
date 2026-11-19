import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Appointment, Barber } from '@/types';
import AppointmentForm from './AppointmentForm';
import { bodyOf, json, mockFetch, renderWithQuery } from './test-utils';

const barbers = [
    { id: 'b1', name: 'Deya', status: 'active' }, { id: 'b2', name: 'Sonny', status: 'active' },
] as Barber[];
const services = [
    { id: 's1', name: 'Corte adulto', price: 150, duration_minutes: 30, category: 'cortes' },
    { id: 's2', name: 'Ritual de barba', price: 200, duration_minutes: 45, category: 'barba' },
    { id: 's3', name: 'Cejas', price: 50, duration_minutes: 30, category: 'ceja_facial' },
];
const at = (h: number, m = 0) => new Date(2030, 2, 12, h, m).toISOString();
const apt = (over: Partial<Appointment> = {}): Appointment => ({
    id: 'a1', client_id: 'c9', barber_id: 'b1', client_name: 'Luis Pérez', customer_phone: '5551234567', barber: { id: 'b1', name: 'Deya' },
    scheduled_at: at(10), end_at: at(11), duration_minutes: 60, status: 'scheduled', notes: 'Corte adulto + Ritual de barba', created_at: at(8),
    walk_in: false, sale: null, services: [
        { service_id: 's1', name: 'Corte adulto', price: 150, duration_minutes: 30 }, { service_id: 's2', name: 'Ritual de barba', price: 200, duration_minutes: 45 },
    ], ...over,
});

afterEach(() => vi.unstubAllGlobals());

const setup = (props: Partial<React.ComponentProps<typeof AppointmentForm>> = {}) => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const view = renderWithQuery(
        <AppointmentForm mode="create" initial={{ date: '2030-03-12', time: '10:00', barberId: 'b1' }} barbers={barbers} services={services} schedule={null}
            onClose={onClose} onSaved={onSaved} {...props} />,
    );
    return { onSaved, onClose, ...view };
};

describe('Nueva cita con servicios', () => {
    it('agrupa por categoría, suma la duración (a bloques de 30 min) y el precio estimado', () => {
        mockFetch([]);
        setup();
        expect(screen.getByRole('group', { name: 'Cortes' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Barba y afeitado' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Ceja y facial' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: /Corte adulto/ }));
        expect(screen.getByTestId('services-duration')).toHaveTextContent('30 min');
        fireEvent.click(screen.getByRole('checkbox', { name: /Ritual de barba/ }));
        // 30 + 45 = 75 min → 1 h 30 min
        expect(screen.getByTestId('services-duration')).toHaveTextContent('1 h 30 min');
        expect(screen.getByTestId('services-price')).toHaveTextContent('$350');
        fireEvent.click(screen.getByRole('checkbox', { name: /Corte adulto/ }));
        expect(screen.getByTestId('services-duration')).toHaveTextContent('1 h');
    });

    it('sin servicios deja agendar solo con nota, pero avisa con suavidad que conviene elegir uno', () => {
        mockFetch([]);
        setup();
        const hint = screen.getByText(/Conviene elegir al menos un servicio/);
        expect(hint).not.toHaveAttribute('role', 'alert');
        expect(screen.getByLabelText('Duración')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: /Cejas/ }));
        expect(screen.queryByText(/Conviene elegir al menos un servicio/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Duración')).not.toBeInTheDocument();
    });

    it('envía service_ids y una llave de idempotencia; un segundo clic no crea otra cita', async () => {
        const fetchMock = mockFetch([['/api/appointments', () => json(apt(), 201)]]);
        const { onSaved } = setup();
        fireEvent.click(screen.getByRole('checkbox', { name: /Corte adulto/ }));
        fireEvent.click(screen.getByRole('checkbox', { name: /Ritual de barba/ }));
        // Cliente sin registrar, con el teclado
        const combo = screen.getByRole('combobox', { name: 'Cliente' });
        fireEvent.keyDown(combo, { key: 'ArrowDown' });
        fireEvent.keyDown(combo, { key: 'Enter' });
        fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Luis' } });
        const save = screen.getByRole('button', { name: 'Guardar cita' });
        fireEvent.click(save);
        fireEvent.click(save);
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
        const posts = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
        expect(posts).toHaveLength(1);
        const body = bodyOf(fetchMock, '/api/appointments', 'POST');
        expect(body).toMatchObject({ service_ids: ['s1', 's2'], customer_name: 'Luis', client_id: null, barber_id: 'b1' });
        expect(body.duration_minutes).toBeUndefined();
        expect(String(body.idempotency_key).length).toBeGreaterThanOrEqual(12);
        expect(new Date(body.scheduled_at).getHours()).toBe(10);
    });

    it('sin servicios manda la duración elegida y no service_ids', async () => {
        const fetchMock = mockFetch([['/api/appointments', () => json(apt(), 201)]]);
        const { onSaved } = setup({ initial: { date: '2030-03-12', time: '10:00', client: { kind: 'client', id: 'c9', name: 'Luis Pérez', phone: null } } });
        fireEvent.change(screen.getByLabelText('Duración'), { target: { value: '90' } });
        fireEvent.change(screen.getByLabelText('Nota'), { target: { value: 'Solo una nota' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cita' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        const body = bodyOf(fetchMock, '/api/appointments', 'POST');
        expect(body).toMatchObject({ client_id: 'c9', duration_minutes: 90, service_note: 'Solo una nota' });
        expect(body.service_ids).toBeUndefined();
    });

    it('pide un cliente antes de guardar', async () => {
        const fetchMock = mockFetch([]);
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cita' }));
        expect(await screen.findByTestId('form-error')).toHaveTextContent(/Busca un cliente/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('Reprogramar', () => {
    const reschedule = (over: Partial<React.ComponentProps<typeof AppointmentForm>> = {}) =>
        setup({ mode: 'reschedule', appointment: apt(), initial: { date: '2030-03-12' }, ...over });

    it('abre precargado: fecha, hora, barbero y servicios de la cita', () => {
        mockFetch([]);
        reschedule();
        expect(screen.getByRole('dialog', { name: 'Reprogramar cita' })).toBeInTheDocument();
        expect(screen.getByLabelText('Barbero')).toHaveValue('b1');
        expect(screen.getByRole('checkbox', { name: /Corte adulto/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /Ritual de barba/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /Cejas/ })).not.toBeChecked();
        expect(screen.getByTestId('services-duration')).toHaveTextContent('1 h 30 min');
        expect(screen.getByRole('button', { name: /Hora/ })).toHaveTextContent('10 a.m.');
        expect(screen.getByRole('button', { name: /Fecha/ })).toHaveTextContent('mar 12 mar 2030');
    });

    it('hace PUT al cambiar de barbero y avisa al terminar', async () => {
        const fetchMock = mockFetch([[/\/api\/appointments\/a1$/, () => json(apt({ barber: { id: 'b2', name: 'Sonny' } }))]]);
        const { onSaved } = reschedule();
        fireEvent.change(screen.getByLabelText('Barbero'), { target: { value: 'b2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT' });
        const body = bodyOf(fetchMock, '/api/appointments/a1', 'PUT');
        expect(body).toMatchObject({ barber_id: 'b2', service_ids: ['s1', 's2'] });
        // La hora no cambió: no se reenvía (una cita antigua fuera de bloque no se rechazaría por eso).
        expect(body.scheduled_at).toBeUndefined();
    });

    it('409 por empalme: explica que el barbero ya tiene cita y deja el formulario abierto', async () => {
        mockFetch([[/\/api\/appointments\/a1$/, () => json({ error: 'Ese barbero ya tiene una cita en ese horario.' }, 409)]]);
        const { onSaved } = reschedule();
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        const alert = await screen.findByTestId('form-error');
        expect(alert).toHaveTextContent('Ese barbero ya tiene una cita en ese horario. Elige otra hora u otro barbero.');
        expect(onSaved).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: 'Reprogramar cita' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    });

    it.each([
        ['Dani no estará disponible en ese horario (Cita médica).', /Dani no estará disponible.*Cita médica/],
        ['Esa cita ya se cobró; no se puede reprogramar.', /ya se cobró/],
        ['Solo se reprograma una cita abierta; esta ya fue cerrada o cancelada.', /cerrada o cancelada/],
    ])('409 «%s» tiene su propio mensaje', async (server, expected) => {
        mockFetch([[/\/api\/appointments\/a1$/, () => json({ error: server }, 409)]]);
        reschedule();
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        expect(await screen.findByTestId('form-error')).toHaveTextContent(expected);
    });

    it('400 por bloque de 30 minutos muestra el texto de la API', async () => {
        const text = 'Las citas empiezan en punto o y media (por ejemplo 1:00 o 1:30 p.m.).';
        mockFetch([[/\/api\/appointments\/a1$/, () => json({ error: text }, 400)]]);
        reschedule();
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        expect(await screen.findByTestId('form-error')).toHaveTextContent(text);
    });
});
