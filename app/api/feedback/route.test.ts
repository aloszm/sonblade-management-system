import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sesiones de prueba por puesto (nombres reales del equipo; sin PIN).
const BASE = { employeeId: null, businessId: 'biz', branchId: 'br1' };
const PEOPLE = {
    owner: { ...BASE, userId: 'u-alonso', email: 'alonso@x.invalid', displayName: 'Alonso', role: 'owner' as const },
    admin: { ...BASE, userId: 'u-sonia', email: 'sonia@x.invalid', displayName: 'Sonia', role: 'admin' as const },
    viewer: { ...BASE, userId: 'u-lucia', email: 'lucia@x.invalid', displayName: 'Lucía', role: 'viewer' as const },
    receptionist: { ...BASE, userId: 'u-emi', email: 'emi@x.invalid', displayName: 'Emi', role: 'receptionist' as const },
    cashier: { ...BASE, userId: 'u-dago', email: 'dago@x.invalid', displayName: 'Dago', role: 'cashier' as const },
    barber: { ...BASE, userId: 'u-dani', email: 'dani@x.invalid', displayName: 'Dani', role: 'barber' as const },
};
type Who = keyof typeof PEOPLE;
const EVERYONE = Object.keys(PEOPLE) as Who[];
let current: (typeof PEOPLE)[Who] = PEOPLE.owner;
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(current.role)) throw new real.AuthorizationError();
            return current;
        },
    };
});

const rpc = vi.fn();
const fromCalls: { table: string; filters: [string, unknown][]; limit?: number }[] = [];
let rows: Record<string, unknown>[] = [];
function queryBuilder(table: string) {
    const call = { table, filters: [] as [string, unknown][], limit: undefined as number | undefined };
    fromCalls.push(call);
    const builder = {
        select: () => builder,
        eq: (col: string, value: unknown) => { call.filters.push([col, value]); return builder; },
        order: () => builder,
        limit: async (n: number) => { call.limit = n; return { data: rows, error: null }; },
    };
    return builder;
}
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({ rpc: (...args: unknown[]) => rpc(...args), from: (t: string) => queryBuilder(t) }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

import { GET, POST } from './route';
import { PATCH } from './[id]/route';
import { POST as retract } from './[id]/retract/route';
import { POST as seen } from './seen/route';
import { GET as counters } from './counters/route';

const ID = '6c3ee0f8-5e86-4703-bd99-eaf0df33e862';
const req = (url: string, method = 'GET', body?: unknown) =>
    new NextRequest(new URL(url, 'http://localhost'), { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const row = (over: Record<string, unknown> = {}) => ({
    id: ID, author_user_id: 'u-sonia', author_role: 'admin', kind: 'falla', body: 'La agenda tarda en cargar', status: 'nuevo',
    screen_path: '/citas', device: 'celular', reply: null, replied_at: null, status_changed_at: null, retracted_at: null,
    author_update_at: null, author_seen_at: null, created_at: '2026-11-20T18:00:00Z', ...over,
});

beforeEach(() => {
    current = PEOPLE.owner;
    rpc.mockReset();
    fromCalls.length = 0;
    rows = [];
    rpc.mockImplementation(async (fn: string) => {
        if (fn === 'create_app_feedback') return { data: row({ author_user_id: current.userId, author_role: current.role }), error: null };
        if (fn === 'review_app_feedback') return { data: { ...row({ status: 'hecho', reply: 'Ya quedó' }), changed: true }, error: null };
        if (fn === 'retract_app_feedback') return { data: row({ author_user_id: current.userId, retracted_at: '2026-11-20T19:00:00Z' }), error: null };
        if (fn === 'mark_app_feedback_seen') return { data: 2, error: null };
        if (fn === 'app_feedback_counters') return { data: { unseen_updates: 1, new_count: current.role === 'owner' ? 4 : null, is_owner: current.role === 'owner' }, error: null };
        if (fn === 'member_display_names') return { data: [{ user_id: 'u-sonia', display_name: 'Sonia Pérez' }, { user_id: 'u-dani', display_name: 'Dani' }], error: null };
        return { data: null, error: null };
    });
});

describe('POST /api/feedback (escribir)', () => {
    it.each(EVERYONE)('%s escribe (consulta incluida: única excepción a solo lectura)', async (who) => {
        current = PEOPLE[who];
        const res = await POST(req('/api/feedback', 'POST', { kind: 'idea', body: '  Más grande el teléfono  ', screen_path: '/clientes/[id]', device: 'celular' }));
        expect(res.status).toBe(201);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(rpc).toHaveBeenCalledWith('create_app_feedback', {
            p_business_id: 'biz', p_kind: 'idea', p_body: 'Más grande el teléfono', p_screen_path: '/clientes/[id]', p_device: 'celular',
        });
        const body = await res.json();
        expect(body.item.is_mine).toBe(true);
        expect(body.item.screen_title).toBe('Agenda');
    });
    it.each([
        [{ kind: 'queja', body: 'Texto válido' }, 'Elige el tipo'],
        [{ kind: 'idea', body: 'Hola' }, 'mínimo 5'],
        [{ kind: 'idea', body: 'a'.repeat(1001) }, 'máximo 1,000'],
        [{ kind: 'idea', body: 'Texto válido', screen_path: '/clientes?tel=5512345678' }, 'pantalla'],
        [{ kind: 'idea', body: 'Texto válido', device: 'Mozilla/5.0 (iPhone)' }, ''],
        [{ kind: 'idea', body: 'Texto válido', pin: '123456' }, ''],
    ])('forma inválida %j: 400 sin llegar a la base', async (input, message) => {
        const res = await POST(req('/api/feedback', 'POST', input));
        expect(res.status).toBe(400);
        if (message) expect((await res.json()).error).toContain(message);
        expect(rpc).not.toHaveBeenCalled();
    });
    it('el tope diario de la base llega como 429 con su mensaje', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: '54000', message: 'Llegaste al máximo de 20 comentarios por día. Mañana puedes escribir más.' } });
        const res = await POST(req('/api/feedback', 'POST', { kind: 'otro', body: 'Comentario veintiuno' }));
        expect(res.status).toBe(429);
        expect((await res.json()).error).toContain('20 comentarios por día');
    });
    it('PIN temporal: la base lo rechaza (42501 → 403)', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Necesitas una sesión activa (y tu PIN definitivo) para escribir comentarios.' } });
        expect((await POST(req('/api/feedback', 'POST', { kind: 'idea', body: 'Texto válido' }))).status).toBe(403);
    });
});

