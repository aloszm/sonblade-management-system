import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { canWrite, personTitle, screenRole } from '@/lib/auth/roles';
import { loginNameFromId } from '@/lib/auth/login-id';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const context = await getAuthContext();
    if (!context) return NextResponse.json({ authenticated: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    // Rol de pantalla: la consulta (viewer) ve la vista de gerencia, pero en modo de solo lectura.
    const legacyRole = screenRole(context.role);
    const readOnly = !canWrite(context.role);
    const supabase = await createSupabaseServerClient();
    // Usuario corto y si debe cambiar su PIN temporal (para "Mi cuenta"). Nunca el correo sintético.
    // Título visible: solo quien tiene fila de empleado (el dueño y la consulta no) puede tenerlo.
    const [{ data: status }, employee] = await Promise.all([
        supabase.rpc('my_account_status'),
        context.employeeId
            ? supabase.from('employees').select('display_title').eq('id', context.employeeId).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    const account = (status ?? {}) as { login_name?: string | null; must_change_pin?: boolean };
    const displayTitle = (employee.data as { display_title?: string | null } | null)?.display_title ?? null;
    // Puesto que se muestra a la persona: su título visible o la etiqueta del puesto. No cambia permisos.
    const title = personTitle({ role: context.role, displayTitle });
    return NextResponse.json({
        authenticated: true,
        user: {
            id: context.employeeId ?? context.userId, userId: context.userId, name: context.displayName, role: legacyRole,
            isOwner: context.role === 'owner', title, display_title: displayTitle, employeeId: context.employeeId ?? null,
            businessId: context.businessId, branchId: context.branchId,
            businessRole: context.role, readOnly, canWrite: !readOnly,
            loginName: account.login_name ?? loginNameFromId(context.email), mustChangePin: Boolean(account.must_change_pin),
        },
    }, { headers: { 'Cache-Control': 'no-store' } });
}
