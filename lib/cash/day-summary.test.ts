import { describe, expect, it } from 'vitest';
import {
    buildDayCash, buildDaySummary, type DayItem, type DayPayment, type DaySale, type DaySummaryInput, type DayTip,
} from './day-summary';
import { buildWhatsAppText, longDayLabel, shortDayLabel, summaryFileName, summaryTitle, whatsAppUrl } from './day-summary-text';
import type { CashMovementRow, CashSessionRow } from './session-view';

const EMP = [{ id: 'deya', display_name: 'Deya Pérez' }, { id: 'dani', display_name: 'Dani López' }, { id: 'emi', display_name: 'Emi Ruiz' }];
const CUT = 'svc-corte';
const sale = (id: string, status = 'paid', total = 0): DaySale => ({ id, folio: `V-${id}`, status, total_amount: total, paid_at: `2026-11-20T18:0${id.length}:00Z` });
const svc = (sale_id: string, employee_id: string | null, line_total: number | string, service_id: string | null = CUT, quantity = 1): DayItem =>
    ({ sale_id, item_type: 'service', item_name_snapshot: 'Corte', service_id, quantity, line_total, employee_id, commission_employee_id: null });
const prod = (sale_id: string, seller: string | null, line_total: number | string, quantity = 1, barber: string | null = 'deya'): DayItem =>
    ({ sale_id, item_type: 'product', item_name_snapshot: 'Cera', service_id: null, quantity, line_total, employee_id: barber, commission_employee_id: seller });
const pay = (sale_id: string, method: string, amount: number | string, status = 'confirmed'): DayPayment => ({ sale_id, method, amount, status });
const tip = (sale_id: string, employee_id: string | null, amount: number | string, method: string | null = 'cash', status = 'generated'): DayTip =>
    ({ sale_id, employee_id, amount, method, status });

const input = (over: Partial<DaySummaryInput>): DaySummaryInput =>
    ({ date: '2026-11-20', sales: [], items: [], payments: [], tips: [], employees: EMP, cutServiceIds: [CUT], ...over });

