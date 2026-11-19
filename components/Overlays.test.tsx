import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MobileNav from './MobileNav';
import Header from './Header';

afterEach(() => vi.unstubAllGlobals());

function mockMe() {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ authenticated: true, user: { id: 'u1', name: 'Dani', role: 'recepcion' } }) })));
}

describe('Hoja "Más" del celular', () => {
    it('cierra con Escape, devuelve el foco al botón y el menú inferior respeta la zona segura', async () => {
        mockMe();
        render(<MobileNav />);
        const more = await screen.findByRole('button', { name: /Más/ });
        expect(screen.getByRole('navigation', { name: 'Principal' }).className).toContain('env(safe-area-inset-bottom)');
        more.focus();
        fireEvent.click(more);
        const dialog = screen.getByRole('dialog', { name: 'Más' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog', { name: 'Más' })).not.toBeInTheDocument();
        expect(more).toHaveFocus();
    });
});

describe('Menú de usuario del encabezado', () => {
    it('Escape lo cierra y el foco vuelve al botón; Tab da la vuelta dentro del menú', async () => {
        mockMe();
        render(<Header toggleSidebar={() => {}} />);
        const trigger = await screen.findByRole('button', { name: /Dani/ });
        trigger.focus();
        fireEvent.click(trigger);
        const items = screen.getAllByRole('menuitem');
        expect(items[0]).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(items[1]).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(items[0]).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });
});
