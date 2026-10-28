import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SaleSchema = z.object({
    idempotency_key: z.string().uuid(),
    client_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(1000).optional(),
    discount_reason: z.string().max(300).optional(),
    items: z.array(z.object({
        item_type: z.enum(['service', 'product']),
        catalog_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(1000),
        employee_id: z.string().uuid().nullable().optional(),
        commission_employee_ids: z.array(z.string().uuid()).max(10).optional(),
        discount_amount: z.number().min(0).default(0),
    })).min(1).max(100),
    payments: z.array(z.object({
        method: z.enum(['cash', 'card', 'transfer', 'other']),
        amount: z.number().positive(),
        reference: z.string().max(200).optional(),
    })).min(1).max(10),
});

export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'cashier', 'barber', 'receptionist']);
        const supabase = await createSupabaseServerClient();
        let query = supabase.from('sales')
            .select('id, created_at, status, subtotal_amount, discount_amount, total_amount, notes, client_id, sale_items(*), payments(*)')
            .eq('business_id', context.businessId)
            .eq('branch_id', context.branchId)
            .order('created_at', { ascending: false }).limit(200);
        const from = request.nextUrl.searchParams.get('from');
        const to = request.nextUrl.searchParams.get('to');
        if (from) query = query.gte('created_at', `${from}T00:00:00.000Z`);
        if (to) query = query.lte('created_at', `${to}T23:59:59.999Z`);
        const { data, error } = await query;
        if (error) throw error;
        return Response.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'cashier']);
        const parsed = SaleSchema.safeParse(await request.json());
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400 });
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('confirm_sale', {
            p_branch_id: context.branchId,
            p_idempotency_key: parsed.data.idempotency_key,
            p_items: parsed.data.items.map(item => ({ ...item, commission_employee_ids: item.commission_employee_ids ?? [] })),
            p_payments: parsed.data.payments,
            p_client_id: parsed.data.client_id ?? null,
            p_notes: parsed.data.notes ?? null,
            p_discount_reason: parsed.data.discount_reason ?? null,
        } as never);
        if (error) throw error;
        return Response.json(data, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}

