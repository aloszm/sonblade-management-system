import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ComentariosPage from './page';
import MyFeedbackList from './_components/MyFeedbackList';
import AllFeedbackView from './_components/AllFeedbackView';
import type { FeedbackItem } from '@/lib/feedback/model';

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

const item = (over: Partial<FeedbackItem> = {}): FeedbackItem => ({
    id: 'f1', kind: 'falla', body: 'La agenda tarda en cargar', status: 'nuevo', screen_path: '/citas', screen_title: 'Agenda', device: 'celular',
    author_role: 'admin', author_role_label: 'Gerente', is_mine: true, reply: null, replied_at: null, status_changed_at: null,
    retracted: false, unseen_update: false, created_at: '2026-11-20T18:00:00Z', ...over,
});
const SUMMARY = { nuevo: 2, visto: 1, en_proceso: 1, hecho: 3, descartado: 0 };

describe('Mis comentarios', () => {
    it('vacío: invita a escribir', () => {
        const onWrite = vi.fn();
        render(<MyFeedbackList items={[]} onRetract={() => {}} onWrite={onWrite} />);
        fireEvent.click(screen.getByRole('button', { name: 'Escribir un comentario' }));
        expect(onWrite).toHaveBeenCalled();
    });

    it('muestra estado, origen y la respuesta; retirar solo mientras sigue en nuevo', () => {
        const onRetract = vi.fn();
        render(<MyFeedbackList onWrite={() => {}} onRetract={onRetract} items={[
            item(),
            item({ id: 'f2', status: 'hecho', reply: 'Ya quedó en la versión de hoy', replied_at: '2026-11-20T20:00:00Z', unseen_update: true }),
            item({ id: 'f3', retracted: true }),
        ]} />);
        const cards = screen.getAllByTestId('my-feedback');
        expect(within(cards[0]).getByText('Nuevo')).toBeInTheDocument();
        expect(within(cards[0]).getByText('Agenda')).toBeInTheDocument();
        fireEvent.click(within(cards[0]).getByRole('button', { name: 'Retirar' }));
        expect(onRetract).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }));
        expect(within(cards[1]).getByText('Hecho')).toBeInTheDocument();
        expect(within(cards[1]).getByText('Novedad')).toBeInTheDocument();
        expect(within(cards[1]).getByText('Ya quedó en la versión de hoy')).toBeInTheDocument();
        expect(within(cards[1]).queryByRole('button', { name: 'Retirar' })).toBeNull();
        expect(within(cards[2]).getByText('Retirado')).toBeInTheDocument();
        expect(within(cards[2]).queryByRole('button', { name: 'Retirar' })).toBeNull();
    });
});

