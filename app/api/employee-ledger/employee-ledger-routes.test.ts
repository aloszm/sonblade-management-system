import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sesiones de prueba por puesto (nombres reales del equipo; sin PIN reales).
const BASE = { businessId: 'biz', branchId: 'br1' };
const PEOPLE = {
    receptionist: { ...BASE, employeeId: 'e-emi', userId: 'u-emi', email: 'emi@gallo-420.barberos.invalid', displayName: 'Emi', role: 'receptionist' as const },
    admin: { ...BASE, employeeId: 'e-sonia', userId: 'u-sonia', email: 'sonia@gallo-420.barberos.invalid', displayName: 'Sonia', role: 'admin' as const },
    owner: { ...BASE, employeeId: null, userId: 'u-alonso', email: 'alonso@gallo-420.barberos.invalid', displayName: 'Alonso', role: 'owner' as const },
    barber: { ...BASE, employeeId: 'e-dani', userId: 'u-dani', email: 'dani@gallo-420.barberos.invalid', displayName: 'Dani', role: 'barber' as const },
    viewer: { ...BASE, employeeId: null, userId: 'u-lucia', email: 'lucia@gallo-420.barberos.invalid', displayName: 'Lucía', role: 'viewer' as const },
};
type Person = Omit<(typeof PEOPLE)[keyof typeof PEOPLE], 'employeeId'> & { employeeId: string | null };
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

// Cadena de consultas falsa: cualquier método devuelve la misma cadena; al esperarla entrega el resultado de la tabla.
const tables: Record<string, unknown[]> = {};
const fromCalls: { table: string; calls: [string, unknown[]][] }[] = [];
function chain(table: string) {
    const record = { table, calls: [] as [string, unknown[]][] };
    fromCalls.push(record);
    const target: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(target, {
        get(_t, prop: string) {
            if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
            if (prop === 'single') return async () => ({ data: { timezone: 'America/Mexico_City' }, error: null });
            return (...args: unknown[]) => { record.calls.push([prop, args]); return proxy; };
        },
    });
    return proxy;
}
const sessionRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
        rpc: (...args: unknown[]) => sessionRpc(...args),
        from: (table: string) => chain(table),
    }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

const pinRpc = vi.fn();
const runWithPinMock = vi.fn();
vi.mock('@/lib/auth/pin-confirm', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/pin-confirm')>();
    return { ...real, runWithPin: (...args: unknown[]) => runWithPinMock(...args) };
});

import { GET as listLedger, POST as createEntry } from './route';
import { POST as cancelEntry } from './[id]/cancel/route';
import { GET as listGoals, PATCH as patchGoal, POST as createGoal } from '../bonus-goals/route';
import { GET as progress } from '../bonus-goals/progress/route';
import { GET as previewWeek } from '../settlements/route';

