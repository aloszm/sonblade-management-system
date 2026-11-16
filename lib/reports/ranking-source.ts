import type { RankingPerson } from '@/lib/reports/ranking';

/** La función team_ranking aún no está en la base (PGRST202 de PostgREST o 42883 de Postgres). */
export function isMissingFunction(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const { code, message } = error as { code?: string; message?: string };
    return code === 'PGRST202' || code === '42883' || /could not find the function/i.test(message ?? '');
}

const peso = (v: unknown): number | null => (v === null || v === undefined ? null : Math.round(Number(v) * 100));

/** Convierte el jsonb de public.team_ranking en cifras por persona (dinero en centavos; null = oculto). */
export function parseTeamRanking(data: unknown): RankingPerson[] {
    const rows = (data as { rows?: unknown } | null)?.rows;
    if (!Array.isArray(rows)) return [];
    return rows.map((r: Record<string, unknown>) => ({
        id: String(r.employee_id),
        name: String(r.name ?? ''),
        isBarber: Boolean(r.is_barber),
        services: Number(r.services ?? 0),
        productUnits: Number(r.product_units ?? 0),
        serviceRevenueCents: peso(r.service_revenue),
        productRevenueCents: peso(r.product_revenue),
        revenuePlace: r.revenue_rank === null || r.revenue_rank === undefined ? null : Number(r.revenue_rank),
    }));
}
