import { describe, expect, it } from 'vitest';
import { buildPersonLines, buildWeekPeople, lineApi, personWeekApi, summarizeLines, summarizePerson, type WeekData } from './person-week';

// El caso del dueño: dos "Barba" de $120 (50 % = $60 cada una) y un producto de $180 (20 % = $36).
const EMP = [{ id: 'e1', display_name: 'Deya', is_barber: true, is_active: true }, { id: 'e2', display_name: 'Dani', is_barber: true, is_active: true }];
const DATA: WeekData = {
    employees: EMP,
    sales: [
        { id: 's1', folio: 'V2611-0001', status: 'paid', paid_at: '2026-11-16T17:00:00Z' },
        { id: 's2', folio: 'V2611-0002', status: 'paid', paid_at: '2026-11-17T18:00:00Z' },
        { id: 's3', folio: 'V2611-0003', status: 'voided', paid_at: '2026-11-17T19:00:00Z' },
    ],
    items: [
        { id: 'i1', sale_id: 's1', item_type: 'service', item_name_snapshot: 'Barba', quantity: 1, line_total: '120.00', employee_id: 'e1', commission_employee_id: null },
        { id: 'i2', sale_id: 's2', item_type: 'service', item_name_snapshot: 'Barba', quantity: 1, line_total: '120.00', employee_id: 'e1', commission_employee_id: null },
        { id: 'i3', sale_id: 's2', item_type: 'product', item_name_snapshot: 'Cera', quantity: 1, line_total: '180.00', employee_id: null, commission_employee_id: 'e1' },
        { id: 'i4', sale_id: 's3', item_type: 'service', item_name_snapshot: 'Corte', quantity: 1, line_total: '150.00', employee_id: 'e1', commission_employee_id: null },
    ],
    commissions: [
        { sale_id: 's1', sale_item_id: 'i1', employee_id: 'e1', status: 'generated', commission_amount: '60.00', basis_amount: '120.00', percentage_snapshot: '50.0000' },
        { sale_id: 's2', sale_item_id: 'i2', employee_id: 'e1', status: 'generated', commission_amount: '60.00', basis_amount: '120.00', percentage_snapshot: '50.0000' },
        { sale_id: 's2', sale_item_id: 'i3', employee_id: 'e1', status: 'generated', commission_amount: '36.00', basis_amount: '180.00', percentage_snapshot: '20.0000' },
        { sale_id: 's3', sale_item_id: 'i4', employee_id: 'e1', status: 'generated', commission_amount: '75.00', basis_amount: '150.00', percentage_snapshot: '50.0000' },
    ],
    tips: [{ sale_id: 's1', employee_id: 'e1', status: 'generated', amount: '20.00' }, { sale_id: 's3', employee_id: 'e1', status: 'generated', amount: '99.00' }],
};

