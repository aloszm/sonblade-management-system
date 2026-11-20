import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import LiquidacionesPage from './page';
import { ENVELOPES, LEDGER, renderWithClient, stubFetch, type Call, type Reply } from '@/components/payroll/test-utils';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const BASE_ROW = {
    employee_id: 'b1', name: 'Deya', gross_commission: 1000, deductions: 0, tips: 0, total_amount: 1000, entry_count: 12,
    can_settle: true, reason: null, settlement_id: null, receipt_number: null,
};
const week = (rows: unknown[]) => ({ period_start: '2026-11-08', period_end: '2026-11-14', timezone: 'America/Mexico_City', is_latest_closed: true, rows });

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function mount(rows: unknown[], me: Record<string, unknown> = { role: 'admin', businessRole: 'owner' }, extra: (c: Call) => Reply | undefined = () => undefined) {
    const calls = stubFetch((c) => {
        const custom = extra(c);
        if (custom) return custom;
        if (c.url.includes('/api/auth/me')) return { body: { authenticated: true, user: me } };
        if (c.url.startsWith('/api/settlements/history')) return { body: [] };
        if (c.url.startsWith('/api/settlements')) return { body: week(rows) };
        if (c.url.startsWith('/api/employee-ledger')) return { body: LEDGER };
        if (c.url.startsWith('/api/envelopes')) return { body: ENVELOPES };
        return undefined;
    });
    renderWithClient(<LiquidacionesPage />);
    return calls;
}

describe('Pago semanal: desglose', () => {
    it('sin los campos nuevos funciona igual: comisiones y neto, sin bonos ni avisos', async () => {
        mount([{ ...BASE_ROW, tips: 50, total_amount: 1050 }]);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver desglose de Deya' }));
        const bd = await screen.findByTestId('pay-breakdown');
        expect(within(bd).getByTestId('line-commission')).toHaveTextContent('+ $1,000.00');
        expect(within(bd).getByTestId('line-tips')).toHaveTextContent('+ $50.00');
        expect(within(bd).getByTestId('breakdown-net')).toHaveTextContent('$1,050.00');
        expect(within(bd).queryByTestId('line-bonus')).toBeNull();
        expect(within(bd).queryByTestId('breakdown-negative')).toBeNull();
    });

    it('con los campos nuevos: cada renglón se expande y muestra sus asientos', async () => {
        mount([{
            ...BASE_ROW, deductions: 40, tips: 100, bonuses: 300, advances: 200, loan_payments: 150, staff_deductions: 60, carryover_in: 0,
            net_amount: 950, total_amount: 950, bonus_goals_enabled: true,
            bonus_lines: [{ name: 'Meta 25', metric: 'services_count', threshold: 25, value: 27, amount: 300 }],
            ledger_lines: [{ entry_id: 'a', entry_type: 'advance', amount: 200, reason: 'Adelanto para la renta' }],
        }]);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver desglose de Deya' }));
        const bd = await screen.findByTestId('pay-breakdown');
        for (const key of ['commission', 'tips', 'bonus', 'advance', 'loan', 'deduction', 'adjustment']) expect(within(bd).getByTestId(`line-${key}`)).toBeInTheDocument();
        const advance = within(bd).getByTestId('line-advance');
        expect(advance).toHaveTextContent('− $200.00');
        expect(within(advance).getByText('Adelanto para la renta')).not.toBeVisible();
        fireEvent.click(within(advance).getByRole('button', { name: /Adelantos/ }));
        expect(within(advance).getByText('Adelanto para la renta')).toBeVisible();
        fireEvent.click(within(within(bd).getByTestId('line-bonus')).getByRole('button', { name: /Bonos por metas/ }));
        expect(within(bd).getByText('Meta 25: 27 de 25 servicios')).toBeVisible();
        expect(within(bd).getByTestId('breakdown-net')).toHaveTextContent('$950.00');
    });

    it('neto negativo: "Se paga $0. Quedan $X pendientes para la próxima semana."', async () => {
        mount([{ ...BASE_ROW, gross_commission: 200, total_amount: 0, advances: 500, net_amount: -300, carryover_out: 300 }]);
        expect(await screen.findByText('Pendiente: $300.00')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ver desglose de Deya' }));
        expect(await screen.findByTestId('breakdown-negative')).toHaveTextContent('Se paga $0. Quedan $300.00 pendientes para la próxima semana.');
        expect(screen.getByTestId('breakdown-net')).toHaveTextContent('-$300.00');
    });

    it('avisa de un préstamo cuyo abono no cupo esta semana', async () => {
        mount([{ ...BASE_ROW, loans_waiting: [{ loan_id: 'l1', scheduled: 250, charged: 0, outstanding: 1000 }] }]);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver desglose de Deya' }));
        expect(await screen.findByTestId('loan-waiting')).toHaveTextContent('no cupo completo');
    });

    it('sin metas activas no aparece nada de bonos en la pantalla', async () => {
        mount([{ ...BASE_ROW, bonuses: 0, bonus_goals_enabled: false, net_amount: 1000 }]);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver desglose de Deya' }));
        await screen.findByTestId('pay-breakdown');
        expect(screen.queryByText(/\bbonos?\b/i)).toBeNull();
    });

    it('el pago se confirma como antes: efectivo + transferencia = total, sin tocar el contrato de POST /api/settlements', async () => {
        const calls = mount([{ ...BASE_ROW }], undefined, (c) => (c.url === '/api/settlements' && c.method === 'POST' ? { status: 201, body: { settlement_id: 's1' } } : undefined));
        fireEvent.click(await screen.findByRole('button', { name: /Pagar/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Registrar pago y generar recibo/ }));
        await waitFor(() => expect(calls.find((c) => c.method === 'POST')).toBeTruthy());
        expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ employee_id: 'b1', period_start: '2026-11-08', payments: [{ method: 'cash', amount: 1000 }] });
    });
});

describe('Pago semanal: movimientos', () => {
    it('muestra la sección "Movimientos del equipo" y nada de bonos cuando no hay metas', async () => {
        mount([BASE_ROW]);
        expect(await screen.findByRole('heading', { name: 'Movimientos del equipo' })).toBeInTheDocument();
        expect(screen.queryByText(/\bbonos?\b/i)).toBeNull();
    });
});
