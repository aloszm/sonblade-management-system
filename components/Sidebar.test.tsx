import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Sidebar from './Sidebar';

function mockMe(user: { name: string; role: 'admin' | 'recepcion' | 'barber'; isOwner?: boolean; title: string }) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ authenticated: true, user: { id: 'u1', ...user } }) })));
}

afterEach(() => vi.unstubAllGlobals());

describe('Menú lateral', () => {
    it('el dueño ve todo, incluida la configuración', async () => {
        mockMe({ name: 'Alonso', role: 'admin', isOwner: true, title: 'Dueño' });
        render(<Sidebar isOpen={true} />);
        for (const label of ['Panel', 'Cobro', 'Caja', 'Agenda', 'Clientes', 'Pago semanal', 'Ventas', 'Inventario', 'Equipo', 'Bitácora', 'Configuración']) {
            expect(await screen.findByRole('link', { name: label })).toBeInTheDocument();
        }
        expect(screen.getByText('Dueño')).toBeInTheDocument();
    });

    it('la gerente no ve la configuración del negocio', async () => {
        mockMe({ name: 'Sonia', role: 'admin', isOwner: false, title: 'Gerente' });
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByRole('link', { name: 'Panel' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    });

    it('recepción ve solo lo de mostrador', async () => {
        mockMe({ name: 'Dago', role: 'recepcion', title: 'Recepción' });
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByRole('link', { name: 'Cobro' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Panel' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Equipo' })).not.toBeInTheDocument();
    });

    it('un barbero ve su semana, clientes y recibos', async () => {
        mockMe({ name: 'Deya', role: 'barber', title: 'Barbero' });
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByRole('link', { name: 'Mi semana' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Cobro' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();
    });

    it('no renderiza nada cuando está cerrado', () => {
        const { container } = render(<Sidebar isOpen={false} />);
        expect(container.innerHTML).toBe('');
    });
});
