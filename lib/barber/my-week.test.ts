import { describe, expect, it } from 'vitest';
import {
    buildClients, buildEarnings, buildMyWeek, buildPayout, buildServices, buildTips, buildToday, currentWeekStart, periodWindow,
    toCents, weekdayOf, zonedInstantIso, type AppointmentInput, type ReportInput, type TipInput,
} from './my-week';

const TZ = 'America/Mexico_City';
// Lunes 16 de noviembre de 2026, 12:00 p. m. en la Ciudad de México (UTC-6): cae en el periodo de transición (15–18 nov).
const MONDAY_NOON = new Date('2026-11-16T18:00:00Z');
// Lunes 9 de noviembre de 2026, 12:00 p. m.: regla vieja (domingo a sábado, corte sábado 8 pm).
const OLD_MONDAY_NOON = new Date('2026-11-09T18:00:00Z');
// Viernes 20 de noviembre de 2026, 12:00 p. m.: regla nueva (jueves 19 a miércoles 25, se paga el sábado 28).
const FRIDAY_NOON = new Date('2026-11-20T18:00:00Z');

const empty: ReportInput = { barber: null, sales: [] };
const report = (over: Partial<NonNullable<ReportInput['barber']>> = {}, sales: ReportInput['sales'] = []): ReportInput => ({
    barber: {
        cuts: 0, service_revenue: 0, product_revenue: 0, service_commission: 0, product_commission: 0, service_breakdown: [], ...over,
    },
    sales,
});