describe('GET /api/feedback (listas)', () => {
    it.each(EVERYONE)('%s ve los suyos: filtra por su usuario y no pide nombres', async (who) => {
        current = PEOPLE[who];
        rows = [row({ author_user_id: current.userId, author_update_at: '2026-11-20T19:00:00Z', reply: 'Lo vemos la próxima semana' })];
        const res = await GET(req('/api/feedback'));
        expect(res.status).toBe(200);
        expect(fromCalls[0].table).toBe('app_feedback');
        expect(fromCalls[0].filters).toEqual([['business_id', 'biz'], ['author_user_id', current.userId]]);
        const body = await res.json();
        expect(body.items[0].unseen_update).toBe(true);
        expect(body.items[0].author_name).toBeUndefined();
        expect(body.summary).toBeUndefined();
        expect(rpc).not.toHaveBeenCalled();
    });
    it.each(['admin', 'viewer', 'receptionist', 'cashier', 'barber'] as const)('%s pide «todos»: 403 sin consultar', async (who) => {
        current = PEOPLE[who];
        expect((await GET(req('/api/feedback?scope=all'))).status).toBe(403);
        expect(fromCalls).toHaveLength(0);
    });
    it('cuenta principal: todos, con nombre de pila, puesto, resumen y filtros', async () => {
        rows = [
            row(),
            row({ id: 'b', author_user_id: 'u-dani', author_role: 'barber', kind: 'idea', status: 'hecho' }),
            row({ id: 'c', author_user_id: 'u-dani', author_role: 'barber', kind: 'idea', retracted_at: '2026-11-20T19:00:00Z' }),
        ];
        let body = await (await GET(req('/api/feedback?scope=all'))).json();
        expect(fromCalls[0].filters).toEqual([['business_id', 'biz']]);
        expect(body.items).toHaveLength(3);
        expect(body.items[0]).toMatchObject({ author_name: 'Sonia', author_role_label: 'Gerente', screen_title: 'Agenda', device: 'celular', is_mine: false });
        expect(body.summary).toEqual({ nuevo: 1, visto: 0, en_proceso: 0, hecho: 1, descartado: 0 });
        body = await (await GET(req('/api/feedback?scope=all&status=nuevo&kind=falla'))).json();
        expect(body.items.map((i: { id: string }) => i.id)).toEqual([ID]);
        body = await (await GET(req('/api/feedback?scope=all&status=retirado'))).json();
        expect(body.items.map((i: { id: string }) => i.id)).toEqual(['c']);
        expect(body.summary.nuevo).toBe(1);
    });
    it.each(['scope=todos', 'scope=all&status=cerrado', 'scope=all&kind=queja'])('parámetros inválidos (%s): 400', async (qs) => {
        expect((await GET(req(`/api/feedback?${qs}`))).status).toBe(400);
    });
});

