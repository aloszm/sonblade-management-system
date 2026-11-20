// D3 (WhatsApp de un clic), recordatorios de mañana y productos en la cita: rutas de la API.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let role = 'receptionist';
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new real.AuthorizationError();
            return { userId: 'u-emi', email: 'emi@gallo-420.barberos.invalid', displayName: 'Emi', employeeId: 'e-emi', businessId: 'b1', branchId: 'br1', role };
        },
    };
});

const APPT_ID = '11111111-1111-4111-8111-111111111111';
const LINE_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const DEYA = '55555555-5555-4555-8555-555555555555';
const APPOINTMENT = {
    id: APPT_ID, client_id: null, assigned_employee_id: DEYA, customer_name: 'Prueba Cliente', customer_phone: '55 1234 5678',
    scheduled_start_at: '2026-11-21T21:30:00Z', scheduled_end_at: '2026-11-21T22:00:00Z', status: 'confirmed', notes: null,
    created_at: '2026-11-19T10:00:00Z', source: 'online', clients: null, employees: { id: DEYA, display_name: 'Deya' }, sales: [],
    appointment_items: [{ id: 'i1', service_id: 's1', price_snapshot: 200, duration_snapshot_minutes: 30, position: 0, removed_at: null, services: { name: 'Corte clásico' } }],
    appointment_notifications: [
        { kind: 'reminder', created_at: '2026-11-20T15:00:00Z', created_by: 'u-dago' },
        { kind: 'reminder', created_at: '2026-11-20T18:00:00Z', created_by: 'u-emi' },
    ],
};
const LINE = {
    id: LINE_ID, appointment_id: APPT_ID, product_id: PRODUCT_ID, name: 'Prueba cera', quantity: 2, unit_price: '150.00', product_active: true,
    tracks_inventory: true, stock: '1.000', seller_employee_id: DEYA, seller_name: 'Deya', added_by: 'u-dago', added_by_name: 'Dago',
    added_at: '2026-11-20T15:00:00Z', updated_at: null, removed_at: null,
};
const PRODUCTS_BLOCK = {
    barber: { id: DEYA, name: 'Deya' }, session_employee: { id: 'e-emi', name: 'Emi' }, open: true, can_edit: true, can_choose_seller: true, lines: [LINE],
};

let appointment: Record<string, unknown> | null = APPOINTMENT;
let rows: Record<string, unknown>[] = [APPOINTMENT];
const rpc = vi.fn();
const calls: [string, unknown[]][] = [];
vi.mock('@/lib/supabase/server', () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order', 'gte', 'lt', 'in']) chain[name] = (...args: unknown[]) => { calls.push([name, args]); return chain; };
    chain.single = async () => ({ data: { timezone: 'America/Mexico_City' }, error: null });
    chain.maybeSingle = async () => ({ data: appointment, error: null });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: rows, error: null });
    return { createSupabaseServerClient: async () => ({ from: () => chain, rpc: (...args: unknown[]) => rpc(...args) }) };
});

import { GET as list } from './route';
import { GET as getOne } from './[id]/route';
import { POST as notify } from './[id]/notifications/route';
import { GET as listProducts, POST as addProduct } from './[id]/products/route';
import { DELETE as removeProduct, PATCH as changeSeller } from './[id]/products/[lineId]/route';

const json = (url: string, method: string, body?: unknown) => new NextRequest(new URL(url, 'http://localhost'), {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
});
const ctx = { params: Promise.resolve({ id: APPT_ID }) };
const lineCtx = { params: Promise.resolve({ id: APPT_ID, lineId: LINE_ID }) };

beforeEach(() => {
    role = 'receptionist';
    appointment = APPOINTMENT;
    rows = [APPOINTMENT];
    calls.length = 0;
    rpc.mockReset();
    rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
        if (fn === 'appointment_products_read') return { data: Object.fromEntries((args.p_appointment_ids as string[]).map((id) => [id, PRODUCTS_BLOCK])), error: null };
        if (fn === 'member_display_names') return { data: [{ user_id: 'u-emi', display_name: 'Emi' }, { user_id: 'u-dago', display_name: 'Dago' }], error: null };
        if (fn === 'record_appointment_notification') return { data: { id: 'n1', kind: args.p_kind, created_at: '2026-11-20T19:00:00Z' }, error: null };
        if (fn === 'product_seller_options') return { data: [{ id: DEYA, name: 'Deya', is_barber: true }, { id: 'e-emi', name: 'Emi', is_barber: false }], error: null };
        if (fn === 'add_appointment_product' || fn === 'set_appointment_product_seller') return { data: LINE, error: null };
        if (fn === 'remove_appointment_product') return { data: { ...LINE, removed_at: '2026-11-20T19:00:00Z' }, error: null };
        return { data: null, error: null };
    });
});

