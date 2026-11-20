import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_READ_ROLES, MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { toTicket, type TicketSaleRow } from '@/lib/sales/ticket';
import { loadMemberNames } from '@/lib/auth/member-names';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';

export const dynamic = 'force-dynamic';

const ReasonSchema = z.object({
    reason: z.string().trim().min(3, 'Escribe el motivo de la anulación.').max(500),
    // Anular se confirma con el PIN de quien anula (B2). Nunca se guarda.
    pin: z.string().max(16).optional(),
});

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Ticket de una venta para el cliente. Recepción y administración. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Venta no encontrada.', 404);
        const supabase = await createSupabaseServerClient();
        const [sale, business, branch] = await Promise.all([
            supabase.from('sales')
                .select('id, folio, created_at, status, subtotal_amount, discount_amount, total_amount, client_id, created_by, sale_items(item_type, item_name_snapshot, quantity, unit_price, discount_amount, line_total, employee_id), payments(method, amount, status), sale_tips(amount, method, status)')
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
            // Quién cobró: nombre visible para cualquier miembro (los perfiles ajenos no se leen por RLS).
            loadMemberNames(supabase, context.businessId, [row.created_by]),
        ]);
        const ticket = toTicket(row, {
            employees: new Map(((employees.data ?? []) as unknown as { id: string; display_name: string }[]).map((e) => [e.id, e.display_name])),
            client: (client.data as unknown as { full_name: string } | null)?.full_name ?? null,
            cashier: row.created_by ? cashier.get(row.created_by) ?? null : null,
        });
        return Response.json({ ...ticket, business: biz, branch: branch.data }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Anula una venta (RB-13: las ventas no se borran). La función de la base devuelve el dinero a la
 * caja abierta, regresa las existencias, revierte las comisiones y deja la huella en la auditoría.
 * Solo dueño y administrador, siempre con su PIN: el servidor lo verifica en esta misma petición y la
 * anulación la hace reverse_sale_confirmed con la sesión recién abierta (la base exige esa sesión
 * reciente y de un solo uso). Queda en la bitácora como pin_confirmed_action con el motivo.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Venta no encontrada.', 404);
        const body = ReasonSchema.safeParse(await request.json().catch(() => null));
        if (!body.success) {
            return Response.json({ error: body.error.issues[0]?.message ?? 'Escribe el motivo de la anulación.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        }
        if (!body.data.pin) {
            return Response.json({ error: 'Confirma con tu PIN para anular la venta.', needs_pin: true }, { status: 428, headers: { 'Cache-Control': 'no-store' } });
        }
        const reason = body.data.reason;
        const outcome = await runWithPin(context, body.data.pin, async (client) => {
            const { data, error } = await client.rpc('reverse_sale_confirmed', { p_sale_id: id.data, p_reason: reason });
            if (error) throw error;
            return data;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        return Response.json(outcome.value, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