describe('semana de una persona', () => {
    it('separa servicios y producto con su porcentaje, y no cuenta la venta anulada', () => {
        const s = summarizePerson(DATA, { id: 'e1', name: 'Deya', isBarber: true });
        expect(s.services).toEqual({ count: 2, revenueCents: 24000, commissionCents: 12000, percent: 50 });
        expect(s.products).toEqual({ count: 1, revenueCents: 18000, commissionCents: 3600, percent: 20 });
        expect(s.tipsCents).toBe(2000);
        expect(s.revenueCents).toBe(42000);
        expect(s.commissionCents).toBe(15600);
        expect(s.earnedCents).toBe(17600);
    });

    it('la propina va en el renglón de su venta y los totales del pie son la suma de los renglones', () => {
        const lines = buildPersonLines(DATA, 'e1');
        expect(lines).toHaveLength(3);
        expect(lines.map((l) => l.concept)).toEqual(expect.arrayContaining(['Barba', 'Cera']));
        expect(lines.reduce((t, l) => t + l.tipCents, 0)).toBe(2000);
        expect(summarizeLines(lines).earnedCents).toBe(17600);
        const api = lineApi(lines.find((l) => l.concept === 'Cera')!);
        expect(api).toMatchObject({ saleId: 's2', folio: 'V2611-0002', kind: 'product', revenue: 180, base: 180, percent: 20, commission: 36 });
    });

    it('un producto regalado (cortesía, $0) cuenta como pieza pero sin base, % ni comisión, y no rompe el 20 %', () => {
        const data: WeekData = {
            ...DATA,
            items: [...DATA.items, { id: 'i5', sale_id: 's2', item_type: 'product', item_name_snapshot: 'Cera', quantity: 2, line_total: '0.00', employee_id: null, commission_employee_id: 'e1' }],
            commissions: [...DATA.commissions, { sale_id: 's2', sale_item_id: 'i5', employee_id: 'e1', status: 'generated', commission_amount: '0.00', basis_amount: '0.00', percentage_snapshot: '0.0000' }],
        };
        const lines = buildPersonLines(data, 'e1');
        const gift = lines.find((l) => l.key === 'item-i5')!;
        expect(gift).toMatchObject({ courtesy: true, revenueCents: 0, baseCents: null, percent: null, commissionCents: 0, quantity: 2 });
        expect(lineApi(gift)).toMatchObject({ courtesy: true, base: null, percent: null, commission: 0 });
        expect(lines.filter((l) => l.key !== 'item-i5').every((l) => !l.courtesy)).toBe(true);
        const s = summarizePerson(data, { id: 'e1', name: 'Deya', isBarber: true });
        expect(s.products).toEqual({ count: 3, revenueCents: 18000, commissionCents: 3600, percent: 20 });
        expect(s.earnedCents).toBe(17600);
    });

    it('una venta vieja que sí pagó comisión por un producto en $0 se muestra como se pagó, no como cortesía', () => {
        const data: WeekData = {
            ...DATA,
            items: [...DATA.items, { id: 'i5', sale_id: 's2', item_type: 'product', item_name_snapshot: 'Cera', quantity: 1, line_total: '0.00', employee_id: null, commission_employee_id: 'e1' }],
            commissions: [...DATA.commissions, { sale_id: 's2', sale_item_id: 'i5', employee_id: 'e1', status: 'generated', commission_amount: '36.00', basis_amount: '180.00', percentage_snapshot: '20.0000' }],
        };
        const old = buildPersonLines(data, 'e1').find((l) => l.key === 'item-i5')!;
        expect(old).toMatchObject({ courtesy: false, baseCents: 18000, percent: 20, commissionCents: 3600 });
    });

    it('si hubo varios porcentajes no inventa uno', () => {
        const data: WeekData = { ...DATA, commissions: DATA.commissions.map((c) => (c.sale_item_id === 'i2' ? { ...c, percentage_snapshot: '40.0000', commission_amount: '48.00' } : c)) };
        const s = summarizePerson(data, { id: 'e1', name: 'Deya', isBarber: true });
        expect(s.services.percent).toBeNull();
        expect(s.services.commissionCents).toBe(10800);
    });

    it('un barbero sin ventas aparece en ceros', () => {
        const people = buildWeekPeople(DATA);
        const dani = personWeekApi(people.find((p) => p.employeeId === 'e2')!);
        expect(dani).toMatchObject({ revenue: 0, earned: 0, tips: 0, services: { count: 0, percent: null } });
        expect(buildPersonLines(DATA, 'e2')).toEqual([]);
    });

    it('una propina sin servicio propio queda en un renglón de propina', () => {
        const data: WeekData = { ...DATA, tips: [{ sale_id: 's1', employee_id: 'e2', status: 'generated', amount: '30.00' }] };
        const lines = buildPersonLines(data, 'e2');
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ kind: 'tip', tipCents: 3000, folio: 'V2611-0001' });
    });
});
