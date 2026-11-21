import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sesiones de prueba por puesto (nombres reales del equipo; sin PIN reales).
const BASE = { businessId: 'biz', branchId: 'br1' };
const PEOPLE = {
    owner: { ...BASE, employeeId: null, userId: 'u-alonso', email: 'alonso@gallo-420.barberos.invalid', displayName: 'Alonso', role: 'owner' as const },
    admin: { ...BASE, employeeId: 'e-sonia', userId: 'u-sonia', email: 'sonia@gallo-420.barberos.invalid', displayName: 'Sonia', role: 'admin' as const },
    viewer: { ...BASE, employeeId: null, userId: 'u-lucia', email: 'lucia@gallo-420.barberos.invalid', displayName: 'Lucía', role: 'viewer' as const },
    receptionist: { ...BASE, employeeId: 'e-dago', userId: 'u-dago', email: 'dago@gallo-420.barberos.invalid', displayName: 'Dago', role: 'receptionist' as const },
    barber: { ...BASE, employeeId: 'e-dani', userId: 'u-dani', email: 'dani@gallo-420.barberos.invalid', displayName: 'Dani', role: 'barber' as const },
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

import { GET as listWages, PUT as saveWage } from './route';
import { GET as weekWages } from './week/route';
import { POST as createException } from './exceptions/route';
import { POST as voidException } from './exceptions/[id]/void/route';
import { GET as previewWeek } from '../settlements/route';

const GOOD_PIN = '482913';
const DAGO = '67db0358-6563-4879-a9c6-340420ad846d';
const EMI = '1ef32d3d-8cf8-4441-aa6c-7a1674d874e4';
const EXC = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const json = (url: string, method: string, body: unknown) =>
    new NextRequest(new URL(url, 'http://localhost'), { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

// Periodo de pago del jueves 19 al miércoles 25 nov 2026 (lib/payroll/pay-period.ts): Dago lunes a viernes, faltó el viernes 20.
const WEEK = {
    enabled: true, period_start: '2026-11-19', period_end: '2026-11-25', amount: 1280, paid_days: 4, worked_days: 4, absent_days: 1, extra_days: 0,
    groups: [{ rate: 320, days: 4, amount: 1280 }], summary: '4 días × $320 = $1,280',
    days: [
        { date: '2026-11-19', weekday: 4, status: 'worked', rate: 320, amount: 320, exception_id: null, reason: null },
        { date: '2026-11-20', weekday: 5, status: 'absent', rate: 320, amount: 0, exception_id: EXC, reason: 'Enfermo' },
        { date: '2026-11-23', weekday: 1, status: 'worked', rate: 320, amount: 320, exception_id: null, reason: null },
        { date: '2026-11-24', weekday: 2, status: 'worked', rate: 320, amount: 320, exception_id: null, reason: null },
        { date: '2026-11-25', weekday: 3, status: 'worked', rate: 320, amount: 320, exception_id: null, reason: null },
    ],
};

beforeEach(() => {
    current = PEOPLE.owner;
    sessionRpc.mockReset(); pinRpc.mockReset(); runWithPinMock.mockReset();
    fromCalls.length = 0;
    for (const key of Object.keys(tables)) delete tables[key];
    tables.employee_wage_rates = [
        { id: 'r2', branch_id: 'br1', employee_id: DAGO, daily_amount: '350.00', work_days: [1, 2, 3, 4, 5], effective_from: '2099-01-04', reason: 'Aumento', created_by: 'u-alonso', created_at: '2026-11-20T12:00:00Z' },
        { id: 'r1', branch_id: 'br1', employee_id: DAGO, daily_amount: '320.00', work_days: [5, 1, 2, 3, 4], effective_from: '2026-11-15', reason: 'Decisión del dueño', created_by: 'u-alonso', created_at: '2026-11-20T10:00:00Z' },
        { id: 'r3', branch_id: 'br1', employee_id: EMI, daily_amount: 320, work_days: [0, 6], effective_from: '2026-11-15', reason: 'Decisión del dueño', created_by: 'u-alonso', created_at: '2026-11-20T10:00:00Z' },
    ];
    tables.employees = [{ id: DAGO, display_name: 'Dago' }, { id: EMI, display_name: 'Emi' }];
    sessionRpc.mockImplementation(async (fn: string, args?: Record<string, unknown>) => {
        if (fn === 'member_display_names') return { data: [{ user_id: 'u-alonso', display_name: 'Alonso' }, { user_id: 'u-sonia', display_name: 'Sonia' }], error: null };
        if (fn === 'employee_wage_week') return { data: {
            // Como la base: el periodo pedido (o el en curso); el de transición termina el miércoles 18.
            period_start: (args?.p_period_start as string | undefined) ?? '2026-11-19',
            period_end: args?.p_period_start === '2026-11-15' ? '2026-11-18' : '2026-11-25', today: '2026-11-21', can_edit: true,
            people: [{ employee_id: DAGO, name: 'Dago', settlement_id: null, receipt_number: null, settled: false, wage: WEEK,
                       accrued_amount: 320, accrued_days: 1, rate: { daily_amount: '320.00', work_days: [1, 2, 3, 4, 5], effective_from: '2026-11-15' },
                       exceptions: [{ id: EXC, work_date: '2026-11-20', kind: 'absent', reason: 'Enfermo', created_by: 'u-sonia', created_at: '', voided_at: null, voided_by: null, void_reason: null, can_void: true }],
                       can_edit: true }],
        }, error: null };
        if (fn === 'preview_commission_settlement') return { data: {
            window_start: 'a', window_end: 'b', gross_commission: 40, deductions: 0, tips: 0, total_amount: 1320, entry_count: 1, can_settle: true,
            reason: null, settlement_id: null, receipt_number: null, net_amount: 1320, wages: 1280, wage: WEEK,
        }, error: null };
        return { data: null, error: null };
    });
    pinRpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
        if (fn === 'set_employee_wage') return { data: { id: 'r9', employee_id: args.p_employee_id, daily_amount: '330.00', work_days: [0, 6], effective_from: '2026-11-15', reason: args.p_reason, previous: { id: 'r3', daily_amount: '320.00', work_days: [0, 6], effective_from: '2026-11-15' } }, error: null };
        if (fn === 'record_attendance_exception') return { data: { id: EXC, employee_id: args.p_employee_id, work_date: args.p_work_date, kind: args.p_kind, reason: args.p_reason, replayed: false, week: WEEK }, error: null };
        if (fn === 'void_attendance_exception') return { data: { id: EXC, voided: true, week: { ...WEEK, amount: 1600 } }, error: null };
        return { data: null, error: null };
    });
    runWithPinMock.mockImplementation(async (_identity: unknown, pin: string, action: (client: unknown) => Promise<unknown>) => {
        if (pin !== GOOD_PIN) return { ok: false, status: 400, error: 'El PIN no es correcto.' };
        return { ok: true, value: await action({ rpc: (...args: unknown[]) => pinRpc(...args) }) };
    });
});

describe('GET /api/wages — fichas de sueldo con vigencia', () => {
    it.each(['owner', 'admin', 'viewer'] as const)('%s ve las fichas de todo el equipo, con la vigente y la programada', async (who) => {
        current = PEOPLE[who];
        const res = await listWages(get('/api/wages'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.rates).toHaveLength(3);
        expect(body.rates[1]).toMatchObject({ id: 'r1', daily_amount: 320, work_days: [1, 2, 3, 4, 5], work_days_label: 'lunes a viernes', created_by_name: 'Alonso', employee_name: 'Dago' });
        const dago = body.current.find((c: { employee_id: string }) => c.employee_id === DAGO);
        expect(dago.current).toMatchObject({ id: 'r1', daily_amount: 320 });
        expect(dago.next).toMatchObject({ id: 'r2', daily_amount: 350 });
        expect(body.can_edit).toBe(who === 'owner');
        expect(body.min_effective_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const rateQuery = fromCalls.find((c) => c.table === 'employee_wage_rates')!;
        expect(rateQuery.calls.some(([m, a]) => m === 'eq' && a[0] === 'employee_id')).toBe(false);
    });

    it.each(['receptionist', 'barber'] as const)('%s solo consulta lo suyo aunque pida a otra persona', async (who) => {
        current = PEOPLE[who];
        const res = await listWages(get(`/api/wages?employee_id=${EMI}`));
        expect(res.status).toBe(200);
        const rateQuery = fromCalls.find((c) => c.table === 'employee_wage_rates')!;
        expect(rateQuery.calls).toContainEqual(['eq', ['employee_id', current.employeeId]]);
        expect((await res.json()).can_edit).toBe(false);
    });

    it('una cuenta sin ficha de empleado que no es de gerencia recibe 403', async () => {
        current = { ...PEOPLE.barber, employeeId: null };
        expect((await listWages(get('/api/wages'))).status).toBe(403);
    });
});

describe('PUT /api/wages — solo la cuenta principal, con PIN', () => {
    const body = { employee_id: EMI, daily_amount: 330, work_days: [6, 0], reason: 'Aumento a partir de esta semana' };

    it.each(['admin', 'viewer', 'receptionist', 'barber'] as const)('%s no cambia sueldos (403)', async (who) => {
        current = PEOPLE[who];
        const res = await saveWage(json('/api/wages', 'PUT', { ...body, pin: GOOD_PIN }));
        expect(res.status).toBe(403);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('sin PIN pide el PIN (428)', async () => {
        const res = await saveWage(json('/api/wages', 'PUT', body));
        expect(res.status).toBe(428);
        expect((await res.json()).needs_pin).toBe(true);
    });

    it.each([
        [{ ...body, daily_amount: 320.555 }, 'decimales'],
        [{ ...body, daily_amount: -1 }, '$0 a $100,000'],
        [{ ...body, work_days: [7] }, 'domingo'],
        [{ ...body, reason: 'abc' }, 'motivo'],
        [{ ...body, effective_from: '15/11/2026' }, 'AAAA-MM-DD'],
    ])('valida la forma en español: %#', async (payload, text) => {
        const res = await saveWage(json('/api/wages', 'PUT', { ...payload, pin: GOOD_PIN }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain(text);
    });

    it('guarda con PIN y la base recibe todo; devuelve la ficha anterior', async () => {
        const res = await saveWage(json('/api/wages', 'PUT', { ...body, effective_from: '2026-11-22', pin: GOOD_PIN }));
        expect(res.status).toBe(200);
        expect(pinRpc).toHaveBeenCalledWith('set_employee_wage', {
            p_branch_id: 'br1', p_employee_id: EMI, p_daily_amount: 330, p_work_days: [6, 0], p_reason: 'Aumento a partir de esta semana', p_effective_from: '2026-11-22',
        });
        expect(await res.json()).toMatchObject({ daily_amount: 330, work_days_label: 'sábado y domingo', previous: { daily_amount: 320 } });
    });

    it('vigencia hacia atrás: 400 con el mensaje de la base', async () => {
        pinRpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'El sueldo no se cambia hacia atrás: la vigencia empieza el 15/11/2026 (domingo de la semana en curso) o después.' } });
        const res = await saveWage(json('/api/wages', 'PUT', { ...body, effective_from: '2026-11-01', pin: GOOD_PIN }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('hacia atrás');
    });
});

describe('POST /api/wages/exceptions — faltó o día extra', () => {
    const body = { employee_id: DAGO, work_date: '2026-11-17', kind: 'absent', reason: 'Faltó por enfermedad' };

    it.each(['viewer', 'receptionist', 'barber'] as const)('%s no registra excepciones (403)', async (who) => {
        current = PEOPLE[who];
        const res = await createException(json('/api/wages/exceptions', 'POST', { ...body, pin: GOOD_PIN }));
        expect(res.status).toBe(403);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('sin PIN pide el PIN (428); tipo inválido 400', async () => {
        expect((await createException(json('/api/wages/exceptions', 'POST', body))).status).toBe(428);
        const res = await createException(json('/api/wages/exceptions', 'POST', { ...body, kind: 'vacaciones', pin: GOOD_PIN }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain('faltó o día extra');
    });

    it.each(['owner', 'admin'] as const)('%s registra con PIN (201) y recibe la semana recalculada', async (who) => {
        current = PEOPLE[who];
        const res = await createException(json('/api/wages/exceptions', 'POST', { ...body, pin: GOOD_PIN }));
        expect(res.status).toBe(201);
        expect(pinRpc).toHaveBeenCalledWith('record_attendance_exception', {
            p_branch_id: 'br1', p_employee_id: DAGO, p_work_date: '2026-11-17', p_kind: 'absent', p_reason: 'Faltó por enfermedad',
        });
        const out = await res.json();
        expect(out.week).toMatchObject({ amount: 1280, absentDays: 1, summary: '4 días × $320 = $1,280' });
    });

    it('la misma excepción dos veces no duplica: 200 con replayed', async () => {
        pinRpc.mockResolvedValueOnce({ data: { id: EXC, replayed: true, week: WEEK }, error: null });
        const res = await createException(json('/api/wages/exceptions', 'POST', { ...body, pin: GOOD_PIN }));
        expect(res.status).toBe(200);
        expect((await res.json()).replayed).toBe(true);
    });

    it('semana pagada: 409 con el mensaje de la base', async () => {
        pinRpc.mockResolvedValueOnce({ data: null, error: { code: '55000', message: 'Esa semana ya se pagó (recibo P2647-01); corrige con un descuento en el siguiente recibo.' } });
        const res = await createException(json('/api/wages/exceptions', 'POST', { ...body, pin: GOOD_PIN }));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toContain('ya se pagó');
    });
});

describe('POST /api/wages/exceptions/[id]/void — anular sin borrar', () => {
    const params = { params: Promise.resolve({ id: EXC }) };

    it('recepción no anula (403)', async () => {
        current = PEOPLE.receptionist;
        expect((await voidException(json(`/api/wages/exceptions/${EXC}/void`, 'POST', { reason: 'Sí vino', pin: GOOD_PIN }), params)).status).toBe(403);
    });

    it('gerencia anula con PIN y motivo', async () => {
        current = PEOPLE.admin;
        const res = await voidException(json(`/api/wages/exceptions/${EXC}/void`, 'POST', { reason: 'Sí vino, fue un error', pin: GOOD_PIN }), params);
        expect(res.status).toBe(200);
        expect(pinRpc).toHaveBeenCalledWith('void_attendance_exception', { p_exception_id: EXC, p_reason: 'Sí vino, fue un error' });
        expect((await res.json()).week.amount).toBe(1600);
    });

    it('id inválido: 404', async () => {
        const res = await voidException(json('/api/wages/exceptions/x/void', 'POST', { reason: 'Sí vino', pin: GOOD_PIN }), { params: Promise.resolve({ id: 'x' }) });
        expect(res.status).toBe(404);
    });
});

describe('GET /api/wages/week — sueldo de la semana para Mi semana y gerencia', () => {
    it.each(['owner', 'receptionist'] as const)('%s recibe el detalle día por día y lo devengado (la base decide a quién ve)', async (who) => {
        current = PEOPLE[who];
        const res = await weekWages(get('/api/wages/week?period_start=2026-11-19'));
        expect(res.status).toBe(200);
        expect(sessionRpc).toHaveBeenCalledWith('employee_wage_week', { p_branch_id: 'br1', p_employee_id: undefined, p_period_start: '2026-11-19' });
        const body = await res.json();
        expect(body).toMatchObject({ period_start: '2026-11-19', period_end: '2026-11-25', pay_date: '2026-11-28', is_transition: false });
        const dago = body.people[0];
        expect(dago).toMatchObject({ name: 'Dago', amount: 1280, summary: 'Sueldo: 4 días × $320 = $1,280', accrued_amount: 320, accrued_days: 1, rate: { daily_amount: 320 } });
        expect(dago.day_lines[1].text).toBe('vie 20 nov · Faltó (Enfermo)');
        expect(dago.exceptions[0]).toMatchObject({ label: 'Faltó', created_by_name: 'Sonia', can_void: true });
    });

    it('el día debe iniciar un periodo de pago (desde el 19 nov, un domingo ya no)', async () => {
        expect((await weekWages(get('/api/wages/week?period_start=2026-11-16'))).status).toBe(400);
        expect((await weekWages(get('/api/wages/week?period_start=2026-11-22'))).status).toBe(400);
    });

    it('agrega la fecha de pago y si es el periodo de transición (la misma regla que la base)', async () => {
        current = PEOPLE.owner;
        const body = await (await weekWages(get('/api/wages/week?period_start=2026-11-15'))).json();
        expect(body).toMatchObject({ pay_date: '2026-11-21', is_transition: true });
    });
});

describe('GET /api/settlements — la vista previa trae el sueldo', () => {
    it('pasa wages y el detalle `wage` tal cual los calcula la base', async () => {
        tables.employees = [{ id: DAGO, display_name: 'Dago' }];
        const res = await previewWeek(get('/api/settlements?period_start=2026-11-19'));
        expect(res.status).toBe(200);
        const body = await res.json();
        const row = body.rows[0];
        expect(row).toMatchObject({ name: 'Dago', wages: 1280, total_amount: 1320 });
        expect(row.wage.summary).toBe('4 días × $320 = $1,280');
        expect(body).toMatchObject({ period_start: '2026-11-19', period_end: '2026-11-25', pay_date: '2026-11-28', is_transition: false,
            previous_start: '2026-11-15', next_start: '2026-11-26' });
    });

    it('el periodo de transición (15 al 18 nov) se pide con su fin real y se paga el sábado 21', async () => {
        tables.employees = [{ id: DAGO, display_name: 'Dago' }];
        const body = await (await previewWeek(get('/api/settlements?period_start=2026-11-15'))).json();
        expect(body).toMatchObject({ period_start: '2026-11-15', period_end: '2026-11-18', pay_date: '2026-11-21', is_transition: true,
            previous_start: '2026-11-08', next_start: '2026-11-19' });
        expect(sessionRpc).toHaveBeenCalledWith('preview_commission_settlement',
            { p_branch_id: 'br1', p_employee_id: DAGO, p_period_start: '2026-11-15', p_period_end: '2026-11-18' });
    });

    it('un domingo después de la transición ya no es inicio de periodo (lo que pedía la app anterior)', async () => {
        tables.employees = [{ id: DAGO, display_name: 'Dago' }];
        expect((await previewWeek(get('/api/settlements?period_start=2026-11-22'))).status).toBe(400);
        const res = await previewWeek(get('/api/settlements?period_start=2026-11-19'));
        expect(await res.json()).toMatchObject({ period_start: '2026-11-19', period_end: '2026-11-25', pay_date: '2026-11-28', is_transition: false });
    });
});