describe('periodos en la hora de la barbería', () => {
    it('convierte una hora local a instante sin depender de la zona del servidor', () => {
        expect(zonedInstantIso('2026-11-14', 20, TZ)).toBe('2026-11-15T02:00:00.000Z');
        expect(zonedInstantIso('2026-11-16', 0, TZ)).toBe('2026-11-16T06:00:00.000Z');
    });

    it('antes de la transición la semana es domingo a sábado con corte el sábado a las 8:00 pm', () => {
        const w = periodWindow('week', OLD_MONDAY_NOON, TZ);
        expect(w.weekStart).toBe('2026-11-08');
        expect(w.startDay).toBe('2026-11-08');
        expect(w.endDay).toBe('2026-11-14');
        expect(w.start).toBe('2026-11-08T02:00:00.000Z'); // sábado 7, 8:00 pm
        expect(w.end).toBe('2026-11-15T02:00:00.000Z'); // sábado 14, 8:00 pm
        expect(w.payDate).toBe('2026-11-14');
        expect(w.isTransition).toBe(false);
        expect(w.previous).toEqual({ start: '2026-11-01T02:00:00.000Z', end: '2026-11-08T02:00:00.000Z' });
    });

    it('del 15 al 18 nov: periodo de transición (sáb 14, 8 pm a jue 19, 00:00), se paga el sábado 21', () => {
        const w = periodWindow('week', MONDAY_NOON, TZ);
        expect([w.startDay, w.endDay, w.payDate, w.isTransition]).toEqual(['2026-11-15', '2026-11-18', '2026-11-21', true]);
        expect(w.start).toBe('2026-11-15T02:00:00.000Z');
        expect(w.end).toBe('2026-11-19T06:00:00.000Z');
        expect(w.previous).toEqual({ start: '2026-11-08T02:00:00.000Z', end: '2026-11-15T02:00:00.000Z' });
    });

    it('desde el 19 nov la semana es de jueves a miércoles, cierra al terminar el miércoles y se paga el sábado', () => {
        const w = periodWindow('week', FRIDAY_NOON, TZ);
        expect([w.startDay, w.endDay, w.payDate, w.isTransition]).toEqual(['2026-11-19', '2026-11-25', '2026-11-28', false]);
        expect(w.start).toBe('2026-11-19T06:00:00.000Z'); // jueves 19, 00:00
        expect(w.end).toBe('2026-11-26T06:00:00.000Z'); // jueves 26, 00:00 (al terminar el miércoles 25)
        expect(w.previous).toEqual({ start: '2026-11-15T02:00:00.000Z', end: '2026-11-19T06:00:00.000Z' }); // la transición
    });

    it('la semana pasada es la anterior y la comparación es la de antes', () => {
        const w = periodWindow('last_week', MONDAY_NOON, TZ);
        expect(w.weekStart).toBe('2026-11-08');
        expect(w.end).toBe('2026-11-15T02:00:00.000Z');
        expect(w.previous.end).toBe('2026-11-08T02:00:00.000Z');
        const after = periodWindow('last_week', FRIDAY_NOON, TZ);
        expect([after.startDay, after.endDay, after.isTransition]).toEqual(['2026-11-15', '2026-11-18', true]);
    });

    it('bordes: sábado 14 a las 8:00 pm y fin del miércoles', () => {
        expect(currentWeekStart(new Date('2026-11-15T01:59:00Z'), TZ)).toBe('2026-11-08'); // sábado 14, 7:59 pm
        expect(currentWeekStart(new Date('2026-11-15T02:00:01Z'), TZ)).toBe('2026-11-15'); // sábado 14, 8:00:01 pm
        expect(currentWeekStart(new Date('2026-11-19T05:59:00Z'), TZ)).toBe('2026-11-15'); // miércoles 18, 11:59 pm
        expect(currentWeekStart(new Date('2026-11-19T06:00:01Z'), TZ)).toBe('2026-11-19'); // jueves 19, 00:00:01
        expect(currentWeekStart(new Date('2026-11-26T05:59:00Z'), TZ)).toBe('2026-11-19'); // miércoles 25, 11:59 pm
        expect(currentWeekStart(new Date('2026-11-26T06:00:01Z'), TZ)).toBe('2026-11-26'); // jueves 26, 00:00:01
    });

    it('el sábado y el domingo ya no abren semana nueva', () => {
        expect(currentWeekStart(new Date('2026-11-22T02:00:01Z'), TZ)).toBe('2026-11-19'); // sábado 21, 8:00:01 pm
        expect(currentWeekStart(new Date('2026-11-22T16:00:00Z'), TZ)).toBe('2026-11-19'); // domingo 22
    });

    it('el mes va del día 1 al último y se compara con el mes anterior', () => {
        const w = periodWindow('month', MONDAY_NOON, TZ);
        expect(w.startDay).toBe('2026-11-01');
        expect(w.endDay).toBe('2026-11-30');
        expect(w.start).toBe('2026-11-01T06:00:00.000Z');
        expect(w.end).toBe('2026-12-01T06:00:00.000Z');
        expect(w.previous).toEqual({ start: '2026-10-01T06:00:00.000Z', end: '2026-11-01T06:00:00.000Z' });
        expect(w.weekStart).toBeNull();
    });

    it('el día de un instante se toma en la hora del negocio, no en UTC', () => {
        // Sábado 14 a las 9:00 pm local = domingo 15 en UTC: es sábado en la barbería.
        expect(weekdayOf('2026-11-15T03:00:00Z', TZ)).toBe(6);
        // En el periodo de transición (empieza el domingo 15) eso cae antes de su primer día: cuenta en el domingo.
        expect(weekdayOf('2026-11-15T03:00:00Z', TZ, '2026-11-15')).toBe(0);
        // El cierre exacto (jueves 26, 00:00) cuenta en el último día (miércoles) del periodo 19–25.
        expect(weekdayOf('2026-11-26T06:00:00Z', TZ, '2026-11-19', '2026-11-25')).toBe(3);
    });
});

