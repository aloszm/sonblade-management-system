import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMemberNames } from '@/lib/auth/member-names';
import { businessDayRange } from '@/lib/business/timezone';
import {
    buildCashFlows, type CashFlow, type FlowTargets, type OtherExpenses,
} from '@/lib/cash/cash-flow';
import {
    FLOW_MOVEMENT_COLUMNS, UNKNOWN_OPENER, withFlowSessionColumns, type CashMovementRow, type CashSessionRow,
} from '@/lib/cash/session-view';

// Lectura con el cliente del usuario (RLS). Nunca select('*'). PostgREST entrega como máximo 1000 filas por consulta: se pagina.

export const PAGE = 1000;

export type Query = { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> };

export async function fetchAll<T>(build: () => Query): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await build().range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as T[];
        rows.push(...page);
        if (page.length < PAGE) return rows;
    }
}

/** Fondo y apartado que la sucursal tiene configurados (para proponer el reparto de una caja abierta). */
export async function loadFlowTargets(supabase: SupabaseClient, branchId: string): Promise<FlowTargets | null> {
    const { data, error } = await supabase.from('branches').select('cash_float_target, daily_reserve_amount, daily_reserve_label').eq('id', branchId).single();
    if (error || !data) return null;
    const row = data as unknown as { cash_float_target: number | string; daily_reserve_amount: number | string; daily_reserve_label: string };
    return { floatTarget: Number(row.cash_float_target), reserveAmount: Number(row.daily_reserve_amount), reserveLabel: row.daily_reserve_label };
}

/**
 * El camino del efectivo de varias cajas. `showAuthors`: poner «quién lo registró» en cada movimiento; recepción no lo recibe
 * (su lista de movimientos de caja tampoco lo muestra).
 */
export async function loadCashFlows(
    supabase: SupabaseClient,
    scope: { businessId: string; branchId: string },
    sessions: CashSessionRow[],
    options: { showAuthors: boolean },
): Promise<CashFlow[]> {
    if (sessions.length === 0) return [];
    const ids = sessions.map((s) => s.id);
    const [movements, targets] = await Promise.all([
        fetchAll<CashMovementRow>(() => supabase.from('cash_movements').select(FLOW_MOVEMENT_COLUMNS)
            .eq('business_id', scope.businessId).eq('branch_id', scope.branchId).in('cash_session_id', ids).order('created_at').order('id')),
        loadFlowTargets(supabase, scope.branchId),
    ]);
    const names = await loadMemberNames(supabase, scope.businessId, [
        ...sessions.flatMap((s) => [s.opened_by, s.closed_by]),
        ...(options.showAuthors ? movements.map((m) => m.created_by) : []),
    ]);
    return buildCashFlows(sessions, movements, names, { targets, authors: options.showAuthors ? names : null, unknownName: UNKNOWN_OPENER });
}

/** Una caja por su id (de la sucursal del usuario); null si no existe. */
export async function loadSessionRow(
    supabase: SupabaseClient, scope: { businessId: string; branchId: string }, sessionId: string,
): Promise<CashSessionRow | null> {
    return withFlowSessionColumns(async (columns) => {
        const { data, error } = await supabase.from('cash_sessions').select(columns)
            .eq('business_id', scope.businessId).eq('branch_id', scope.branchId).eq('id', sessionId).limit(1);
        if (error) throw error;
        return ((data ?? []) as unknown as CashSessionRow[])[0] ?? null;
    });
}

/**
 * Gastos del día pagados del sobre o del banco: NO salen de la caja. Solo se piden para quien ve la pantalla de Gastos
 * (cuenta principal, gerencia, consulta).
 */
export async function loadOtherExpenses(
    supabase: SupabaseClient, scope: { businessId: string; branchId: string }, day: string, timezone: string,
): Promise<OtherExpenses> {
    const range = businessDayRange(day, day, timezone);
    const rows = await fetchAll<{ amount: number | string; paid_from: string }>(() => supabase.from('expenses').select('amount, paid_from')
        .eq('business_id', scope.businessId).eq('branch_id', scope.branchId).eq('status', 'posted').in('paid_from', ['envelope', 'bank'])
        .gte('incurred_at', range.from).lt('incurred_at', range.to).order('id'));
    const cents = (v: number | string) => Math.round(Number(v) * 100);
    return {
        envelopeCents: rows.filter((r) => r.paid_from === 'envelope').reduce((t, r) => t + cents(r.amount), 0),
        bankCents: rows.filter((r) => r.paid_from === 'bank').reduce((t, r) => t + cents(r.amount), 0),
        count: rows.length,
    };
}
