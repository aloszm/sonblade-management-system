import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import MobileNav from './MobileNav';

type U = { role: 'admin' | 'recepcion' | 'barber'; readOnly?: boolean; isOwner?: boolean; mustChangePin?: boolean };
function mockMe(user: U) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ authenticated: true, user: { id: 'u1', name: 'Dani', ...user } }) })));
}

afterEach(() => vi.unstubAllGlobals());

const bar = () => screen.getByRole('navigation', { name: 'Principal' });
const names = () => within(bar()).getAllByRole('link').map((l) => l.textContent);

describe('Menú inferior del celular', () => {
    it('el barbero ve Mi semana, Agenda, Clientes y Pago semanal; no cobra ni maneja caja', async () => {
        mockMe({ role: 'barber' });
        render(<MobileNav />);
        await screen.findByRole('link', { name: /Mi semana/ });
        expect(names()).toEqual(['Mi semana', 'Agenda', 'Clientes', 'Pago semanal']);
    });

    it('recepción: Caja, Agenda, Barberos hoy y Clientes; el resto en Más', async () => {
        mockMe({ role: 'recepcion' });
        render(<MobileNav />);
        await screen.findByRole('link', { name: /Caja/ });
        expect(names()).toEqual(['Caja', 'Agenda', 'Barberos hoy', 'Clientes']);
        fireEvent.click(screen.getByRole('button', { name: /Más/ }));
        const sheet = screen.getByRole('dialog', { name: 'Más' });
        expect(within(sheet).getByRole('link', { name: 'Cobro' })).toBeInTheDocument();
        expect(within(sheet).getByRole('link', { name: 'Pago semanal' })).toBeInTheDocument();
        expect(within(sheet).getByRole('link', { name: 'Cobro' }).className).toContain('min-h-11');
    });

    it('el dueño llega a Finanzas, y desde Más a Reportes y Gastos', async () => {
        mockMe({ role: 'admin', isOwner: true });
        render(<MobileNav />);
        await screen.findByRole('link', { name: /Panel/ });
        expect(names()).toEqual(['Panel', 'Agenda', 'Caja', 'Finanzas']);
        fireEvent.click(screen.getByRole('button', { name: /Más/ }));
        const sheet = screen.getByRole('dialog', { name: 'Más' });
        for (const l of ['Reportes', 'Gastos', 'Configuración']) expect(within(sheet).getByRole('link', { name: l })).toBeInTheDocument();
    });

    it('la consulta no ve Caja entre los atajos ni Cobro', async () => {
        mockMe({ role: 'admin', readOnly: true });
        render(<MobileNav />);
        await screen.findByRole('link', { name: /Panel/ });
        expect(names()).toEqual(['Panel', 'Agenda', 'Finanzas', 'Barberos hoy']);
        expect(screen.queryByRole('link', { name: /Cobro/ })).not.toBeInTheDocument();
    });

    it('con PIN temporal solo hay Mi cuenta y Salir', async () => {
        mockMe({ role: 'admin', isOwner: true, mustChangePin: true });
        render(<MobileNav />);
        await screen.findByRole('link', { name: /Mi cuenta/ });
        expect(names()).toEqual(['Mi cuenta']);
        expect(screen.getByRole('button', { name: /Salir/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Más/ })).not.toBeInTheDocument();
    });
});