describe('POST /api/appointments/[id]/notifications', () => {
    it('arma el enlace en el servidor y registra que se abrió', async () => {
        const res = await notify(json(`/api/appointments/${APPT_ID}/notifications`, 'POST', { kind: 'recordatorio' }), ctx);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.url.startsWith('https://wa.me/525512345678?text=')).toBe(true);
        expect(body.message).toContain('Te recordamos tu cita en Gallo 4:20');
        expect(body.message).toContain('Corte clásico');
        expect(body.message).toContain('Deya');
        expect(body.notification).toEqual({ id: 'n1', kind: 'reminder', created_at: '2026-11-20T19:00:00Z' });
        expect(rpc).toHaveBeenCalledWith('record_appointment_notification', { p_appointment_id: APPT_ID, p_kind: 'reminder' });
    });
    it('sin teléfono válido responde 422 y no registra', async () => {
        appointment = { ...APPOINTMENT, customer_phone: '123' };
        const res = await notify(json(`/api/appointments/${APPT_ID}/notifications`, 'POST', { kind: 'confirmacion' }), ctx);
        expect(res.status).toBe(422);
        expect((await res.json()).code).toBe('no_phone');
        expect(rpc).not.toHaveBeenCalledWith('record_appointment_notification', expect.anything());
    });
    it.each(['barber', 'viewer'])('%s no puede (403) y no recibe el teléfono', async (r) => {
        role = r;
        const res = await notify(json(`/api/appointments/${APPT_ID}/notifications`, 'POST', { kind: 'confirmacion' }), ctx);
        expect(res.status).toBe(403);
        expect(JSON.stringify(await res.json())).not.toContain('5512345678');
    });
    it('tipo inválido: 400', async () => {
        const res = await notify(json(`/api/appointments/${APPT_ID}/notifications`, 'POST', { kind: 'numero_cliente' }), ctx);
        expect(res.status).toBe(400);
    });
});

