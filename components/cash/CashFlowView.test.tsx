import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CashFlowView, { CashFlowDayTotal } from './CashFlowView';
import CashFlowPanel from './CashFlowPanel';
import { buildCashFlow, buildCashFlows, buildDayFlowTotal, type CashFlow, type CashFlowPayload } from '@/lib/cash/cash-flow';
import type { CashMovementRow, CashSessionRow } from '@/lib/cash/session-view';

const closed = (over: Partial<CashSessionRow> = {}): CashSessionRow => ({
    id: 's', status: 'closed', opening_cash: 500, counted_cash: 1000, difference_amount: 0, expected_cash: 1000, opened_by: 'u1', opened_at: '2026-11-20T15:00:00Z',
    closed_at: '2026-11-21T01:00:00Z', closed_by: 'u2', float_left: 500, reserve_amount: 400, withdrawn_amount: 100, withdrawal_delivered_to: 'Alonso', ...over,
});
const openSession = (): CashSessionRow => closed({ status: 'open', counted_cash: null, difference_amount: null, expected_cash: null, closed_at: null, closed_by: null, float_left: null, reserve_amount: null, withdrawn_amount: null, withdrawal_delivered_to: null });
let n = 0;
const mv = (over: Partial<CashMovementRow>): CashMovementRow => ({ id: `m${++n}`, cash_session_id: 's', amount: 0, method: 'cash', movement_type: 'sale_payment', direction: 'in', created_at: '2026-11-20T18:30:00Z', ...over });
const names = new Map([['u1', 'Emi'], ['u2', 'Dago'], ['u3', 'Deya']]);
const TZ = 'America/Mexico_City';

const sales = mv({ amount: 430, sale_id: 'a' });
const expense = mv({ amount: 50, direction: 'out', movement_type: 'expense', expense_id: 'g', description: 'Garrafón de agua', created_by: 'u3' });
const change = mv({ amount: 120, movement_type: 'deposit', description: 'Cambio del banco' });

const flow = (over: Partial<CashSessionRow> = {}, moves: CashMovementRow[] = [sales, expense, change]): CashFlow =>
    buildCashFlow(closed(over), moves, names, { authors: names, targets: { floatTarget: 500, reserveAmount: 600, reserveLabel: 'Renta y gastos' } });

