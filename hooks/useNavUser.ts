'use client';

import React from 'react';
import type { NavUser } from '@/lib/nav';
import type { BusinessRole } from '@/lib/auth/context';

/** Lo que /api/auth/me entrega para menús. `display_title`: título visible propio (p. ej. "Gerente Barbera"), o null. */
export type SessionUser = NavUser & { name: string; id: string; title?: string; businessRole?: BusinessRole; display_title?: string | null };

/** Quién es la sesión (para menús). null hasta saberlo o si no hay sesión. */
export function useNavUser(): SessionUser | null {
    const [user, setUser] = React.useState<SessionUser | null>(null);
    React.useEffect(() => {
        let alive = true;
        fetch('/api/auth/me', { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => { if (alive && data?.authenticated) setUser(data.user); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    return user;
}
