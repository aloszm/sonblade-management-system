import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import TomorrowReminders, { pendingCount, sortReminders, type TomorrowAppointment } from './TomorrowReminders';
import { appointment } from './fixtures';
import { json, mockFetch, renderWithQuery } from './test-utils';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const row = (over: Partial<TomorrowAppointment> & { id: string }): TomorrowAppointment => ({
    ...appointment(), has_valid_phone: true, reminder_sent: false, ...over,
});
const SENT = { at: '2026-11-20T21:15:00Z', by: 'u-dago', by_name: 'Dago' };
const ROWS: TomorrowAppointment[] = [
    row({ id: 'sent', client_name: 'Prueba Enviada', scheduled_at: '2026-11-21T16:00:00Z', reminder_sent: true, notifications: { confirmation: null, reminder: SENT } }),
    row({ id: 'nophone', client_name: 'Prueba Sin Teléfono', scheduled_at: '2026-11-21T17:00:00Z', has_valid_phone: false, customer_phone: null }),
    row({ id: 'late', client_name: 'Prueba Tarde', scheduled_at: '2026-11-21T22:00:00Z' }),
    row({ id: 'early', client_name: 'Prueba Temprano', scheduled_at: '2026-11-21T15:00:00Z' }),
];

describe('Recordatorios de mañana', () => {
    it('ordena: por avisar por hora, luego sin teléfono y al final las enviadas; cuenta solo las pendientes con teléfono', () => {
        expect(sortReminders(ROWS).map((r) => r.id)).toEqual(['early', 'late', 'nophone', 'sent']);
        expect(pendingCount(ROWS)).toBe(2);
        expect(pendingCount(undefined)).toBe(0);
    });

    it('la lista muestra hora, cliente, servicio y barbero; marca las enviadas y avisa de las que no tienen teléfono', async () => {
        mockFetch([[/recordatorios=manana/, () => json({ day: '2026-11-21', timezone: 'America/Mexico_City', appointments: ROWS })]]);
        renderWithQuery(<TomorrowReminders onClose={() => undefined} onChanged={() => undefined} />);
        const rows = await screen.findAllByTestId('tomorrow-row');
        expect(rows).toHaveLength(4);
        expect(rows[0]).toHaveTextContent('9:00 a. m.');
        expect(rows[0]).toHaveTextContent('Prueba Temprano');
        expect(rows[0]).toHaveTextContent('Corte · Deya');
        expect(within(rows[0]).getByRole('button', { name: 'Enviar recordatorio a Prueba Temprano' })).toBeEnabled();
        expect(within(rows[2]).getByTestId('tomorrow-no-phone')).toHaveTextContent('Sin teléfono registrado');
        expect(within(rows[2]).queryByRole('button')).toBeNull();
        expect(within(rows[3]).getByTestId('tomorrow-sent')).toHaveTextContent('Abrió WhatsApp: Dago');
        expect(screen.getByText(/2 pendientes/)).toBeInTheDocument();
    });

    it('el botón de una fila abre WhatsApp con su cita y vuelve a cargar la lista', async () => {
        const tab = { closed: false, opener: {} as unknown, location: { href: '' }, close: vi.fn(), document: { write: vi.fn() } };
        vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
        let sent = false;
        const fetchMock = mockFetch([
            [/recordatorios=manana/, () => json({ day: '2026-11-21', timezone: 'America/Mexico_City', appointments: sent ? ROWS.map((r) => (r.id === 'early' ? { ...r, reminder_sent: true, notifications: { confirmation: null, reminder: SENT } } : r)) : ROWS })],
            [/\/api\/appointments\/early\/notifications$/, () => { sent = true; return json({ url: 'https://wa.me/525551112233?text=x', message: 'x', notification: {} }, 201); }],
        ]);
        const onChanged = vi.fn();
        renderWithQuery(<TomorrowReminders onClose={() => undefined} onChanged={onChanged} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Enviar recordatorio a Prueba Temprano' }));
        await waitFor(() => expect(tab.location.href).toBe('https://wa.me/525551112233?text=x'));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        // Después de refrescar, esa fila baja detrás de las pendientes y las que no tienen teléfono.
        await waitFor(() => expect(screen.getAllByTestId('tomorrow-row').map((r) => r.textContent).findIndex((t) => t?.includes('Prueba Temprano'))).toBe(2));
        expect(fetchMock.mock.calls.filter(([u]) => /recordatorios=manana/.test(String(u))).length).toBeGreaterThanOrEqual(2);
    });

    it('sin citas: estado vacío', async () => {
        mockFetch([[/recordatorios=manana/, () => json({ day: '2026-11-21', timezone: 'America/Mexico_City', appointments: [] })]]);
        renderWithQuery(<TomorrowReminders onClose={() => undefined} onChanged={() => undefined} />);
        expect(await screen.findByText('Mañana no hay citas por avisar')).toBeInTheDocument();
    });

    it('si falla la carga muestra el error y Reintentar vuelve a pedir', async () => {
        let fail = true;
        mockFetch([[/recordatorios=manana/, () => (fail ? json({ error: 'x' }, 500) : json({ day: '2026-11-21', timezone: 'America/Mexico_City', appointments: ROWS }))]]);
        renderWithQuery(<TomorrowReminders onClose={() => undefined} onChanged={() => undefined} />);
        expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las citas de mañana');
        fail = false;
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findAllByTestId('tomorrow-row')).toHaveLength(4);
    });
});
