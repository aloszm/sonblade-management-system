import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext, type BusinessRole } from '@/lib/auth/context';
import { loadAppointmentProducts, toProductLine, type ExtrasClient } from '@/lib/appointments/extras';
import { NO_STORE } from '@/lib/money/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Productos en la cita (propuesta sin efecto de dinero: el cobro los registra con confirm_sale).
 * Reglas en la base (public.add_appointment_product, appointment_products_read, product_seller_options):
 *  - Dueño, gerencia y recepción en cualquier cita abierta; el barbero solo en las suyas.
 *  - Vendedor por omisión: el barbero de la cita. El barbero no elige; recepción y gerencia sí.
 *  - No mueve inventario; la lectura trae existencias para avisar "no hay suficientes".
 */
const PRODUCT_EDITOR_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist', 'barber'];
const READ_ROLES: BusinessRole[] = [...PRODUCT_EDITOR_ROLES, 'viewer'];

const IdSchema = z.string().uuid();
const AddSchema = z.object({
    product_id: z.string({ message: 'Elige un producto.' }).uuid('Elige un producto.'),
    quantity: z.number({ message: 'La cantidad debe ser de 1 a 50.' }).int('La cantidad debe ser de 1 a 50.')
        .min(1, 'La cantidad debe ser de 1 a 50.').max(50, 'La cantidad debe ser de 1 a 50.').default(1),
    /** Vendedor (empleado). Si no llega, la base usa el barbero de la cita. */
    seller_employee_id: z.string().uuid('Vendedor no válido.').nullable().optional(),
}).strict();

type SellerOption = { id: string; name: string; is_barber: boolean };

/** Productos de la cita con vendedor, capturista y existencias; para recepción y gerencia, también los vendedores elegibles. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(READ_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Cita no encontrada.', 404);
        const db = await createSupabaseServerClient();
        const products = (await loadAppointmentProducts(db as unknown as ExtrasClient, context.branchId, [id.data])).get(id.data);
        const { data: exists, error } = await db.from('appointments').select('id')
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).eq('id', id.data).maybeSingle();
        if (error) throw error;
        if (!exists || !products) throw new AuthorizationError('Cita no encontrada.', 404);
        let sellers: SellerOption[] = [];
        if (products.can_choose_seller) {
            const options = await db.rpc('product_seller_options', { p_branch_id: context.branchId });
            if (options.error) throw options.error;
            sellers = (options.data ?? []) as SellerOption[];
        }
        return Response.json({ appointment_id: id.data, ...products, seller_options: sellers }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Agrega un producto a una cita abierta (si ya hay línea del mismo producto y vendedor, suma la cantidad). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuthContext(PRODUCT_EDITOR_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Cita no encontrada.', 404);
        const parsed = AddSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const db = await createSupabaseServerClient();
        const { data, error } = await db.rpc('add_appointment_product', {
            p_appointment_id: id.data,
            p_product_id: parsed.data.product_id,
            p_quantity: parsed.data.quantity,
            p_seller_employee_id: parsed.data.seller_employee_id ?? undefined,
        });
        if (error) throw error;
        return Response.json({ line: toProductLine((data ?? {}) as Record<string, unknown>) }, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
