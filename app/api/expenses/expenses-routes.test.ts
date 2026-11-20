import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sesiones de prueba por puesto (nombres reales del equipo; sin PIN reales).
const BASE = { employeeId: null, businessId: 'biz', branchId: 'br1' };
const PEOPLE = {
    receptionist: { ...BASE, userId: 'u-emi', email: 'emi@gallo-420.barberos.invalid', displayName: 'Emi', role: 'receptionist' as const },
    cashier: { ...BASE, userId: 'u-dago', email: 'dago@gallo-420.barberos.invalid', displayName: 'Dago', role: 'cashier' as const },
    admin: { ...BASE, userId: 'u-sonia', email: 'sonia@gallo-420.barberos.invalid', displayName: 'Sonia', role: 'admin' as const },
    owner: { ...BASE, userId: 'u-alonso', email: 'alonso@gallo-420.barberos.invalid', displayName: 'Alonso', role: 'owner' as const },
    barber: { ...BASE, userId: 'u-dani', email: 'dani@gallo-420.barberos.invalid', displayName: 'Dani', role: 'barber' as const },
    viewer: { ...BASE, userId: 'u-lucia', email: 'lucia@gallo-420.barberos.invalid', displayName: 'Lucía', role: 'viewer' as const },
};
type Person = (typeof PEOPLE)[keyof typeof PEOPLE];
let current: Person = PEOPLE.owner;
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

// Cliente falso: registra cada llamada de la consulta y devuelve lo que diga `tables`.
const calls: { table: string; op: string; args: unknown[] }[] = [];
let tables: Record<string, unknown> = {};
const sessionRpc = vi.fn();
const storage = { createSignedUploadUrl: vi.fn(), createSignedUrl: vi.fn() };
function builder(table: string) {
    const result = () => ({ data: tables[table] ?? [], error: null });
    const b: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'order', 'limit', 'gte', 'lt']) {
        b[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return b; };
    }
    b.maybeSingle = async () => ({ data: tables[table] ?? null, error: null });
    b.single = async () => ({ data: tables[table] ?? null, error: null });
    b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return b;
}
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
        from: (table: string) => builder(table),
        rpc: (...args: unknown[]) => sessionRpc(...args),
        storage: { from: () => storage },
    }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

const pinRpc = vi.fn();
const runWithPinMock = vi.fn();
vi.mock('@/lib/auth/pin-confirm', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/pin-confirm')>();
    return { ...real, runWithPin: (...args: unknown[]) => runWithPinMock(...args) };
});

import { GET as listExpenses, POST as createExpense } from './route';
import { POST as cancelExpense } from './[id]/cancel/route';
import { GET as viewReceipt, PATCH as attachReceipt } from './[id]/receipt/route';
import { POST as signUpload } from './receipts/route';
import { GET as listCategories, PATCH as updateCategory, POST as createCategory } from '../expense-categories/route';
import { GET as listTemplates, PATCH as updateTemplate, POST as createTemplate } from '../recurring-expenses/route';
import { GET as pendingTemplates } from '../recurring-expenses/pending/route';

