import bcrypt from 'bcryptjs';
import { getAuthContext } from '@/lib/auth/context';

export interface UserSession {
    id: string;
    userId: string;
    name: string;
    role: 'admin' | 'barber' | 'recepcion';
    businessId: string;
    branchId: string;
}

export async function getSession(): Promise<UserSession | null> {
    const context = await getAuthContext();
    if (!context) return null;
    const role = context.role === 'owner' || context.role === 'admin'
        ? 'admin'
        : context.role === 'cashier' || context.role === 'receptionist' ? 'recepcion' : 'barber';
    return {
        id: context.employeeId ?? context.userId,
        userId: context.userId,
        name: context.displayName,
        role,
        businessId: context.businessId,
        branchId: context.branchId,
    };
}

export async function destroySession() {
    const { createSupabaseServerClient } = await import('@/lib/supabase/server');
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
}

export async function hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, 12);
}

export async function verifyPin(plain: string, stored: string): Promise<{ match: boolean; needsRehash: boolean }> {
    if (!stored.startsWith('$2')) return { match: false, needsRehash: false };
    return { match: await bcrypt.compare(plain, stored), needsRehash: false };
}

export async function requireAdmin(): Promise<void> {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        const error = new Error(session ? 'Forbidden' : 'Unauthenticated') as Error & { status: number };
        error.status = session ? 403 : 401;
        throw error;
    }
}

export async function requireStaff(): Promise<void> {
    const session = await getSession();
    if (!session || !['admin', 'recepcion'].includes(session.role)) {
        const error = new Error(session ? 'Forbidden' : 'Unauthenticated') as Error & { status: number };
        error.status = session ? 403 : 401;
        throw error;
    }
}

