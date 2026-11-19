// Clientes con su resumen (C1, 20261119212000). Contrato de /api/clients y /api/clients/[id].
//
// Regla única de VISITA (la aplica la base en public.client_summaries): una venta cobrada y no anulada
// (las ventas de una misma cita cuentan una vez) o una cita completada que no tiene venta.
// total_spent: suma de esas ventas, sin propinas. Para el barbero llega null (no ve importes).
import type { SupabaseClient } from '@supabase/supabase-js';

export const CLIENT_COLUMNS = 'id, full_name, phone, email, notes, preferences, is_active, created_at, updated_at';

export type ClientRow = {
    id: string; full_name: string; phone: string | null; email: string | null; notes: string | null; preferences: string | null;
    is_active: boolean; created_at: string; updated_at: string;
};

export type ClientSummary = {
    visits: number;
    last_visit_at: string | null;
    /** null para el barbero. */
    total_spent: number | null;
    no_shows: number;
    next_appointment_at: string | null;
    next_appointment_id: string | null;
};

export type ClientView = ClientRow & ClientSummary & { name: string };

export const EMPTY_SUMMARY: ClientSummary = {
    visits: 0, last_visit_at: null, total_spent: 0, no_shows: 0, next_appointment_at: null, next_appointment_id: null,
};

type SummaryRow = {
    client_id: string; visits: number; last_visit_at: string | null; total_spent: number | string | null; no_shows: number;
    next_appointment_at: string | null; next_appointment_id: string | null;
};

/** Une cada cliente con su resumen (una sola llamada a la base para toda la lista). */
export async function withSummaries(supabase: SupabaseClient, branchId: string, clients: ClientRow[]): Promise<ClientView[]> {
    if (clients.length === 0) return [];
    const { data, error } = await supabase.rpc('client_summaries', { p_branch_id: branchId, p_client_ids: clients.map((c) => c.id) });
    if (error) throw error;
    const byId = new Map(((data ?? []) as SummaryRow[]).map((s) => [s.client_id, s]));
    return clients.map((client) => {
        const s = byId.get(client.id);
        const summary: ClientSummary = s ? {
            visits: Number(s.visits ?? 0),
            last_visit_at: s.last_visit_at,
            total_spent: s.total_spent === null ? null : Number(s.total_spent),
            no_shows: Number(s.no_shows ?? 0),
            next_appointment_at: s.next_appointment_at,
            next_appointment_id: s.next_appointment_id,
        } : EMPTY_SUMMARY;
        return { ...client, ...summary, name: client.full_name };
    });
}

/** Una fila del historial de la ficha (public.client_history). */
export type ClientHistoryEntry = {
    kind: 'appointment' | 'sale';
    id: string;
    at: string;
    ends_at: string | null;
    /** Estado de la cita (kind 'appointment') o de la venta (kind 'sale'). */
    status: string;
    source: 'appointment' | 'walk_in' | 'online' | null;
    barber: string | null;
    services: string[];
    products: string[];
    notes: string | null;
    sale_id: string | null;
    folio: string | null;
    sale_status: string | null;
    /** null para el barbero o si la cita no tiene venta. */
    total: number | null;
};