describe('buildDaySummary', () => {
    it('día sin ventas: ceros, formas de pago básicas en cero, sin personas y cuadra', () => {
        const s = buildDaySummary(input({}));
        expect(s.sales).toEqual({ paidCount: 0, voidedCount: 0, voidedCents: 0 });
        expect(s.totals.grandTotalCents).toBe(0);
        expect(s.methods.map((m) => m.method)).toEqual(['cash', 'card', 'transfer']);
        expect(s.people).toEqual([]);
        expect(s.check.ok).toBe(true);
    });

    it('reparte servicios, productos y propinas; ingreso = servicios + productos; total = ingreso + propinas', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 350), sale('b', 'paid', 150)],
            items: [svc('a', 'deya', 200), prod('a', 'deya', 150), svc('b', 'dani', 150)],
            payments: [pay('a', 'cash', 350), pay('b', 'card', 150)],
            tips: [tip('a', 'deya', 30), tip('b', 'dani', 20, 'card')],
        }));
        expect(s.totals).toMatchObject({ servicesCents: 35000, serviceCount: 2, cutCount: 2, productsCents: 15000, productUnits: 1, tipsCents: 5000, businessIncomeCents: 50000, grandTotalCents: 55000 });
        expect(s.check.ok).toBe(true);
        expect(s.people.map((p) => [p.firstName, p.totalCents])).toEqual([['Deya', 38000 - 0], ['Dani', 17000]]);
    });

    it('pago dividido: cada parte va a su método y los métodos suman el total', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 200)], items: [svc('a', 'deya', 200)],
            payments: [pay('a', 'cash', 50), pay('a', 'card', 150)],
        }));
        const by = Object.fromEntries(s.methods.map((m) => [m.method, m]));
        expect(by.cash).toMatchObject({ salesCents: 5000, payments: 1 });
        expect(by.card).toMatchObject({ salesCents: 15000, payments: 1 });
        expect(s.check.methodsDiffCents).toBe(0);
        expect(s.saleLines[0].methodLabel).toBe('Efectivo 50 + Tarjeta 150');
    });

    it('propina con método distinto al de la venta: la propina va a SU método', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 200)], items: [svc('a', 'deya', 200)],
            payments: [pay('a', 'cash', 200)], tips: [tip('a', 'deya', 40, 'card')],
        }));
        const by = Object.fromEntries(s.methods.map((m) => [m.method, m]));
        expect(by.cash).toMatchObject({ salesCents: 20000, tipsCents: 0, totalCents: 20000 });
        expect(by.card).toMatchObject({ salesCents: 0, tipsCents: 4000, totalCents: 4000, payments: 0 });
        expect(s.check.ok).toBe(true);
    });

    it('venta anulada: no cuenta (ni sus pagos, propinas ni renglones) y se muestra aparte', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 200), sale('x', 'refunded', 150), sale('y', 'cancelled', 100)],
            items: [svc('a', 'deya', 200), svc('x', 'dani', 150), svc('y', 'dani', 100)],
            payments: [pay('a', 'cash', 200), pay('x', 'cash', 150)], tips: [tip('x', 'dani', 20)],
        }));
        expect(s.sales).toEqual({ paidCount: 1, voidedCount: 2, voidedCents: 25000 });
        expect(s.totals.grandTotalCents).toBe(20000);
        expect(s.people.map((p) => p.firstName)).toEqual(['Deya']);
        expect(s.saleLines).toHaveLength(1);
        expect(s.check.ok).toBe(true);
    });

    it('pagos revertidos no cuentan', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 100)], items: [svc('a', 'deya', 100)],
            payments: [pay('a', 'cash', 100), pay('a', 'card', 100, 'reversed')],
        }));
        expect(s.methods.find((m) => m.method === 'card')?.salesCents).toBe(0);
        expect(s.check.ok).toBe(true);
    });

    it('producto vendido por recepción: se apunta a quien lo vendió, no al barbero de la cita', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 330)], items: [svc('a', 'deya', 200), prod('a', 'emi', 130, 2, 'deya')],
            payments: [pay('a', 'cash', 330)],
        }));
        const emi = s.people.find((p) => p.firstName === 'Emi');
        const deya = s.people.find((p) => p.firstName === 'Deya');
        expect(emi).toMatchObject({ productsCents: 13000, productUnits: 2, serviceCount: 0, totalCents: 13000 });
        expect(deya).toMatchObject({ productsCents: 0, servicesCents: 20000 });
    });

    it('lo no asignado va en «Sin asignar», al final, y el total por persona cuadra', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 300)], items: [svc('a', null, 100), svc('a', 'deya', 150), prod('a', null, 50)],
            payments: [pay('a', 'cash', 300)], tips: [tip('a', null, 10)],
        }));
        expect(s.people.at(-1)).toMatchObject({ employeeId: null, name: 'Sin asignar', servicesCents: 10000, productsCents: 5000, tipsCents: 1000 });
        expect(s.people.reduce((t, p) => t + p.totalCents, 0)).toBe(s.totals.grandTotalCents);
        expect(s.check.ok).toBe(true);
    });

    it('cortes: solo los servicios de categoría «cortes»; el resto son servicios', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 400)], items: [svc('a', 'deya', 150), svc('a', 'deya', 100, 'svc-barba'), svc('a', 'deya', 150, CUT, 1)],
            payments: [pay('a', 'cash', 400)],
        }));
        expect(s.totals).toMatchObject({ serviceCount: 3, cutCount: 2 });
        expect(s.people[0]).toMatchObject({ serviceCount: 3, cutCount: 2 });
    });

    it('redondeos: centavos enteros, sin errores de coma flotante', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 0.3), sale('b', 'paid', 0.6)],
            items: [svc('a', 'deya', '0.10'), svc('a', 'deya', '0.20'), svc('b', 'deya', 0.1 + 0.2 + 0.3)],
            payments: [pay('a', 'cash', '0.30'), pay('b', 'card', 0.1 + 0.2 + 0.3)],
        }));
        expect(s.totals.servicesCents).toBe(90);
        expect(s.totals.grandTotalCents).toBe(90);
        expect(s.check.ok).toBe(true);
    });

    it('si los pagos no suman lo vendido, lo dice (no maquilla)', () => {
        const s = buildDaySummary(input({ sales: [sale('a', 'paid', 200)], items: [svc('a', 'deya', 200)], payments: [pay('a', 'cash', 150)] }));
        expect(s.check).toEqual({ methodsDiffCents: -5000, peopleDiffCents: 0, ok: false });
    });

    it('lista de ventas: sin clientes; hora, quién atendió, concepto, importe y propina', () => {
        const s = buildDaySummary(input({
            sales: [sale('a', 'paid', 200)], items: [svc('a', 'deya', 200), prod('a', 'emi', 0, 2)],
            payments: [pay('a', 'cash', 200)], tips: [tip('a', 'deya', 20)],
        }));
        expect(s.saleLines[0]).toMatchObject({ folio: 'V-a', servedBy: 'Deya y Emi', concept: 'Corte, Cera ×2', amountCents: 20000, tipCents: 2000, methodLabel: 'Efectivo' });
        expect(JSON.stringify(s)).not.toMatch(/client|phone|tel/i);
    });
});

