import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

    it('recepción y gerencia siguen viendo editar y eliminar', async () => {
        for (const role of ['recepcion', 'admin'] as const) {
            mockSession(role);
            const { unmount } = render(<ClientsPage />);
            expect(await screen.findByRole('button', { name: 'Editar a Marco Pérez' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Eliminar a Marco Pérez' })).toBeInTheDocument();
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
