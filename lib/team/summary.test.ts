import { describe, expect, it } from 'vitest';
import { buildTeamSummary, teamWindow, toRankingPeople, type EmployeeRow } from './summary';

const employees: EmployeeRow[] = [
    { id: 'deya', display_name: 'Deya', is_barber: true, is_active: true },
    { id: 'dani', display_name: 'Dani', is_barber: true, is_active: true },
    { id: 'sonia', display_name: 'Sonia', is_barber: true, is_active: true },
    { id: 'dago', display_name: 'Dago', is_barber: false, is_active: true },
    { id: 'emi', display_name: 'Emi', is_barber: false, is_active: true },
];
const item = (id: string, sale: string, type: 'service' | 'product', name: string, qty: number, total: number, emp: string | null, seller: string | null = null) => ({
    id, sale_id: sale, item_type: type, item_name_snapshot: name, quantity: qty, line_total: total, employee_id: emp, commission_employee_id: seller,
});

const sales = [{ id: 's1', status: 'paid' }, { id: 's2', status: 'paid' }, { id: 's3', status: 'refunded' }];
const items = [
    item('i1', 's1', 'service', 'Corte adulto', 1, 150, 'deya'),
    item('i2', 's1', 'service', 'Barba', 1, 100, 'deya'),
    item('i3', 's1', 'product', 'Pomada Negra Baregk (150 ml)', 1, 180, null, 'dago'),
    item('i4', 's2', 'service', 'Corte adulto', 2, 300, 'dani'),
    item('i5', 's2', 'product', 'Polvo de textura', 1, 225, null, 'deya'),
    item('i6', 's3', 'service', 'Servicio VIP', 1, 420, 'sonia'), // anulada: no cuenta
];
const commissions = [
    { sale_id: 's1', sale_item_id: 'i1', commission_amount: 75, status: 'generated', employee_id: 'deya' },
    { sale_id: 's1', sale_item_id: 'i2', commission_amount: 50, status: 'generated', employee_id: 'deya' },
    { sale_id: 's1', sale_item_id: 'i3', commission_amount: 36, status: 'generated', employee_id: 'dago' },
    { sale_id: 's2', sale_item_id: 'i4', commission_amount: 150, status: 'generated', employee_id: 'dani' },
    { sale_id: 's2', sale_item_id: 'i5', commission_amount: 45, status: 'generated', employee_id: 'deya' },
    { sale_id: 's3', sale_item_id: 'i6', commission_amount: 210, status: 'generated', employee_id: 'sonia' },
    { sale_id: 's2', sale_item_id: 'i4', commission_amount: 99, status: 'reversed', employee_id: 'dani' },
];
const tips = [
    { sale_id: 's1', amount: 30, status: 'generated', employee_id: 'deya' },
    { sale_id: 's3', amount: 50, status: 'generated', employee_id: 'sonia' },
];