const GOOD_PIN = '482913';
const EXP = '6c3ee0f8-5e86-4703-bd99-eaf0df33e862';
const CAT = '0b7e67f1-6c71-4bd3-8b50-c41fe6155499';
const json = (url: string, method: string, body?: unknown) =>
    new NextRequest(new URL(url, 'http://localhost'), { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const withId = (id = EXP) => ({ params: Promise.resolve({ id }) });
const GOOD_EXPENSE = { paid_from: 'envelope', amount: 300, category_id: CAT, description: 'Renta de noviembre', idempotency_key: 'clave-gasto-0001', pin: GOOD_PIN };

beforeEach(() => {
    current = PEOPLE.owner;
    calls.length = 0;
    tables = {
        businesses: { timezone: 'America/Mexico_City' },
        expenses: [
            { id: EXP, status: 'posted', category: 'Renta', category_id: CAT, description: 'Renta', amount: '300.00', method: 'cash', incurred_at: '2026-11-10T18:00:00Z', created_at: '2026-11-10T18:00:00Z', created_by: 'u-sonia', paid_from: 'envelope', cash_session_id: null, envelope_id: 'env', vendor: null, receipt_path: 'biz/br1/2026-11/a.pdf', recurring_expense_id: null, cancelled_by: null, cancelled_at: null, cancel_reason: null },
            { id: 'e2', status: 'cancelled', category: 'Luz', category_id: CAT, description: 'Luz', amount: '450.50', method: 'transfer', incurred_at: '2026-11-09T18:00:00Z', created_at: '2026-11-09T18:00:00Z', created_by: 'u-alonso', paid_from: 'bank', cash_session_id: null, envelope_id: null, vendor: 'CFE', receipt_path: null, recurring_expense_id: null, cancelled_by: 'u-alonso', cancelled_at: '2026-11-10T00:00:00Z', cancel_reason: 'Duplicado' },
        ],
        expense_categories: [{ id: CAT, name: 'Renta', is_active: true, affects_profit: true, sort_order: 10 }],
        recurring_expenses: [{ id: 'r1', name: 'Renta del local', category_id: CAT, suggested_amount: '4500.00', day_of_month: 5, paid_from: 'bank', method: 'transfer', vendor: null, is_active: true, created_at: '', updated_at: '' }],
    };
    sessionRpc.mockReset(); pinRpc.mockReset(); runWithPinMock.mockReset();
    storage.createSignedUploadUrl.mockReset(); storage.createSignedUrl.mockReset();
    sessionRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
        if (fn === 'member_display_names') return { data: [{ user_id: 'u-sonia', display_name: 'Sonia' }, { user_id: 'u-alonso', display_name: 'Alonso' }], error: null };
        if (fn === 'pending_recurring_expenses') return { data: [{ id: 'r1', name: 'Renta del local', category_id: CAT, category_name: 'Renta', suggested_amount: '4500.00', day_of_month: 5, due_on: '2026-11-05', is_overdue: true, paid_from: 'bank', method: 'transfer', vendor: null }], error: null };
        if (fn === 'save_recurring_expense') return { data: { id: args.p_id ?? 'r-new', name: 'Renta del local', suggested_amount: '4500.00' }, error: null };
        return { data: { ok: true, fn }, error: null };
    });
    pinRpc.mockResolvedValue({ data: { expense_id: 'new-exp', paid_from: 'envelope', amount: '300.00', envelope_balance: '700.00', replayed: false }, error: null });
    runWithPinMock.mockImplementation(async (_identity: unknown, pin: string, action: (client: unknown) => Promise<unknown>) => {
        if (pin !== GOOD_PIN) return { ok: false, status: 400, error: 'El PIN no es correcto.' };
        return { ok: true, value: await action({ rpc: (...args: unknown[]) => pinRpc(...args) }) };
    });
});