describe('lo ganado', () => {
    const window = periodWindow('week', MONDAY_NOON, TZ);
    const sale = (id: string, at: string, commission: number, items: ('service' | 'product')[] = ['service']) => ({
        id, created_at: at, amount: 0, commission, items: items.map((t) => ({ item_name: t === 'service' ? 'Corte adulto' : 'Pomada Negra Baregk (150 ml)', item_type: t })),
    });

    it('suma comisiones de servicios, de productos y propinas en centavos', () => {
        const current = report({ service_commission: 150.1, product_commission: 36 }, [
            sale('a', '2026-11-16T17:00:00Z', 75), sale('b', '2026-11-17T20:00:00Z', 75.1), sale('c', '2026-11-17T21:00:00Z', 36, ['product']),
        ]);
        const tips: TipInput[] = [{ sale_id: 'a', amount: 20, created_at: '2026-11-16T17:05:00Z', settlement_id: null }, { sale_id: 'b', amount: '10.50', created_at: '2026-11-17T20:05:00Z', settlement_id: null }];
        const e = buildEarnings(window, current, empty, tips, []);
        expect(e.serviceCents).toBe(15010);
        expect(e.productCents).toBe(3600);
        expect(e.tipsCents).toBe(3050);
        expect(e.totalCents).toBe(21660);
        // Sin semana anterior no hay porcentaje (no se divide entre cero).
        expect(e.previousTotalCents).toBe(0);
        expect(e.deltaPct).toBeNull();
        expect(e.deltaCents).toBe(21660);
    });

    it('reparte por día de la semana y encuentra el mejor día', () => {
        const current = report({}, [
            sale('a', '2026-11-16T17:00:00Z', 75), // lunes
            sale('b', '2026-11-17T17:00:00Z', 75), // martes
            sale('c', '2026-11-17T19:00:00Z', 60), // martes
        ]);
        const tips: TipInput[] = [{ sale_id: 'c', amount: 30, created_at: '2026-11-17T19:05:00Z', settlement_id: null }];
        const e = buildEarnings(window, current, empty, tips, []);
        // Periodo de transición: 4 barras, del domingo 15 al miércoles 18.
        expect(e.byWeekday.map((d) => d.dow)).toEqual([0, 1, 2, 3]);
        expect(e.byWeekday[1]).toMatchObject({ dow: 1, services: 1, commissionCents: 7500, totalCents: 7500 });
        expect(e.byWeekday[2]).toMatchObject({ dow: 2, services: 2, commissionCents: 13500, tipsCents: 3000, totalCents: 16500 });
        expect(e.bestDay).toEqual({ dow: 2, services: 2, totalCents: 16500 });
    });

    it('semana de jueves a miércoles: las barras empiezan en jueves', () => {
        const week = periodWindow('week', FRIDAY_NOON, TZ);
        const current = report({}, [sale('a', '2026-11-19T17:00:00Z', 75), sale('b', '2026-11-24T17:00:00Z', 50)]); // jueves y martes
        const e = buildEarnings(week, current, empty, [], []);
        expect(e.byWeekday.map((d) => d.dow)).toEqual([4, 5, 6, 0, 1, 2, 3]);
        expect(e.byWeekday[0]).toMatchObject({ dow: 4, commissionCents: 7500 });
        expect(e.byWeekday[5]).toMatchObject({ dow: 2, commissionCents: 5000 });
        const month = buildEarnings(periodWindow('month', FRIDAY_NOON, TZ), current, empty, [], []);
        expect(month.byWeekday.map((d) => d.dow)).toEqual([0, 1, 2, 3, 4, 5, 6]); // el mes sigue de domingo a sábado
    });

    it('compara contra la semana anterior', () => {
        const e = buildEarnings(window, report({ service_commission: 300 }), report({ service_commission: 200 }), [], []);
        expect(e.deltaCents).toBe(10000);
        expect(e.deltaPct).toBe(50);
        const down = buildEarnings(window, report({ service_commission: 100 }), report({ service_commission: 200 }), [], []);
        expect(down.deltaPct).toBe(-50);
    });

    it('una semana sin nada queda en ceros y sin mejor día', () => {
        const e = buildEarnings(window, empty, empty, [], []);
        expect(e.totalCents).toBe(0);
        expect(e.bestDay).toBeNull();
        expect(e.byWeekday.every((d) => d.totalCents === 0)).toBe(true);
    });

    it('un monto inválido cuenta como cero, no como NaN', () => {
        expect(toCents('abc')).toBe(0);
        expect(toCents(undefined)).toBe(0);
        expect(toCents('12.345')).toBe(1235);
    });
});

