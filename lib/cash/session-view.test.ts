import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { buildSessionView, loadClosedSessions, loadOpenSession, movementTag, toUiMovement, UNKNOWN_OPENER, type CashMovementRow, type CashSessionRow } from './session-view';

const session: CashSessionRow = {
    id: 'sess-1',
    status: 'open',
    opening_cash: '500.00',
    counted_cash: null,
    difference_amount: null,
    opened_by: 'user-1',
    opened_at: '2026-11-01T15:00:00Z',
    closed_at: null,
};

const movement = (over: Partial<CashMovementRow>): CashMovementRow => ({
    cash_session_id: 'sess-1',
    amount: 0,
    method: 'cash',
    movement_type: 'sale_payment',
    direction: 'in',
    ...over,
});

describe('buildSessionView', () => {
    it('calcula los totales y deja el efectivo esperado igual al de la base (RB-12)', () => {
        const view = buildSessionView(session, [
            movement({ amount: '200.00' }),                                                          // venta en efectivo
            movement({ amount: '80.00' }),                                                           // parte en efectivo de un pago mixto
            movement({ amount: '120.00', method: 'card' }),                                          // parte con tarjeta
            movement({ amount: '200.00', method: 'transfer' }),                                      // transferencia
            movement({ amount: '150.00', movement_type: 'withdrawal', direction: 'out' }),           // pago de comisiones en efectivo
            movement({ amount: '20.00', movement_type: 'refund', direction: 'out', method: 'card' }), // reembolso con tarjeta
        ], 'Dago');

        expect(view.opened_by).toBe('Dago');
        expect(view.initial_amount).toBe(500);
        expect(view.total_cash).toBe(280);
        expect(view.total_expenses).toBe(150);
        expect(view.total_card).toBe(100);
        expect(view.total_transfer).toBe(200);
        expect(view.total_sales).toBe(580);
        // La pantalla calcula: inicial + efectivo - salidas
        expect(view.initial_amount + view.total_cash - view.total_expenses).toBe(630);
        expect(view.physical_count).toBeNull();
        expect(view.difference).toBeNull();
    });

    it('muestra el conteo y la diferencia de una caja cerrada', () => {
        const view = buildSessionView(
            { ...session, status: 'closed', counted_cash: '1480.00', difference_amount: '-20.00', closed_at: '2026-11-07T19:30:00Z' },
            [],
            'Dago',
        );
        expect(view.status).toBe('closed');
        expect(view.physical_count).toBe(1480);
        expect(view.difference).toBe(-20);
    });

    it('muestra a quién se entregó el retiro del cierre, y nada si no se indicó', () => {
        const closed = { ...session, status: 'closed' as const, counted_cash: '1500.00', difference_amount: '0.00', closed_at: '2026-11-07T19:30:00Z', withdrawn_amount: '400.00' };
        expect(buildSessionView({ ...closed, withdrawal_delivered_to: 'Dueño' }, [], 'Dago').withdrawal_delivered_to).toBe('Dueño');
        expect(buildSessionView(closed, [], 'Dago').withdrawal_delivered_to).toBeNull();
    });

    it('no mezcla tarjeta o transferencia con el efectivo físico', () => {
        const view = buildSessionView(session, [movement({ amount: 300, method: 'card' })], 'Dago');
        expect(view.total_cash).toBe(0);
        expect(view.total_card).toBe(300);
    });
});

describe('propinas en caja', () => {
    it('no cuentan como venta, sí como dinero recibido por su método, y el efectivo queda en el cajón', () => {
        const view = buildSessionView(session, [
            movement({ amount: '200.00', sale_id: 's1' }),                                              // venta en efectivo
            movement({ amount: '50.00', movement_type: 'deposit', sale_id: 's1' }),                     // propina en efectivo
            movement({ amount: '40.00', movement_type: 'deposit', method: 'card', sale_id: 's1' }),     // propina con tarjeta
            movement({ amount: '100.00', movement_type: 'deposit' }),                                   // depósito normal (sin venta)
        ], 'Dago');
        expect(view.total_sales).toBe(200);
        expect(view.total_tips).toBe(90);
        expect(view.total_card).toBe(40);
        expect(view.total_cash).toBe(350);
        expect(view.initial_amount + view.total_cash - view.total_expenses).toBe(850);
    });

    it('devolver una propina la descuenta de propinas, no de ventas', () => {
        const view = buildSessionView(session, [
            movement({ amount: '200.00', method: 'card', sale_id: 's1' }),
            movement({ amount: '30.00', movement_type: 'deposit', method: 'card', sale_id: 's1' }),
            movement({ amount: '200.00', movement_type: 'refund', direction: 'out', method: 'card', sale_id: 's1' }),
            movement({ amount: '30.00', movement_type: 'withdrawal', direction: 'out', method: 'card', sale_id: 's1' }),
        ], 'Dago');
        expect(view.total_sales).toBe(0);
        expect(view.total_tips).toBe(0);
        expect(view.total_card).toBe(0);
    });
});

