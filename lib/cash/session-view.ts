import type { SupabaseClient } from '@supabase/supabase-js';
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
};

const num = (value: number | string | null | undefined) => Number(value ?? 0);
const round2 = (value: number) => Math.round(value * 100) / 100;

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
): CashSession {
    let totalSales = 0;
    let totalCard = 0;
    let totalTransfer = 0;
    let cashIn = 0;
    let cashOut = 0;

    for (const m of movements) {
        const amount = num(m.amount);
        const signed = m.direction === 'in' ? amount : -amount;
        if (m.movement_type === 'sale_payment' || m.movement_type === 'refund') {
            totalSales += signed;
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
        initial_amount: num(session.opening_cash),
        total_sales: round2(totalSales),
        total_expenses: round2(cashOut),
        total_cash: round2(cashIn),
        total_card: round2(totalCard),
        total_transfer: round2(totalTransfer),
        physical_count: session.counted_cash === null ? null : num(session.counted_cash),
        difference: session.difference_amount === null ? null : num(session.difference_amount),
        status: session.status,
        opened_at: session.opened_at,
        closed_at: session.closed_at,
    };
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
    };
}

const SESSION_COLUMNS = 'id, status, opening_cash, counted_cash, difference_amount, opened_by, opened_at, closed_at';
const MOVEMENT_COLUMNS = 'id, cash_session_id, amount, method, movement_type, direction, description, created_at';

async function toViews(supabase: SupabaseClient, sessions: CashSessionRow[]): Promise<CashSession[]> {
    if (sessions.length === 0) return [];
    const ids = sessions.map((s) => s.id);
    const userIds = Array.from(new Set(sessions.map((s) => s.opened_by)));

    const [{ data: movements, error: movementsError }, { data: profiles }] = await Promise.all([
        supabase.from('cash_movements').select(MOVEMENT_COLUMNS).in('cash_session_id', ids).limit(5000),
        supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
    ]);
    if (movementsError) throw movementsError;

    const names = new Map<string, string>();
    for (const p of (profiles ?? []) as { user_id: string; full_name: string | null }[]) {
        if (p.full_name) names.set(p.user_id, p.full_name);
    }
    const bySession = new Map<string, CashMovementRow[]>();
    for (const m of (movements ?? []) as unknown as CashMovementRow[]) {
        const list = bySession.get(m.cash_session_id) ?? [];
        list.push(m);
        bySession.set(m.cash_session_id, list);
    }
    return sessions.map((s) => buildSessionView(s, bySession.get(s.id) ?? [], names.get(s.opened_by) ?? 'Usuario'));
}

export async function loadOpenSession(supabase: SupabaseClient, businessId: string, branchId: string): Promise<CashSession | null> {
    const { data, error } = await supabase.from('cash_sessions').select(SESSION_COLUMNS)
        .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'open')
        .order('opened_at', { ascending: false }).limit(1);
    if (error) throw error;
    return (await toViews(supabase, (data ?? []) as unknown as CashSessionRow[]))[0] ?? null;
}

export async function loadSessionById(supabase: SupabaseClient, businessId: string, branchId: string, sessionId: string): Promise<CashSession | null> {
    const { data, error } = await supabase.from('cash_sessions').select(SESSION_COLUMNS)
        .eq('business_id', businessId).eq('branch_id', branchId).eq('id', sessionId).limit(1);
    if (error) throw error;
    return (await toViews(supabase, (data ?? []) as unknown as CashSessionRow[]))[0] ?? null;
}

export async function loadClosedSessions(supabase: SupabaseClient, businessId: string, branchId: string, limit = 30): Promise<CashSession[]> {
    const { data, error } = await supabase.from('cash_sessions').select(SESSION_COLUMNS)
        .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'closed')
        .order('closed_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return toViews(supabase, (data ?? []) as unknown as CashSessionRow[]);
}
