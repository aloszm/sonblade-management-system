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
    it('la cuenta de renglones ya no se llama "Servicios": cuenta servicios y productos con comisión y lo explica', async () => {
        // Deya: 2 servicios + 1 producto = 3 comisiones. Equipo dice "Servicios: 2" y "Productos: 1"; aquí 3 "con comisión".
        mount([{ ...BASE_ROW, entry_count: 3, gross_commission: 156, total_amount: 156 }]);
        await screen.findByRole('button', { name: 'Ver desglose de Deya' });
        expect(screen.getByRole('columnheader', { name: 'Con comisión' })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Servicios' })).toBeNull();
        expect(screen.getByTestId('entry-count-note')).toHaveTextContent('cada uno vale 1');
    });

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
        // La fila de la tabla también dice cuánto se descontó (adelantos 200 + abonos 150 + descuentos 60).
        expect(screen.getByTestId('row-discounted')).toHaveTextContent('Ya descontado: − $410.00');
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

const WAGE = {
    enabled: true, period_start: '2026-11-08', period_end: '2026-11-14', amount: 1600, paid_days: 5, worked_days: 5, absent_days: 0, extra_days: 0,
    groups: [{ rate: 320, days: 5, amount: 1600 }], summary: '5 días × $320 = $1,600',
    days: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((date) => ({ date, status: 'worked', rate: 320, amount: 320 })),
};

describe('Pago semanal: sueldo por día', () => {
    it('la fila trae la columna "Sueldo" y el desglose abre con el renglón "Sueldo: 5 días × $320 = $1,600" y su detalle día por día', async () => {
        mount([{ ...BASE_ROW, employee_id: 'b9', name: 'Dago', gross_commission: 40, total_amount: 1640, wages: 1600, wage: WAGE }]);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver desglose de Dago' }));
        expect(screen.getByTestId('row-wage')).toHaveTextContent('+ $1,600.00');
        const bd = await screen.findByTestId('pay-breakdown');
        const line = within(bd).getByTestId('line-wage');
        expect(line).toHaveTextContent('Sueldo: 5 días × $320 = $1,600');
        expect(line).toHaveTextContent('+ $1,600.00');
        fireEvent.click(within(line).getByRole('button', { name: /Sueldo/ }));
        expect(within(line).getByText('lun 9 nov · Trabajado')).toBeVisible();
        expect(within(line).getByText('vie 13 nov · Trabajado')).toBeVisible();
        expect(within(bd).getByTestId('breakdown-net')).toHaveTextContent('$1,640.00');
    });

    it('quien no tiene sueldo no ve renglón de sueldo y su columna dice "—"', async () => {
        mount([BASE_ROW]);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver desglose de Deya' }));
        expect(screen.getByTestId('row-wage')).toHaveTextContent('—');
        expect(screen.queryByTestId('line-wage')).toBeNull();
    });

    it('con la semana en curso: la sección "Sueldo por día de la semana" trae las faltas y días extra de la API', async () => {
        const calls = mount([BASE_ROW], undefined, (c) => (c.url.startsWith('/api/wages/week') ? { body: { period_start: '2026-11-08', period_end: '2026-11-14', today: '2026-11-20', can_edit: true, people: [] } } : undefined));
        expect(await screen.findByText('Nadie tiene sueldo por día en esta semana')).toBeInTheDocument();
        expect(calls.some((c) => c.url === '/api/wages/week?period_start=2026-11-08')).toBe(true);
    });

    it('se puede avanzar a la semana en curso (la que aún no cierra) pero no más allá', async () => {
        const calls = mount([BASE_ROW], undefined, (c) => {
            if (c.url.startsWith('/api/wages/week')) return { body: { period_start: '2026-11-08', period_end: '2026-11-14', today: '2026-11-20', can_edit: true, people: [] } };
            // La semana en curso (15 al 21) no es la última cerrada.
            if (c.url === '/api/settlements?period_start=2026-11-15') return { body: { ...week([{ ...BASE_ROW, reason: 'week_not_closed', can_settle: false }]), period_start: '2026-11-15', period_end: '2026-11-21', is_latest_closed: false } };
            return undefined;
        });
        const next = await screen.findByRole('button', { name: 'Semana siguiente' });
        await waitFor(() => expect(next).toBeEnabled());
        fireEvent.click(next);
        await waitFor(() => expect(calls.some((c) => c.url === '/api/settlements?period_start=2026-11-15')).toBe(true));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeDisabled());
        expect(await screen.findByText('Cierra el sábado a las 8:00 pm')).toBeInTheDocument();
    });
});

describe('Pago semanal: movimientos', () => {
    it('muestra la sección "Movimientos del equipo" y nada de bonos cuando no hay metas', async () => {
        mount([BASE_ROW]);
        expect(await screen.findByRole('heading', { name: 'Movimientos del equipo' })).toBeInTheDocument();
        expect(screen.queryByText(/\bbonos?\b/i)).toBeNull();
    });
});