describe('toUiMovement', () => {
    it('traduce los tipos de la base a los de la pantalla', () => {
        expect(toUiMovement(movement({ id: 'a', amount: '10' })).type).toBe('sale');
        expect(toUiMovement(movement({ movement_type: 'expense', direction: 'out' })).type).toBe('expense');
        expect(toUiMovement(movement({ movement_type: 'refund', direction: 'out' })).type).toBe('withdrawal');
        expect(toUiMovement(movement({ movement_type: 'adjustment', direction: 'in' })).type).toBe('deposit');
    });

    it('usa una descripción por defecto y marca todo como confirmado', () => {
        const ui = toUiMovement(movement({ id: 'm1', description: '  ', amount: '55.5', method: 'transfer' }));
        expect(ui).toMatchObject({ id: 'm1', session_id: 'sess-1', description: 'Cobro de venta', amount: 55.5, payment_method: 'transfer', status: 'confirmed' });
    });
});

describe('movementTag', () => {
    it('etiqueta cada movimiento de la lista de caja', () => {
        expect(movementTag(movement({ movement_type: 'sale_payment' }))).toBe('Venta');
        expect(movementTag(movement({ movement_type: 'deposit', sale_id: 's1' }))).toBe('Propina');
        expect(movementTag(movement({ movement_type: 'withdrawal', direction: 'out', sale_id: 's1' }))).toBe('Propina');
        expect(movementTag(movement({ movement_type: 'expense', direction: 'out' }))).toBe('Gasto');
        expect(movementTag(movement({ movement_type: 'withdrawal', direction: 'out' }))).toBe('Retiro');
        expect(movementTag(movement({ movement_type: 'deposit' }))).toBe('Entrada');
        expect(movementTag(movement({ movement_type: 'refund', direction: 'out' }))).toBe('Reembolso');
    });
});

// Cliente falso: cada tabla devuelve sus filas y rpc('member_display_names') lo que diga la prueba.
function fakeSupabase(tables: Record<string, unknown[]>, rpcResult: { data: unknown; error: unknown }) {
    const fromCalls: string[] = [];
    const rpc = vi.fn<(name: string, args: unknown) => Promise<typeof rpcResult>>(async () => rpcResult);
    const builder = (rows: unknown[]) => {
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b;
        b.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
        return b;
    };
    const client = { from: (t: string) => { fromCalls.push(t); return builder(tables[t] ?? []); }, rpc };
    return { client: client as unknown as SupabaseClient, rpc, fromCalls };
}

describe('nombres de quien abrió y cerró la caja', () => {
    const OWNER = '76c82fae-0000-4000-8000-000000000001';
    const DAGO = 'afe3a615-0000-4000-8000-000000000002';

    it('recepción recibe el nombre de la cuenta principal (sin leer perfiles ajenos)', async () => {
        const { client, rpc, fromCalls } = fakeSupabase(
            { cash_sessions: [{ ...session, opened_by: OWNER }], cash_movements: [] },
            { data: [{ user_id: OWNER, display_name: 'Alonso' }], error: null },
        );
        const view = await loadOpenSession(client, 'biz-1', 'branch-1');
        expect(view?.opened_by).toBe('Alonso');
        expect(view?.closed_by).toBeNull();
        expect(rpc).toHaveBeenCalledWith('member_display_names', { p_business_id: 'biz-1', p_user_ids: [OWNER] });
        expect(fromCalls).not.toContain('profiles');
    });

    it('el historial trae quién abrió y quién cerró', async () => {
        const closed = { ...session, status: 'closed' as const, opened_by: DAGO, closed_by: OWNER, closed_at: '2026-11-07T19:30:00Z' };
        const { client, rpc } = fakeSupabase(
            { cash_sessions: [closed], cash_movements: [] },
            { data: [{ user_id: OWNER, display_name: 'Alonso' }, { user_id: DAGO, display_name: 'Dago' }], error: null },
        );
        const [view] = await loadClosedSessions(client, 'biz-1', 'branch-1');
        expect(view.opened_by).toBe('Dago');
        expect(view.closed_by).toBe('Alonso');
        expect(rpc.mock.calls[0][1]).toEqual({ p_business_id: 'biz-1', p_user_ids: [DAGO, OWNER] });
    });

    it('si el nombre no llega, la caja sigue funcionando con el comodín', async () => {
        const { client } = fakeSupabase(
            { cash_sessions: [{ ...session, opened_by: OWNER }], cash_movements: [{ cash_session_id: 'sess-1', amount: 100, method: 'cash', movement_type: 'sale_payment', direction: 'in' }] },
            { data: null, error: { code: '42883', message: 'function does not exist' } },
        );
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const view = await loadOpenSession(client, 'biz-1', 'branch-1');
        errorLog.mockRestore();
        expect(view?.opened_by).toBe(UNKNOWN_OPENER);
        expect(view?.total_cash).toBe(100);
    });

    it('buildSessionView deja closed_by en null si nadie la ha cerrado', () => {
        expect(buildSessionView(session, [], 'Dago').closed_by).toBeNull();
        expect(buildSessionView(session, [], 'Dago', 'Sonia').closed_by).toBe('Sonia');
    });
});
