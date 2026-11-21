import { describe, expect, it } from 'vitest';
import {
    buildCashFlow, buildCashFlows, buildDayFlowTotal, flowGroupOf, flowLine, visibleLines, type FlowGroupId,
} from './cash-flow';
import { buildSessionView, type CashMovementRow, type CashSessionRow } from './session-view';

const session = (over: Partial<CashSessionRow> = {}): CashSessionRow => ({
    id: 's', status: 'closed', opening_cash: 500, counted_cash: 6100, difference_amount: 0, opened_by: 'u1', opened_at: '2026-11-20T15:00:00Z',
    closed_at: '2026-11-21T01:00:00Z', closed_by: 'u2', float_left: 500, reserve_amount: 600, withdrawn_amount: 5000, withdrawal_delivered_to: 'Alonso',
    expected_cash: 6100, closing_note: null, ...over,
});
let n = 0;
const mv = (over: Partial<CashMovementRow>): CashMovementRow => ({
    id: `m${++n}`, cash_session_id: 's', amount: 0, method: 'cash', movement_type: 'sale_payment', direction: 'in', created_at: `2026-11-20T16:${String(n % 60).padStart(2, '0')}:00Z`, ...over,
});
const names = new Map([['u1', 'Emi'], ['u2', 'Dago'], ['u3', 'Deya']]);

/** El ejemplo del dueño: 500 + 7,050 + 160 + 200 − 350 − 1,200 − 160 − 100 = 6,100 (las propinas entregadas van dentro del pago al equipo). */
const owner = (): CashMovementRow[] => [
    mv({ amount: 7050, movement_type: 'sale_payment', sale_id: 'v1' }),
    mv({ amount: 160, movement_type: 'deposit', sale_id: 'v1', description: 'Propina para Deya' }),
    mv({ amount: 200, movement_type: 'deposit', description: 'Cambio del banco', created_by: 'u1' }),
    mv({ amount: 350, direction: 'out', movement_type: 'expense', expense_id: 'g1', description: 'Garrafón de agua', created_by: 'u3' }),
    mv({ amount: 1000, direction: 'out', movement_type: 'withdrawal', commission_settlement_id: 'p1', description: 'Pago de comisiones · P2647-01' }),
    mv({ amount: 200, direction: 'out', movement_type: 'withdrawal', description: 'Adelanto · Deya: para la renta' }),
    mv({ amount: 160, direction: 'out', movement_type: 'withdrawal', description: 'Propinas al equipo' }),
    mv({ amount: 100, direction: 'out', movement_type: 'withdrawal', description: 'Al banco' }),
];

describe('flowGroupOf: cada tipo de movimiento cae en su renglón', () => {
    const cases: [string, Parameters<typeof flowGroupOf>[0], FlowGroupId][] = [
        ['cobro en efectivo', { movement_type: 'sale_payment', direction: 'in', sale_id: 'v' }, 'sales'],
        ['propina cobrada', { movement_type: 'deposit', direction: 'in', sale_id: 'v', description: 'Propina para Deya' }, 'tips'],
        ['entrada manual', { movement_type: 'deposit', direction: 'in', description: 'Cambio' }, 'otherIn'],
        ['adelanto cancelado', { movement_type: 'deposit', direction: 'in', description: 'Cancelación de adelanto · Deya: error' }, 'teamBack'],
        ['abono a préstamo', { movement_type: 'deposit', direction: 'in', description: 'Abono a préstamo · Deya: semana 2' }, 'teamBack'],
        ['gasto cancelado con la caja abierta', { movement_type: 'adjustment', direction: 'in', expense_id: 'g', description: 'Cancelación de gasto: duplicado' }, 'expenseBack'],
        ['ajuste de entrada sin gasto', { movement_type: 'adjustment', direction: 'in', description: 'Ajuste' }, 'otherIn'],
        ['gasto de la caja', { movement_type: 'expense', direction: 'out', expense_id: 'g', description: 'Agua' }, 'expenses'],
        ['pago semanal', { movement_type: 'withdrawal', direction: 'out', commission_settlement_id: 'p', description: 'Pago de comisiones · P2647-01' }, 'team'],
        ['adelanto', { movement_type: 'withdrawal', direction: 'out', description: 'Adelanto · Deya: x' }, 'team'],
        ['préstamo', { movement_type: 'withdrawal', direction: 'out', description: 'Préstamo · Dani: x' }, 'team'],
        ['reembolso de venta', { movement_type: 'refund', direction: 'out', sale_id: 'v', description: 'Reembolso de venta' }, 'refunds'],
        ['propina devuelta', { movement_type: 'refund', direction: 'out', sale_id: 'v', description: 'Devolución de propina' }, 'tipRefunds'],
        ['propina devuelta (versión anterior: retiro con venta)', { movement_type: 'withdrawal', direction: 'out', sale_id: 'v', description: 'Devolución de propina' }, 'tipRefunds'],
        ['retiro manual', { movement_type: 'withdrawal', direction: 'out', description: 'Al banco' }, 'otherOut'],
        ['retiro que dice «adelanto» sin el formato del sistema', { movement_type: 'withdrawal', direction: 'out', description: 'Adelanto a Juan' }, 'otherOut'],
        ['ajuste de salida', { movement_type: 'adjustment', direction: 'out', description: 'Ajuste' }, 'otherOut'],
    ];
    it.each(cases)('%s', (_name, m, group) => { expect(flowGroupOf(m)).toBe(group); });
});

