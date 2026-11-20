import { NextRequest } from 'next/server';
import { z } from 'zod';
import { FRONT_DESK_READ_ROLES, FRONT_DESK_ROLES, cashMovementNeedsPin } from '@/lib/auth/roles';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';

export const dynamic = 'force-dynamic';
const MovementSchema = z.object({
    cash_session_id: z.string().uuid(),
    movement_type: z.enum(['expense', 'withdrawal', 'deposit']),
    method: z.enum(['cash', 'card', 'transfer', 'other']),
    amount: z.number().positive(),
    description: z.string().trim().min(2).max(300),
    // Gerencia confirma con su PIN; la descripción es el comentario que queda en la bitácora.
    pin: z.string().max(16).optional(),
});

export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        const sessionId = request.nextUrl.searchParams.get('session_id');
        let query = supabase.from('cash_movements')
            .select('id, cash_session_id, amount, method, movement_type, direction, description, created_at, sale_id, expense_id')
            .eq('business_id', context.businessId).eq('branch_id', context.branchId)
            .order('created_at', { ascending: false }).limit(500);
        if (sessionId) query = query.eq('cash_session_id', sessionId);
        const type = request.nextUrl.searchParams.get('type');
        if (type === 'expense') query = query.eq('movement_type', 'expense');
        const { data, error } = await query;
        if (error) throw error;
        return Response.json(((data ?? []) as unknown as { method: string }[]).map((row) => ({ ...row, payment_method: row.method })), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(FRONT_DESK_ROLES);
        const parsed = MovementSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400 });
        // Gerencia: siempre con PIN (record_cash_movement_confirmed, que también lo exige en la base).
        if (cashMovementNeedsPin(context.role)) {
            if (!parsed.data.pin) return Response.json({ error: 'Confirma con tu PIN para registrar este movimiento.', needs_pin: true }, { status: 428, headers: { 'Cache-Control': 'no-store' } });
            const outcome = await runWithPin(context, parsed.data.pin, async (client) => {
                const { data, error } = await client.rpc('record_cash_movement_confirmed', {
                    p_cash_session_id: parsed.data.cash_session_id,
                    p_movement_type: parsed.data.movement_type,
                    p_method: parsed.data.method,
                    p_amount: parsed.data.amount,
                    p_description: parsed.data.description,
                });
                if (error) throw error;
                return data;
            });
            if (!outcome.ok) return pinErrorResponse(outcome);
            return Response.json(outcome.value, { status: 201, headers: { 'Cache-Control': 'no-store' } });
        }
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('record_cash_movement', {
            p_cash_session_id: parsed.data.cash_session_id,
            p_movement_type: parsed.data.movement_type,
            p_method: parsed.data.method,
            p_amount: parsed.data.amount,
            p_description: parsed.data.description,
        } as never);
        if (error) throw error;
        return Response.json(data, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}

