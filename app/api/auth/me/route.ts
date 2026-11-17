import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { canWrite, roleTitle, screenRole } from '@/lib/auth/roles';

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
    return NextResponse.json({
        authenticated: true,
        user: {
            id: context.employeeId ?? context.userId, userId: context.userId, name: context.displayName, role: legacyRole,
            isOwner: context.role === 'owner', title, employeeId: context.employeeId ?? null,
            businessId: context.businessId, branchId: context.branchId,
            businessRole: context.role, readOnly, canWrite: !readOnly,
        },
    }, { headers: { 'Cache-Control': 'no-store' } });
}