describe('GET /api/expenses — lista con filtros', () => {
    it.each(['owner', 'admin', 'viewer'] as const)('%s ve gastos con totales y nombres', async (who) => {
        current = PEOPLE[who];
        const res = await listExpenses(json('/api/expenses?from=2026-11-01&to=2026-11-30&paid_from=envelope&status=posted&category_id=' + CAT, 'GET'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.expenses[0]).toMatchObject({ amount: 300, payment_method: 'cash', created_by_name: 'Sonia', has_receipt: true });
        expect(body.totals).toMatchObject({ posted: 300, cancelled: 450.5, by_paid_from: { envelope: 300, bank: 0, cash_drawer: 0 } });
        expect(body.can_edit).toBe(who !== 'viewer');
        expect(calls).toEqual(expect.arrayContaining([
            { table: 'expenses', op: 'gte', args: ['incurred_at', '2026-11-01T06:00:00.000Z'] },
            { table: 'expenses', op: 'lt', args: ['incurred_at', '2026-12-01T06:00:00.000Z'] },
            { table: 'expenses', op: 'eq', args: ['paid_from', 'envelope'] },
            { table: 'expenses', op: 'eq', args: ['status', 'posted'] },
            { table: 'expenses', op: 'eq', args: ['category_id', CAT] },
        ]));
    });
    it.each(['receptionist', 'cashier', 'barber'] as const)('%s no ve gastos (403)', async (who) => {
        current = PEOPLE[who];
        expect((await listExpenses(json('/api/expenses', 'GET'))).status).toBe(403);
    });
    it('filtro inválido: 400', async () => {
        expect((await listExpenses(json('/api/expenses?paid_from=caja', 'GET'))).status).toBe(400);
    });
});

describe('POST /api/expenses — registrar con PIN', () => {
    it.each(['owner', 'admin'] as const)('%s registra un gasto del sobre con su PIN', async (who) => {
        current = PEOPLE[who];
        const res = await createExpense(json('/api/expenses', 'POST', { ...GOOD_EXPENSE, incurred_on: '2026-11-10', vendor: '  ', comment: 'Pago de renta' }));
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ expense_id: 'new-exp', amount: 300, envelope_balance: 700, replayed: false });
        expect(pinRpc).toHaveBeenCalledWith('record_expense', expect.objectContaining({
            p_branch_id: 'br1', p_paid_from: 'envelope', p_amount: 300, p_category_id: CAT, p_incurred_on: '2026-11-10',
            p_comment: 'Pago de renta', p_vendor: undefined, p_idempotency_key: 'clave-gasto-0001',
        }));
    });
    it('un reintento con la misma clave responde 200 y replayed', async () => {
        pinRpc.mockResolvedValue({ data: { expense_id: 'new-exp', amount: 300, replayed: true }, error: null });
        const res = await createExpense(json('/api/expenses', 'POST', GOOD_EXPENSE));
        expect(res.status).toBe(200);
        expect((await res.json()).replayed).toBe(true);
    });
    it.each(['receptionist', 'cashier', 'barber', 'viewer'] as const)('%s no registra gastos (403, sin PIN)', async (who) => {
        current = PEOPLE[who];
        expect((await createExpense(json('/api/expenses', 'POST', GOOD_EXPENSE))).status).toBe(403);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });
    it.each([
        [{ paid_from: 'caja' }],
        [{ amount: 0 }],
        [{ description: 'x' }],
        [{ idempotency_key: undefined }],
        [{ incurred_on: '10/11/2026' }],
        [{ comment: 'ok' }],
    ])('datos inválidos %j: 400 antes del PIN', async (patch) => {
        const res = await createExpense(json('/api/expenses', 'POST', { ...GOOD_EXPENSE, ...patch }));
        expect(res.status).toBe(400);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });
    it('sin PIN: 428', async () => {
        const res = await createExpense(json('/api/expenses', 'POST', { ...GOOD_EXPENSE, pin: undefined }));
        expect(res.status).toBe(428);
    });
    it('reglas de la base llegan en español: fecha futura 400, sobre insuficiente 409', async () => {
        pinRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'La fecha del gasto no puede ser futura.' } });
        let res = await createExpense(json('/api/expenses', 'POST', GOOD_EXPENSE));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('La fecha del gasto no puede ser futura.');
        pinRpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'En el sobre hay $700; el gasto es de $800.' } });
        res = await createExpense(json('/api/expenses', 'POST', GOOD_EXPENSE));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('En el sobre hay $700; el gasto es de $800.');
    });
});

describe('POST /api/expenses/[id]/cancel', () => {
    it.each(['owner', 'admin'] as const)('%s cancela con PIN y motivo', async (who) => {
        current = PEOPLE[who];
        pinRpc.mockResolvedValue({ data: { paid_from: 'envelope', returned_to: 'envelope', reference_id: 'm1', envelope_id: 'env', envelope_balance: '1000.00' }, error: null });
        const res = await cancelExpense(json(`/api/expenses/${EXP}/cancel`, 'POST', { reason: 'Se registró dos veces', pin: GOOD_PIN }), withId());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ status: 'cancelled', returned_to: 'envelope', envelope_balance: 1000 });
        expect(pinRpc).toHaveBeenCalledWith('cancel_expense', { p_expense_id: EXP, p_reason: 'Se registró dos veces' });
    });
    it.each(['receptionist', 'cashier', 'barber', 'viewer'] as const)('%s no cancela (403)', async (who) => {
        current = PEOPLE[who];
        expect((await cancelExpense(json(`/api/expenses/${EXP}/cancel`, 'POST', { reason: 'Se registró dos veces', pin: GOOD_PIN }), withId())).status).toBe(403);
    });
    it('motivo corto: 400; sin PIN: 428; id inválido: 404', async () => {
        expect((await cancelExpense(json(`/api/expenses/${EXP}/cancel`, 'POST', { reason: 'no', pin: GOOD_PIN }), withId())).status).toBe(400);
        expect((await cancelExpense(json(`/api/expenses/${EXP}/cancel`, 'POST', { reason: 'Se registró dos veces' }), withId())).status).toBe(428);
        expect((await cancelExpense(json('/api/expenses/x/cancel', 'POST', { reason: 'Se registró dos veces', pin: GOOD_PIN }), withId('x'))).status).toBe(404);
    });
    it('ya cancelado: 409', async () => {
        pinRpc.mockResolvedValue({ data: null, error: { code: '55000', message: 'Ese gasto ya está cancelado.' } });
        const res = await cancelExpense(json(`/api/expenses/${EXP}/cancel`, 'POST', { reason: 'Se registró dos veces', pin: GOOD_PIN }), withId());
        expect(res.status).toBe(409);
    });
});