describe('resumen del equipo', () => {
    const summary = buildTeamSummary({ sales, items, commissions, tips, employees });
    const by = (id: string) => summary.people.find((p) => p.employeeId === id)!;

    it('cuenta servicios por tipo y piezas de producto, solo de ventas cobradas', () => {
        expect(by('deya').services).toEqual({ count: 2, byType: [{ name: 'Barba', count: 1 }, { name: 'Corte adulto', count: 1 }] });
        expect(by('dani').services.count).toBe(2);
        expect(by('sonia').services.count).toBe(0);
        expect(by('deya').products).toMatchObject({ units: 1, revenueCents: 22500 });
        expect(by('dago').products).toMatchObject({ units: 1, revenueCents: 18000, byItem: [{ name: 'Pomada Negra Baregk (150 ml)', count: 1 }] });
    });
    it('separa comisión de servicios y de productos, y suma propinas completas', () => {
        expect(by('deya').earned).toEqual({ serviceCommissionCents: 12500, productCommissionCents: 4500, tipsCents: 3000, totalCents: 20000 });
        expect(by('dago').earned).toMatchObject({ productCommissionCents: 3600, totalCents: 3600 });
        expect(by('dani').earned.serviceCommissionCents).toBe(15000); // la comisión revertida no cuenta
    });
    it('ventas generadas = servicios + productos netos; las anuladas no aportan ni propinas', () => {
        expect(by('deya').generatedCents).toBe(47500);
        expect(by('sonia').generatedCents).toBe(0);
        expect(by('sonia').earned.totalCents).toBe(0);
    });
    it('los barberos activos aparecen aunque no lleven nada; recepción sin ventas no', () => {
        expect(summary.people.map((p) => p.name)).toEqual(['Deya', 'Dani', 'Sonia', 'Dago']);
        expect(summary.people.some((p) => p.name === 'Emi')).toBe(false);
    });
    it('totales del equipo', () => {
        expect(summary.totals).toMatchObject({ sales: 2, serviceCount: 4, productUnits: 2, productRevenueCents: 40500, generatedCents: 95500, tipsCents: 3000, commissionCents: 35600 });
    });
    it('una venta sin persona asignada queda aparte y no se pierde', () => {
        const s = buildTeamSummary({ sales: [{ id: 'x', status: 'paid' }], items: [item('p', 'x', 'product', 'Peine de textura', 1, 80, null, null)], commissions: [], tips: [], employees: [] });
        expect(s.people).toHaveLength(1);
        expect(s.people[0]).toMatchObject({ employeeId: null, name: 'Sin asignar', generatedCents: 8000 });
    });
    it('sin ventas todo es cero', () => {
        const s = buildTeamSummary({ sales: [], items: [], commissions: [], tips: [], employees });
        expect(s.totals.generatedCents).toBe(0);
        expect(s.people.map((p) => p.name)).toEqual(['Dani', 'Deya', 'Sonia']);
    });
    it('alimenta el ranking con las mismas cifras', () => {
        const people = toRankingPeople(summary);
        expect(people.find((p) => p.id === 'deya')).toMatchObject({ services: 2, productUnits: 1, serviceRevenueCents: 25000, productRevenueCents: 22500 });
    });
});

describe('periodos en la hora de la barbería', () => {
    // 2026-11-16 es lunes. A las 02:00 UTC todavía es domingo 15 en Ciudad de México.
    const tz = 'America/Mexico_City';
    it('"hoy" es el día local, no el de UTC', () => {
        const w = teamWindow('today', new Date('2026-11-16T02:00:00Z'), tz);
        expect(w).toMatchObject({ startDay: '2026-11-15', endDay: '2026-11-15', start: '2026-11-15T06:00:00.000Z', end: '2026-11-16T06:00:00.000Z' });
    });
    it('antes del 15 nov la semana va de domingo a sábado con corte el sábado 8 pm', () => {
        const w = teamWindow('week', new Date('2026-11-11T18:00:00Z'), tz);
        expect(w).toMatchObject({ startDay: '2026-11-08', endDay: '2026-11-14', start: '2026-11-08T02:00:00.000Z' });
        expect(w.end).toBe('2026-11-15T02:00:00.000Z');
    });
    it('"Esta semana" es el periodo de pago: la transición del 15 al 18 nov y luego de jueves a miércoles', () => {
        const bridge = teamWindow('week', new Date('2026-11-18T18:00:00Z'), tz);
        expect(bridge).toMatchObject({ startDay: '2026-11-15', endDay: '2026-11-18', start: '2026-11-15T02:00:00.000Z', end: '2026-11-19T06:00:00.000Z' });
        const w = teamWindow('week', new Date('2026-11-21T18:00:00Z'), tz);
        expect(w).toMatchObject({ startDay: '2026-11-19', endDay: '2026-11-25', start: '2026-11-19T06:00:00.000Z', end: '2026-11-26T06:00:00.000Z' });
    });
    it('el mes es el mes natural', () => {
        const w = teamWindow('month', new Date('2026-11-16T18:00:00Z'), tz);
        expect(w).toMatchObject({ startDay: '2026-11-01', endDay: '2026-11-30' });
    });
});
