import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ClientsPage from './page';

const CLIENTS = [
    { id: 'c1', name: 'Marco Pérez', client_number: 'C-0001', phone: '5512345678', email: null, created_at: '2026-11-01T12:00:00Z', visits: 2, points: 10, last_visit_at: null },
];

function mockSession(role: 'admin' | 'recepcion' | 'barber', readOnly = false) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).includes('/api/auth/me') ? { authenticated: true, user: { id: 'u1', role, readOnly } } : CLIENTS),
    })));
}

afterEach(() => vi.unstubAllGlobals());

describe('Clientes por puesto', () => {
    it('el barbero registra clientes nuevos pero no ve editar ni eliminar', async () => {
        mockSession('barber');
        render(<ClientsPage />);
        expect(await screen.findByText('Marco Pérez')).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /Registrar cliente/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Editar a/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Eliminar a/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument();
    });

    it('recepción y gerencia siguen viendo editar, y nadie ve eliminar', async () => {
        for (const role of ['recepcion', 'admin'] as const) {
            mockSession(role);
            const { unmount } = render(<ClientsPage />);
            expect(await screen.findByRole('button', { name: 'Editar a Marco Pérez' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Eliminar a/ })).not.toBeInTheDocument();
            expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument();
            unmount();
        }
    });

    it('la cuenta de consulta ve la cartera sin registrar, editar ni eliminar', async () => {
        mockSession('admin', true);
        render(<ClientsPage />);
        expect(await screen.findByText('Marco Pérez')).toBeInTheDocument();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(screen.queryByRole('button', { name: /Registrar cliente/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Editar a/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Acciones' })).not.toBeInTheDocument();
    });
});

describe('Clientes: fallo de carga', () => {
    it('un fallo de red no se ve como "sin clientes": muestra el error en español y reintenta', async () => {
        let attempt = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            if (String(url).includes('/api/auth/me')) return { ok: true, json: async () => ({ authenticated: true, user: { id: 'u1', role: 'admin' } }) };
            attempt += 1;
            if (attempt === 1) throw new TypeError('Failed to fetch');
            return { ok: true, json: async () => CLIENTS };
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