describe('Comprobantes', () => {
    it('dueño pide enlace de subida: ruta por negocio/sucursal/mes', async () => {
        storage.createSignedUploadUrl.mockResolvedValue({ data: { path: 'biz/br1/2026-11/x.pdf', token: 't', signedUrl: 'https://s/x' }, error: null });
        const res = await signUpload(json('/api/expenses/receipts', 'POST', { content_type: 'application/pdf', size: 1000 }));
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ bucket: 'expense-receipts', path: 'biz/br1/2026-11/x.pdf', token: 't' });
        expect(storage.createSignedUploadUrl.mock.calls[0][0]).toMatch(/^biz\/br1\/\d{4}-\d{2}\/[0-9a-f-]{36}\.pdf$/);
    });
    it.each([
        [{ content_type: 'text/html', size: 10 }],
        [{ content_type: 'image/png', size: 6 * 1024 * 1024 }],
    ])('tipo o tamaño no permitido %j: 400', async (body) => {
        expect((await signUpload(json('/api/expenses/receipts', 'POST', body))).status).toBe(400);
        expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
    });
    it.each(['receptionist', 'viewer', 'barber'] as const)('%s no sube comprobantes (403)', async (who) => {
        current = PEOPLE[who];
        expect((await signUpload(json('/api/expenses/receipts', 'POST', { content_type: 'application/pdf', size: 10 }))).status).toBe(403);
    });
    it('consulta ve el comprobante con enlace temporal', async () => {
        current = PEOPLE.viewer;
        tables.expenses = { receipt_path: 'biz/br1/2026-11/a.pdf' };
        storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://s/a' }, error: null });
        const res = await viewReceipt(json(`/api/expenses/${EXP}/receipt`, 'GET'), withId());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ url: 'https://s/a', expires_in: 60 });
        expect(storage.createSignedUrl).toHaveBeenCalledWith('biz/br1/2026-11/a.pdf', 60);
    });
    it('sin comprobante: 404', async () => {
        tables.expenses = { receipt_path: null };
        expect((await viewReceipt(json(`/api/expenses/${EXP}/receipt`, 'GET'), withId())).status).toBe(404);
    });
    it('adjuntar después: gerencia sí, consulta no', async () => {
        current = PEOPLE.admin;
        let res = await attachReceipt(json(`/api/expenses/${EXP}/receipt`, 'PATCH', { receipt_path: 'biz/br1/2026-11/b.pdf' }), withId());
        expect(res.status).toBe(200);
        expect(sessionRpc).toHaveBeenCalledWith('set_expense_receipt', { p_expense_id: EXP, p_receipt_path: 'biz/br1/2026-11/b.pdf' });
        current = PEOPLE.viewer;
        res = await attachReceipt(json(`/api/expenses/${EXP}/receipt`, 'PATCH', { receipt_path: 'biz/br1/2026-11/b.pdf' }), withId());
        expect(res.status).toBe(403);
    });
});