describe('buildCashFlow: caja cerrada con todos los tipos', () => {
    const flow = buildCashFlow(session(), owner(), names, { authors: names });
    const line = (id: FlowGroupId) => flowLine(flow, id);

    it('fondo + entradas − salidas = efectivo que debe haber, renglón por renglón', () => {
        expect(flow.openingCents).toBe(50000);
        expect(line('sales')).toMatchObject({ cents: 705000, count: 1, side: 'in' });
        expect(line('tips')).toMatchObject({ cents: 16000, count: 1 });
        expect(line('otherIn')).toMatchObject({ cents: 20000, count: 1 });
        expect(line('expenses')).toMatchObject({ cents: 35000, count: 1, side: 'out' });
        expect(line('team')).toMatchObject({ cents: 120000, count: 2 });
        expect(line('otherOut')).toMatchObject({ cents: 26000, count: 2 });
        expect(flow.inCents).toBe(741000);
        expect(flow.outCents).toBe(181000);
        expect(flow.expectedCents).toBe(610000);
        expect(flow.openingCents + flow.inCents - flow.outCents).toBe(flow.expectedCents);
    });

    it('el esperado es el de la pantalla de Caja (buildSessionView), no otra fórmula', () => {
        const view = buildSessionView(session(), owner(), 'Emi', 'Dago');
        expect(flow.expectedCents).toBe(Math.round((view.expected_cash ?? 0) * 100));
        expect(flow.expectedCents).toBe(Math.round(((view.initial_amount + view.total_cash - view.total_expenses)) * 100));
    });

    it('contado, diferencia y a dónde se fue lo contado suman lo contado', () => {
        expect(flow).toMatchObject({ countedCents: 610000, differenceCents: 0, open: false, openedBy: 'Emi', closedBy: 'Dago' });
        expect(flow.split).toEqual({ floatCents: 50000, reserveCents: 60000, withdrawnCents: 500000, deliveredTo: 'Alonso', reserveLabel: 'Apartado', proposed: false, floatNote: null });
        expect(flow.split!.floatCents + flow.split!.reserveCents + flow.split!.withdrawnCents).toBe(flow.countedCents);
        expect(flow.check).toEqual({ expectedDiffCents: 0, storedExpectedDiffCents: 0, differenceDiffCents: 0, splitDiffCents: 0, issues: [], ok: true });
    });

    it('cada renglón trae sus movimientos con hora, motivo y quién lo registró', () => {
        expect(line('expenses').items).toEqual([{ id: expect.any(String), at: expect.any(String), description: 'Garrafón de agua', cents: 35000, by: 'Deya' }]);
        expect(line('otherIn').items[0]).toMatchObject({ description: 'Cambio del banco', by: 'Emi' });
        expect(line('team').items.map((i) => i.description)).toEqual(['Pago de comisiones · P2647-01', 'Adelanto · Deya: para la renta']);
    });

    it('sin nombres de autores (recepción) los renglones salen sin «quién registró»', () => {
        const noAuthors = buildCashFlow(session(), owner(), names);
        expect(noAuthors.lines.flatMap((l) => l.items).every((i) => i.by === null)).toBe(true);
    });

    it('«Gastos pagados de la caja» y «Pagos al equipo» se ven aunque estén en cero; los renglones raros solo si hay', () => {
        const quiet = buildCashFlow(session({ counted_cash: 500, expected_cash: 500, reserve_amount: 0, withdrawn_amount: 0 }), [], names);
        const ids = (side: 'in' | 'out') => visibleLines(quiet, side).map((l) => l.id);
        expect(ids('in')).toEqual(['sales', 'tips', 'otherIn']);
        expect(ids('out')).toEqual(['expenses', 'team', 'otherOut']);
        expect(flowLine(quiet, 'expenses')).toMatchObject({ cents: 0, count: 0, always: true });
        const withRefund = buildCashFlow(session({ counted_cash: 450, expected_cash: 450, reserve_amount: 0, withdrawn_amount: 0, float_left: 450 }), [mv({ amount: 50, direction: 'out', movement_type: 'refund', sale_id: 'x', description: 'Reembolso de venta' })], names);
        expect(visibleLines(withRefund, 'out').map((l) => l.id)).toContain('refunds');
    });
});

