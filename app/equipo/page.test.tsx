import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as baseRender, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamPage from './page';

// La pantalla usa react-query (metas de bono, movimientos): igual que en la app, va dentro del proveedor.
function render(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return baseRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const BARBERS = [{ id: 'b1', name: 'Deya', status: 'active', isBarber: true, hasAccount: true }];
const ACCOUNTS = { accounts: [{ userId: 'u9', loginName: 'deya', role: 'barber', isActive: true, mustChangePin: false, employeeId: 'b1', name: 'Deya', isSelf: false, canManage: true }], assignableRoles: ['barber'], adminKeyConfigured: true };

const TEAM = { accounts: [
    { userId: 'u1', loginName: 'alonso', role: 'owner', isActive: true, mustChangePin: false, employeeId: null, name: 'Alonso', isSelf: false, canManage: true },
    { userId: 'u2', loginName: 'sonia', role: 'admin', isActive: true, mustChangePin: false, employeeId: 'b2', name: 'Sonia', isSelf: false, canManage: true },
], assignableRoles: ['barber', 'admin', 'owner'], adminKeyConfigured: true };

type Call = { url: string; method: string };
function stub(opts: { barbersFail?: boolean; team?: boolean } = {}) {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, method: init?.method ?? 'GET' });
        if (u.includes('/api/auth/me')) return { ok: true, json: async () => ({ authenticated: true, user: { role: 'admin' } }) };
        if (u.includes('/api/barbers?')) { if (opts.barbersFail) throw new TypeError('Failed to fetch'); return { ok: true, json: async () => BARBERS }; }
        if (u.includes('/api/accounts')) return { ok: true, json: async () => (opts.team ? TEAM : ACCOUNTS) };
        if (u.includes('/api/admin/summary')) return { ok: true, json: async () => ({ barberSummaries: [] }) };
        return { ok: true, json: async () => ({}) };
    }));
    return calls;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Equipo: puestos visibles', () => {
    it('Alonso y Sonia se leen "Gerente"; solo Alonso lleva la insignia "Cuenta principal"; nadie dice Dueño', async () => {
        stub({ team: true });
        render(<TeamPage />);
        const alonso = (await screen.findByText('Alonso')).closest('li')!;
        const sonia = screen.getByText('Sonia').closest('li')!;
        expect(alonso).toHaveTextContent('Gerente');
        expect(within(alonso).getByTestId('primary-account-badge')).toHaveTextContent('Cuenta principal');
        expect(sonia).toHaveTextContent('Gerente');
        expect(within(sonia).queryByTestId('primary-account-badge')).toBeNull();
        expect(document.body).not.toHaveTextContent(/Due[ñn][oa]/);
    });
});

describe('Equipo: título visible', () => {
    function stubTitle(businessRole: 'owner' | 'admin') {
        const calls: { url: string; method: string; body?: string }[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            const u = String(url);
            calls.push({ url: u, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined });
            if (u.includes('/api/auth/me')) return { ok: true, json: async () => ({ authenticated: true, user: { role: 'admin', businessRole } }) };
            if (u.includes('/api/barbers?')) return { ok: true, json: async () => [{ id: 'b2', name: 'Sonia', status: 'active', isBarber: true, hasAccount: true, displayTitle: 'Gerente Barbera' }] };
            if (u.includes('/api/accounts')) return { ok: true, json: async () => ({ ...TEAM, accounts: TEAM.accounts.map((a) => (a.userId === 'u2' ? { ...a, displayTitle: 'Gerente Barbera' } : a)) }) };
            if (u.includes('/api/admin/summary')) return { ok: true, json: async () => ({ barberSummaries: [] }) };
            return { ok: true, json: async () => ({}) };
        }));
        return calls;
    }

    it('Sonia se lee "Gerente Barbera" en su tarjeta y en Accesos; Alonso sigue "Gerente"', async () => {
        stubTitle('admin');
        render(<TeamPage />);
        expect(await screen.findByTestId('member-title')).toHaveTextContent('Gerente Barbera');
        const sonia = (await screen.findByText('sonia')).closest('li')!;
        expect(sonia).toHaveTextContent('Gerente Barbera');
        const alonso = screen.getByText('alonso').closest('li')!;
        expect(alonso).toHaveTextContent('Gerente');
        expect(alonso).not.toHaveTextContent('Barbera');
    });

    it('la cuenta principal ve el campo y lo envía al guardar', async () => {
        const calls = stubTitle('owner');
        render(<TeamPage />);
        await screen.findByTestId('member-title');
        await waitFor(() => expect(calls.some((c) => c.url.includes('/api/auth/me'))).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
        const input = await screen.findByLabelText('Título visible (opcional)');
        expect(input).toHaveValue('Gerente Barbera');
        expect(screen.getByText(/Solo cambia cómo se lee el puesto; no cambia permisos/)).toBeInTheDocument();
        fireEvent.change(input, { target: { value: 'Gerente y Barbera' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/api/barbers/b2'))).toBe(true));
        const sent = JSON.parse(calls.find((c) => c.method === 'PATCH')!.body!);
        expect(sent.display_title).toBe('Gerente y Barbera');
    });

    it('gerencia no ve el campo ni envía el título', async () => {
        const calls = stubTitle('admin');
        render(<TeamPage />);
        await screen.findByTestId('member-title');
        fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
        await screen.findByRole('dialog', { name: 'Editar persona' });
        expect(screen.queryByLabelText('Título visible (opcional)')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
        await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
        expect(JSON.parse(calls.find((c) => c.method === 'PATCH')!.body!)).not.toHaveProperty('display_title');
    });
});

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

describe('Equipo: horario de recepción', () => {
    it('recepción también tiene botón Horario y al guardar se envía su horario', async () => {
        const calls: { url: string; method: string; body?: string }[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            const u = String(url);
            calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body as string | undefined });
            if (u.includes('/api/auth/me')) return { ok: true, json: async () => ({ authenticated: true, user: { role: 'owner' } }) };
            if (u.includes('/api/barbers?')) return { ok: true, json: async () => [{ id: 'r1', name: 'Emi', status: 'active', isBarber: false, hasAccount: true }] };
            if (u.includes('/api/accounts')) return { ok: true, json: async () => ACCOUNTS };
            if (u.includes('/api/schedule')) return { ok: true, json: async () => ({ timezone: 'America/Mexico_City', hours: null, barbers: {} }) };
            return { ok: true, json: async () => ({}) };
        }));
        render(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Horario de Emi' }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).not.toHaveTextContent('La agenda no acepta citas');
        fireEvent.change(await within(dialog).findByLabelText('Domingo: tipo de horario'), { target: { value: 'off' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar horario' }));
        await waitFor(() => expect(calls.some((c) => c.url === '/api/barbers/r1/schedule' && c.method === 'PUT')).toBe(true));
        const put = calls.find((c) => c.method === 'PUT')!;
        expect(JSON.parse(put.body!).days[0]).toEqual({ weekday: 0, off: true });
    });
});
