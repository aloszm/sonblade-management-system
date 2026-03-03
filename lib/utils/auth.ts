import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET_KEY = new TextEncoder().encode(
    process.env.JWT_SECRET || 'sonblade-super-secret-key-32-chars-long-minimal'
);

export interface UserSession {
    id: string; // barber id or 'admin'
    name: string;
    role: 'admin' | 'barber';
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
    } catch (e) {
        return null;
    }
}

export async function destroySession() {
    const cookieStore = await cookies();
    cookieStore.delete('session');
}
