import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { canWrite, roleTitle, screenRole } from '@/lib/auth/roles';
import { loginNameFromId } from '@/lib/auth/login-id';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const context = await getAuthContext();
    if (!context) return NextResponse.json({ authenticated: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    // Rol de pantalla: la consulta (viewer) ve la vista de gerencia, pero en modo de solo lectura.
    const legacyRole = screenRole(context.role);
    // Puesto que se muestra a la persona. El rol admin es la gerencia de la sucursal:
    // opera todo, pero solo el dueño cambia comisiones y configuración.
    const title = roleTitle(context.role);
    const readOnly = !canWrite(context.role);
    // Usuario corto y si debe cambiar su PIN temporal (para "Mi cuenta"). Nunca el correo sintético.
    const { data: status } = await (await createSupabaseServerClient()).rpc('my_account_status');
    const account = (status ?? {}) as { login_name?: string | null; must_change_pin?: boolean };
    return NextResponse.json({
        authenticated: true,
        user: {
            id: context.employeeId ?? context.userId, userId: context.userId, name: context.displayName, role: legacyRole,
            isOwner: context.role === 'owner', title, employeeId: context.employeeId ?? null,
            businessId: context.businessId, branchId: context.branchId,
            businessRole: context.role, readOnly, canWrite: !readOnly,
            loginName: account.login_name ?? loginNameFromId(context.email), mustChangePin: Boolean(account.must_change_pin),
        },
    }, { headers: { 'Cache-Control': 'no-store' } });
}