const GOOD_PIN = '482913';
const EMP = '6c3ee0f8-5e86-4703-bd99-eaf0df33e862';
const LOAN = '0f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b';
const ENTRY = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const GOAL = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const json = (url: string, method: string, body: unknown) =>
    new NextRequest(new URL(url, 'http://localhost'), { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

const LEDGER_ROWS = [
    { id: 'l1', branch_id: 'br1', employee_id: EMP, employee_name: 'Dani', entry_type: 'advance', amount: '300.00', receipt_effect: '-300.00', paid_from: 'envelope',
      method: 'cash', reason: 'Adelanto para renta', loan_id: null, bonus_goal_id: null, reverses_entry_id: null, reversed_by_entry_id: null, settlement_id: null,
      receipt_number: null, origin_settlement_id: null, week_start: '2026-11-15', effective_at: '2026-11-18T18:00:00Z', is_pending: true, created_by: 'u-sonia', created_at: '2026-11-18T18:00:00Z' },
    { id: 'l2', branch_id: 'br1', employee_id: EMP, employee_name: 'Dani', entry_type: 'deduction', amount: '50', receipt_effect: '-50', paid_from: null,
      method: null, reason: 'Se llevó una cera', loan_id: null, bonus_goal_id: null, reverses_entry_id: null, reversed_by_entry_id: null, settlement_id: 's1',
      receipt_number: 'P2646-03', origin_settlement_id: null, week_start: '2026-11-08', effective_at: '2026-11-10T18:00:00Z', is_pending: false, created_by: 'u-sonia', created_at: '2026-11-10T18:00:00Z' },
];

beforeEach(() => {
    current = PEOPLE.owner;
    sessionRpc.mockReset(); pinRpc.mockReset(); runWithPinMock.mockReset();
    fromCalls.length = 0;
    for (const key of Object.keys(tables)) delete tables[key];
    sessionRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
        if (fn === 'employee_ledger_list') return { data: LEDGER_ROWS, error: null };
        if (fn === 'employee_loans_with_balance') return { data: [{ id: LOAN, branch_id: 'br1', employee_id: EMP, principal: '300.00', weekly_amount: '100.00', paid: '100.00', outstanding: '200.00', status: 'active', reason: 'Préstamo', created_by: 'u-sonia', created_at: '2026-11-18T18:00:00Z' }], error: null };
        if (fn === 'member_display_names') return { data: [{ user_id: 'u-sonia', display_name: 'Sonia' }], error: null };
        if (fn === 'save_bonus_goal') return { data: { id: GOAL, branch_id: 'br1', name: args.p_name ?? 'Meta', metric: args.p_metric ?? 'services_count', threshold: '40.00', bonus_amount: '300.00', applies_to: 'all_barbers', employee_id: null, valid_from: '2026-11-15', valid_to: null, is_active: true, created_by: 'u-alonso', created_at: '', updated_at: '' }, error: null };
        if (fn === 'bonus_goal_progress') return { data: { enabled: true, period_start: '2026-11-19', period_end: '2026-11-25', window_start: '', window_end: '', people: [{ employee_id: EMP, name: 'Dani', goals: [{ goal_id: GOAL, name: 'Meta', metric: 'services_count', threshold: '40.00', bonus_amount: '300.00', value: '12.00', achieved: false, remaining: '28.00' }] }] }, error: null };
        if (fn === 'preview_commission_settlement') return { data: { window_start: 'a', window_end: 'b', gross_commission: 1000, deductions: 0, tips: 100, total_amount: 550, entry_count: 3, can_settle: true, reason: null, settlement_id: null, receipt_number: null, advances: 500, staff_deductions: 50, bonuses: 0, loan_payments: 0, carryover_in: 0, carryover_out: 0, net_amount: 550, bonus_goals_enabled: false }, error: null };
        return { data: null, error: null };
    });
    pinRpc.mockResolvedValue({ data: { entry_id: ENTRY, entry_type: 'advance', amount: '300.00', receipt_effect: '-300.00', paid_from: 'envelope', envelope_balance: '700.00', cash_available: null, loan_outstanding: null, replayed: false }, error: null });
    runWithPinMock.mockImplementation(async (_identity: unknown, pin: string, action: (client: unknown) => Promise<unknown>) => {
        if (pin !== GOOD_PIN) return { ok: false, status: 400, error: 'El PIN no es correcto.' };
        return { ok: true, value: await action({ rpc: (...args: unknown[]) => pinRpc(...args) }) };
    });
});

describe('GET /api/employee-ledger — libro por empleado y general', () => {
    it.each(['owner', 'admin', 'viewer'] as const)('%s ve el libro general (o de una persona) con números y pendientes', async (who) => {
        current = PEOPLE[who];
        const res = await listLedger(get(`/api/employee-ledger?employee_id=${EMP}`));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(sessionRpc).toHaveBeenCalledWith('employee_ledger_list', expect.objectContaining({ p_branch_id: 'br1', p_employee_id: EMP }));
        expect(body.entries[0]).toMatchObject({ id: 'l1', amount: 300, receipt_effect: -300, label: 'Adelanto', can_cancel: true, created_by_name: 'Sonia' });
        expect(body.entries[1]).toMatchObject({ can_cancel: false, receipt_number: 'P2646-03' });
        expect(body.loans[0]).toMatchObject({ principal: 300, outstanding: 200, status: 'active' });
        expect(body.pending).toMatchObject({ count: 1, receipt_effect: -300, advances: 300 });
        expect(body.can_edit).toBe(who !== 'viewer');
    });

    it.each(['barber', 'receptionist'] as const)('%s solo ve lo suyo aunque pida a otra persona', async (who) => {
        current = PEOPLE[who];
        const res = await listLedger(get(`/api/employee-ledger?employee_id=${EMP}`));
        expect(res.status).toBe(200);
        expect(sessionRpc).toHaveBeenCalledWith('employee_ledger_list', expect.objectContaining({ p_employee_id: current.employeeId }));
        expect(sessionRpc).toHaveBeenCalledWith('employee_loans_with_balance', { p_branch_id: 'br1', p_employee_id: current.employeeId });
        expect((await res.json()).can_edit).toBe(false);
    });

    it('una cuenta sin ficha de empleado que no es de gerencia recibe 403', async () => {
        current = { ...PEOPLE.barber, employeeId: null };
        const res = await listLedger(get('/api/employee-ledger'));
        expect(res.status).toBe(403);
    });
});