describe('recibo de pago', () => {
    const window = periodWindow('last_week', MONDAY_NOON, TZ);
    const settlement = { id: 's1', receipt_number: 'R-0007', period_start: '2026-11-08', period_end: '2026-11-14', total_amount: '1240.50', paid_at: '2026-11-14T02:30:00Z', status: 'paid' };

    it('si la semana ya tiene recibo, dice cuánto se pagó', () => {
        const p = buildPayout(window, [settlement], MONDAY_NOON);
        expect(p.status).toBe('paid');
        expect(p.paidCents).toBe(124050);
        expect(p.receipts[0].number).toBe('R-0007');
    });

    it('semana cerrada sin recibo: pendiente de pago', () => {
        expect(buildPayout(window, [], MONDAY_NOON).status).toBe('closed');
    });

    it('semana en curso sin recibo: abierta; recibos de otras semanas no cuentan', () => {
        const current = periodWindow('week', MONDAY_NOON, TZ);
        const p = buildPayout(current, [settlement], MONDAY_NOON);
        expect(p.status).toBe('open');
        expect(p.paidCents).toBe(0);
    });

    it('el mes suma todos los recibos pagados que caen en él', () => {
        const month = periodWindow('month', MONDAY_NOON, TZ);
        const second = { ...settlement, id: 's2', receipt_number: 'R-0006', period_start: '2026-11-01', total_amount: 500 };
        const draft = { ...settlement, id: 's3', period_start: '2026-11-08', status: 'draft' };
        const p = buildPayout(month, [settlement, second, draft], MONDAY_NOON);
        expect(p.paidCents).toBe(174050);
        expect(p.receipts).toHaveLength(2);
    });
});

describe('servicios y propinas', () => {
    it('top 5, ticket promedio y productos vendidos', () => {
        const current = report({
            cuts: 10, service_revenue: 1700, product_revenue: 180,
            service_breakdown: [
                { name: 'Barba', count: 1, revenue: 100 }, { name: 'Corte adulto', count: 5, revenue: 750 }, { name: 'Corte y barba', count: 2, revenue: 540 },
                { name: 'Bigote', count: 1, revenue: 40 }, { name: 'Corte niño', count: 3, revenue: 360 }, { name: 'Afeitado completo', count: 1, revenue: 120 },
            ],
        }, [{ id: 'p1', created_at: '2026-11-16T20:00:00Z', amount: 180, items: [{ item_name: 'Pomada Roja Baregk (150 ml)', item_type: 'product' }] }]);
        const s = buildServices(current, report({ cuts: 8 }), { week: 10, lastWeek: 8, month: 31 });
        expect(s.count).toBe(10);
        expect(s.previousCount).toBe(8);
        expect(s.avgTicketCents).toBe(17000);
        expect(s.top.map((t) => t.name)).toEqual(['Corte adulto', 'Corte niño', 'Corte y barba', 'Afeitado completo', 'Barba']);
        expect(s.products.revenueCents).toBe(18000);
        expect(s.products.items).toEqual([{ name: 'Pomada Roja Baregk (150 ml)', count: 1 }]);
        expect(s.monthCount).toBe(31);
        expect(s.lastWeekCount).toBe(8);
    });

    it('sin servicios el ticket promedio es cero', () => {
        const s = buildServices(empty, empty, { week: 0, lastWeek: 0, month: 0 });
        expect(s.avgTicketCents).toBe(0);
        expect(s.top).toEqual([]);
    });

    it('propinas: total, promedio y cuántos servicios dejaron propina', () => {
        const tips: TipInput[] = [
            { sale_id: 'a', amount: 20, created_at: '', settlement_id: null }, { sale_id: 'a', amount: 10, created_at: '', settlement_id: null }, { sale_id: 'b', amount: 50, created_at: '', settlement_id: null },
        ];
        const t = buildTips(tips, [{ sale_id: 'z', amount: 40, created_at: '', settlement_id: null }], 8);
        expect(t).toMatchObject({ totalCents: 8000, count: 3, avgCents: 2667, salesWithTip: 2, services: 8, previousTotalCents: 4000 });
        expect(buildTips([], [], 0).avgCents).toBe(0);
    });
});

