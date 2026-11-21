import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as baseRender, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TeamPage from './page';

// Equipo: la tarjeta explica la semana de cada persona y "Ver desglose" abre sus ventas una por una.
function render(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return baseRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const BARBERS = [
    { id: 'e-deya', name: 'Deya', status: 'active', isBarber: true, hasAccount: true },
    { id: 'e-dani', name: 'Dani', status: 'active', isBarber: true, hasAccount: true },
];
// Periodo de pago del jueves 19 al miércoles 25 de noviembre de 2026 (lib/payroll/pay-period.ts).
const WINDOW = { start: '2026-11-19T06:00:00Z', end: '2026-11-26T06:00:00Z', startDay: '2026-11-19', endDay: '2026-11-25' };
const kind = (count: number, revenue: number, commission: number, percent: number | null) => ({ count, revenue, commission, percent });
const DEYA = { employeeId: 'e-deya', name: 'Deya', isBarber: true, services: kind(2, 240, 120, 50), products: kind(1, 180, 36, 20), tips: 0, revenue: 420, commission: 156, earned: 156 };
const DANI = { employeeId: 'e-dani', name: 'Dani', isBarber: true, services: kind(0, 0, 0, null), products: kind(0, 0, 0, null), tips: 0, revenue: 0, commission: 0, earned: 0 };
const LINES = [
    { key: 'a', saleId: 's1', folio: 'V2611-0001', paidAt: '2026-11-19T17:00:00Z', kind: 'service', concept: 'Barba', quantity: 1, revenue: 120, base: 120, percent: 50, commission: 60, tip: 0 },
];

function stub() {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const u = String(url);
        calls.push(u);
        const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
        if (u.includes('/api/auth/me')) return ok({ authenticated: true, user: { role: 'admin', businessRole: 'admin' } });
        if (u.includes('/api/barbers?')) return ok(BARBERS);
        if (u.includes('/api/accounts')) return ok({ accounts: [], assignableRoles: [], adminKeyConfigured: true });
        if (u === '/api/team-week') return ok({ timezone: 'America/Mexico_City', window: WINDOW, people: [DEYA, DANI] });
        if (u === '/api/team-week/e-deya') return ok({ timezone: 'America/Mexico_City', window: WINDOW, summary: DEYA, lines: LINES });
        if (u.startsWith('/api/wages')) return ok({ employee_id: null, today: '2026-11-20', min_effective_from: '2026-11-15', can_edit: false, rates: [], current: [] });
        return ok({});
    }));
    return calls;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Equipo: tarjeta de la semana y desglose', () => {
    it('la tarjeta dice el periodo, servicios, producto y lo que gana; ya no dice "cortes"', async () => {
        stub();
        render(<TeamPage />);
        const summaries = await screen.findAllByTestId('week-summary');
        const deya = summaries[0];
        expect(within(deya).getByTestId('week-caption')).toHaveTextContent('Esta semana · jueves 19 al miércoles 25 de noviembre');
        expect(within(deya).getByTestId('week-services')).toHaveTextContent('Servicios: 2 · $240 → comisión 50 % = $120');
        expect(within(deya).getByTestId('week-products')).toHaveTextContent('Productos: 1 · $180 → comisión 20 % = $36');
        expect(within(deya).getByTestId('week-total')).toHaveTextContent('Ventas: $420Gana: $156');
        expect(within(summaries[1]).getByTestId('week-empty')).toHaveTextContent('Sin ventas esta semana.');
        expect(screen.queryByText(/cortes/i)).toBeNull();
    });

    it('"Ver desglose" abre una ventana con las ventas de esa persona; el perfil sigue a un toque', async () => {
        const calls = stub();
        render(<TeamPage />);
        await screen.findAllByTestId('week-summary');
        fireEvent.click(screen.getByRole('button', { name: 'Ver desglose de la semana de Deya' }));
        const dialog = await screen.findByRole('dialog', { name: 'Desglose de la semana' });
        expect(await within(dialog).findByTestId('week-line')).toHaveTextContent('Barba');
        expect(within(dialog).getByRole('link', { name: /Ver venta/ })).toHaveAttribute('href', '/ticket/s1');
        expect(within(dialog).getByTestId('totals-revenue')).toHaveTextContent('Ventas: $420');
        expect(within(dialog).getByRole('link', { name: 'Ver perfil completo de Deya' })).toHaveAttribute('href', '/barberos/e-deya');
        expect(calls).toContain('/api/team-week/e-deya');
        expect(screen.getByRole('link', { name: 'Ver perfil de Dani' })).toHaveAttribute('href', '/barberos/e-dani');
    });
});
