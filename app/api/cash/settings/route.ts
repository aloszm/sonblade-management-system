import { NextRequest } from 'next/server';
import { z } from 'zod';
import { FRONT_DESK_READ_ROLES, MANAGEMENT_READ_ROLES, MANAGEMENT_ROLES, cashMovementNeedsPin } from '@/lib/auth/roles';
import { PinConfirmSchema, pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const SettingsSchema = z.object({
    float_target: z.number().min(0).max(1_000_000),
    reserve_amount: z.number().min(0).max(1_000_000),
    reserve_label: z.string().trim().min(2, 'Escribe para qué es el apartado.').max(60),
}).merge(PinConfirmSchema);

type BranchRow = { cash_float_target: number | string; daily_reserve_amount: number | string; daily_reserve_label: string };

/**
 * Ajustes de caja de la sucursal: fondo que se deja para el día siguiente y apartado diario.
 * También dice cuánto se dejó en el último cierre, para proponerlo al abrir.
 */
export async function GET() {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        const [branch, last] = await Promise.all([
            supabase.from('branches').select('cash_float_target, daily_reserve_amount, daily_reserve_label').eq('id', context.branchId).single(),
            supabase.from('cash_sessions').select('float_left').eq('business_id', context.businessId).eq('branch_id', context.branchId)
                .eq('status', 'closed').order('closed_at', { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (branch.error) throw branch.error;
        if (last.error) throw last.error;
        const row = branch.data as unknown as BranchRow;
        const left = (last.data as unknown as { float_left: number | string | null } | null)?.float_left;
        return Response.json({
            float_target: Number(row.cash_float_target),
            reserve_amount: Number(row.daily_reserve_amount),
            reserve_label: row.daily_reserve_label,
            last_float_left: left === null || left === undefined ? null : Number(left),
            // Dueño y gerencia, siempre con PIN y comentario (set_cash_settings_confirmed).
            can_edit: MANAGEMENT_ROLES.includes(context.role),
            // Gerencia confirma con PIN sus gastos, retiros y entradas manuales.
            movement_needs_pin: cashMovementNeedsPin(context.role),
            can_see_history: MANAGEMENT_READ_ROLES.includes(context.role),
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Cambia el fondo y el apartado. Dueño o gerencia, siempre con su PIN y un comentario: el PIN se
 * verifica en esta misma petición y el cambio lo hace set_cash_settings_confirmed con la sesión
 * recién abierta (la tabla branches sigue siendo solo del dueño). Queda en la bitácora.
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = SettingsSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const outcome = await runWithPin(context, parsed.data.pin, async (client) => {
            const { data, error } = await client.rpc('set_cash_settings_confirmed', {
                p_branch_id: context.branchId,
                p_float_target: parsed.data.float_target,
                p_reserve_amount: parsed.data.reserve_amount,
                p_reserve_label: parsed.data.reserve_label,
                p_comment: parsed.data.comment,
            });
            if (error) throw error;
            return data;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        return Response.json(outcome.value, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