// ───────────────────────── Caja del día
const session = (id: string, over: Partial<CashSessionRow> = {}): CashSessionRow => ({
    id, status: 'closed', opening_cash: 500, counted_cash: 1100, difference_amount: 0, opened_by: 'u1', opened_at: `2026-11-20T15:0${id.length}:00Z`,
    closed_at: '2026-11-21T01:00:00Z', closed_by: 'u2', reserve_amount: 600, float_left: 500, withdrawn_amount: 0, ...over,
});
const mv = (cash_session_id: string, over: Partial<CashMovementRow>): CashMovementRow =>
    ({ cash_session_id, amount: 0, method: 'cash', movement_type: 'sale_payment', direction: 'in', ...over });
const names = new Map([['u1', 'Emi'], ['u2', 'Dago']]);

describe('buildDayCash', () => {
    it('día sin caja', () => {
        expect(buildDayCash([], [], names)).toEqual({ sessions: [], anyOpen: false, differenceCents: 0, reserveCents: 0 });
    });

    it('esperado = fondo + cobros en efectivo + entradas − salidas (misma fórmula de Caja) y separa lo manual', () => {
        const cash = buildDayCash([session('s')], [
            mv('s', { amount: 400, movement_type: 'sale_payment' }),
            mv('s', { amount: 150, method: 'card', movement_type: 'sale_payment' }),
            mv('s', { amount: 50, movement_type: 'deposit', sale_id: 'a', description: 'Propina para Deya' }),
            mv('s', { amount: 100, direction: 'out', movement_type: 'refund', sale_id: 'x' }),
            mv('s', { amount: 80, direction: 'out', movement_type: 'expense', description: 'Agua' }),
            mv('s', { amount: 20, direction: 'out', movement_type: 'withdrawal', description: 'Adelanto · Deya' }),
            mv('s', { amount: 30, movement_type: 'deposit', description: 'Cambio del banco' }),
            mv('s', { amount: 999, direction: 'out', method: 'card', movement_type: 'expense', description: 'Pagado con tarjeta' }),
        ], names);
        const s = cash.sessions[0];
        expect(s).toMatchObject({ initialCents: 50000, cashFromSalesCents: 35000, manualInCents: 3000, manualOutCents: 10000, expectedCents: 50000 + 35000 + 3000 - 10000 });
        expect(s.manualOut.map((m) => [m.tag, m.description])).toEqual([['Gasto', 'Agua'], ['Retiro', 'Adelanto · Deya']]);
        expect(s.manualIn.map((m) => m.tag)).toEqual(['Entrada']);
        expect(s.openedBy).toBe('Emi');
        expect(s.closedBy).toBe('Dago');
        expect(s.countedCents).toBe(110000);
        expect(s.reserveCents).toBe(60000);
    });

    it('dos cajas el mismo día: en orden, con diferencia y apartado sumados', () => {
        const cash = buildDayCash([
            session('bb', { opened_at: '2026-11-20T22:00:00Z', difference_amount: -10, reserve_amount: 200 }),
            session('a', { opened_at: '2026-11-20T15:00:00Z', difference_amount: 5, reserve_amount: 600 }),
        ], [], names);
        expect(cash.sessions.map((s) => s.id)).toEqual(['a', 'bb']);
        expect(cash.differenceCents).toBe(-500);
        expect(cash.reserveCents).toBe(80000);
    });

    it('caja abierta: se marca, sin contado ni diferencia, y no suma al apartado', () => {
        const cash = buildDayCash([session('s', { status: 'open', counted_cash: null, difference_amount: null, closed_at: null, closed_by: null, reserve_amount: null })], [], names);
        expect(cash.anyOpen).toBe(true);
        expect(cash.sessions[0]).toMatchObject({ open: true, countedCents: null, differenceCents: null, closedBy: null });
    });

    it('quien abrió sin nombre conocido usa el comodín', () => {
        expect(buildDayCash([session('s')], [], new Map()).sessions[0].openedBy).toBe('Usuario');
    });
});