describe('POST /api/employee-ledger — adelanto, préstamo, abono y descuento', () => {
    const advance = { employee_id: EMP, entry_type: 'advance', amount: 300, reason: 'Adelanto para renta', paid_from: 'envelope', idempotency_key: 'clave-prueba-0001' };

    it.each(['barber', 'viewer', 'receptionist'] as const)('%s no registra (403)', async (who) => {
        current = PEOPLE[who];
        const res = await createEntry(json('/api/employee-ledger', 'POST', { ...advance, pin: GOOD_PIN }));
        expect(res.status).toBe(403);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('sin PIN pide el PIN (428)', async () => {
        const res = await createEntry(json('/api/employee-ledger', 'POST', advance));
        expect(res.status).toBe(428);
        expect((await res.json()).needs_pin).toBe(true);
    });

    it('PIN incorrecto: 400 sin llamar a la base', async () => {
        const res = await createEntry(json('/api/employee-ledger', 'POST', { ...advance, pin: '000000' }));
        expect(res.status).toBe(400);
        expect(pinRpc).not.toHaveBeenCalled();
    });

    it.each([
        [{ ...advance, paid_from: undefined }, 'de dónde sale'],
        [{ ...advance, entry_type: 'deduction', paid_from: 'cash_drawer' }, 'no entrega dinero'],
        [{ ...advance, entry_type: 'loan' }, 'abono por semana'],
        [{ ...advance, entry_type: 'loan', weekly_amount: 400 }, 'no puede ser mayor'],
        [{ ...advance, entry_type: 'loan_payment', paid_from: null }, 'préstamo'],
        [{ ...advance, reason: 'abc' }, 'motivo'],
        [{ ...advance, amount: 10.555 }, 'decimales'],
    ])('valida la forma en español: %#', async (body, text) => {
        const res = await createEntry(json('/api/employee-ledger', 'POST', { ...body, pin: GOOD_PIN }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain(text);
    });

    it.each(['owner', 'admin'] as const)('%s registra un adelanto con PIN (201) y la base recibe todo', async (who) => {
        current = PEOPLE[who];
        const res = await createEntry(json('/api/employee-ledger', 'POST', { ...advance, pin: GOOD_PIN }));
        expect(res.status).toBe(201);
        expect(pinRpc).toHaveBeenCalledWith('record_employee_ledger_entry', expect.objectContaining({
            p_branch_id: 'br1', p_employee_id: EMP, p_entry_type: 'advance', p_amount: 300, p_paid_from: 'envelope', p_idempotency_key: 'clave-prueba-0001',
        }));
        expect(await res.json()).toMatchObject({ entry_id: ENTRY, amount: 300, receipt_effect: -300, envelope_balance: 700, replayed: false });
    });

    it('préstamo con abono semanal y descuento sin dinero', async () => {
        let res = await createEntry(json('/api/employee-ledger', 'POST', { ...advance, entry_type: 'loan', paid_from: 'bank', method: 'transfer', weekly_amount: 100, pin: GOOD_PIN }));
        expect(res.status).toBe(201);
        expect(pinRpc).toHaveBeenLastCalledWith('record_employee_ledger_entry', expect.objectContaining({ p_entry_type: 'loan', p_weekly_amount: 100, p_method: 'transfer' }));
        res = await createEntry(json('/api/employee-ledger', 'POST', { ...advance, entry_type: 'deduction', paid_from: null, pin: GOOD_PIN }));
        expect(res.status).toBe(201);
        expect(pinRpc).toHaveBeenLastCalledWith('record_employee_ledger_entry', expect.objectContaining({ p_entry_type: 'deduction', p_paid_from: undefined }));
        res = await createEntry(json('/api/employee-ledger', 'POST', { ...advance, entry_type: 'loan_payment', paid_from: null, loan_id: LOAN, pin: GOOD_PIN }));
        expect(res.status).toBe(201);
        expect(pinRpc).toHaveBeenLastCalledWith('record_employee_ledger_entry', expect.objectContaining({ p_entry_type: 'loan_payment', p_loan_id: LOAN }));
    });

    it('sin efectivo suficiente: 409 con el mensaje de la base', async () => {
        pinRpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'En el sobre hay $700; no se pueden entregar $800.' } });
        const res = await createEntry(json('/api/employee-ledger', 'POST', { ...advance, amount: 800, pin: GOOD_PIN }));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('En el sobre hay $700; no se pueden entregar $800.');
    });
});

describe('POST /api/employee-ledger/[id]/cancel', () => {
    const params = { params: Promise.resolve({ id: ENTRY }) };
    it.each(['barber', 'viewer', 'receptionist'] as const)('%s no cancela (403)', async (who) => {
        current = PEOPLE[who];
        const res = await cancelEntry(json(`/api/employee-ledger/${ENTRY}/cancel`, 'POST', { reason: 'Se registró mal', pin: GOOD_PIN }), params);
        expect(res.status).toBe(403);
    });
    it('pide PIN y motivo', async () => {
        expect((await cancelEntry(json(`/api/employee-ledger/${ENTRY}/cancel`, 'POST', { reason: 'Se registró mal' }), params)).status).toBe(428);
        expect((await cancelEntry(json(`/api/employee-ledger/${ENTRY}/cancel`, 'POST', { reason: 'no', pin: GOOD_PIN }), params)).status).toBe(400);
    });
    it('gerencia cancela con PIN; ya incluido en recibo: 409', async () => {
        current = PEOPLE.admin;
        pinRpc.mockResolvedValueOnce({ data: { entry_id: ENTRY, reversal_id: 'r1', entry_type: 'advance', amount: '300', returned_to: 'envelope', envelope_id: 'env', envelope_balance: '1000', cash_available: null }, error: null });
        let res = await cancelEntry(json(`/api/employee-ledger/${ENTRY}/cancel`, 'POST', { reason: 'Se registró mal', pin: GOOD_PIN }), params);
        expect(res.status).toBe(200);
        expect(pinRpc).toHaveBeenCalledWith('cancel_employee_ledger_entry', { p_entry_id: ENTRY, p_reason: 'Se registró mal' });
        expect(await res.json()).toMatchObject({ reversal_id: 'r1', returned_to: 'envelope', envelope_balance: 1000, amount: 300 });
        pinRpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'Ya se incluyó en el recibo P2646-03; no se cancela. Corrígelo con un asiento nuevo.' } });
        res = await cancelEntry(json(`/api/employee-ledger/${ENTRY}/cancel`, 'POST', { reason: 'Se registró mal', pin: GOOD_PIN }), params);
        expect(res.status).toBe(409);
        expect((await res.json()).error).toContain('P2646-03');
    });
    it('id inválido: 404', async () => {
        const res = await cancelEntry(json('/api/employee-ledger/x/cancel', 'POST', { reason: 'Se registró mal', pin: GOOD_PIN }), { params: Promise.resolve({ id: 'x' }) });
        expect(res.status).toBe(404);
    });
});