describe('Todos (cuenta principal)', () => {
    const base = { summary: SUMMARY, status: '' as const, kind: '' as const, order: 'desc' as const, onFilter: () => {}, onCopy: () => {} };

    it('resumen arriba, quién lo escribió y desde dónde, más nuevos primero', () => {
        render(<AllFeedbackView {...base} onReview={async () => true} items={[
            item({ id: 'a', is_mine: false, author_name: 'Sonia', created_at: '2026-11-19T10:00:00Z' }),
            item({ id: 'b', is_mine: false, author_name: 'Dani', author_role: 'barber', author_role_label: 'Barbero', kind: 'idea', device: 'computadora', screen_title: 'Cobro', created_at: '2026-11-20T10:00:00Z' }),
        ]} />);
        expect(screen.getByText('Nuevos').nextSibling).toHaveTextContent('2');
        expect(screen.getByText('En proceso', { selector: 'p' }).nextSibling).toHaveTextContent('1');
        expect(screen.getByText('Hechos').nextSibling).toHaveTextContent('3');
        const cards = screen.getAllByTestId('all-feedback');
        expect(cards[0]).toHaveTextContent('Dani');
        expect(cards[0]).toHaveTextContent('Barbero');
        expect(cards[0]).toHaveTextContent('Cobro');
        expect(cards[0]).toHaveTextContent('computadora');
        expect(cards[1]).toHaveTextContent('Sonia');
    });

    it('acciones rápidas: estado y respuesta (si estaba nuevo, pasa a visto al responder)', async () => {
        const onReview = vi.fn(async () => true);
        render(<AllFeedbackView {...base} onReview={onReview} items={[item({ is_mine: false, author_name: 'Sonia' })]} />);
        fireEvent.click(screen.getByRole('button', { name: 'En proceso' }));
        await waitFor(() => expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), { status: 'en_proceso' }));
        fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
        fireEvent.change(screen.getByLabelText('Respuesta para quien lo escribió'), { target: { value: 'Lo vemos la próxima semana' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar respuesta' }));
        await waitFor(() => expect(onReview).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'f1' }), { reply: 'Lo vemos la próxima semana', status: 'visto' }));
    });

    it('un retirado queda sin acciones', () => {
        render(<AllFeedbackView {...base} onReview={async () => true} items={[item({ retracted: true, author_name: 'Emi' })]} />);
        expect(screen.getByText('Retirado')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Hecho' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Responder' })).toBeNull();
    });

    it('filtros y orden avisan hacia arriba; sin resultados lo dice', () => {
        const onFilter = vi.fn();
        render(<AllFeedbackView {...base} status="hecho" onFilter={onFilter} onReview={async () => true} items={[]} />);
        expect(screen.getByText('No hay comentarios con ese filtro')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'idea' } });
        expect(onFilter).toHaveBeenCalledWith({ kind: 'idea' });
        fireEvent.click(screen.getByRole('button', { name: /más nuevos primero/ }));
        expect(onFilter).toHaveBeenCalledWith({ order: 'asc' });
        expect(screen.getByRole('button', { name: /Copiar para enviar/ })).toBeDisabled();
    });
});

describe('Pantalla /comentarios', () => {
    const route = (isOwner: boolean, mine: FeedbackItem[]) => (url: string) => {
        if (url === '/api/auth/me') return { body: { authenticated: true, user: { id: 'u', name: isOwner ? 'Alonso' : 'Dani', role: isOwner ? 'admin' : 'barber', isOwner } } };
        if (url === '/api/feedback?scope=mine') return { body: { items: mine } };
        if (url.startsWith('/api/feedback?scope=all')) return { body: { items: [item({ id: 'x', is_mine: false, author_name: 'Emi', author_role_label: 'Recepción' })], summary: SUMMARY } };
        if (url === '/api/feedback/seen') return { body: { marked: 1 } };
        return { body: {} };
    };

    it('barbero: solo «Mis comentarios», sin pestaña «Todos»; marca vistas las respuestas nuevas', async () => {
        mockFetch(route(false, [item({ unseen_update: true, reply: 'Ya quedó' })]));
        render(<ComentariosPage />);
        expect(await screen.findByText('Ya quedó')).toBeInTheDocument();
        await waitFor(() => expect(calls.some((c) => c.url === '/api/feedback/seen' && c.init?.method === 'POST')).toBe(true));
        expect(screen.queryByRole('tab', { name: 'Todos' })).toBeNull();
        expect(calls.some((c) => c.url.includes('scope=all'))).toBe(false);
    });

    it('cuenta principal: pestaña «Todos» con filtros que viajan a la API y copia para enviar', async () => {
        mockFetch(route(true, []));
        const writeText = vi.fn(async () => {});
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        render(<ComentariosPage />);
        fireEvent.click(await screen.findByRole('tab', { name: 'Todos' }));
        expect(await screen.findByText('Emi')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'nuevo' } });
        await waitFor(() => expect(calls.some((c) => c.url === '/api/feedback?scope=all&status=nuevo')).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: /Copiar para enviar/ }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        const text = (writeText.mock.calls[0] as unknown as [string])[0];
        expect(text).toContain('Comentarios de BarberOS (Nuevo, todos los tipos)');
        expect(text).toContain('[Algo no funciona · Nuevo] Agenda (/citas), celular');
        expect(text).toContain('Emi, Recepción');
    });
});
