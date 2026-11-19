import { beforeEach, describe, expect, it, vi } from 'vitest';

type Ctx = { userId: string; email: string; displayName: string; employeeId: string | null; businessId: string; branchId: string; role: string };
let context: Ctx;
let employeeTitle: string | null = null;
const employeeQuery = vi.fn();
vi.mock('@/lib/auth/context', () => ({ getAuthContext: async () => context }));
vi.mock('@/lib/supabase/server', () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq']) chain[name] = () => chain;
    chain.maybeSingle = async () => { employeeQuery(); return { data: { display_title: employeeTitle }, error: null }; };
    return { createSupabaseServerClient: async () => ({ from: () => chain, rpc: async () => ({ data: { login_name: 'x', must_change_pin: false } }) }) };
});

import { GET } from './route';

const base = { userId: 'u1', email: 'x@gallo-420.barberos.invalid', businessId: 'b1', branchId: 'br1' };
beforeEach(() => { employeeTitle = null; employeeQuery.mockClear(); });

describe('GET /api/auth/me: título de la persona', () => {
    it('gerente con título visible lo recibe en title y display_title; el rol no cambia', async () => {
        context = { ...base, displayName: 'Sonia', employeeId: 'e1', role: 'admin' };
        employeeTitle = 'Gerente Barbera';
        const { user } = await (await GET()).json();
        expect(user).toMatchObject({ title: 'Gerente Barbera', display_title: 'Gerente Barbera', businessRole: 'admin', role: 'admin', isOwner: false });
    });

    it('cuenta sin empleado (dueño) usa la etiqueta por omisión y no consulta employees', async () => {
        context = { ...base, displayName: 'Alonso', employeeId: null, role: 'owner' };
        const { user } = await (await GET()).json();
        expect(user).toMatchObject({ title: 'Gerente', display_title: null, isOwner: true });
        expect(employeeQuery).not.toHaveBeenCalled();
    });

    it.each([['barber', 'Barbero'], ['receptionist', 'Recepción'], ['viewer', 'Consulta']])('%s sin título se lee %s', async (role, label) => {
        context = { ...base, displayName: 'Persona', employeeId: role === 'viewer' ? null : 'e2', role };
        const { user } = await (await GET()).json();
        expect(user.title).toBe(label);
        expect(user.display_title).toBeNull();
    });
});
