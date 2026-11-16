import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MobileNav from './MobileNav';

function mockMe(role: 'admin' | 'recepcion' | 'barber') {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ authenticated: true, user: { id: 'u1', name: 'Dani', role } }) })));
}

afterEach(() => vi.unstubAllGlobals());

describe('Menú inferior del celular', () => {
    it('el barbero ve Mi semana, Citas, Clientes, Recibos y Salir; no cobra ni maneja caja', async () => {
        mockMe('barber');
        render(<MobileNav />);
        expect(await screen.findByRole('link', { name: /Mi semana/ })).toBeInTheDocument();
        for (const name of [/Citas/, /Clientes/, /Recibos/]) expect(screen.getByRole('link', { name })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Cobro/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Caja/ })).not.toBeInTheDocument();
        // Cuatro accesos y Salir: caben en 390 px sin desbordar.
        expect(screen.getAllByRole('link')).toHaveLength(4);
    });

    it('recepción conserva Caja, Clientes, Citas y Recibos', async () => {
        mockMe('recepcion');
        render(<MobileNav />);
        expect(await screen.findByRole('link', { name: /Caja/ })).toBeInTheDocument();
        expect(screen.getAllByRole('link')).toHaveLength(4);
    });
});
