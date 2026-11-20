import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ReciboPage from './page';
import { stubFetch } from '@/components/payroll/test-utils';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }) }));

const RECEIPT = {
    receipt_number: 'REC-0007', status: 'paid',
    business: { name: 'Gallo 4:20', currency: 'MXN', timezone: 'America/Mexico_City' },
    branch: { name: 'Centro', address: null, phone: null },
    employee: { id: 'b1', display_name: 'Deya' },
    period_start: '2026-11-08', period_end: '2026-11-14', window_start: '2026-11-08T02:00:00Z', window_end: '2026-11-15T02:00:00Z',
    paid_at: '2026-11-15T03:00:00Z', paid_by_name: 'Alonso',
    total_amount: 1000, gross_commission: 1000, deductions: 0,
    payments: [{ method: 'cash', amount: 1000, reference: null }],
    commission_lines: [], adjustment_lines: [],
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Recibo', () => {
    it('un recibo anterior (sin campos nuevos) se ve como siempre: comisiones, propinas y total pagado', async () => {
        stubFetch(() => ({ body: { ...RECEIPT, tips_total: 50, total_amount: 1050 } }));
        render(<ReciboPage />);
        const bd = await screen.findByTestId('pay-breakdown');
        expect(within(bd).getByTestId('line-commission')).toHaveTextContent('+ $1,000.00');
        expect(within(bd).getByTestId('line-tips')).toHaveTextContent('+ $50.00');
        expect(within(bd).getByTestId('breakdown-net')).toHaveTextContent('$1,050.00');
        expect(within(bd).queryByTestId('line-bonus')).toBeNull();
        expect(screen.queryByTestId('breakdown-negative')).toBeNull();
    });

    it('con el libro del empleado: todo el desglose a la vista (sin pestañas cerradas) para imprimir', async () => {
        stubFetch(() => ({ body: {
            ...RECEIPT, total_amount: 700, advances: 200, loan_payments: 100, staff_deductions: 0, bonuses: 0, carryover_in: 0, net_amount: 700,
            ledger_lines: [{ entry_id: 'a', entry_type: 'advance', amount: 200, reason: 'Adelanto para la renta' }, { entry_id: 'p', entry_type: 'loan_payment', amount: 100, reason: 'Abono semanal' }],
        } }));
        render(<ReciboPage />);
        const bd = await screen.findByTestId('pay-breakdown');
        expect(within(bd).getByTestId('line-advance')).toHaveTextContent('− $200.00');
        expect(within(bd).getByText('Adelanto para la renta')).toBeVisible();
        expect(within(bd).queryByRole('button')).toBeNull();
        expect(within(bd).getByTestId('breakdown-net')).toHaveTextContent('$700.00');
        expect(within(bd).queryByTestId('line-bonus')).toBeNull();
    });

    it('neto negativo: se pagó $0 y dice "Queda pendiente para la próxima semana: $X"', async () => {
        stubFetch(() => ({ body: {
            ...RECEIPT, total_amount: 0, gross_commission: 200, advances: 500, net_amount: -300, carryover_out: 300, payments: [],
            carryover_next: { amount: 300, week_start: '2026-11-15', reason: 'Saldo de la semana anterior' },
        } }));
        render(<ReciboPage />);
        expect(await screen.findByTestId('breakdown-negative')).toHaveTextContent('Queda pendiente para la próxima semana: $300.00');
        expect(screen.getByTestId('breakdown-net')).toHaveTextContent('$0.00');
        expect(screen.getByText(/Sin pago en efectivo ni transferencia/)).toBeInTheDocument();
    });

    it('con un bono cobrado muestra la línea de bonos y su meta', async () => {
        stubFetch(() => ({ body: {
            ...RECEIPT, total_amount: 1300, bonuses: 300, net_amount: 1300,
            ledger_lines: [{ entry_id: 'b', entry_type: 'bonus', amount: 300, goal_name: 'Meta 25', details: { threshold: 25, value: 27 } }],
        } }));
        render(<ReciboPage />);
        const bonus = await screen.findByTestId('line-bonus');
        expect(bonus).toHaveTextContent('+ $300.00');
        expect(within(bonus).getByText('Meta 25: 27 de 25')).toBeVisible();
    });
});