describe('El camino del efectivo (caja cerrada)', () => {
    it('cuenta el efectivo de arriba hacia abajo: fondo, entradas, salidas, esperado, contado y diferencia', () => {
        render(<CashFlowView flow={flow()} timezone={TZ} />);
        expect(screen.getByTestId('cf-opening')).toHaveTextContent('Fondo con que se abrió$500');
        expect(screen.getByTestId('cf-amount-sales')).toHaveTextContent('+$430');
        expect(screen.getByTestId('cf-line-sales')).toHaveTextContent('Cobros en efectivo (1)');
        expect(screen.getByTestId('cf-amount-otherIn')).toHaveTextContent('+$120');
        expect(screen.getByTestId('cf-amount-expenses')).toHaveTextContent('−$50');
        expect(screen.getByTestId('cf-expected')).toHaveTextContent('Efectivo que debe haber');
        expect(screen.getByTestId('cf-expected-value')).toHaveTextContent('$1,000');
        expect(screen.getByTestId('cf-counted')).toHaveTextContent('$1,000');
        expect(screen.getByTestId('cf-difference')).toHaveTextContent('Cuadra');
        expect(screen.queryByTestId('cf-warning')).toBeNull();
    });

    it('«Gastos pagados de la caja» se ve en $0 cuando no hubo gastos, atenuado; también pagos al equipo', () => {
        render(<CashFlowView flow={flow({ counted_cash: 1050, expected_cash: 1050, reserve_amount: 450, withdrawn_amount: 100 }, [sales, change])} timezone={TZ} />);
        const gastos = screen.getByTestId('cf-line-expenses');
        expect(gastos).toHaveTextContent('Gastos pagados de la caja');
        expect(screen.getByTestId('cf-amount-expenses')).toHaveTextContent('$0');
        expect(gastos.className).toContain('text-bos-muted');
        expect(screen.getByTestId('cf-line-team')).toHaveTextContent('Pagos al equipo');
        expect(screen.queryByTestId('cf-toggle-expenses')).toBeNull(); // sin movimientos no hay nada que desplegar
    });

    it('cada renglón se despliega y muestra hora, motivo, quién lo registró y monto', () => {
        render(<CashFlowView flow={flow()} timezone={TZ} />);
        const toggle = screen.getByTestId('cf-toggle-expenses');
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const items = screen.getByTestId('cf-items-expenses');
        expect(items).toHaveTextContent('Garrafón de agua');
        expect(items).toHaveTextContent('12:30'); // 18:30 UTC en la Ciudad de México
        expect(items).toHaveTextContent('registró Deya');
        expect(items).toHaveTextContent('−$50');
        fireEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('sin autores (recepción) no dice quién lo registró', () => {
        const f = buildCashFlow(closed(), [sales, expense, change], names);
        render(<CashFlowView flow={f} timezone={TZ} />);
        fireEvent.click(screen.getByTestId('cf-toggle-expenses'));
        expect(screen.getByTestId('cf-items-expenses')).not.toHaveTextContent('registró');
    });

    it('a dónde se fue lo contado: fondo, apartado al sobre, retiro con a quién, y el total igual a lo contado', () => {
        render(<CashFlowView flow={flow()} timezone={TZ} />);
        expect(screen.getByRole('heading', { name: '¿A dónde se fue lo contado?' })).toBeInTheDocument();
        expect(screen.getByTestId('cf-float')).toHaveTextContent('Se deja de fondo para mañana$500');
        expect(screen.getByTestId('cf-reserve')).toHaveTextContent('Se aparta al sobre «Renta y gastos»$400');
        expect(screen.getByTestId('cf-withdrawn')).toHaveTextContent('Se retira (entregado a: Alonso)$100');
        expect(screen.getByTestId('cf-split-total')).toHaveTextContent('Total (debe ser igual a lo contado)$1,000');
    });

    it('faltante: lo dice con la cantidad', () => {
        render(<CashFlowView flow={flow({ counted_cash: 970, difference_amount: -30, float_left: 500, reserve_amount: 400, withdrawn_amount: 70 })} timezone={TZ} />);
        expect(screen.getByTestId('cf-difference')).toHaveTextContent('Faltan $30');
        expect(screen.queryByTestId('cf-warning')).toBeNull();
    });

    it('sobrante: lo dice con la cantidad', () => {
        render(<CashFlowView flow={flow({ counted_cash: 1020, difference_amount: 20, float_left: 500, reserve_amount: 400, withdrawn_amount: 120 })} timezone={TZ} />);
        expect(screen.getByTestId('cf-difference')).toHaveTextContent('Sobran $20');
    });

    it('si el reparto no suma lo contado, avisa en vez de cuadrar a la fuerza', () => {
        render(<CashFlowView flow={flow({ withdrawn_amount: 0 })} timezone={TZ} />);
        const alert = screen.getByTestId('cf-warning');
        expect(alert).toHaveAttribute('role', 'alert');
        expect(alert).toHaveTextContent('no cuadran');
        expect(alert).toHaveTextContent('no suman lo contado');
        // Y lo que se muestra sigue siendo lo guardado, no un valor corregido.
        expect(screen.getByTestId('cf-withdrawn')).toHaveTextContent('$0');
    });

    it('caja cerrada sin reparto guardado: lo explica', () => {
        render(<CashFlowView flow={flow({ float_left: null, reserve_amount: null, withdrawn_amount: null })} timezone={TZ} />);
        expect(screen.getByTestId('cf-nosplit')).toHaveTextContent('sin repartir');
        expect(screen.queryByTestId('cf-split')).toBeNull();
    });

    it('el motivo de dejar menos fondo se muestra', () => {
        render(<CashFlowView flow={flow({ float_left: 300, reserve_amount: 600, withdrawn_amount: 100, closing_note: 'Se pagó al proveedor' })} timezone={TZ} />);
        expect(screen.getByTestId('cf-float-note')).toHaveTextContent('Se pagó al proveedor');
    });

    it('el motivo de la diferencia va junto a «Diferencia»', () => {
        render(<CashFlowView flow={flow({ counted_cash: 970, difference_amount: -30, withdrawn_amount: 70, difference_reason: 'Cambio mal dado' })} timezone={TZ} />);
        expect(screen.getByTestId('cf-difference')).toHaveTextContent('Faltan $30');
        expect(within(screen.getByTestId('cf-difference')).getByTestId('cf-difference-reason')).toHaveTextContent('Motivo: Cambio mal dado');
        expect(screen.queryByTestId('cf-warning')).toBeNull();
    });

    it('caja vieja con diferencia y sin motivo: «Sin motivo registrado», sin tratarlo como error', () => {
        render(<CashFlowView flow={flow({ counted_cash: 1050, difference_amount: 50, withdrawn_amount: 150 })} timezone={TZ} />);
        expect(screen.getByTestId('cf-difference')).toHaveTextContent('Sobran $50');
        expect(screen.getByTestId('cf-difference-reason')).toHaveTextContent('Sin motivo registrado');
        expect(screen.queryByTestId('cf-warning')).toBeNull();
    });

    it('si cuadra, no hay renglón de motivo', () => {
        render(<CashFlowView flow={flow()} timezone={TZ} />);
        expect(screen.queryByTestId('cf-difference-reason')).toBeNull();
    });
});

describe('Lo que no toca el efectivo', () => {
    const withCard = () => buildCashFlow(closed(), [sales, expense, change, mv({ amount: 150, method: 'card', sale_id: 'b' }), mv({ amount: 80, method: 'transfer', sale_id: 'c' })], names, { authors: names });

    it('dice cuánto fue tarjeta y transferencia y que no están en la caja', () => {
        render(<CashFlowView flow={withCard()} timezone={TZ} />);
        expect(screen.getByTestId('cf-notcash')).toHaveTextContent('Tarjeta $150 y transferencia $80 no están en la caja.');
    });

    it('quien ve Gastos recibe los gastos del sobre y del banco con enlace a Gastos', () => {
        render(<CashFlowView flow={withCard()} timezone={TZ} otherExpenses={{ envelopeCents: 25000, bankCents: 5000, count: 2 }} />);
        const line = screen.getByTestId('cf-otherexp');
        expect(line).toHaveTextContent('Gastos pagados del sobre o del banco: $300 (no salen de la caja)');
        expect(line).toHaveTextContent('2 gastos');
        expect(within(line).getByRole('link', { name: 'Ver Gastos' })).toHaveAttribute('href', '/gastos');
    });

    it('recepción no recibe el monto ni el enlace: solo la aclaración', () => {
        render(<CashFlowView flow={withCard()} timezone={TZ} otherExpenses={null} />);
        const line = screen.getByTestId('cf-otherexp');
        expect(line).toHaveTextContent('Los gastos pagados del sobre o del banco no salen de la caja.');
        expect(within(line).queryByRole('link')).toBeNull();
    });
});

describe('Caja abierta', () => {
    const live = () => buildCashFlow(openSession(), [mv({ amount: 900, sale_id: 'a' }), expense], names, { authors: names, targets: { floatTarget: 500, reserveAmount: 600, reserveLabel: 'Renta y gastos' } });

    it('en vivo: «Efectivo que debe haber ahora», sin contado ni diferencia', () => {
        render(<CashFlowView flow={live()} timezone={TZ} />);
        expect(screen.getByTestId('cf-expected')).toHaveTextContent('Efectivo que debe haber ahora');
        expect(screen.getByTestId('cf-expected-value')).toHaveTextContent('$1,350');
        expect(screen.queryByTestId('cf-counted')).toBeNull();
        expect(screen.queryByTestId('cf-difference')).toBeNull();
    });

    it('al cerrar se propone el reparto con los valores configurados, marcado como propuesta', () => {
        render(<CashFlowView flow={live()} timezone={TZ} />);
        const split = screen.getByTestId('cf-split');
        expect(within(split).getByRole('heading', { name: /Al cerrar se propone/ })).toHaveTextContent('propuesta');
        expect(screen.getByTestId('cf-float')).toHaveTextContent('$500');
        expect(screen.getByTestId('cf-reserve')).toHaveTextContent('Renta y gastos');
        expect(screen.getByTestId('cf-reserve')).toHaveTextContent('$600');
        expect(screen.getByTestId('cf-withdrawn')).toHaveTextContent('$250');
        expect(screen.getByTestId('cf-split-total')).toHaveTextContent('$1,350');
    });
});

describe('Total del día con varias cajas', () => {
    const rows = [
        closed({ id: 'a' }), closed({ id: 'b', opened_at: '2026-11-20T22:00:00Z', counted_cash: 520, difference_amount: -30, expected_cash: 550, float_left: 500, reserve_amount: 20, withdrawn_amount: 0 }),
    ];
    const moves = [
        mv({ cash_session_id: 'a', amount: 500, sale_id: 'x' }), mv({ cash_session_id: 'a', amount: 80, direction: 'out', movement_type: 'expense', expense_id: 'e1', description: 'Agua' }),
        mv({ cash_session_id: 'a', amount: 80, movement_type: 'deposit', description: 'Cambio' }),
        mv({ cash_session_id: 'b', amount: 100, sale_id: 'y' }), mv({ cash_session_id: 'b', amount: 50, direction: 'out', movement_type: 'expense', expense_id: 'e2', description: 'Jabón' }),
    ];
    it('suma los renglones de todas las cajas y no suma fondos ni esperados', () => {
        const total = buildDayFlowTotal(buildCashFlows(rows, moves, names));
        render(<CashFlowDayTotal total={total} otherExpenses={{ envelopeCents: 10000, bankCents: 0, count: 1 }} />);
        expect(screen.getByRole('heading', { name: 'Total del día · 2 cajas' })).toBeInTheDocument();
        expect(screen.getByTestId('cf-total-sales')).toHaveTextContent('Cobros en efectivo (2)+$600');
        expect(screen.getByTestId('cf-total-expenses')).toHaveTextContent('Gastos pagados de la caja (2)−$130');
        expect(screen.getByTestId('cf-total-difference')).toHaveTextContent('Faltan $30');
        expect(screen.getByTestId('cf-total-reserve')).toHaveTextContent('$420');
        expect(screen.getByTestId('cf-total-withdrawn')).toHaveTextContent('$100');
        expect(screen.getByTestId('cf-day-total')).toHaveTextContent('Gastos pagados del sobre o del banco: $100');
        expect(screen.getByTestId('cf-day-total')).not.toHaveTextContent('Fondo con que se abrió');
    });
});

describe('Panel que lo pide al servidor', () => {
    let body: unknown;
    let status = 200;
    const calls: string[] = [];
    beforeEach(() => {
        calls.length = 0; status = 200;
        body = { flow: flow(), timezone: TZ, day: '2026-11-20', otherExpenses: null } satisfies CashFlowPayload;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return { ok: status < 400, status, json: async () => body }; }));
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('pide /api/cash/flow con la caja y la muestra', async () => {
        render(<CashFlowPanel sessionId="abc-123" />);
        expect(screen.getByLabelText('Cargando el efectivo')).toBeInTheDocument();
        expect(await screen.findByTestId('cash-flow')).toBeInTheDocument();
        expect(calls[0]).toBe('/api/cash/flow?session_id=abc-123');
        expect(screen.getByTestId('cf-expected-value')).toHaveTextContent('$1,000');
    });

    it('si falla, lo dice y deja reintentar', async () => {
        status = 500; body = { error: 'x' };
        render(<CashFlowPanel sessionId="abc-123" />);
        expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el efectivo');
        status = 200; body = { flow: flow(), timezone: TZ, day: '2026-11-20', otherExpenses: null };
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByTestId('cash-flow')).toBeInTheDocument();
        expect(calls).toHaveLength(2);
    });

    it('al cambiar refreshKey (llegó un movimiento) vuelve a pedir', async () => {
        const { rerender } = render(<CashFlowPanel sessionId="abc-123" refreshKey="1" />);
        await screen.findByTestId('cash-flow');
        rerender(<CashFlowPanel sessionId="abc-123" refreshKey="2" />);
        await waitFor(() => expect(calls).toHaveLength(2));
    });
});