describe('/api/bonus-goals — solo la cuenta principal', () => {
    it.each(['admin', 'viewer', 'barber', 'receptionist'] as const)('%s no ve ni cambia metas (403)', async (who) => {
        current = PEOPLE[who];
        expect((await listGoals()).status).toBe(403);
        expect((await createGoal(json('/api/bonus-goals', 'POST', {}))).status).toBe(403);
        expect((await patchGoal(json('/api/bonus-goals', 'PATCH', { id: GOAL }))).status).toBe(403);
    });

    it('sin metas: lista vacía y apagado', async () => {
        const res = await listGoals();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ goals: [], enabled: false });
    });

    it('lista con números y nombre de la persona', async () => {
        tables.bonus_goals = [{ id: GOAL, branch_id: 'br1', name: 'Meta Dani', metric: 'service_revenue', threshold: '8000.00', bonus_amount: '300.00', applies_to: 'employee', employee_id: EMP, valid_from: '2026-11-15', valid_to: null, is_active: true, created_by: 'u-alonso', created_at: '', updated_at: '' }];
        tables.employees = [{ id: EMP, display_name: 'Dani' }];
        const body = await (await listGoals()).json();
        expect(body.enabled).toBe(true);
        expect(body.goals[0]).toMatchObject({ threshold: 8000, bonus_amount: 300, employee_name: 'Dani', metric_label: 'Ventas de servicios en la semana (pesos)' });
    });

    it('crea una meta para todos los barberos', async () => {
        const res = await createGoal(json('/api/bonus-goals', 'POST', { name: 'Cuarenta cortes', metric: 'services_count', threshold: 40, bonus_amount: 300, applies_to: 'all_barbers', valid_from: '2026-11-15' }));
        expect(res.status).toBe(201);
        expect(sessionRpc).toHaveBeenCalledWith('save_bonus_goal', expect.objectContaining({ p_branch_id: 'br1', p_metric: 'services_count', p_threshold: 40, p_applies_to: 'all_barbers', p_employee_id: undefined }));
        expect((await res.json()).goal).toMatchObject({ id: GOAL, threshold: 40, bonus_amount: 300 });
    });

    it.each([
        [{ name: 'Meta', metric: 'services_count', threshold: 10.5, bonus_amount: 100, applies_to: 'all_barbers' }, 'número entero'],
        [{ name: 'Meta', metric: 'services_count', threshold: 10, bonus_amount: 100, applies_to: 'employee' }, 'persona'],
        [{ name: 'Meta', metric: 'cortes', threshold: 10, bonus_amount: 100, applies_to: 'all_barbers' }, 'métrica'],
        [{ name: 'Meta', metric: 'services_count', threshold: 10, bonus_amount: 0, applies_to: 'all_barbers' }, 'bono'],
    ])('valida la meta: %#', async (body, text) => {
        const res = await createGoal(json('/api/bonus-goals', 'POST', body));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain(text);
    });

    it('PATCH apaga la meta o le quita la fecha de fin', async () => {
        let res = await patchGoal(json('/api/bonus-goals', 'PATCH', { id: GOAL, is_active: false }));
        expect(res.status).toBe(200);
        expect(sessionRpc).toHaveBeenLastCalledWith('save_bonus_goal', expect.objectContaining({ p_id: GOAL, p_is_active: false, p_clear_valid_to: false }));
        res = await patchGoal(json('/api/bonus-goals', 'PATCH', { id: GOAL, valid_to: null }));
        expect(res.status).toBe(200);
        expect(sessionRpc).toHaveBeenLastCalledWith('save_bonus_goal', expect.objectContaining({ p_id: GOAL, p_valid_to: undefined, p_clear_valid_to: true }));
    });
});

