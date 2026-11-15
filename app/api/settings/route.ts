import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener el formato HH:MM.');

// Perfil del negocio (key = shop_profile). Nombre, moneda y zona horaria viven en el negocio;
// dirección y teléfono en la sucursal; el resto en businesses.settings.
const ProfileSchema = z.object({
    name: z.string().trim().min(2, 'El nombre es muy corto.').max(160),
    address: z.string().trim().max(300).optional().default(''),
    city: z.string().trim().max(120).optional().default(''),
    phone: z.string().trim().max(32).optional().default(''),
    email: z.union([z.literal(''), z.string().trim().email('El correo no es válido.').max(254)]).optional().default(''),
    currency: z.enum(['MXN', 'USD', 'EUR', 'COP', 'PEN']),
    timezone: z.string().trim().min(3).max(64),
    tagline: z.string().trim().max(80).optional().default(''),
    // Horario por día: "0" (domingo) a "6" (sábado); null = cerrado. La base valida lo mismo.
    hours: z.record(z.enum(['0', '1', '2', '3', '4', '5', '6']), z.object({ open: time, close: time }).nullable())
        .refine((h) => Object.values(h).every((d) => !d || d.open < d.close), 'La apertura debe ser antes del cierre.')
        .optional(),
    taxId: z.string().trim().max(40).optional().default(''),
    // Tasas generales de comisión. Si no llegan, no se tocan.
    serviceCommissionPct: z.number().min(0).max(100).optional(),
    productCommissionPct: z.number().min(0).max(100).optional(),
});
const UpdateSchema = z.object({ key: z.literal('shop_profile'), value: ProfileSchema });

type BusinessRow = {
    name: string; currency: string; timezone: string; settings: Record<string, unknown> | null;
    service_commission_pct: number | string; product_commission_pct: number | string;
};
type BranchRow = { address: string | null; phone: string | null };

export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        if (request.nextUrl.searchParams.get('key') !== 'shop_profile') {
            return Response.json({ error: 'Parámetro key no válido.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const [business, branch] = await Promise.all([
            supabase.from('businesses').select('name, currency, timezone, settings, service_commission_pct, product_commission_pct').eq('id', context.businessId).single(),
            supabase.from('branches').select('address, phone').eq('id', context.branchId).single(),
        ]);
        if (business.error) throw business.error;
        if (branch.error) throw branch.error;
        const b = business.data as unknown as BusinessRow;
        const br = branch.data as unknown as BranchRow;
        return Response.json({
            ...(b.settings ?? {}),
            name: b.name,
            currency: b.currency,
            timezone: b.timezone,
            address: br.address ?? '',
            phone: br.phone ?? '',
            serviceCommissionPct: Number(b.service_commission_pct),
            productCommissionPct: Number(b.product_commission_pct),
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Guarda el perfil con update_business_profile (queda en la auditoría). Solo el dueño. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner']);
        const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const p = parsed.data.value;
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.rpc('update_business_profile', {
            p_business_id: context.businessId,
            p_branch_id: context.branchId,
            p_name: p.name,
            p_currency: p.currency,
            p_timezone: p.timezone,
            p_address: p.address,
            p_phone: p.phone,
            p_settings: { city: p.city, email: p.email, taxId: p.taxId, tagline: p.tagline, ...(p.hours ? { hours: p.hours } : {}) },
        } as never);
        if (error) throw error;

        // Las tasas de comisión se cambian con su propia función para que el cambio quede en la bitácora.
        if (p.serviceCommissionPct !== undefined && p.productCommissionPct !== undefined) {
            const current = await supabase.from('businesses').select('service_commission_pct, product_commission_pct').eq('id', context.businessId).single();
            if (current.error) throw current.error;
            const row = current.data as unknown as { service_commission_pct: number | string; product_commission_pct: number | string };
            if (Number(row.service_commission_pct) !== p.serviceCommissionPct || Number(row.product_commission_pct) !== p.productCommissionPct) {
                const rates = await supabase.rpc('set_commission_defaults', {
                    p_business_id: context.businessId, p_service_pct: p.serviceCommissionPct, p_product_pct: p.productCommissionPct,
                });
                if (rates.error) throw rates.error;
            }
        }
        return Response.json({ success: true }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
