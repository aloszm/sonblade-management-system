import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as baseRender, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamPage from './page';

// Equipo: el sueldo por día en la tarjeta de cada persona y su ficha. Solo la cuenta principal lo cambia.
function render(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return baseRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const BARBERS = [
    { id: 'e-dago', name: 'Dago', status: 'active', isBarber: false, hasAccount: true },
    { id: 'e-deya', name: 'Deya', status: 'active', isBarber: true, hasAccount: true },
];
const RATE = {
    id: 'r1', employee_id: 'e-dago', employee_name: 'Dago', daily_amount: 320, work_days: [1, 2, 3, 4, 5], work_days_label: 'lunes a viernes',
    effective_from: '2026-11-15', reason: 'Acuerdo inicial', created_by_name: 'Alonso', created_at: '2026-11-20T15:00:00Z',
};
const wagesFor = (canEdit: boolean) => ({
    employee_id: null, today: '2026-11-20', min_effective_from: '2026-11-15', can_edit: canEdit, rates: [RATE],
    current: [{ employee_id: 'e-dago', employee_name: 'Dago', current: RATE, next: null }],
});

function stub(canEdit: boolean, wagesStatus = 200) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/api/auth/me')) return { ok: true, status: 200, json: async () => ({ authenticated: true, user: { role: 'admin', businessRole: canEdit ? 'owner' : 'admin' } }) };
        if (u.includes('/api/barbers?')) return { ok: true, status: 200, json: async () => BARBERS };
        if (u.includes('/api/accounts')) return { ok: true, status: 200, json: async () => ({ accounts: [], assignableRoles: [], adminKeyConfigured: true }) };
        if (u.includes('/api/admin/summary')) return { ok: true, status: 200, json: async () => ({ barberSummaries: [] }) };
        if (u.startsWith('/api/wages')) return { ok: wagesStatus === 200, status: wagesStatus, json: async () => (wagesStatus === 200 ? wagesFor(canEdit) : { error: 'x' }) };
        return { ok: true, status: 200, json: async () => ({}) };
    }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Equipo: sueldo por día', () => {
    it('la tarjeta de Dago dice su sueldo; la de un barbero sin sueldo no dice nada de sueldo', async () => {
        stub(true);
        render(<TeamPage />);
        expect(await screen.findByTestId('member-wage')).toHaveTextContent('Sueldo: $320 por día · lunes a viernes · desde 15 nov 2026');
        expect(screen.getAllByTestId('member-wage')).toHaveLength(1);
    });

    it('la cuenta principal abre la ficha de Dago y ve "Cambiar sueldo"', async () => {
        stub(true);
        render(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Sueldo por día de Dago' }));
        const section = await screen.findByTestId('wage-section');
        expect(await within(section).findByTestId('wage-current')).toHaveTextContent('$320 por día · lunes a viernes');
        expect(within(section).getByRole('button', { name: /Cambiar sueldo/ })).toBeInTheDocument();
    });

    it('la gerencia lo ve en solo lectura: sin botón de cambiar ni de asignar', async () => {
        stub(false);
        render(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Sueldo por día de Dago' }));
        const section = await screen.findByTestId('wage-section');
        expect(await within(section).findByTestId('wage-readonly')).toBeInTheDocument();
        expect(within(section).queryByRole('button', { name: /Cambiar sueldo|Asignar sueldo/ })).toBeNull();
    });

    it('quien no tiene sueldo: "Sin sueldo fijo: gana por comisión y propinas", y "Asignar sueldo" solo para la cuenta principal', async () => {
        stub(true);
        const { unmount } = render(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Sueldo por día de Deya' }));
        let section = await screen.findByTestId('wage-section');
        expect(await within(section).findByText('Sin sueldo fijo: gana por comisión y propinas')).toBeInTheDocument();
        expect(within(section).getByRole('button', { name: /Asignar sueldo/ })).toBeInTheDocument();
        unmount();

        vi.unstubAllGlobals();
        stub(false);
        render(<TeamPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Sueldo por día de Deya' }));
        section = await screen.findByTestId('wage-section');
        expect(await within(section).findByText('Sin sueldo fijo: gana por comisión y propinas')).toBeInTheDocument();
        expect(within(section).queryByRole('button', { name: /Asignar sueldo/ })).toBeNull();
    });

    it('si el sueldo no se puede leer, Equipo sigue funcionando y la ficha lo avisa', async () => {
        stub(true, 500);
        render(<TeamPage />);
        expect(await screen.findByText('Deya')).toBeInTheDocument();
        expect(screen.queryByTestId('member-wage')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Sueldo por día de Dago' }));
        expect(await screen.findByText('No se pudo cargar el sueldo')).toBeInTheDocument();
    });
});
