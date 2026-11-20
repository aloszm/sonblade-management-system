import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Sidebar from './Sidebar';

function mockMe(user: { name: string; role: 'admin' | 'recepcion' | 'barber'; isOwner?: boolean; title: string; readOnly?: boolean; mustChangePin?: boolean }) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ authenticated: true, user: { id: 'u1', ...user } }) })));
}

afterEach(() => vi.unstubAllGlobals());

describe('Menú lateral', () => {
    it('el dueño ve todo, incluida la configuración', async () => {
        mockMe({ name: 'Alonso', role: 'admin', isOwner: true, title: 'Gerente' });
        render(<Sidebar isOpen={true} />);
        for (const label of ['Panel', 'Cobro', 'Caja', 'Agenda', 'Clientes', 'Pago semanal', 'Ventas', 'Inventario', 'Equipo', 'Bitácora', 'Configuración']) {
            expect(await screen.findByRole('link', { name: label })).toBeInTheDocument();
        }
        expect(screen.getByText('Gerente')).toBeInTheDocument();
        expect(screen.queryByText('Dueño')).not.toBeInTheDocument();
    });

    it('la gerente no ve la configuración del negocio', async () => {
        mockMe({ name: 'Sonia', role: 'admin', isOwner: false, title: 'Gerente' });
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByRole('link', { name: 'Panel' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    });

    it('la cuenta de consulta ve lo mismo que gerencia, sin Cobro, Mi semana ni Configuración', async () => {
        mockMe({ name: 'Lucía', role: 'admin', isOwner: false, title: 'Consulta', readOnly: true });
        render(<Sidebar isOpen={true} />);
        for (const label of ['Panel', 'Caja', 'Barberos hoy', 'Agenda', 'Clientes', 'Pago semanal', 'Ventas', 'Cuadre', 'Finanzas', 'Gastos', 'Inventario', 'Servicios', 'Equipo', 'Reportes', 'Bitácora']) {
            expect(await screen.findByRole('link', { name: label })).toBeInTheDocument();
        }
        for (const label of ['Cobro', 'Mi semana', 'Configuración']) expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
        expect(screen.getByText('Consulta')).toBeInTheDocument();
    });

    it('recepción ve solo lo de mostrador', async () => {
        mockMe({ name: 'Dago', role: 'recepcion', title: 'Recepción' });
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByRole('link', { name: 'Cobro' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Barberos hoy' })).toHaveAttribute('href', '/equipo-hoy');
        expect(screen.queryByRole('link', { name: 'Panel' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Equipo' })).not.toBeInTheDocument();
    });

    it('un barbero ve su semana, la agenda (solo lectura) y clientes; no ve recibos de pago', async () => {
        mockMe({ name: 'Deya', role: 'barber', title: 'Barbero' });
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByRole('link', { name: 'Mi semana' })).toBeInTheDocument();
        for (const label of ['Agenda', 'Clientes']) expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Pago semanal' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Cobro' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Barberos hoy' })).not.toBeInTheDocument();
    });

    it('con PIN temporal solo muestra Mi cuenta', async () => {
        mockMe({ name: 'Dago', role: 'recepcion', title: 'Recepción', mustChangePin: true });
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByRole('link', { name: 'Mi cuenta' })).toBeInTheDocument();
        expect(screen.getAllByRole('link').filter((l) => l.closest('nav'))).toHaveLength(1);
    });

    it('con título visible muestra "Gerente Barbera" sin cambiar el menú de gerencia', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ authenticated: true, user: {
            id: 'e1', name: 'Sonia', role: 'admin', isOwner: false, businessRole: 'admin', title: 'Gerente Barbera', display_title: 'Gerente Barbera',
        } }) })));
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByText('Gerente Barbera')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Panel' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    });

    it('sin título visible muestra la etiqueta del puesto', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ authenticated: true, user: {
            id: 'u1', name: 'Alonso', role: 'admin', isOwner: true, businessRole: 'owner', title: 'Gerente', display_title: null,
        } }) })));
        render(<Sidebar isOpen={true} />);
        expect(await screen.findByText('Gerente')).toBeInTheDocument();
        expect(screen.queryByText('Gerente Barbera')).not.toBeInTheDocument();
    });

    it('no renderiza nada cuando está cerrado', () => {
        const { container } = render(<Sidebar isOpen={false} />);
        expect(container.innerHTML).toBe('');
    });
});
