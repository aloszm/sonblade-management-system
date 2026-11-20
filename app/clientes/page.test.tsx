import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClientsPage from './page';

const CLIENTS = [
    {
        id: 'c1', name: 'Marco Pérez', full_name: 'Marco Pérez', phone: '5512345678', email: null, notes: null, preferences: null, is_active: true,
        created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z', visits: 3, last_visit_at: '2026-11-10T18:00:00Z',
        total_spent: 900, no_shows: 2, next_appointment_at: '2026-11-25T17:00:00Z', next_appointment_id: 'a1',
    },
    {
        id: 'c2', name: 'Luis Soto', full_name: 'Luis Soto', phone: null, email: null, notes: null, preferences: null, is_active: true,
        created_at: '2026-11-02T12:00:00Z', updated_at: '2026-11-02T12:00:00Z', visits: 0, last_visit_at: null,
        total_spent: null, no_shows: 0, next_appointment_at: null, next_appointment_id: null,
    },
];

type Mock = { clients?: unknown; me?: unknown; onClients?: (url: string) => void };
function mockApi({ clients = CLIENTS, me = { authenticated: true, user: { id: 'u1', role: 'recepcion', readOnly: false } }, onClients }: Mock = {}) {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/api/auth/me')) return { ok: true, status: 200, json: async () => me };
        if (init?.method === 'POST') return { ok: true, status: 201, json: async () => ({ id: 'c3' }) };
        onClients?.(u);
        return { ok: true, status: 200, json: async () => clients };
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('Clientes: lista', () => {
    it('muestra los datos reales: visitas, última visita, faltas y próxima cita; sin puntos ni número de cliente', async () => {
        mockApi();
        render(<ClientsPage />);
        expect(await screen.findByText('Marco Pérez')).toBeInTheDocument();
        const rows = screen.getAllByTestId('client-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('55 1234 5678');
        expect(rows[0]).toHaveTextContent('2 faltas');
        expect(rows[0]).not.toHaveTextContent('Nunca');
        expect(rows[0]).toHaveTextContent('3');
        // Sin teléfono ni visitas: se omite el dato y "Nunca" aparece porque la fecha es nula.
        expect(rows[1]).toHaveTextContent('Nunca');
        expect(rows[1]).not.toHaveTextContent(/falta/);
        expect(rows[1]).not.toHaveTextContent('$0');
        expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Puntos/)).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Marco Pérez/ })).toHaveAttribute('href', '/clientes/c1');
    });

    it('busca con espera y filtra por estado enviando los parámetros del contrato', async () => {
        const urls: string[] = [];
        mockApi({ onClients: (u) => urls.push(u) });
        render(<ClientsPage />);
        await screen.findByText('Marco Pérez');
        expect(urls[0]).toContain('estado=activos');
        fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar clientes' }), { target: { value: 'mar' } });
        fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar clientes' }), { target: { value: 'marco' } });
        await waitFor(() => expect(urls.some((u) => u.includes('q=marco'))).toBe(true));
        expect(urls.some((u) => u.includes('q=mar&') || u.endsWith('q=mar'))).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
        await waitFor(() => expect(urls.some((u) => u.includes('estado=inactivos'))).toBe(true));
    });

    it('estado vacío cuando no hay clientes', async () => {
        mockApi({ clients: [] });
        render(<ClientsPage />);
        expect(await screen.findByText('Todavía no hay clientes registrados')).toBeInTheDocument();
    });

    it('la barbera con la lista vacía ve que aquí aparecen quienes atienda o registre', async () => {
        mockApi({ clients: [], me: { authenticated: true, user: { id: 'u2', role: 'barbero', readOnly: false } } });
        render(<ClientsPage />);
        expect(await screen.findByText('Aquí verás a los clientes que atiendas o registres')).toBeInTheDocument();
    });

    it('la cuenta de consulta no ve el botón de registrar', async () => {
        mockApi({ me: { authenticated: true, user: { id: 'u1', role: 'admin', readOnly: true } } });
        render(<ClientsPage />);
        await screen.findByText('Marco Pérez');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(screen.queryByRole('button', { name: /Registrar cliente/ })).not.toBeInTheDocument();
    });

    it('el barbero puede registrar clientes nuevos', async () => {
        mockApi({ me: { authenticated: true, user: { id: 'u1', role: 'barber', readOnly: false } } });
        render(<ClientsPage />);
        expect(await screen.findByRole('button', { name: /Registrar cliente/ })).toBeInTheDocument();
    });
});

describe('Clientes: alta', () => {
    it('valida por campo y no envía hasta que todo es válido; no permite doble envío', async () => {
        const fn = mockApi();
        render(<ClientsPage />);
        fireEvent.click(await screen.findByRole('button', { name: /Registrar cliente/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
        expect(await screen.findByText(/Escribe el nombre del cliente/)).toBeInTheDocument();
        expect(screen.queryByText(/Escribe un teléfono/)).not.toBeInTheDocument();
        expect(fn.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
        const phone = screen.getByLabelText(/Teléfono/);
        expect(phone).toHaveAttribute('inputmode', 'tel');
        expect(phone).toHaveAttribute('autocomplete', 'tel');

        fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'Ana Ruiz' } });
        fireEvent.change(phone, { target: { value: '5511223344' } });
        fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: 'mal' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cliente' }));
        expect(await screen.findByText('El correo no es válido.')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/Correo/), { target: { value: '' } });
        const save = screen.getByRole('button', { name: 'Guardar cliente' });
        fireEvent.click(save);
        fireEvent.click(save);
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Guardar cliente' })).not.toBeInTheDocument());
        const posts = fn.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
        expect(posts).toHaveLength(1);
        expect(JSON.parse(String((posts[0][1] as RequestInit).body))).toMatchObject({ name: 'Ana Ruiz', phone: '5511223344' });
    });
});

describe('Clientes: fallo de carga', () => {
    it('un fallo de red no se ve como "sin clientes": muestra el error en español y reintenta', async () => {
        let attempt = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ authenticated: true, user: { id: 'u1', role: 'admin' } }) };
            attempt += 1;
            if (attempt === 1) throw new TypeError('Failed to fetch');
            return { ok: true, status: 200, json: async () => CLIENTS };
        }));
        render(<ClientsPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent(/no hay conexión/i);
        expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Todavía no hay clientes/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByText('Marco Pérez')).toBeInTheDocument();
    });

    it('un error del servidor se distingue del de conexión', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ authenticated: true, user: { id: 'u1', role: 'admin' } }) };
            return { ok: false, status: 500, json: async () => ({ error: 'relation "clients" does not exist' }) };
        }));
        render(<ClientsPage />);
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(/problema en el servidor/i);
        expect(alert).not.toHaveTextContent(/relation/);
    });
});