describe('GET /api/bonus-goals/progress — avance de la semana ("Mi semana")', () => {
    it.each(['owner', 'admin', 'viewer', 'barber', 'receptionist'] as const)('%s consulta; la base decide a quién ve', async (who) => {
        current = PEOPLE[who];
        const res = await progress(get('/api/bonus-goals/progress?period_start=2026-11-19'));
        expect(res.status).toBe(200);
        expect(sessionRpc).toHaveBeenCalledWith('bonus_goal_progress', { p_branch_id: 'br1', p_employee_id: undefined, p_period_start: '2026-11-19' });
        const body = await res.json();
        expect(body.people[0].goals[0]).toMatchObject({ value: 12, threshold: 40, remaining: 28, achieved: false, metric_label: 'Servicios completados en la semana' });
    });
    it('el día debe iniciar un periodo de pago (desde el 19 nov, un domingo ya no)', async () => {
        expect((await progress(get('/api/bonus-goals/progress?period_start=2026-11-16'))).status).toBe(400);
        expect((await progress(get('/api/bonus-goals/progress?period_start=2026-11-22'))).status).toBe(400);
        expect((await progress(get('/api/bonus-goals/progress?period_start=2026-11-19'))).status).toBe(200);
    });
});

describe('GET /api/settlements — la vista previa trae el desglose nuevo sin romper lo anterior', () => {
    it('incluye adelantos, descuentos y neto, y conserva las claves de antes', async () => {
        tables.employees = [{ id: EMP, display_name: 'Dani' }];
        const res = await previewWeek(get('/api/settlements?period_start=2026-11-08'));
        expect(res.status).toBe(200);
        const row = (await res.json()).rows[0];
        expect(row).toMatchObject({ employee_id: EMP, name: 'Dani', gross_commission: 1000, deductions: 0, tips: 100, total_amount: 550, can_settle: true,
            advances: 500, staff_deductions: 50, net_amount: 550, bonus_goals_enabled: false });
    });
});