describe('PATCH /api/feedback/[id] (estado y respuesta)', () => {
    it('la cuenta principal cambia estado y responde', async () => {
        const res = await PATCH(req(`/api/feedback/${ID}`, 'PATCH', { status: 'hecho', reply: ' Ya quedó ' }), ctx());
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith('review_app_feedback', { p_feedback_id: ID, p_status: 'hecho', p_reply: 'Ya quedó' });
        expect((await res.json()).changed).toBe(true);
    });
    it.each(['admin', 'viewer', 'receptionist', 'cashier', 'barber'] as const)('%s: 403 sin llegar a la base', async (who) => {
        current = PEOPLE[who];
        expect((await PATCH(req(`/api/feedback/${ID}`, 'PATCH', { status: 'visto' }), ctx())).status).toBe(403);
        expect(rpc).not.toHaveBeenCalled();
    });
    it.each([[{}], [{ status: 'nuevo' }], [{ reply: 'x'.repeat(501) }], [{ status: 'visto', body: 'otro texto' }]])('cuerpo inválido %j: 400', async (input) => {
        expect((await PATCH(req(`/api/feedback/${ID}`, 'PATCH', input), ctx())).status).toBe(400);
        expect(rpc).not.toHaveBeenCalled();
    });
    it('id inválido: 404', async () => {
        expect((await PATCH(req('/api/feedback/x', 'PATCH', { status: 'visto' }), ctx('x'))).status).toBe(404);
    });
    it('retirado: la base responde 55000 → 409', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'Ese comentario lo retiró quien lo escribió.' } });
        const res = await PATCH(req(`/api/feedback/${ID}`, 'PATCH', { status: 'visto' }), ctx());
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('Ese comentario lo retiró quien lo escribió.');
    });
});

describe('retirar, vistos y contadores', () => {
    it.each(EVERYONE)('%s retira el suyo (la base valida autor y estado)', async (who) => {
        current = PEOPLE[who];
        const res = await retract(req(`/api/feedback/${ID}/retract`, 'POST'), ctx());
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith('retract_app_feedback', { p_feedback_id: ID });
        expect((await res.json()).item.retracted).toBe(true);
    });
    it('retirar uno ya revisado: 409 con el mensaje de la base', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'Ya no se puede retirar: la cuenta principal ya lo revisó.' } });
        const res = await retract(req(`/api/feedback/${ID}/retract`, 'POST'), ctx());
        expect(res.status).toBe(409);
        expect((await res.json()).error).toContain('Ya no se puede retirar');
    });
    it('marcar como vistos', async () => {
        current = PEOPLE.barber;
        const res = await seen();
        expect(await res.json()).toEqual({ marked: 2 });
        expect(rpc).toHaveBeenCalledWith('mark_app_feedback_seen', { p_business_id: 'biz' });
    });
    it.each(EVERYONE)('contadores de %s: avisos propios; nuevos solo para la cuenta principal', async (who) => {
        current = PEOPLE[who];
        const body = await (await counters()).json();
        expect(body.unseen_updates).toBe(1);
        expect(body.new_count).toBe(who === 'owner' ? 4 : null);
        expect(body.is_owner).toBe(who === 'owner');
    });
});
