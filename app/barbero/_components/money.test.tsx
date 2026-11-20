import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { MyMoneySections } from './money';
import { ENTRY, LEDGER, renderWithClient, stubFetch, type Call, type Reply } from '@/components/payroll/test-utils';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const OWN_LEDGER = {
    ...LEDGER, employee_id: 'b1', can_edit: false,
    entries: [ENTRY, { ...ENTRY, id: 'e2', entry_type: 'deduction', label: 'Descuento', paid_from: null, amount: 60, receipt_effect: -60, reason: 'Pomada', can_cancel: false, is_pending: true }],
    pending: { count: 2, receipt_effect: -260, advances: 200, deductions: 60, loan_payments: 0, carryover: 40 },
};
const PROGRESS = {
    enabled: true, period_start: '2026-11-15',
    people: [{ employee_id: 'b1', name: 'Deya', goals: [{ goal_id: 'g1', name: 'Meta 25', metric: 'services_count', value: 18, threshold: 25, achieved: false, remaining: 7, bonus_amount: 300 }] }],
};

function mount(ledger: unknown, progress: unknown, extra: (c: Call) => Reply | undefined = () => undefined) {
    const calls = stubFetch((c) => {
        const custom = extra(c);
        if (custom) return custom;
        if (c.url.startsWith('/api/employee-ledger')) return { body: ledger };
        if (c.url.startsWith('/api/bonus-goals/progress')) return { body: progress };
        return undefined;
    });
    renderWithClient(<MyMoneySections employeeId="b1" mine name="Deya" showProgress />);
    return calls;
}

describe('Mi semana: dinero', () => {
    it('muestra lo que se descontará en el próximo recibo, su historial y ningún botón de registrar o cancelar', async () => {
        mount(OWN_LEDGER, { enabled: false, people: [] });
        const card = await screen.findByTestId('my-pending');
        expect(card).toHaveTextContent('Lo que se descontará en tu próximo recibo');
        expect(card).toHaveTextContent('Adelantos');
        expect(card).toHaveTextContent('− $200.00');
        expect(card).toHaveTextContent('Descuentos');
        expect(card).toHaveTextContent('Pendiente de la semana anterior');
        const ledger = await screen.findByTestId('my-ledger');
        expect(within(ledger).getAllByRole('listitem')).toHaveLength(2);
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('sin nada pendiente no dibuja la tarjeta', async () => {
        mount({ ...OWN_LEDGER, entries: [], pending: { count: 0, receipt_effect: 0, advances: 0, deductions: 0, loan_payments: 0, carryover: 0 } }, { enabled: false, people: [] });
        await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
        expect(screen.queryByTestId('my-pending')).toBeNull();
        expect(screen.queryByTestId('my-ledger')).toBeNull();
    });

    it('con metas activas muestra su avance con una barra accesible', async () => {
        mount(OWN_LEDGER, PROGRESS);
        const goal = await screen.findByTestId('goal-progress');
        expect(goal).toHaveTextContent('Llevas 18 de 25 servicios; te faltan 7 servicios para el bono de $300.00.');
        const bar = within(goal).getByRole('progressbar', { name: 'Avance hacia Meta 25' });
        expect(bar).toHaveAttribute('aria-valuenow', '18');
        expect(bar).toHaveAttribute('aria-valuemax', '25');
        expect(bar).toHaveAttribute('aria-valuetext', '18 de 25 servicios');
    });

    it('sin metas activas (enabled falso) no se muestra nada de bonos', async () => {
        mount(OWN_LEDGER, { enabled: false, period_start: '2026-11-15', people: [] });
        await screen.findByTestId('my-pending');
        expect(screen.queryByTestId('my-goals')).toBeNull();
        expect(document.body.textContent).not.toMatch(/\bbonos?\b/i);
    });

    it('meta lograda: lo dice y la barra queda llena', async () => {
        const done = { ...PROGRESS, people: [{ ...PROGRESS.people[0], goals: [{ ...PROGRESS.people[0].goals[0], value: 27, achieved: true, remaining: 0 }] }] };
        mount(OWN_LEDGER, done);
        const goal = await screen.findByTestId('goal-progress');
        expect(goal).toHaveTextContent('¡Meta lograda!');
        expect(within(goal).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    });

    it('pide solo lo de la persona en pantalla', async () => {
        const calls = mount(OWN_LEDGER, PROGRESS);
        await screen.findByTestId('my-pending');
        expect(calls.some((c) => c.url === '/api/employee-ledger?employee_id=b1')).toBe(true);
        expect(calls.some((c) => c.url === '/api/bonus-goals/progress?employee_id=b1')).toBe(true);
    });
});
