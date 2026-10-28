import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

export async function GET() {
    const context = await getAuthContext();
    if (!context) return NextResponse.json({ authenticated: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const legacyRole = context.role === 'owner' || context.role === 'admin'
        ? 'admin'
        : context.role === 'receptionist' || context.role === 'cashier' ? 'recepcion' : 'barber';
    return NextResponse.json({
        authenticated: true,
        user: { id: context.employeeId ?? context.userId, userId: context.userId, name: context.displayName, role: legacyRole, businessId: context.businessId, branchId: context.branchId },
    }, { headers: { 'Cache-Control': 'no-store' } });
}

