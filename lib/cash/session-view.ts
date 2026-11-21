import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMemberNames } from '@/lib/auth/member-names';
import type { CashMovement, CashSession } from '@/types';

// Filas tal como las devuelve la base (esquema v2).
export type CashSessionRow = {
    id: string;
    status: 'open' | 'closed';
    opening_cash: number | string;
    counted_cash: number | string | null;
    difference_amount: number | string | null;
    opened_by: string;
    opened_at: string;
    closed_at: string | null;
    closed_by?: string | null;
    // Cierre guiado: lo que se dejó de fondo, lo apartado y lo retirado.
    opening_expected?: number | string | null;
    float_left?: number | string | null;
    reserve_amount?: number | string | null;
    withdrawn_amount?: number | string | null;
    /** A quién se entregó el retiro del cierre. */
    withdrawal_delivered_to?: string | null;
    counted_breakdown?: Record<string, number> | null;
    /** Esperado que la base guardó al cerrar (sirve para comprobar el cierre). */
    expected_cash?: number | string | null;
    /** Motivo escrito al dejar menos del fondo recomendado. */
    closing_note?: string | null;
};

export type CashMovementRow = {
    id?: string;
    cash_session_id: string;
    amount: number | string;
    method: string;
    movement_type: string;
    direction: 'in' | 'out';
    description?: string | null;
    created_at?: string;
    sale_id?: string | null;
    /** Gasto que originó el movimiento (gastos pagados de la caja y su cancelación). */
    expense_id?: string | null;
    /** Pago semanal que originó el movimiento (comisiones, propinas, sueldos). */
    commission_settlement_id?: string | null;
    /** Quién lo registró. */
    created_by?: string | null;
};

/**
 * Una propina (o su devolución) es una entrada/salida ligada a una venta que no es cobro ni reembolso:
 * la base la registra como deposit/withdrawal con sale_id.
 */
export function isTipMovement(m: Pick<CashMovementRow, 'movement_type' | 'sale_id'>): boolean {
    return Boolean(m.sale_id) && (m.movement_type === 'deposit' || m.movement_type === 'withdrawal');
}

const num = (value: number | string | null | undefined) => Number(value ?? 0);
const round2 = (value: number) => Math.round(value * 100) / 100;
const optional = (value: number | string | null | undefined) => (value === null || value === undefined ? null : Number(value));

/**
 * Arma la vista que espera la pantalla de caja a partir de la sesion y sus movimientos.
 * Todo sale de la base; el efectivo esperado sigue RB-12:
 *   esperado = inicial + entradas de efectivo - salidas de efectivo
 * y la pantalla lo calcula como initial_amount + total_cash - total_expenses.
 */
export function buildSessionView(
    session: CashSessionRow,
    movements: CashMovementRow[],
    openedByName: string,
    closedByName: string | null = null,
): CashSession {
    let totalSales = 0;
    let totalTips = 0;
    let totalCard = 0;
    let totalTransfer = 0;
    let cashIn = 0;
    let cashOut = 0;

    for (const m of movements) {
        const amount = num(m.amount);
        const signed = m.direction === 'in' ? amount : -amount;
        const tip = isTipMovement(m);
        if (m.movement_type === 'sale_payment' || m.movement_type === 'refund') totalSales += signed;
        // Las propinas no son venta del negocio, pero sí dinero que entró por ese método (cuadra con la terminal).
        if (tip) totalTips += signed;
        if (tip || m.movement_type === 'sale_payment' || m.movement_type === 'refund') {
            if (m.method === 'card') totalCard += signed;
            if (m.method === 'transfer') totalTransfer += signed;
        }
        if (m.method === 'cash') {
            if (m.direction === 'in') cashIn += amount;
            else cashOut += amount;
        }
    }

    return {
        id: session.id,
        opened_by: openedByName,
        closed_by: closedByName,
        initial_amount: num(session.opening_cash),
        total_sales: round2(totalSales),
        total_tips: round2(totalTips),
        total_expenses: round2(cashOut),
        total_cash: round2(cashIn),
        total_card: round2(totalCard),
        total_transfer: round2(totalTransfer),
        physical_count: session.counted_cash === null ? null : num(session.counted_cash),
        difference: session.difference_amount === null ? null : num(session.difference_amount),
        status: session.status,
        opened_at: session.opened_at,
        closed_at: session.closed_at,
        // Efectivo que debería haber físicamente (RB-12).
        expected_cash: round2(num(session.opening_cash) + cashIn - cashOut),
        opening_expected: optional(session.opening_expected),
        float_left: optional(session.float_left),
        reserve_amount: optional(session.reserve_amount),
        withdrawn_amount: optional(session.withdrawn_amount),
        withdrawal_delivered_to: session.withdrawal_delivered_to ?? null,
        counted_breakdown: session.counted_breakdown ?? null,
    };
}

