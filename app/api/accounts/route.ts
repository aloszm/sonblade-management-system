import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, AuthorizationError, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { assignableRoles, canManageAccount } from '@/lib/auth/account-rules';
import { loginIdFor, normalizeLoginName } from '@/lib/auth/login-id';
import { generateTemporaryPin } from '@/lib/auth/pin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { adminKeyConfigured, createSupabaseAdminClient, MISSING_ADMIN_KEY } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const NO_CACHE = { 'Cache-Control': 'no-store' };

/** Accesos del negocio: quién tiene usuario, su puesto y si está activo. Nunca el PIN. */
export async function GET() {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        const [{ data: members, error }, { data: employees }] = await Promise.all([
            supabase.from('business_memberships').select('user_id, role, is_active, login_name, must_change_pin').eq('business_id', context.businessId).order('created_at'),
            supabase.from('employees').select('id, user_id, display_name').eq('business_id', context.businessId),
        ]);
        if (error) throw error;
        const accounts = (members ?? []).map((m) => {
            const employee = (employees ?? []).find((e) => e.user_id === m.user_id);
            return {
                userId: m.user_id, loginName: m.login_name, role: m.role, isActive: m.is_active, mustChangePin: m.must_change_pin,
                employeeId: employee?.id ?? null, name: employee?.display_name ?? (m.user_id === context.userId ? context.displayName : m.login_name ?? 'Sin nombre'),
                isSelf: m.user_id === context.userId, canManage: m.user_id !== context.userId && canManageAccount(context.role, m.role),
            };
        });
        return NextResponse.json({ accounts, assignableRoles: assignableRoles(context.role), adminKeyConfigured: adminKeyConfigured() }, { headers: NO_CACHE });
    } catch (error) { return authErrorResponse(error); }
}

const CreateSchema = z.object({
    loginName: z.string().max(64),
    fullName: z.string().trim().min(2).max(120),
    role: z.enum(['owner', 'admin', 'viewer', 'barber', 'receptionist']),
    employeeId: z.string().uuid().nullable().optional(),
});

/**
 * Crear acceso (dueño y gerencia, según account-rules). Usa la API de administración de
 * Supabase Auth en el servidor: crea el usuario con el correo sintético y un PIN temporal,
 * y la base completa perfil, membresía, sucursales y liga con el empleado en una transacción.
 * Si esa parte falla, se borra el usuario de Auth recién creado para no dejar nada a medias.
 * El PIN temporal se devuelve UNA vez para dictárselo; no se guarda ni se registra.
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Los datos del acceso no son válidos.' }, { status: 400, headers: NO_CACHE });
        const loginName = normalizeLoginName(parsed.data.loginName);
        if (!loginName) return NextResponse.json({ error: 'El usuario debe tener de 3 a 32 letras o números, sin espacios ni acentos.' }, { status: 400, headers: NO_CACHE });
        if (!canManageAccount(context.role, parsed.data.role)) throw new AuthorizationError('Tu puesto no puede crear accesos de ese tipo.');

        const admin = createSupabaseAdminClient();
        if (!admin) return NextResponse.json({ error: MISSING_ADMIN_KEY }, { status: 503, headers: NO_CACHE });

        const supabase = await createSupabaseServerClient();
        const { data: business, error: businessError } = await supabase.from('businesses').select('slug').eq('id', context.businessId).single();
        if (businessError) throw businessError;
        const { data: taken } = await supabase.from('business_memberships').select('user_id').eq('business_id', context.businessId).eq('login_name', loginName).limit(1);
        if (taken?.length) return NextResponse.json({ error: 'Ese usuario ya está en uso. Elige otro.' }, { status: 409, headers: NO_CACHE });

        const pin = generateTemporaryPin();
        const { data: created, error: createError } = await admin.auth.admin.createUser({
            email: loginIdFor(loginName, business.slug), password: pin, email_confirm: true,
            user_metadata: { full_name: parsed.data.fullName },
        });
        if (createError || !created.user) {
            const status = (createError as { status?: number } | null)?.status;
            if (status === 422 || (createError as { code?: string } | null)?.code === 'email_exists') return NextResponse.json({ error: 'Ese usuario ya está en uso. Elige otro.' }, { status: 409, headers: NO_CACHE });
            return NextResponse.json({ error: 'No se pudo crear el acceso. Intenta de nuevo.' }, { status: 502, headers: NO_CACHE });
        }
        const { error: provisionError } = await admin.rpc('provision_account', {
            p_actor_user_id: context.userId, p_business_id: context.businessId, p_user_id: created.user.id,
            p_login_name: loginName, p_role: parsed.data.role, p_full_name: parsed.data.fullName,
            p_employee_id: (parsed.data.employeeId ?? null) as unknown as string,
        });
        if (provisionError) {
            await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
            throw provisionError;
        }
        return NextResponse.json({ userId: created.user.id, loginName, temporaryPin: pin }, { status: 201, headers: NO_CACHE });
    } catch (error) { return authErrorResponse(error); }
}
