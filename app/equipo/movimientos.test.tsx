import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import TeamPage from './page';
import { renderWithClient } from '@/components/payroll/test-utils';

const BARBERS = [{ id: 'b1', name: 'Deya', status: 'active', isBarber: true, hasAccount: true }];
const ACCOUNTS = { accounts: [{ userId: 'u9', loginName: 'deya', role: 'barber', isActive: true, mustChangePin: false, employeeId: 'b1', name: 'Deya', isSelf: false, canManage: true }], assignableRoles: ['barber'], adminKeyConfigured: true };
const GOAL = { id: 'g1', name: 'Meta 25', metric: 'services_count', threshold: 25, bonus_amount: 300, applies_to: 'all_barbers', employee_id: null, employee_name: null, valid_from: '2026-11-01', valid_to: null, is_active: true };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function stubMoney(businessRole: 'owner' | 'admin', goals: unknown[] = [GOAL]) {
    const calls: { url: string; method: string; body?: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
        const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
        if (u.includes('/api/auth/me')) return ok({ authenticated: true, user: { role: 'admin', businessRole } });
        if (u.includes('/api/barbers?')) return ok(BARBERS);
        if (u.includes('/api/accounts')) return ok(ACCOUNTS);
        if (u.includes('/api/admin/summary')) return ok({ barberSummaries: [] });
        if (u === '/api/bonus-goals' && (init?.method ?? 'GET') === 'GET') return ok({ goals, enabled: goals.some((g) => (g as { is_active: boolean }).is_active) });
        if (u === '/api/bonus-goals') return ok({ goal: GOAL }, 201);
        if (u.startsWith('/api/employee-ledger')) return ok({ employee_id: 'b1', entries: [], loans: [], pending: { count: 0, receipt_effect: 0, advances: 0, deductions: 0, loan_payments: 0, carryover: 0 }, can_edit: true });
        if (u.startsWith('/api/envelopes')) return ok({ envelopes: [], can_edit: true });
        return ok({});
    }));
    return calls;
}

describe('Equipo: metas de bono (solo cuenta principal)', () => {
    it('la gerencia que no es cuenta principal no ve el gestor ni lo pide a la API', async () => {
        const calls = stubMoney('admin');
        renderWithClient(<TeamPage />);
        await screen.findByText('Deya');
        await waitFor(() => expect(calls.some((c) => c.url.includes('/api/auth/me'))).toBe(true));
        expect(screen.queryByTestId('bonus-goals')).toBeNull();
        expect(screen.queryByRole('link', { name: 'Metas de bono' })).toBeNull();
        expect(calls.some((c) => c.url === '/api/bonus-goals')).toBe(false);
    });

    it('la cuenta principal ve sus metas y que sin metas activas no se calculan bonos', async () => {
        stubMoney('owner', [{ ...GOAL, is_active: false }]);
        renderWithClient(<TeamPage />);
        const section = await screen.findByTestId('bonus-goals');
        expect(section).toHaveTextContent('Mientras no haya metas activas no se calculan bonos');
        expect(await within(section).findByTestId('goals-state')).toHaveTextContent('No hay metas activas: los bonos están apagados.');
        expect(within(section).getByText('Apagada')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Metas de bono' })).toHaveAttribute('href', '#metas-de-bono');
    });

    it('crear una meta valida antes y envía la forma que espera la API', async () => {
        const calls = stubMoney('owner', []);
        renderWithClient(<TeamPage />);
        const section = await screen.findByTestId('bonus-goals');
        fireEvent.click(within(section).getByRole('button', { name: /Nueva meta/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Nueva meta de bono' });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Crear meta' }));
        expect(await within(dialog).findByText('El nombre de la meta lleva de 2 a 80 letras.')).toBeInTheDocument();
        expect(calls.some((c) => c.url === '/api/bonus-goals' && c.method === 'POST')).toBe(false);
        fireEvent.change(within(dialog).getByLabelText('Nombre de la meta'), { target: { value: 'Meta 25' } });
        fireEvent.change(within(dialog).getByLabelText('Meta (servicios)'), { target: { value: '25' } });
        fireEvent.change(within(dialog).getByLabelText('Bono ($)'), { target: { value: '300' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Crear meta' }));
        await waitFor(() => expect(calls.some((c) => c.url === '/api/bonus-goals' && c.method === 'POST')).toBe(true));
        expect(calls.find((c) => c.url === '/api/bonus-goals' && c.method === 'POST')!.body).toMatchObject({ name: 'Meta 25', metric: 'services_count', threshold: 25, bonus_amount: 300, applies_to: 'all_barbers', employee_id: null });
    });

    it('apagar una meta manda is_active: false', async () => {
        const calls = stubMoney('owner');
        renderWithClient(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Apagar Meta 25' }));
        await waitFor(() => expect(calls.some((c) => c.url === '/api/bonus-goals' && c.method === 'PATCH')).toBe(true));
        expect(calls.find((c) => c.method === 'PATCH' && c.url === '/api/bonus-goals')!.body).toEqual({ id: 'g1', is_active: false });
    });
});

describe('Equipo: movimientos por persona', () => {
    it('la ficha de cada persona abre sus movimientos con el formulario "Registrar" y la persona fija', async () => {
        const calls = stubMoney('admin');
        renderWithClient(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Movimientos de Deya' }));
        const panel = await screen.findByTestId('person-ledger');
        expect(await within(panel).findByRole('heading', { name: 'Movimientos de Deya' })).toBeInTheDocument();
        expect(calls.some((c) => c.url === '/api/employee-ledger?employee_id=b1')).toBe(true);
        fireEvent.click(await within(panel).findByRole('button', { name: /Registrar/ }));
        const person = within(await screen.findByTestId('ledger-form')).getByLabelText('Persona');
        expect(person).toBeDisabled();
        expect(person).toHaveValue('b1');
    });
});
