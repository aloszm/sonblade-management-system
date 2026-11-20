import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import BookingSettingsPage from '@/app/configuracion/reservas/page';
import { bodyOf, json, mockFetch, renderWithQuery } from '@/app/citas/_components/test-utils';

afterEach(() => vi.unstubAllGlobals());

const SETTINGS = { enabled: true, lead_minutes: 60, max_days_ahead: 30, cancel_hours: 2, max_online_per_day: 30, max_active_per_phone: 2,
    privacy_version: '2026-11-17', last_changed_at: '2026-11-20T21:15:00Z', last_changed_by: 'Alonso' };

function routes(opts: { canEdit?: boolean; put?: () => Response } = {}) {
    return mockFetch([
        [/\/api\/booking-settings$/, (_url, init) => (init?.method === 'PUT'
            ? (opts.put ? opts.put() : json({ settings: { ...SETTINGS, enabled: false }, changed: true }))
            : json({ settings: SETTINGS, can_edit: opts.canEdit ?? true }))],
    ]);
}

const pinStep = async (pin = '123456', comment = 'Apagamos por el evento') => {
    const dialog = await screen.findByTestId('pin-confirm');
    fireEvent.change(within(dialog).getByLabelText(/Comentario/), { target: { value: comment } });
    fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: pin } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Guardar con PIN/ }));
    return dialog;
};

describe('Reservas en línea (pantalla)', () => {
    it('la cuenta principal ve el interruptor, la explicación y quién cambió por última vez', async () => {
        routes();
        renderWithQuery(<BookingSettingsPage />);
        const toggle = await screen.findByRole('switch', { name: 'Reservas en línea' });
        expect(toggle).toBeEnabled();
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('booking-state')).toHaveTextContent('encendidas');
        expect(screen.getByText(/aparece «Agenda por WhatsApp»/)).toBeInTheDocument();
        expect(screen.getByText(/hasta 5 minutos/)).toBeInTheDocument();
        expect(screen.getByTestId('booking-last-change')).toHaveTextContent(/Último cambio: Alonso · .*2026/);
        expect(screen.queryByTestId('booking-readonly')).toBeNull();
        expect(screen.getByLabelText(/Anticipación mínima para reservar/)).toHaveValue(60);
        expect(screen.getByLabelText('Días hacia adelante')).toHaveValue(30);
        expect(screen.getByLabelText('Horas mínimas para cancelar')).toHaveValue(2);
        expect(screen.getByLabelText('Máximo de reservas en línea por día')).toHaveValue(30);
    });

    it('gerencia lo ve todo en solo lectura, con la nota de que solo la cuenta principal cambia', async () => {
        routes({ canEdit: false });
        renderWithQuery(<BookingSettingsPage />);
        const toggle = await screen.findByRole('switch', { name: 'Reservas en línea' });
        expect(toggle).toBeDisabled();
        expect(screen.getByTestId('booking-readonly')).toHaveTextContent('Solo la cuenta principal puede cambiar esto.');
        expect(screen.getByLabelText('Días hacia adelante')).toBeDisabled();
        expect(screen.queryByRole('button', { name: /Guardar cambios/ })).toBeNull();
    });

    it('apagar pide PIN y comentario, y manda el cambio completo con el PIN', async () => {
        const fetchMock = routes();
        renderWithQuery(<BookingSettingsPage />);
        const toggle = await screen.findByRole('switch', { name: 'Reservas en línea' });
        const save = screen.getByRole('button', { name: /Guardar cambios/ });
        expect(save).toBeDisabled();
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByTestId('booking-state')).toHaveTextContent('apagadas');
        fireEvent.click(save);
        const dialog = await screen.findByTestId('pin-confirm');
        expect(dialog).toHaveTextContent('Encendidas → Apagadas');
        await pinStep();
        await waitFor(() => expect(bodyOf(fetchMock, '/api/booking-settings', 'PUT')).toBeDefined());
        expect(bodyOf(fetchMock, '/api/booking-settings', 'PUT')).toEqual({
            enabled: false, lead_minutes: 60, max_days_ahead: 30, cancel_hours: 2, max_online_per_day: 30, comment: 'Apagamos por el evento', pin: '123456',
        });
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());
    });

    it('PIN equivocado: muestra el mensaje en la ventana y no cierra', async () => {
        routes({ put: () => json({ error: 'El PIN no es correcto.', pin_error: true }, 400) });
        renderWithQuery(<BookingSettingsPage />);
        fireEvent.click(await screen.findByRole('switch', { name: 'Reservas en línea' }));
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
        const dialog = await pinStep('000000');
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('El PIN no es correcto.');
        expect(screen.getByTestId('pin-confirm')).toBeInTheDocument();
    });

    it('un número fuera de rango no abre la ventana del PIN y explica el rango', async () => {
        routes();
        renderWithQuery(<BookingSettingsPage />);
        const days = await screen.findByLabelText('Días hacia adelante');
        fireEvent.change(days, { target: { value: '120' } });
        fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
        expect(await screen.findByText('Escribe un número entero de 1 a 90.')).toBeInTheDocument();
        expect(screen.queryByTestId('pin-confirm')).toBeNull();
    });

    it('si falla la carga muestra el error y Reintentar vuelve a pedir', async () => {
        let fail = true;
        mockFetch([[/\/api\/booking-settings$/, () => (fail ? json({ error: 'Falla del servidor.' }, 500) : json({ settings: SETTINGS, can_edit: true }))]]);
        renderWithQuery(<BookingSettingsPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las reservas en línea');
        fail = false;
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByRole('switch', { name: 'Reservas en línea' })).toBeInTheDocument();
    });
});