/** Etiqueta corta del movimiento para la lista de la pantalla de caja. */
export function movementTag(row: Pick<CashMovementRow, 'movement_type' | 'sale_id'>): NonNullable<CashMovement['tag']> {
    if (isTipMovement(row)) return 'Propina';
    switch (row.movement_type) {
        case 'sale_payment': return 'Venta';
        case 'expense': return 'Gasto';
        case 'withdrawal': return 'Retiro';
        case 'deposit': return 'Entrada';
        case 'refund': return 'Reembolso';
        default: return 'Ajuste';
    }
}

/** Traduce un movimiento de la base al formato que muestra la pantalla. */
export function toUiMovement(row: CashMovementRow): CashMovement {
    let type: CashMovement['type'];
    switch (row.movement_type) {
        case 'sale_payment': type = 'sale'; break;
        case 'expense': type = 'expense'; break;
        case 'deposit': type = 'deposit'; break;
        case 'withdrawal': type = 'withdrawal'; break;
        default: type = row.direction === 'in' ? 'deposit' : 'withdrawal'; // refund / adjustment
    }
    const fallback: Record<string, string> = {
        sale_payment: 'Cobro de venta', refund: 'Reembolso de venta', adjustment: 'Ajuste de caja',
    };
    return {
        id: row.id ?? '',
        session_id: row.cash_session_id,
        type,
        description: row.description?.trim() || fallback[row.movement_type] || 'Movimiento de caja',
        amount: num(row.amount),
        payment_method: row.method,
        status: 'confirmed',
        created_at: row.created_at ?? '',
        tag: movementTag(row),
    };
}

export const SESSION_COLUMNS = 'id, status, opening_cash, counted_cash, difference_amount, opened_by, opened_at, closed_at, closed_by, opening_expected, float_left, reserve_amount, withdrawn_amount, withdrawal_delivered_to, counted_breakdown';
/** Lo mismo más lo que necesita «El camino del efectivo». */
export const FLOW_SESSION_COLUMNS = `${SESSION_COLUMNS}, expected_cash, closing_note`;
export const FLOW_MOVEMENT_COLUMNS = 'id, cash_session_id, amount, method, movement_type, direction, description, created_at, sale_id, expense_id, commission_settlement_id, created_by';
export const MOVEMENT_COLUMNS = 'id, cash_session_id, amount, method, movement_type, direction, description, created_at, sale_id';

/** Nombre que se usa cuando el servidor no puede decir quién abrió la caja. */
export const UNKNOWN_OPENER = 'Usuario';

async function toViews(supabase: SupabaseClient, businessId: string, sessions: CashSessionRow[]): Promise<CashSession[]> {
    if (sessions.length === 0) return [];
    const ids = sessions.map((s) => s.id);

    // Nombres visibles de quien abrió y cerró: public.member_display_names los da a cualquier miembro activo
    // del negocio (recepción no puede leer perfiles ajenos, y la cuenta principal no tiene ficha de empleado).
    const [{ data: movements, error: movementsError }, names] = await Promise.all([
        supabase.from('cash_movements').select(MOVEMENT_COLUMNS).in('cash_session_id', ids).limit(5000),
        loadMemberNames(supabase, businessId, sessions.flatMap((s) => [s.opened_by, s.closed_by])),
    ]);
    if (movementsError) throw movementsError;

    const bySession = new Map<string, CashMovementRow[]>();
    for (const m of (movements ?? []) as unknown as CashMovementRow[]) {
        const list = bySession.get(m.cash_session_id) ?? [];
        list.push(m);
        bySession.set(m.cash_session_id, list);
    }
    return sessions.map((s) => buildSessionView(
        s,
        bySession.get(s.id) ?? [],
        names.get(s.opened_by) ?? UNKNOWN_OPENER,
        s.closed_by ? names.get(s.closed_by) ?? null : null,
    ));
}

export async function loadOpenSession(supabase: SupabaseClient, businessId: string, branchId: string): Promise<CashSession | null> {
    const { data, error } = await supabase.from('cash_sessions').select(SESSION_COLUMNS)
        .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'open')
        .order('opened_at', { ascending: false }).limit(1);
    if (error) throw error;
    return (await toViews(supabase, businessId, (data ?? []) as unknown as CashSessionRow[]))[0] ?? null;
}

export async function loadSessionById(supabase: SupabaseClient, businessId: string, branchId: string, sessionId: string): Promise<CashSession | null> {
    const { data, error } = await supabase.from('cash_sessions').select(SESSION_COLUMNS)
        .eq('business_id', businessId).eq('branch_id', branchId).eq('id', sessionId).limit(1);
    if (error) throw error;
    return (await toViews(supabase, businessId, (data ?? []) as unknown as CashSessionRow[]))[0] ?? null;
}

export async function loadClosedSessions(supabase: SupabaseClient, businessId: string, branchId: string, limit = 30): Promise<CashSession[]> {
    const { data, error } = await supabase.from('cash_sessions').select(SESSION_COLUMNS)
        .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'closed')
        .order('closed_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return toViews(supabase, businessId, (data ?? []) as unknown as CashSessionRow[]);
}
