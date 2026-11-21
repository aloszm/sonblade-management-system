import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WhatsAppActions, NO_PHONE_MESSAGE, WA_HELP } from './whatsapp';
import { appointment } from './fixtures';
import { bodyOf, json, mockFetch } from './test-utils';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const URL_WA = 'https://wa.me/525551112233?text=Hola%2C%20Prueba%20Luis';

function fakeTab() {
    const tab = { closed: false, opener: {} as unknown, location: { href: '' }, close: vi.fn(() => { tab.closed = true; }), document: { write: vi.fn() } };
    return tab;
}

describe('WhatsApp de un clic: botones', () => {
    it('recepción ve ambos botones con la ayuda; el barbero no ve botones', () => {
        const { unmount } = render(<WhatsAppActions apt={appointment()} canSend onSent={() => undefined} />);
        expect(screen.getByRole('button', { name: 'Enviar confirmación' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Enviar recordatorio' })).toBeInTheDocument();
        expect(screen.getByText(WA_HELP)).toBeInTheDocument();
        unmount();
        render(<WhatsAppActions apt={appointment()} canSend={false} onSent={() => undefined} />);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('el barbero solo ve el estado "recordatorio enviado" si la API se lo entrega', () => {
        const apt = appointment({ notifications: { confirmation: null, reminder: { at: new Date().toISOString(), by: 'u-dago', by_name: 'Dago' } } });
        render(<WhatsAppActions apt={apt} canSend={false} onSent={() => undefined} />);
        expect(screen.getByTestId('wa-status')).toHaveTextContent(/Recordatorio · Abrió WhatsApp: Dago, hoy/);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('no hay botones en citas canceladas ni cobradas', () => {
        const { unmount } = render(<WhatsAppActions apt={appointment({ status: 'cancelled' })} canSend onSent={() => undefined} />);
        expect(screen.queryByTestId('wa-actions')).toBeNull();
        unmount();
        render(<WhatsAppActions apt={appointment({ sale: { id: 's1', total: 200 } })} canSend onSent={() => undefined} />);
        expect(screen.queryByTestId('wa-actions')).toBeNull();
    });

    it('abre la pestaña en el mismo toque (antes de la respuesta) y luego le asigna la dirección de WhatsApp', async () => {
        const tab = fakeTab();
        const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
        let release: (r: Response) => void = () => undefined;
        const fetchMock = mockFetch([[/\/notifications$/, () => new Promise<Response>((resolve) => { release = resolve; })]]);
        const onSent = vi.fn();
        render(<WhatsAppActions apt={appointment({ id: 'a-77' })} canSend onSent={onSent} />);
        fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }));
        // Síncrono con el toque: la pestaña ya está abierta y todavía no hay dirección.
        expect(open).toHaveBeenCalledWith('', '_blank');
        expect(tab.location.href).toBe('');
        release(json({ url: URL_WA, message: 'Hola', notification: { id: 'n1', kind: 'confirmation', created_at: '2026-11-20T21:15:00Z' } }, 201));
        await waitFor(() => expect(tab.location.href).toBe(URL_WA));
        expect(tab.opener).toBeNull();
        expect(bodyOf(fetchMock, '/api/appointments/a-77/notifications', 'POST')).toEqual({ kind: 'confirmacion' });
        await waitFor(() => expect(onSent).toHaveBeenCalled());
        expect(screen.queryByTestId('wa-fallback')).toBeNull();
    });

    it('el recordatorio manda kind "recordatorio"', async () => {
        const tab = fakeTab();
        vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
        const fetchMock = mockFetch([[/\/notifications$/, () => json({ url: URL_WA, message: 'x', notification: {} }, 201)]]);
        render(<WhatsAppActions apt={appointment()} canSend onSent={() => undefined} />);
        fireEvent.click(screen.getByRole('button', { name: 'Enviar recordatorio' }));
        await waitFor(() => expect(tab.location.href).toBe(URL_WA));
        expect(bodyOf(fetchMock, '/notifications', 'POST')).toEqual({ kind: 'recordatorio' });
    });

    it('si el navegador bloqueó la pestaña queda un enlace visible "Abrir WhatsApp"', async () => {
        vi.spyOn(window, 'open').mockReturnValue(null);
        mockFetch([[/\/notifications$/, () => json({ url: URL_WA, message: 'x', notification: {} }, 201)]]);
        render(<WhatsAppActions apt={appointment()} canSend onSent={() => undefined} />);
        fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }));
        const link = await screen.findByRole('link', { name: 'Abrir WhatsApp' });
        expect(link).toHaveAttribute('href', URL_WA);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });

    it('sin teléfono (422): mensaje claro, cierra la pestaña vacía y no deja enlace', async () => {
        const tab = fakeTab();
        vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
        mockFetch([[/\/notifications$/, () => json({ error: 'La cita no tiene un teléfono válido de 10 dígitos.', code: 'no_phone' }, 422)]]);
        const onSent = vi.fn();
        render(<WhatsAppActions apt={appointment({ customer_phone: null })} canSend onSent={onSent} />);
        fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }));
        expect(await screen.findByTestId('wa-error')).toHaveTextContent('Este cliente no tiene teléfono registrado.');
        expect(NO_PHONE_MESSAGE).toMatch(/^Este cliente no tiene teléfono registrado/);
        expect(tab.close).toHaveBeenCalled();
        expect(onSent).not.toHaveBeenCalled();
        expect(screen.queryByTestId('wa-fallback')).toBeNull();
    });

    it('muestra "Abrió WhatsApp: Dago, hoy ..." cuando ya existe (nunca «Enviado») y deja volver a enviar', () => {
        const apt = appointment({ notifications: { confirmation: { at: new Date().toISOString(), by: 'u-dago', by_name: 'Dago' }, reminder: null } });
        render(<WhatsAppActions apt={apt} canSend onSent={() => undefined} />);
        expect(screen.getByTestId('wa-sent-confirmacion')).toHaveTextContent(/^Abrió WhatsApp: Dago, hoy /);
        expect(screen.getByTestId('wa-sent-confirmacion')).not.toHaveTextContent(/Enviado/);
        expect(screen.queryByTestId('wa-sent-recordatorio')).toBeNull();
        expect(screen.getByRole('button', { name: 'Enviar confirmación' })).toBeEnabled();
    });

    it('un fallo del servidor muestra un mensaje en español sin enlace', async () => {
        vi.spyOn(window, 'open').mockReturnValue(fakeTab() as unknown as Window);
        mockFetch([[/\/notifications$/, () => json({ error: 'boom' }, 500)]]);
        render(<WhatsAppActions apt={appointment()} canSend onSent={() => undefined} />);
        fireEvent.click(screen.getByRole('button', { name: 'Enviar recordatorio' }));
        expect(await screen.findByTestId('wa-error')).toHaveTextContent('Hubo un problema en el servidor.');
    });
});