describe('Categorías de gastos', () => {
    it.each(['owner', 'admin', 'viewer'] as const)('%s las lee; solo la cuenta principal puede editarlas', async (who) => {
        current = PEOPLE[who];
        const body = await (await listCategories(json('/api/expense-categories', 'GET'))).json();
        expect(body.categories[0]).toMatchObject({ name: 'Renta' });
        expect(body.can_edit).toBe(who === 'owner');
        expect(calls).toContainEqual({ table: 'expense_categories', op: 'eq', args: ['is_active', true] });
    });
    it('?all=1 incluye desactivadas', async () => {
        await listCategories(json('/api/expense-categories?all=1', 'GET'));
        expect(calls).not.toContainEqual({ table: 'expense_categories', op: 'eq', args: ['is_active', true] });
    });
    it('la cuenta principal crea y cambia', async () => {
        expect((await createCategory(json('/api/expense-categories', 'POST', { name: 'Papelería' }))).status).toBe(201);
        expect(sessionRpc).toHaveBeenCalledWith('save_expense_category', { p_business_id: 'biz', p_name: 'Papelería', p_sort_order: undefined });
        expect((await updateCategory(json('/api/expense-categories', 'PATCH', { id: CAT, is_active: false }))).status).toBe(200);
    });
    it.each(['admin', 'viewer', 'receptionist'] as const)('%s no administra categorías (403)', async (who) => {
        current = PEOPLE[who];
        expect((await createCategory(json('/api/expense-categories', 'POST', { name: 'Papelería' }))).status).toBe(403);
        expect((await updateCategory(json('/api/expense-categories', 'PATCH', { id: CAT, is_active: false }))).status).toBe(403);
    });
    it('PATCH sin cambios: 400', async () => {
        expect((await updateCategory(json('/api/expense-categories', 'PATCH', { id: CAT }))).status).toBe(400);
    });
});

describe('Gastos fijos (plantillas)', () => {
    it('consulta lee plantillas y pendientes del mes', async () => {
        current = PEOPLE.viewer;
        const list = await (await listTemplates(json('/api/recurring-expenses', 'GET'))).json();
        expect(list.templates[0]).toMatchObject({ name: 'Renta del local', suggested_amount: 4500 });
        expect(list.can_edit).toBe(false);
        const res = await pendingTemplates(json('/api/recurring-expenses/pending?month=2026-11', 'GET'));
        expect(res.status).toBe(200);
        expect((await res.json()).pending[0]).toMatchObject({ id: 'r1', suggested_amount: 4500, due_on: '2026-11-05', is_overdue: true });
        expect(sessionRpc).toHaveBeenCalledWith('pending_recurring_expenses', { p_branch_id: 'br1', p_month: '2026-11-01' });
    });
    it('mes mal escrito: 400', async () => {
        expect((await pendingTemplates(json('/api/recurring-expenses/pending?month=2026-13', 'GET'))).status).toBe(400);
    });
    it.each(['owner', 'admin'] as const)('%s crea y desactiva plantillas', async (who) => {
        current = PEOPLE[who];
        const body = { name: 'Renta del local', category_id: CAT, suggested_amount: 4500, day_of_month: 5, paid_from: 'bank', method: 'transfer' };
        const res = await createTemplate(json('/api/recurring-expenses', 'POST', body));
        expect(res.status).toBe(201);
        expect((await res.json()).suggested_amount).toBe(4500);
        expect((await updateTemplate(json('/api/recurring-expenses', 'PATCH', { id: CAT, is_active: false }))).status).toBe(200);
        expect(sessionRpc).toHaveBeenLastCalledWith('save_recurring_expense', expect.objectContaining({ p_branch_id: 'br1', p_id: CAT, p_is_active: false }));
    });
    it.each(['receptionist', 'cashier', 'barber', 'viewer'] as const)('%s no crea plantillas (403)', async (who) => {
        current = PEOPLE[who];
        expect((await createTemplate(json('/api/recurring-expenses', 'POST', { name: 'Renta', category_id: CAT, suggested_amount: 1, day_of_month: 5, paid_from: 'bank' }))).status).toBe(403);
    });
    it('día 0 o pagado desde caja: 400', async () => {
        expect((await createTemplate(json('/api/recurring-expenses', 'POST', { name: 'Renta', category_id: CAT, suggested_amount: 1, day_of_month: 0, paid_from: 'bank' }))).status).toBe(400);
        expect((await createTemplate(json('/api/recurring-expenses', 'POST', { name: 'Renta', category_id: CAT, suggested_amount: 1, day_of_month: 5, paid_from: 'cash_drawer' }))).status).toBe(400);
    });
});