describe('lecturas de citas con notificaciones y productos', () => {
    it('la lista trae la última notificación por tipo y los productos', async () => {
        const body = await (await list(json('/api/appointments', 'GET'))).json();
        expect(body[0].notifications).toEqual({ confirmation: null, reminder: { at: '2026-11-20T18:00:00Z', by: 'u-emi', by_name: 'Emi' } });
        expect(body[0].products.lines[0]).toMatchObject({ name: 'Prueba cera', quantity: 2, stock: 1, short_stock: true, seller_name: 'Deya', added_by_name: 'Dago', unit_price: 150 });
        expect(body[0].products.session_employee).toEqual({ id: 'e-emi', name: 'Emi' });
        expect(body[0].appointment_notifications).toBeUndefined();
    });
    it('la cita para el cobro trae sus productos', async () => {
        const body = await (await getOne(json(`/api/appointments/${APPT_ID}`, 'GET'), ctx)).json();
        expect(body.products.lines).toHaveLength(1);
        expect(body.products.barber).toEqual({ id: DEYA, name: 'Deya' });
    });
    it('recordatorios=manana: citas de mañana con estado de recordatorio', async () => {
        const res = await list(json('/api/appointments?recordatorios=manana', 'GET'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(body.appointments[0]).toMatchObject({ id: APPT_ID, reminder_sent: true, has_valid_phone: true });
        expect(calls.some(([name, args]) => name === 'in' && JSON.stringify(args).includes('confirmed'))).toBe(true);
    });
    it('recordatorios: el barbero recibe 403; valor desconocido 400', async () => {
        role = 'barber';
        expect((await list(json('/api/appointments?recordatorios=manana', 'GET'))).status).toBe(403);
        role = 'receptionist';
        expect((await list(json('/api/appointments?recordatorios=hoy', 'GET'))).status).toBe(400);
    });
});

describe('/api/appointments/[id]/products', () => {
    it('GET para recepción incluye vendedores elegibles', async () => {
        const body = await (await listProducts(json(`/api/appointments/${APPT_ID}/products`, 'GET'), ctx)).json();
        expect(body.can_choose_seller).toBe(true);
        expect(body.seller_options).toHaveLength(2);
        expect(body.lines[0].seller_employee_id).toBe(DEYA);
    });
    it('GET para el barbero no pide la lista de vendedores', async () => {
        role = 'barber';
        rpc.mockImplementation(async (fn: string) => fn === 'appointment_products_read'
            ? { data: { [APPT_ID]: { ...PRODUCTS_BLOCK, session_employee: null, can_choose_seller: false } }, error: null }
            : { data: null, error: null });
        const body = await (await listProducts(json(`/api/appointments/${APPT_ID}/products`, 'GET'), ctx)).json();
        expect(body.seller_options).toEqual([]);
        expect(rpc).not.toHaveBeenCalledWith('product_seller_options', expect.anything());
    });
    it('POST agrega con vendedor opcional (sin vendedor manda undefined: la base usa al barbero de la cita)', async () => {
        let res = await addProduct(json(`/api/appointments/${APPT_ID}/products`, 'POST', { product_id: PRODUCT_ID }), ctx);
        expect(res.status).toBe(201);
        expect(rpc).toHaveBeenCalledWith('add_appointment_product', { p_appointment_id: APPT_ID, p_product_id: PRODUCT_ID, p_quantity: 1, p_seller_employee_id: undefined });
        res = await addProduct(json(`/api/appointments/${APPT_ID}/products`, 'POST', { product_id: PRODUCT_ID, quantity: 3, seller_employee_id: DEYA }), ctx);
        expect(rpc).toHaveBeenLastCalledWith('add_appointment_product', { p_appointment_id: APPT_ID, p_product_id: PRODUCT_ID, p_quantity: 3, p_seller_employee_id: DEYA });
        expect((await res.json()).line.seller_name).toBe('Deya');
    });
    it.each([{ product_id: 'x' }, { product_id: PRODUCT_ID, quantity: 0 }, { product_id: PRODUCT_ID, quantity: 51 }, { product_id: PRODUCT_ID, extra: 1 }])('POST rechaza %o', async (body) => {
        const res = await addProduct(json(`/api/appointments/${APPT_ID}/products`, 'POST', body), ctx);
        expect(res.status).toBe(400);
    });
    it('POST: consulta no agrega (403); la regla de la base se traduce (55000 → 409)', async () => {
        role = 'viewer';
        expect((await addProduct(json(`/api/appointments/${APPT_ID}/products`, 'POST', { product_id: PRODUCT_ID }), ctx)).status).toBe(403);
        role = 'barber';
        rpc.mockResolvedValue({ data: null, error: { code: '55000', message: 'Esa cita ya se cobró, se cerró o se canceló: sus productos ya no se cambian.' } });
        const res = await addProduct(json(`/api/appointments/${APPT_ID}/products`, 'POST', { product_id: PRODUCT_ID }), ctx);
        expect(res.status).toBe(409);
    });
    it('PATCH cambia el vendedor; el barbero no puede (403)', async () => {
        appointment = { id: LINE_ID };
        const res = await changeSeller(json(`/api/appointments/${APPT_ID}/products/${LINE_ID}`, 'PATCH', { seller_employee_id: DEYA }), lineCtx);
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith('set_appointment_product_seller', { p_line_id: LINE_ID, p_seller_employee_id: DEYA });
        role = 'barber';
        expect((await changeSeller(json(`/api/appointments/${APPT_ID}/products/${LINE_ID}`, 'PATCH', { seller_employee_id: DEYA }), lineCtx)).status).toBe(403);
    });
    it('DELETE quita la línea o N piezas; línea de otra cita: 404', async () => {
        appointment = { id: LINE_ID };
        let res = await removeProduct(json(`/api/appointments/${APPT_ID}/products/${LINE_ID}?quantity=1`, 'DELETE'), lineCtx);
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith('remove_appointment_product', { p_line_id: LINE_ID, p_quantity: 1 });
        expect((await res.json()).removed).toBe(true);
        res = await removeProduct(json(`/api/appointments/${APPT_ID}/products/${LINE_ID}?quantity=0`, 'DELETE'), lineCtx);
        expect(res.status).toBe(400);
        appointment = null;
        res = await removeProduct(json(`/api/appointments/${APPT_ID}/products/${LINE_ID}`, 'DELETE'), lineCtx);
        expect(res.status).toBe(404);
    });
});