describe('clientes', () => {
    const window = periodWindow('week', FRIDAY_NOON, TZ); // jueves 19 a miércoles 25
    const visit = (id: string, clientId: string | null, name: string, at: string, notes: string | null = 'Corte adulto', status: AppointmentInput['status'] = 'completed'): AppointmentInput => ({
        id, client_id: clientId, customer_name: name, scheduled_start_at: at, scheduled_end_at: null, status, notes, clients: clientId ? { full_name: name } : null,
    });

    it('cuenta visitas, clientes distintos y quienes repiten (también contra visitas anteriores)', () => {
        const rows = [
            visit('1', 'c1', 'Marco', '2026-11-19T17:00:00Z'),
            visit('2', 'c2', 'Luis', '2026-11-20T17:00:00Z'),
            visit('3', 'c2', 'Luis', '2026-11-21T17:00:00Z'),
            visit('4', 'c3', 'Iván', '2026-11-21T19:00:00Z'),
            visit('5', null, 'Cliente sin cita', '2026-11-22T19:00:00Z'),
            visit('6', 'c1', 'Marco', '2026-10-20T17:00:00Z'), // venida anterior, fuera del periodo
            visit('7', 'c4', 'Pablo', '2026-11-19T19:00:00Z', 'Barba', 'cancelled'),
        ];
        const c = buildClients(rows, window);
        expect(c.visits).toBe(5);
        expect(c.unique).toBe(3);
        expect(c.unregistered).toBe(1);
        expect(c.repeat).toBe(2); // Marco (ya venía) y Luis (dos veces)
        expect(c.recent[0]).toMatchObject({ name: 'Cliente sin cita', service: 'Corte adulto' });
        expect(c.recent).toHaveLength(5);
    });

    it('sin visitas todo es cero', () => {
        expect(buildClients([], window)).toEqual({ visits: 0, unique: 0, unregistered: 0, repeat: 0, recent: [] });
    });
});

describe('hoy', () => {
    const appt = (id: string, start: string, end: string | null, status: AppointmentInput['status'], name = 'Marco'): AppointmentInput => ({
        id, client_id: null, customer_name: name, scheduled_start_at: start, scheduled_end_at: end, status, notes: 'Corte adulto',
    });

    it('ordena por hora, cuenta atendidas y destaca la próxima con los minutos que faltan', () => {
        const rows = [
            appt('c', '2026-11-16T21:00:00Z', '2026-11-16T21:30:00Z', 'scheduled', 'Pablo'),
            appt('a', '2026-11-16T16:00:00Z', '2026-11-16T16:30:00Z', 'completed', 'Marco'),
            appt('b', '2026-11-16T18:30:00Z', '2026-11-16T19:00:00Z', 'confirmed', 'Luis'),
            appt('d', '2026-11-16T20:00:00Z', '2026-11-16T20:30:00Z', 'cancelled', 'Iván'),
        ];
        const t = buildToday(rows, MONDAY_NOON);
        expect(t.appointments.map((a) => a.id)).toEqual(['a', 'b', 'd', 'c']);
        expect(t.attended).toBe(1);
        expect(t.pending).toBe(2);
        expect(t.next?.id).toBe('b');
        expect(t.minutesToNext).toBe(30);
    });

    it('una cita en servicio es la actual aunque ya haya empezado', () => {
        const t = buildToday([appt('a', '2026-11-16T17:45:00Z', '2026-11-16T18:15:00Z', 'in_progress')], MONDAY_NOON);
        expect(t.next?.id).toBe('a');
        expect(t.minutesToNext).toBe(-15);
    });

    it('sin citas pendientes no hay próxima', () => {
        const t = buildToday([appt('a', '2026-11-16T16:00:00Z', '2026-11-16T16:30:00Z', 'completed')], MONDAY_NOON);
        expect(t.next).toBeNull();
        expect(t.minutesToNext).toBeNull();
        expect(buildToday([], MONDAY_NOON).attended).toBe(0);
    });
});

describe('buildMyWeek', () => {
    it('arma todas las secciones sin datos sin romperse', () => {
        const window = periodWindow('week', MONDAY_NOON, TZ);
        const out = buildMyWeek({
            window, now: MONDAY_NOON, serviceRatePct: 50, current: empty, previous: empty, counts: { week: 0, lastWeek: 0, month: 0 },
            tips: [], previousTips: [], settlements: [], recentSettlements: [], clientRows: [], todayRows: [],
        });
        expect(out.earnings.totalCents).toBe(0);
        expect(out.services.count).toBe(0);
        expect(out.payout.status).toBe('open');
        expect(out.receipts).toEqual([]);
    });
});
