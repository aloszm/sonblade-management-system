import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

export async function GET() {
    const context = await getAuthContext();
    if (!context) return NextResponse.json({ authenticated: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const legacyRole = context.role === 'owner' || context.role === 'admin'
        ? 'admin'
        : context.role === 'receptionist' || context.role === 'cashier' ? 'recepcion' : 'barber';
    // Puesto que se muestra a la persona. El rol admin es la gerencia de la sucursal:
    // opera todo, pero solo el dueño cambia comisiones y configuración.
    const title = context.role === 'owner' ? 'Dueño' : context.role === 'admin' ? 'Gerente' : legacyRole === 'recepcion' ? 'Recepción' : 'Barbero';
    return NextResponse.json({
        authenticated: true,
        user: {
            id: context.employeeId ?? context.userId, userId: context.userId, name: context.displayName, role: legacyRole,
            isOwner: context.role === 'owner', title, employeeId: context.employeeId ?? null,
            businessId: context.businessId, branchId: context.branchId,
        },
    }, { headers: { 'Cache-Control': 'no-store' } });
}

