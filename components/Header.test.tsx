import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from './Header';

vi.mock('next/navigation', () => ({ usePathname: () => '/pos' }));

function mockMe(role: 'admin' | 'recepcion' | 'barber') {
    vi.stubGlobal('fetch', vi.fn(async () => ({
        json: async () => ({ authenticated: true, user: { name: 'Dago', role } }),
    })));
}

afterEach(() => vi.unstubAllGlobals());

describe('Header', () => {
    const mockToggle = vi.fn();

    it('muestra el título de la página en español', async () => {
        mockMe('recepcion');
        render(<Header toggleSidebar={mockToggle} />);
        expect(await screen.findByText('Punto de Venta')).toBeInTheDocument();
    });

    it('recepción ve "Nueva Cita" y lleva a la agenda', async () => {
        mockMe('recepcion');
        render(<Header toggleSidebar={mockToggle} />);
        const link = await screen.findByRole('link', { name: /Nueva Cita/ });
        expect(link).toHaveAttribute('href', '/citas?nueva=1');
    });

    it('un barbero no ve "Nueva Cita" porque no puede agendar', async () => {
        mockMe('barber');
        render(<Header toggleSidebar={mockToggle} />);
        expect(await screen.findByText('Dago')).toBeInTheDocument();
        expect(screen.queryByText('Nueva Cita')).not.toBeInTheDocument();
    });

    it('no ofrece controles de adorno sin función (buscador, notificaciones)', () => {
        mockMe('admin');
        render(<Header toggleSidebar={mockToggle} />);
        expect(screen.queryByPlaceholderText(/Buscar/)).not.toBeInTheDocument();
    });
});
