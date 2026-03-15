import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET);

export interface UserSession {
    id: string; // barber id, receptionist id, or 'admin'
    name: string;
    role: 'admin' | 'barber' | 'recepcion';
}

export async function createSession(payload: UserSession) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const sessionToken = await new SignJWT({ ...payload })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('7d')
        .sign(SECRET_KEY);

    const cookieStore = await cookies();
    cookieStore.set('session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: expiresAt,
        path: '/'
    });
}

export async function getSession(): Promise<UserSession | null> {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session');
    if (!sessionToken) return null;

    try {
        const { payload } = await jwtVerify(sessionToken.value, SECRET_KEY);
        return payload as unknown as UserSession;
    } catch (_e) {
        return null;
    }
}

export async function destroySession() {
    const cookieStore = await cookies();
    cookieStore.delete('session');
}

/** Hash a PIN before storing in DB */
export async function hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, 10);
}

/** Compare plain PIN against a stored value.
 *  If stored is a bcrypt hash ($2b$...) uses bcrypt.compare.
 *  Otherwise falls back to plain-text equality (legacy migration path). */
export async function verifyPin(
    plain: string,
    stored: string
): Promise<{ match: boolean; needsRehash: boolean }> {
    if (stored.startsWith('$2')) {
        return { match: await bcrypt.compare(plain, stored), needsRehash: false };
    }
    // Legacy plain-text PIN — signal that it should be rehashed on success
    return { match: plain === stored, needsRehash: plain === stored };
}

/** Throws a 403 error if the current session is not admin.
 *  Call at the start of admin-only API handlers. */
export async function requireAdmin(): Promise<void> {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
        const err = new Error('Forbidden') as Error & { status: number };
        err.status = 403;
        throw err;
    }
}

/** Throws a 403 error if the caller is not admin or receptionist.
 *  Use for routes accessible to both roles (clients, appointments). */
export async function requireStaff(): Promise<void> {
    const session = await getSession();
    if (!session || !['admin', 'recepcion'].includes(session.role)) {
        const err = new Error('Forbidden') as Error & { status: number };
        err.status = 403;
        throw err;
    }
}
