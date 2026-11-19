import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TeamPage from './page';

const BARBERS = [{ id: 'b1', name: 'Deya', status: 'active', isBarber: true, hasAccount: true }];
const ACCOUNTS = { accounts: [{ userId: 'u9', loginName: 'deya', role: 'barber', isActive: true, mustChangePin: false, employeeId: 'b1', name: 'Deya', isSelf: false, canManage: true }], assignableRoles: ['barber'], adminKeyConfigured: true };

type Call = { url: string; method: string };
function stub(opts: { barbersFail?: boolean } = {}) {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, method: init?.method ?? 'GET' });
        if (u.includes('/api/auth/me')) return { ok: true, json: async () => ({ authenticated: true, user: { role: 'admin' } }) };
        if (u.includes('/api/barbers?')) { if (opts.barbersFail) throw new TypeError('Failed to fetch'); return { ok: true, json: async () => BARBERS }; }
        if (u.includes('/api/accounts')) return { ok: true, json: async () => ACCOUNTS };
        if (u.includes('/api/admin/summary')) return { ok: true, json: async () => ({ barberSummaries: [] }) };
        return { ok: true, json: async () => ({}) };
    }));
    return calls;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Equipo: errores, doble envío y confirmaciones', () => {
    it('si no carga el equipo muestra el error de conexión con Reintentar', async () => {
        stub({ barbersFail: true });
        render(<TeamPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent(/no hay conexión/i);
        expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    });

    it('desactivar un acceso pide confirmación propia (no window.confirm) y no llama a la API hasta confirmar', async () => {
        const calls = stub();
        const spy = vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('window.confirm'); });
        render(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: /Desactivar acceso/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Desactivar acceso' });
        expect(dialog).toHaveTextContent('¿Desactivar el acceso de Deya?');
        expect(calls.some((c) => c.url.includes('/api/accounts/u9') && c.method === 'PATCH')).toBe(false);
        fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar acceso' }));
        await waitFor(() => expect(calls.some((c) => c.url.includes('/api/accounts/u9') && c.method === 'PATCH')).toBe(true));
        expect(spy).not.toHaveBeenCalled();
    });

    it('restablecer PIN también pasa por el diálogo', async () => {
        const calls = stub();
        render(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: /Restablecer PIN/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Restablecer PIN' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
        expect(calls.some((c) => c.url.includes('reset-pin'))).toBe(false);
    });

    it('guardar una persona nueva no se duplica con doble envío', async () => {
        const calls = stub();
        render(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: /Agregar persona/ }));
        fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Nuevo' } });
        const form = screen.getByLabelText('Nombre').closest('form')!;
        fireEvent.submit(form);
        fireEvent.submit(form);
        await waitFor(() => expect(calls.filter((c) => c.url === '/api/barbers' && c.method === 'POST')).toHaveLength(1));
    });
});
