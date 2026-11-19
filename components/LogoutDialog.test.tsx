import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Header from './Header';
import MobileNav from './MobileNav';
import Sidebar from './Sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/pos', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const calls: { url: string; method?: string }[] = [];
function mockApi(logoutOk = true) {
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method });
        if (init?.method === 'DELETE') return { ok: logoutOk, json: async () => ({}) };
        return { ok: true, json: async () => ({ authenticated: true, user: { id: 'u1', name: 'Dani Soto', role: 'admin', isOwner: true } }) };
    }));
    vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('No debe usarse window.confirm'); });
}
const logouts = () => calls.filter((c) => c.method === 'DELETE').length;

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Salir pide confirmación en los tres menús (sin window.confirm)', () => {
    it('encabezado: abre el diálogo, cancelar no cierra la sesión', async () => {
        mockApi();
        render(<Header toggleSidebar={() => undefined} />);
        fireEvent.click(await screen.findByRole('button', { name: /Dani Soto/ }));
        fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Cerrar sesión' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(logouts()).toBe(0);
    });

    it('menú lateral: confirmar cierra la sesión una sola vez aunque se toque dos veces', async () => {
        mockApi();
        Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
        render(<Sidebar isOpen />);
        fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
        const dialog = await screen.findByRole('dialog', { name: 'Cerrar sesión' });
        const salir = within(dialog).getByRole('button', { name: 'Salir' });
        fireEvent.click(salir);
        fireEvent.click(salir);
        await waitFor(() => expect(logouts()).toBe(1));
        await waitFor(() => expect(window.location.href).toBe('/login'));
    });

    it('celular: "Salir" del menú Más pide la misma confirmación', async () => {
        mockApi();
        render(<MobileNav />);
        fireEvent.click(await screen.findByRole('button', { name: /Más/ }));
        fireEvent.click(screen.getByRole('button', { name: /Salir/ }));
        expect(await screen.findByRole('dialog', { name: 'Cerrar sesión' })).toBeInTheDocument();
        expect(logouts()).toBe(0);
        fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
        await waitFor(() => expect(logouts()).toBe(1));
    });

    it('si el servidor falla, avisa en español y no sale', async () => {
        mockApi(false);
        render(<Sidebar isOpen />);
        fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salir' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudo cerrar la sesión/);
    });
});
