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

    it('la hora del pago y de cada línea usa el formato único del sistema ("9:00 p. m.", nunca "p.m." ni 24 horas)', async () => {
        stubFetch(() => ({ body: RECEIPT }));
        render(<ReciboPage />);
        await screen.findByTestId('pay-breakdown');
        expect(screen.getByText(/Pagado:/)).toHaveTextContent('Pagado: sáb 14 nov 2026, 9:00 p. m.');
        expect(document.body.textContent).not.toMatch(/\b[ap]\.m\./i);
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

    it('un recibo de recepción con sueldo: "Sueldo: 5 días × $320 = $1,600" y cada día a la vista para imprimir (faltas incluidas)', async () => {
        const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((date) => ({ date, status: date === '2026-11-11' ? 'absent' : 'worked', rate: 320, amount: date === '2026-11-11' ? 0 : 320, reason: date === '2026-11-11' ? 'Avisó que estaba enfermo' : null }));
        stubFetch(() => ({ body: {
            ...RECEIPT, employee: { id: 'e-dago', display_name: 'Dago' }, total_amount: 1320, gross_commission: 40, payments: [{ method: 'cash', amount: 1320, reference: null }],
            wages: 1280, net_amount: 1320,
            wage: { amount: 1280, paid_days: 4, groups: [{ rate: 320, days: 4, amount: 1280 }], days, summary: '4 días × $320 = $1,280' },
        } }));
        render(<ReciboPage />);
        const bd = await screen.findByTestId('pay-breakdown');
        const line = within(bd).getByTestId('line-wage');
        expect(line).toHaveTextContent('Sueldo: 4 días × $320 = $1,280');
        expect(line).toHaveTextContent('+ $1,280.00');
        expect(within(line).getByText('lun 9 nov · Trabajado')).toBeVisible();
        expect(within(line).getByText('mié 11 nov · Faltó (Avisó que estaba enfermo)')).toBeVisible();
        expect(within(bd).queryByRole('button')).toBeNull();
        expect(within(bd).getByTestId('breakdown-net')).toHaveTextContent('$1,320.00');
        // El recibo de quien solo cobra sueldo no se ve como "de barbero".
        expect(screen.getByText('Persona')).toBeInTheDocument();
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