describe('solo cuenta el efectivo', () => {
    it('tarjeta y transferencia no entran al camino y se reportan aparte', () => {
        const f = buildCashFlow(session({ counted_cash: 1000, expected_cash: 1000, reserve_amount: 500, withdrawn_amount: 0 }), [
            mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' }),
            mv({ amount: 300, method: 'card', movement_type: 'sale_payment', sale_id: 'b' }),
            mv({ amount: 40, method: 'card', movement_type: 'deposit', sale_id: 'b', description: 'Propina para Dani' }),
            mv({ amount: 200, method: 'transfer', movement_type: 'sale_payment', sale_id: 'c' }),
            mv({ amount: 999, method: 'card', direction: 'out', movement_type: 'expense', expense_id: 'g', description: 'Gasto con tarjeta' }),
        ], names);
        expect(flowLine(f, 'sales').count).toBe(1);
        expect(flowLine(f, 'expenses').cents).toBe(0);
        expect(f.expectedCents).toBe(100000);
        expect(f.cardCents).toBe(34000);
        expect(f.transferCents).toBe(20000);
        expect(f.check.ok).toBe(true);
    });
});

describe('faltante, sobrante y avisos', () => {
    it('faltante: la diferencia guardada es negativa y todo sigue cuadrando contra lo guardado', () => {
        const f = buildCashFlow(session({ counted_cash: 970, difference_amount: -30, expected_cash: 1000, float_left: 500, reserve_amount: 400, withdrawn_amount: 70 }),
            [mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' })], names);
        expect(f).toMatchObject({ expectedCents: 100000, countedCents: 97000, differenceCents: -3000 });
        expect(f.check.ok).toBe(true);
    });
    it('sobrante', () => {
        const f = buildCashFlow(session({ counted_cash: 1020, difference_amount: 20, expected_cash: 1000, float_left: 500, reserve_amount: 500, withdrawn_amount: 20 }),
            [mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' })], names);
        expect(f.differenceCents).toBe(2000);
        expect(f.check.ok).toBe(true);
    });
    it('motivo de la diferencia: se entrega recortado; nulo si cuadra, si está abierta o si es una caja vieja sin motivo', () => {
        const one = [mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' })];
        const short = { counted_cash: 970, difference_amount: -30, expected_cash: 1000, float_left: 500, reserve_amount: 400, withdrawn_amount: 70 };
        expect(buildCashFlow(session({ ...short, difference_reason: '  Cambio mal dado ' }), one, names).differenceReason).toBe('Cambio mal dado');
        expect(buildCashFlow(session(short), one, names).differenceReason).toBeNull();
        expect(buildCashFlow(session({ ...short, difference_reason: '   ' }), one, names).differenceReason).toBeNull();
        // Si cuadra, aunque la fila trajera texto, no se muestra (la base lo guarda nulo).
        expect(buildCashFlow(session({ counted_cash: 1000, difference_amount: 0, expected_cash: 1000, float_left: 500, reserve_amount: 500, withdrawn_amount: 0, difference_reason: 'x' }), one, names).differenceReason).toBeNull();
        expect(buildCashFlow(session({ status: 'open', counted_cash: null, difference_amount: null, expected_cash: null, closed_at: null, closed_by: null }), one, names).differenceReason).toBeNull();
    });
    it('el esperado guardado no coincide con el calculado: avisa, no cuadra a la fuerza', () => {
        const f = buildCashFlow(session({ expected_cash: 900, counted_cash: 1000, difference_amount: 100, float_left: 500, reserve_amount: 500, withdrawn_amount: 0 }),
            [mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' })], names);
        expect(f.expectedCents).toBe(100000); // se sigue mostrando el calculado por la Caja
        expect(f.check.storedExpectedDiffCents).toBe(-10000); // guardado − calculado
        expect(f.check.ok).toBe(false);
        expect(f.check.issues.join(' ')).toMatch(/esperado guardado/);
    });
    it('la diferencia guardada no es contado − esperado: avisa', () => {
        const f = buildCashFlow(session({ counted_cash: 1000, difference_amount: -5, expected_cash: 1000, float_left: 500, reserve_amount: 500, withdrawn_amount: 0 }),
            [mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' })], names);
        expect(f.check.differenceDiffCents).toBe(500);
        expect(f.check.issues.join(' ')).toMatch(/diferencia guardada/);
    });
    it('fondo + apartado + retiro distinto de lo contado: avisa con la diferencia', () => {
        const f = buildCashFlow(session({ counted_cash: 1000, difference_amount: 0, expected_cash: 1000, float_left: 500, reserve_amount: 400, withdrawn_amount: 0 }),
            [mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' })], names);
        expect(f.check.splitDiffCents).toBe(-10000);
        expect(f.check.ok).toBe(false);
        expect(f.check.issues.join(' ')).toMatch(/no suman lo contado \(−\$100\.00\)/);
    });
    it('caja cerrada antes del cierre guiado: sin reparto guardado, y no es error', () => {
        const f = buildCashFlow(session({ float_left: null, reserve_amount: null, withdrawn_amount: null, counted_cash: 1000, difference_amount: 0, expected_cash: 1000 }),
            [mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' })], names, { targets: { floatTarget: 500, reserveAmount: 600, reserveLabel: 'Renta' } });
        expect(f.split).toBeNull();
        expect(f.check).toMatchObject({ splitDiffCents: null, ok: true });
    });
    it('el motivo de dejar menos fondo (closing_note) se conserva', () => {
        const f = buildCashFlow(session({ counted_cash: 1000, expected_cash: 1000, float_left: 300, reserve_amount: 600, withdrawn_amount: 100, closing_note: 'Se pagó al proveedor' }),
            [mv({ amount: 500, movement_type: 'sale_payment', sale_id: 'a' })], names);
        expect(f.split?.floatNote).toBe('Se pagó al proveedor');
    });
    it('centavos sin errores de coma flotante', () => {
        const f = buildCashFlow(session({ opening_cash: 0.1, counted_cash: 0.3, expected_cash: 0.3, difference_amount: 0, float_left: 0.3, reserve_amount: 0, withdrawn_amount: 0 }),
            [mv({ amount: 0.2, movement_type: 'sale_payment', sale_id: 'a' })], names);
        expect(f.expectedCents).toBe(30);
        expect(f.check.ok).toBe(true);
    });
});

describe('caja abierta', () => {
    const open = (targets = { floatTarget: 500, reserveAmount: 600, reserveLabel: 'Renta y gastos' }) => buildCashFlow(
        session({ status: 'open', counted_cash: null, difference_amount: null, closed_at: null, closed_by: null, float_left: null, reserve_amount: null, withdrawn_amount: null, expected_cash: null }),
        owner(), names, { targets },
    );
    it('en vivo: sin contado ni diferencia, y propone el reparto con los valores configurados', () => {
        const f = open();
        expect(f).toMatchObject({ open: true, countedCents: null, differenceCents: null, expectedCents: 610000 });
        expect(f.split).toEqual({ floatCents: 50000, reserveCents: 60000, withdrawnCents: 500000, deliveredTo: null, reserveLabel: 'Renta y gastos', proposed: true, floatNote: null });
        expect(f.check.ok).toBe(true);
    });
    it('la propuesta usa proposeSplit: si no alcanza, primero el fondo, luego el apartado', () => {
        const f = buildCashFlow(session({ status: 'open', counted_cash: null, difference_amount: null, closed_at: null, closed_by: null, float_left: null, reserve_amount: null, withdrawn_amount: null, expected_cash: null }),
            [mv({ amount: 300, movement_type: 'sale_payment', sale_id: 'a' })], names, { targets: { floatTarget: 500, reserveAmount: 600, reserveLabel: 'Renta' } });
        expect(f.expectedCents).toBe(80000);
        expect(f.split).toMatchObject({ floatCents: 50000, reserveCents: 30000, withdrawnCents: 0, proposed: true });
    });
    it('sin ajustes de caja no inventa una propuesta', () => {
        const f = buildCashFlow(session({ status: 'open', counted_cash: null, difference_amount: null, closed_at: null, closed_by: null, float_left: null, reserve_amount: null, withdrawn_amount: null }), [], names);
        expect(f.split).toBeNull();
    });
});

describe('varias cajas del día', () => {
    const rows = [
        session({ id: 'b', opened_at: '2026-11-20T22:00:00Z', opening_cash: 500, counted_cash: 520, difference_amount: -30, expected_cash: 550, float_left: 500, reserve_amount: 20, withdrawn_amount: 0, closed_at: '2026-11-21T04:00:00Z' }),
        session({ id: 'a', opened_at: '2026-11-20T15:00:00Z', opening_cash: 500, counted_cash: 1000, difference_amount: 0, expected_cash: 1000, float_left: 500, reserve_amount: 400, withdrawn_amount: 100 }),
        session({ id: 'c', status: 'open', opened_at: '2026-11-21T05:00:00Z', counted_cash: null, difference_amount: null, closed_at: null, closed_by: null, float_left: null, reserve_amount: null, withdrawn_amount: null, expected_cash: null }),
    ];
    const moves = [
        mv({ cash_session_id: 'a', amount: 500, movement_type: 'sale_payment', sale_id: 'x' }),
        mv({ cash_session_id: 'a', amount: 80, direction: 'out', movement_type: 'expense', expense_id: 'e1', description: 'Agua' }),
        mv({ cash_session_id: 'a', amount: 80, movement_type: 'deposit', description: 'Cambio' }),
        mv({ cash_session_id: 'b', amount: 100, movement_type: 'sale_payment', sale_id: 'y' }),
        mv({ cash_session_id: 'b', amount: 50, direction: 'out', movement_type: 'expense', expense_id: 'e2', description: 'Jabón' }),
        mv({ cash_session_id: 'c', amount: 10, movement_type: 'sale_payment', sale_id: 'z' }),
    ];
    const flows = buildCashFlows(rows, moves, names);
    it('las ordena por hora de apertura y cada una lleva SUS movimientos', () => {
        expect(flows.map((f) => f.id)).toEqual(['a', 'b', 'c']);
        expect(flows.map((f) => f.lines.reduce((t, l) => t + l.count, 0))).toEqual([3, 2, 1]);
        expect(flows.map((f) => f.check.ok)).toEqual([true, true, true]);
    });
    it('el total del día suma renglones, gastos, diferencia, apartado y retiro; no suma fondos ni esperados', () => {
        const t = buildDayFlowTotal(flows);
        expect(t).toMatchObject({ sessionCount: 3, anyOpen: true, expensesCents: 13000, differenceCents: -3000, reserveCents: 42000, withdrawnCents: 10000, floatLeftCents: 50000, issues: 0 });
        expect(t.lines.find((l) => l.id === 'sales')).toMatchObject({ cents: 61000, count: 3 });
        expect(t.lines.find((l) => l.id === 'expenses')).toMatchObject({ cents: 13000, count: 2 });
        expect(t.inCents).toBe(61000 + 8000);
        expect(t.outCents).toBe(13000);
    });
    it('un día sin cajas da un total en ceros', () => {
        expect(buildDayFlowTotal([])).toMatchObject({ sessionCount: 0, anyOpen: false, inCents: 0, outCents: 0, floatLeftCents: null });
    });
});

describe('invariante: los renglones reparten TODOS los movimientos de efectivo', () => {
    it('para movimientos de cualquier tipo, fondo + entradas − salidas = el esperado de la Caja', () => {
        const types = ['sale_payment', 'expense', 'withdrawal', 'deposit', 'refund', 'adjustment'];
        const methods = ['cash', 'card', 'transfer', 'other'];
        let seed = 7;
        const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
        for (let round = 0; round < 40; round++) {
            const ms: CashMovementRow[] = Array.from({ length: 30 }, () => mv({
                amount: (rnd(20000) + 1) / 100, movement_type: types[rnd(types.length)], method: methods[rnd(methods.length)], direction: rnd(2) ? 'in' : 'out',
                sale_id: rnd(2) ? 'v' : null, expense_id: rnd(3) === 0 ? 'g' : null, commission_settlement_id: rnd(4) === 0 ? 'p' : null,
                description: ['Adelanto · X', 'Devolución de propina', 'Cancelación de adelanto · X', 'Otro', ''][rnd(5)],
            }));
            const f = buildCashFlow(session({ expected_cash: null, difference_amount: 0, counted_cash: 0, float_left: 0, reserve_amount: 0, withdrawn_amount: 0 }), ms, names);
            expect(f.check.expectedDiffCents).toBe(0);
            expect(f.openingCents + f.inCents - f.outCents).toBe(f.expectedCents);
            expect(f.lines.reduce((t, l) => t + l.count, 0)).toBe(ms.filter((m) => m.method === 'cash').length);
        }
    });
});
