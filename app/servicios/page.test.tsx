import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ServicesPage from './page';

const SERVICES = [{ id: 's1', name: 'Corte clásico', price: 150, duration_minutes: 30, is_active: true, category: 'cortes', sort_order: 0 }];

type Handler = (url: string, init?: RequestInit) => Promise<Partial<Response>>;
function stub(handler: Handler) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ authenticated: true, user: { role: 'admin' } }) };
        return handler(String(url), init);
    }));
}

afterEach(() => vi.unstubAllGlobals());

describe('Servicios: errores y guardado', () => {
    it('si la carga falla no dice "no hay servicios": muestra el error en español y reintenta', async () => {
        let attempt = 0;
        stub(async () => {
            attempt += 1;
            if (attempt === 1) throw new TypeError('Failed to fetch');
            return { ok: true, json: async () => SERVICES };
        });
        render(<ServicesPage />);
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/no hay conexión/i);
        expect(screen.queryByText(/Failed to fetch/)).toBeNull();
        expect(screen.queryByText(/No se encontraron servicios/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByText('Corte clásico')).toBeInTheDocument();
    });

    it('error del servidor al cargar: mensaje de servidor, no texto crudo', async () => {
        stub(async () => ({ ok: false, status: 500, json: async () => ({ error: 'duplicate key value violates' }) }));
        render(<ServicesPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent(/problema en el servidor/i);
    });

    it('guardar un servicio nuevo no se duplica con doble clic', async () => {
        let posts = 0;
        let release: () => void = () => undefined;
        const gate = new Promise<void>((r) => { release = r; });
        stub(async (url, init) => {
            if (init?.method === 'POST') { posts += 1; await gate; return { ok: true, json: async () => ({}) }; }
            return { ok: true, json: async () => SERVICES };
        });
        render(<ServicesPage />);
        await screen.findByText('Corte clásico');
        fireEvent.click(screen.getByRole('button', { name: /Nuevo servicio/ }));
        fireEvent.change(screen.getByLabelText('Nombre del servicio'), { target: { value: 'Barba' } });
        const save = screen.getByRole('button', { name: 'Guardar servicio' });
        fireEvent.click(save);
        fireEvent.click(save);
        await waitFor(() => expect(save).toBeDisabled());
        expect(posts).toBe(1);
        release();
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar servicio' })).toBeNull());
    });

    it('si guardar falla muestra el motivo en español y permite reintentar', async () => {
        stub(async (url, init) => {
            if (init?.method === 'POST') throw new TypeError('Failed to fetch');
            return { ok: true, json: async () => SERVICES };
        });
        render(<ServicesPage />);
        await screen.findByText('Corte clásico');
        fireEvent.click(screen.getByRole('button', { name: /Nuevo servicio/ }));
        fireEvent.change(screen.getByLabelText('Nombre del servicio'), { target: { value: 'Barba' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar servicio' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/no hay conexión/i);
        expect(screen.getByRole('button', { name: 'Guardar servicio' })).toBeEnabled();
    });
});
