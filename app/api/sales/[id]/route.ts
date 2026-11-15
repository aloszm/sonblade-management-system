import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { toTicket, type TicketSaleRow } from '@/lib/sales/ticket';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ReasonSchema = z.object({ reason: z.string().trim().min(3, 'Escribe el motivo de la anulación.').max(500) });

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Ticket de una venta para el cliente. Recepción y administración. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext([...FRONT_DESK_ROLES]);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Venta no encontrada.', 404);
        const supabase = await createSupabaseServerClient();
        const [sale, business, branch] = await Promise.all([
            supabase.from('sales')
                .select('id, created_at, status, subtotal_amount, discount_amount, total_amount, client_id, created_by, sale_items(item_type, item_name_snapshot, quantity, unit_price, discount_amount, line_total, employee_id), payments(method, amount, status), sale_tips(amount, method, status)')
                .eq('business_id', context.businessId).eq('branch_id', context.branchId).eq('id', id.data).maybeSingle(),
            supabase.from('businesses').select('name, currency, timezone').eq('id', context.businessId).single(),
            supabase.from('branches').select('name, address, phone').eq('id', context.branchId).single(),
        ]);
        if (sale.error) throw sale.error;
        if (business.error) throw business.error;
        if (branch.error) throw branch.error;
        if (!sale.data) throw new AuthorizationError('Venta no encontrada.', 404);
        const row = sale.data as unknown as TicketSaleRow;
        const biz = business.data as unknown as { name: string; currency: string; timezone: string };

        const employeeIds = Array.from(new Set(row.sale_items.map((i) => i.employee_id).filter((v): v is string => Boolean(v))));
        const [employees, client, cashier] = await Promise.all([
            employeeIds.length ? supabase.from('employees').select('id, display_name').in('id', employeeIds) : Promise.resolve({ data: [] }),
            row.client_id ? supabase.from('clients').select('full_name').eq('id', row.client_id).maybeSingle() : Promise.resolve({ data: null }),
            row.created_by ? supabase.from('profiles').select('full_name').eq('user_id', row.created_by).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        const ticket = toTicket(row, {
            employees: new Map(((employees.data ?? []) as unknown as { id: string; display_name: string }[]).map((e) => [e.id, e.display_name])),
            client: (client.data as unknown as { full_name: string } | null)?.full_name ?? null,
            cashier: (cashier.data as unknown as { full_name: string | null } | null)?.full_name ?? null,
        }, biz.timezone);
        return Response.json({ ...ticket, business: biz, branch: branch.data }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Anula una venta (RB-13: las ventas no se borran). La función de la base devuelve el dinero a la
 * caja abierta, regresa las existencias, revierte las comisiones y deja la huella en la auditoría.
 * Solo dueño y administrador.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuthContext(['owner', 'admin']);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Venta no encontrada.', 404);
        const body = ReasonSchema.safeParse(await request.json().catch(() => null));
        if (!body.success) {
            return Response.json({ error: body.error.issues[0]?.message ?? 'Escribe el motivo de la anulación.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        }
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('reverse_sale', { p_sale_id: id.data, p_reason: body.data.reason } as never);
        if (error) throw error;
        return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
