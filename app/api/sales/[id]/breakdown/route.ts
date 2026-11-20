import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_READ_ROLES, canSeeSaleCost } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
    buildSaleBreakdown, type BreakdownCommission, type BreakdownHold, type BreakdownInput, type BreakdownItem,
    type BreakdownPayment, type BreakdownSale, type BreakdownTip,
} from '@/lib/sales/breakdown';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

const SALE_COLUMNS = 'id, folio, status, subtotal_amount, discount_amount, total_amount';
const ITEM_COLUMNS = 'id, item_type, product_id, item_name_snapshot, quantity, unit_price, discount_amount, line_total, employee_id, commission_employee_id';

/**
 * Desglose de una venta: cómo se repartió el dinero (comisiones, propina) y, para quien puede verlo, el costo de
 * producto y lo que le queda a la barbería. Solo lectura, con la sesión de quien consulta (la base aplica sus permisos).
 *
 * Quién ve qué se decide AQUÍ, en el servidor, y no en la pantalla:
 * - Cuenta principal, gerencia y consulta (canSeeSaleCost): todo.
 * - Recepción: comisiones y propina; el costo (sale_items.unit_cost_snapshot, products.cost_price) ni siquiera se lee.
 * - Barbero: 403, igual que el ticket (/api/sales/[id]); hoy no puede abrir ventas y esto no lo cambia.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Venta no encontrada.', 404);
        const withCost = canSeeSaleCost(context.role);
        const supabase = await createSupabaseServerClient();
        const where = { business_id: context.businessId, branch_id: context.branchId };

        const [sale, items, commissions, tips, payments, holds] = await Promise.all([
            supabase.from('sales').select(SALE_COLUMNS).match(where).eq('id', id.data).maybeSingle(),
            supabase.from('sale_items').select(withCost ? `${ITEM_COLUMNS}, unit_cost_snapshot` : ITEM_COLUMNS).match(where).eq('sale_id', id.data).order('id'),
            supabase.from('commission_entries')
                .select('sale_item_id, employee_id, basis, basis_amount, calculation_type, percentage_snapshot, fixed_amount_snapshot, commission_amount, status')
                .match(where).eq('sale_id', id.data).order('id'),
            supabase.from('sale_tips').select('employee_id, amount, method, status').match(where).eq('sale_id', id.data).order('id'),
            supabase.from('payments').select('method, amount, status').match(where).eq('sale_id', id.data).order('id'),
            // Las comisiones en espera solo las lee gerencia (RLS); para recepción no se consulta.
            withCost
                ? supabase.from('commission_holds').select('sale_item_id, reason, resolved_at').match(where).eq('sale_id', id.data)
                : Promise.resolve({ data: [], error: null }),
        ]);
        for (const result of [sale, items, commissions, tips, payments, holds]) if (result.error) throw result.error;
        if (!sale.data) throw new AuthorizationError('Venta no encontrada.', 404);

        const itemRows = (items.data ?? []) as unknown as BreakdownItem[];
        const commissionRows = (commissions.data ?? []) as unknown as BreakdownCommission[];
        const tipRows = (tips.data ?? []) as unknown as BreakdownTip[];

        // Nombres de quienes aparecen en la venta (los empleados se leen por RLS como en el ticket).
        const employeeIds = Array.from(new Set([
            ...itemRows.flatMap((i) => [i.employee_id, i.commission_employee_id]),
            ...commissionRows.map((c) => c.employee_id),
            ...tipRows.map((t) => t.employee_id),
        ].filter((v): v is string => Boolean(v))));
        const employees = employeeIds.length
            ? await supabase.from('employees').select('id, display_name').eq('business_id', context.businessId).in('id', employeeIds)
            : { data: [], error: null };
        if (employees.error) throw employees.error;
        const names: Record<string, string> = {};
        for (const e of (employees.data ?? []) as unknown as { id: string; display_name: string }[]) names[e.id] = e.display_name;

        // Respaldo del costo (solo quien ve costos): productos cuyo renglón no guardó el costo de ese día.
        let fallbackUnitCosts: Record<string, number | string | null> | undefined;
        if (withCost) {
            const missing = itemRows.filter((i) => i.item_type === 'product' && i.product_id && (i.unit_cost_snapshot === null || i.unit_cost_snapshot === undefined));
            if (missing.length > 0) {
                const costs = await supabase.rpc('product_costs', { p_branch_id: context.branchId });
                if (costs.error) throw costs.error;
                fallbackUnitCosts = {};
                for (const c of (costs.data ?? []) as unknown as { product_id: string; cost_price: number | string | null }[]) fallbackUnitCosts[c.product_id] = c.cost_price;
            }
        }

        const input: BreakdownInput = {
            sale: sale.data as unknown as BreakdownSale,
            items: itemRows,
            commissions: commissionRows,
            tips: tipRows,
            payments: (payments.data ?? []) as unknown as BreakdownPayment[],
            holds: (holds.data ?? []) as unknown as BreakdownHold[],
            names,
            fallbackUnitCosts,
        };
        return Response.json(buildSaleBreakdown(input, withCost ? 'full' : 'front_desk'), { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
