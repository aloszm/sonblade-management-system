import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FeedbackComposer from './FeedbackComposer';
import FeedbackButton from './FeedbackButton';

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
function mockFetch(handler: (url: string, init?: RequestInit) => { ok?: boolean; status?: number; body: unknown }) {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const r = handler(url, init);
        return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body };
    }));
}
afterEach(() => { vi.unstubAllGlobals(); });

const ITEM = { id: 'f1', kind: 'falla', body: 'La agenda tarda', status: 'nuevo', screen_path: '/citas', screen_title: 'Agenda', device: 'celular' };

describe('Ventana «¿Qué mejorarías?»', () => {
    it('muestra la pantalla de origen, cuatro tipos grandes, el aviso de privacidad y el contador', () => {
        mockFetch(() => ({ body: {} }));
        render(<FeedbackComposer screen={{ path: '/citas', title: 'Agenda' }} device="celular" onClose={() => {}} />);
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('¿Qué mejorarías?')).toBeInTheDocument();
        expect(within(dialog).getByText('Sobre: Agenda')).toBeInTheDocument();
        expect(within(dialog).getAllByRole('radio').map((b) => b.textContent)).toEqual(['Idea o mejora', 'Algo no funciona', 'Tengo una duda', 'Otro']);
        expect(within(dialog).getByText('No escribas datos personales de clientes ni PIN.')).toBeInTheDocument();
        expect(within(dialog).getByText('0/1,000')).toBeInTheDocument();
    });

    it('sin tipo o con texto corto no envía y explica por qué', async () => {
        mockFetch(() => ({ body: {} }));
        render(<FeedbackComposer screen={null} device="computadora" onClose={() => {}} />);
        expect(screen.getByText('Sobre: la aplicación en general')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Elige qué tipo de comentario es.');
        fireEvent.click(screen.getByRole('radio', { name: /Tengo una duda/ }));
        fireEvent.change(screen.getByLabelText('Cuéntanos'), { target: { value: 'Hola' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('mínimo 5');
        expect(calls).toHaveLength(0);
    });

    it('envía tipo, texto, pantalla y dispositivo, y confirma con claridad', async () => {
        mockFetch(() => ({ status: 201, body: { item: ITEM } }));
        const onSent = vi.fn();
        render(<FeedbackComposer screen={{ path: '/citas', title: 'Agenda' }} device="celular" onClose={() => {}} onSent={onSent} />);
        fireEvent.click(screen.getByRole('radio', { name: /Algo no funciona/ }));
        expect(screen.getByRole('radio', { name: /Algo no funciona/ })).toHaveAttribute('aria-checked', 'true');
        fireEvent.change(screen.getByLabelText('Cuéntanos'), { target: { value: '  La agenda tarda en cargar  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
        expect(await screen.findByText('Tu comentario quedó enviado.')).toBeInTheDocument();
        expect(calls[0].url).toBe('/api/feedback');
        expect(JSON.parse(String(calls[0].init?.body))).toEqual({ kind: 'falla', body: 'La agenda tarda en cargar', screen_path: '/citas', device: 'celular' });
        expect(onSent).toHaveBeenCalledWith(ITEM);
        expect(screen.getByRole('link', { name: 'Ver mis comentarios' })).toHaveAttribute('href', '/comentarios');
    });

    it('si la base frena (20 por día), muestra su mensaje y conserva el texto', async () => {
        mockFetch(() => ({ ok: false, status: 429, body: { error: 'Llegaste al máximo de 20 comentarios por día. Mañana puedes escribir más.' } }));
        render(<FeedbackComposer screen={null} device={null} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('radio', { name: /Otro/ }));
        fireEvent.change(screen.getByLabelText('Cuéntanos'), { target: { value: 'Comentario veintiuno' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('20 comentarios por día');
        expect(screen.getByLabelText('Cuéntanos')).toHaveValue('Comentario veintiuno');
    });
});

describe('Botón de acceso en el encabezado', () => {
    const me = (user: Record<string, unknown>) => mockFetch((url) => (url === '/api/auth/me' ? { body: { authenticated: true, user } } : { body: {} }));

    it('con sesión: abre la ventana sin salir de la pantalla', async () => {
        me({ id: 'u-dani', name: 'Dani', role: 'barber' });
        render(<FeedbackButton />);
        fireEvent.click(await screen.findByRole('button', { name: 'Escribir un comentario o sugerencia' }));
        expect(screen.getByRole('dialog')).toHaveTextContent('¿Qué mejorarías?');
    });

    it('con PIN temporal o sin sesión no aparece', async () => {
        me({ id: 'u-deya', name: 'Deya', role: 'barber', mustChangePin: true });
        const { container } = render(<FeedbackButton />);
        await waitFor(() => expect(calls.length).toBeGreaterThan(0));
        expect(container).toBeEmptyDOMElement();
        mockFetch(() => ({ body: { authenticated: false } }));
        const second = render(<FeedbackButton />);
        await waitFor(() => expect(calls.length).toBeGreaterThan(0));
        expect(second.container).toBeEmptyDOMElement();
    });
});
