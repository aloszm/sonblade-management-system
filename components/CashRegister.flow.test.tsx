import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CashRegister from './CashRegister';
import { buildCashFlow, type CashFlowPayload } from '@/lib/cash/cash-flow';
import type { CashMovementRow, CashSessionRow } from '@/lib/cash/session-view';

// «¿Cuánto efectivo hay y por qué?» con la caja abierta y «Ver el efectivo» en los cierres anteriores.
const TZ = 'America/Mexico_City';
const openRow: CashSessionRow = { id: 'open-1', status: 'open', opening_cash: 500, counted_cash: null, difference_amount: null, opened_by: 'u1', opened_at: '2026-11-21T15:00:00Z', closed_at: null };
const closedRow: CashSessionRow = {
    id: 'closed-1', status: 'closed', opening_cash: 500, counted_cash: 970, difference_amount: -30, expected_cash: 1000, opened_by: 'u1', opened_at: '2026-11-20T15:00:00Z',
    closed_at: '2026-11-21T01:00:00Z', closed_by: 'u2', float_left: 500, reserve_amount: 400, withdrawn_amount: 70,
};
const moves: CashMovementRow[] = [
    { id: 'm1', cash_session_id: 'open-1', amount: 900, method: 'cash', movement_type: 'sale_payment', direction: 'in', sale_id: 'a', created_at: '2026-11-21T16:00:00Z' },
    { id: 'm2', cash_session_id: 'open-1', amount: 50, method: 'cash', movement_type: 'expense', direction: 'out', expense_id: 'g', description: 'Agua', created_at: '2026-11-21T17:00:00Z' },
];
const targets = { floatTarget: 500, reserveAmount: 600, reserveLabel: 'Renta y gastos' };
const names = new Map([['u1', 'Emi'], ['u2', 'Dago']]);

const sessionView = {
    id: 'open-1', opened_by: 'Emi', initial_amount: 500, total_sales: 900, total_tips: 0, total_expenses: 50, total_cash: 900, total_card: 0, total_transfer: 0,
    physical_count: null, difference: null, status: 'open', opened_at: '2026-11-21T15:00:00Z', closed_at: null, expected_cash: 1350,
};
const history = [{ ...sessionView, id: 'closed-1', status: 'closed', physical_count: 970, difference: -30, closed_at: '2026-11-21T01:00:00Z', closed_by: 'Dago', float_left: 500, reserve_amount: 400, withdrawn_amount: 70 }];

const calls: string[] = [];
beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        calls.push(url);
        const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
        if (url.startsWith('/api/cash/session')) return ok(sessionView);
        if (url.startsWith('/api/cash/movements')) return ok(moves.map((m) => ({ ...m, payment_method: m.method })));
        if (url.startsWith('/api/cash/settings')) return ok({ float_target: 500, reserve_amount: 600, reserve_label: 'Renta y gastos', last_float_left: 500, can_edit: true, can_see_history: true });
        if (url.startsWith('/api/cash/history')) return ok(history);
        if (url.startsWith('/api/cash/flow')) {
            const id = new URL(url, 'http://x').searchParams.get('session_id');
            const payload: CashFlowPayload = id === 'closed-1'
                ? { flow: buildCashFlow(closedRow, [{ ...moves[0], cash_session_id: 'closed-1', amount: 500 }], names, { targets }), timezone: TZ, day: '2026-11-20', otherExpenses: null }
                : { flow: buildCashFlow(openRow, moves, names, { targets, authors: names }), timezone: TZ, day: '2026-11-21', otherExpenses: { envelopeCents: 0, bankCents: 0, count: 0 } };
            return ok(payload);
        }
        return { ok: false, status: 404, json: async () => ({}) };
    }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Caja: el camino del efectivo', () => {
    it('caja abierta: el botón «¿Cuánto efectivo hay y por qué?» muestra la cuenta en vivo y la propuesta de cierre', async () => {
        render(<CashRegister />);
        const toggle = await screen.findByTestId('cash-flow-toggle');
        expect(toggle).toHaveTextContent('¿Cuánto efectivo hay y por qué?');
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(calls.some((c) => c.startsWith('/api/cash/flow'))).toBe(false); // no se pide hasta que se abre
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const flow = await screen.findByTestId('cash-flow');
        expect(calls).toContain('/api/cash/flow?session_id=open-1');
        expect(within(flow).getByTestId('cf-expected')).toHaveTextContent('Efectivo que debe haber ahora');
        expect(within(flow).getByTestId('cf-expected-value')).toHaveTextContent('$1,350');
        expect(within(flow).getByTestId('cf-amount-expenses')).toHaveTextContent('−$50');
        expect(within(flow).getByRole('heading', { name: /Al cerrar se propone/ })).toBeInTheDocument();
        // Lo que hay en caja arriba y en el panel es lo mismo.
        expect(screen.getByTestId('cash-expected')).toHaveTextContent('$1,350');
    });

    it('cierres anteriores: «Ver el efectivo» pide la caja y muestra el bloque completo, con faltante', async () => {
        render(<CashRegister />);
        const toggle = await screen.findByTestId('past-flow-toggle');
        expect(toggle).toHaveTextContent('Ver el efectivo');
        fireEvent.click(toggle);
        const row = await screen.findByTestId('past-flow');
        await waitFor(() => expect(within(row).getByTestId('cash-flow')).toBeInTheDocument());
        expect(calls).toContain('/api/cash/flow?session_id=closed-1');
        expect(within(row).getByTestId('cf-expected-value')).toHaveTextContent('$1,000');
        expect(within(row).getByTestId('cf-difference')).toHaveTextContent('Faltan $30');
        expect(within(row).getByTestId('cf-withdrawn')).toHaveTextContent('$70');
        expect(toggle).toHaveTextContent('Ocultar el efectivo');
        fireEvent.click(toggle);
        expect(screen.queryByTestId('past-flow')).toBeNull();
    });
});