// ───────────────────────── Texto para enviar
describe('texto del resumen', () => {
    const summary = buildDaySummary(input({
        sales: [sale('a', 'paid', 350), sale('b', 'paid', 150), sale('x', 'refunded', 100)],
        items: [svc('a', 'deya', 200), prod('a', 'deya', 150), svc('b', 'dani', 150), svc('x', 'dani', 100)],
        payments: [pay('a', 'cash', 350), pay('b', 'card', 150)], tips: [tip('a', 'deya', 30), tip('b', 'dani', 20, 'transfer')],
    }));

    it('formato de WhatsApp: total, tipos, formas de pago, personas, anuladas y caja; solo nombres de pila', () => {
        const cash = buildDayCash([session('s', { counted_cash: 1100, reserve_amount: 600 })], [mv('s', { amount: 600 })], names);
        const text = buildWhatsAppText('2026-11-20', summary, cash);
        expect(text.split('\n')).toEqual([
            'Resumen de caja · vie 20 nov 2026',
            'Total cobrado: $550',
            '· Servicios: $350 (2, 2 cortes)',
            '· Productos: $150 (1)',
            '· Propinas: $50',
            'Efectivo: $380 · Tarjeta: $150 · Transferencia: $20',
            'Por persona:',
            '· Deya: 1 servicio $200 · productos $150 · propinas $30 = $380',
            '· Dani: 1 servicio $150 · propinas $20 = $170',
            'Ventas anuladas: 1 ($100)',
            'Caja: esperado $1,100 · contado $1,100 · diferencia $0 · apartado $600',
        ]);
        expect(text).not.toMatch(/Pérez|López/);
    });

    it('día sin cobros y sin caja', () => {
        const text = buildWhatsAppText('2026-11-20', buildDaySummary(input({})), buildDayCash([], [], names));
        expect(text).toBe('Resumen de caja · vie 20 nov 2026\nNo hubo cobros este día.\nCaja: sin caja abierta este día');
    });

    it('caja abierta: avisa que puede cambiar; muchas cajas: un renglón', () => {
        const open = buildDayCash([session('s', { status: 'open', counted_cash: null, difference_amount: null, reserve_amount: null })], [], names);
        expect(buildWhatsAppText('2026-11-20', summary, open)).toContain('Caja: abierta (esperado $500); el resumen puede cambiar');
        const many = buildDayCash(['a', 'bb', 'ccc', 'dddd'].map((id) => session(id)), [], names);
        expect(buildWhatsAppText('2026-11-20', summary, many)).toContain('Cajas: 4 cajas · diferencia $0 · apartado $2,400');
    });

    it('enlace de WhatsApp, rótulos de fecha y nombre de archivo', () => {
        expect(whatsAppUrl('Hola\n$1')).toBe('https://wa.me/?text=Hola%0A%241');
        expect(longDayLabel('2026-11-20')).toBe('viernes 20 de noviembre de 2026');
        expect(shortDayLabel('2026-11-20')).toBe('vie 20 nov 2026');
        expect(summaryTitle('2026-11-20')).toBe('Resumen de caja · viernes 20 de noviembre de 2026');
        expect(summaryFileName('2026-11-20')).toBe('Resumen-caja-2026-11-20');
    });
});
