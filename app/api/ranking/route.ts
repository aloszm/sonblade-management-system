import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { readerRole } from '@/lib/auth/roles';
import { periodWindow } from '@/lib/barber/my-week';
import { loadBusinessTimezone } from '@/lib/business/timezone';
import type { PodiumRow } from '@/lib/reports/podium';
import { boardsFromCuts, buildBoards, unavailableBoards, type Boards, type RankingPerson } from '@/lib/reports/ranking';
import { isMissingFunction, parseTeamRanking } from '@/lib/reports/ranking-source';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadEmployees, loadTeamSummary } from '@/lib/team/load';
import { toRankingPeople } from '@/lib/team/summary';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['week', 'last_week', 'month']).catch('week');
type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Source = 'function' | 'fallback' | 'limited';

// La función de la base y la lectura directa entregan lo mismo; el ranking lo arma siempre buildBoards, que es
// quien oculta el dinero ajeno al barbero. Aquí solo se decide de dónde salen las cifras.
async function rankingViaFunction(db: Db, branchId: string, win: { start: string; end: string }): Promise<RankingPerson[] | 'missing'> {
    // La función aún no figura en los tipos generados de la base.
    const client = db as unknown as { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
    const { data, error } = await client.rpc('team_ranking', { p_branch_id: branchId, p_from: win.start, p_to: win.end });
    if (error) {
        if (isMissingFunction(error)) return 'missing';
        throw error;
    }
    return parseTeamRanking(data);
}

/**
 * Ranking del equipo en tres clasificaciones (cortes, ingreso, productos vendidos).
 * 1) Usa public.team_ranking si existe en la base. 2) Si no, dueño, gerencia, caja y recepción lo calculan leyendo
 * ventas (la base se lo permite). 3) Un barbero solo tiene los cortes de la semana (weekly_cuts_podium); lo demás
 * queda "disponible pronto". El dinero ajeno nunca sale de aquí para un barbero.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const period = PeriodSchema.parse(request.nextUrl.searchParams.get('period') ?? undefined);
        const supabase = await createSupabaseServerClient();
        const timezone = await loadBusinessTimezone(supabase, context.businessId);
        const win = periodWindow(period, new Date(), timezone);
        // La consulta lee el ranking como gerencia (con importes); nunca escribe aquí.
        const viewer = { role: readerRole(context.role), employeeId: context.employeeId };

        let boards: Boards;
        let source: Source = 'function';
        const current = await rankingViaFunction(supabase, context.branchId, win);
        if (current !== 'missing') {
            const previous = await rankingViaFunction(supabase, context.branchId, win.previous).catch(() => 'missing' as const);
            boards = buildBoards(current, previous === 'missing' ? null : previous, viewer);
        } else if (context.role !== 'barber') {
            source = 'fallback';
            const employees = await loadEmployees(supabase, context.businessId);
            const [now, before] = await Promise.all([
                loadTeamSummary(supabase, context, win, employees),
                loadTeamSummary(supabase, context, win.previous, employees).catch(() => null),
            ]);
            boards = buildBoards(toRankingPeople(now), before ? toRankingPeople(before) : null, viewer);
        } else {
            source = 'limited';
            if (period === 'week') {
                const { data, error } = await supabase.rpc('weekly_cuts_podium', { p_branch_id: context.branchId });
                if (error) throw error;
                boards = boardsFromCuts(((data as { rows?: PodiumRow[] } | null)?.rows ?? []));
            } else {
                boards = unavailableBoards();
            }
        }
        return Response.json({ period, source, window: { start: win.start, end: win.end }, boards }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