describe('El camino del efectivo: apertura con otro monto', () => {
    it('muestra cuánto se esperaba abrir, la diferencia y el motivo escrito al abrir', () => {
        render(<CashFlowView flow={flow({ opening_cash: 300, opening_expected: 500, opening_note: 'Se usaron $200 para cambio del banco', expected_cash: 800, counted_cash: 800 })} timezone={TZ} />);
        expect(screen.getByTestId('cf-opening')).toHaveTextContent('Fondo con que se abrió$300');
        const note = screen.getByTestId('cf-opening-note');
        expect(note).toHaveTextContent('Se esperaba abrir con $500: abrió con $200 menos.');
        expect(note).toHaveTextContent('Motivo: Se usaron $200 para cambio del banco');
    });

    it('si abrió con más de lo esperado lo dice; una caja vieja sin motivo dice «Sin motivo registrado»', () => {
        render(<CashFlowView flow={flow({ opening_cash: 700, opening_expected: 500, opening_note: null, expected_cash: 1200, counted_cash: 1200 })} timezone={TZ} />);
        expect(screen.getByTestId('cf-opening-note')).toHaveTextContent('abrió con $200 más. Sin motivo registrado');
    });

    it('si abrió con lo esperado (o la caja no guardó cuánto se esperaba) no aparece nada', () => {
        const { unmount } = render(<CashFlowView flow={flow({ opening_expected: 500 })} timezone={TZ} />);
        expect(screen.queryByTestId('cf-opening-note')).toBeNull();
        unmount();
        render(<CashFlowView flow={flow()} timezone={TZ} />);
        expect(screen.queryByTestId('cf-opening-note')).toBeNull();
    });
});
