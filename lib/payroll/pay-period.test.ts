import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    PAY_PERIOD_RULES, isPayPeriodClosed, isPayPeriodStart, latestClosedPayPeriod, nextPayPeriod, payDateLabel, payPeriodAt,
    payPeriodDaysLabel, payPeriodEndOf, payPeriodForDate, payPeriodKind, payPeriodLabel, previousPayPeriod, zonedMinuteIso,
} from './pay-period';

const MX = 'America/Mexico_City'; // UTC-6 todo el año (México no cambia de horario desde 2022)
/** Instante de una hora local de México. */
const mx = (local: string) => new Date(`${local}${local.length === 16 ? ':00' : ''}-06:00`);
const span = (p: { start: string; end: string }) => `${p.start}..${p.end}`;

describe('la regla es la misma que siembra la migración', () => {
    it('PAY_PERIOD_RULES = filas de private.pay_period_rules en 20261121100000_pay_period_thu_wed.sql', () => {
        const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261121100000_pay_period_thu_wed.sql'), 'utf8');
        const seed = sql.slice(sql.indexOf('insert into private.pay_period_rules'));
        const rows = [...seed.matchAll(/\(null, date '(\d{4}-\d{2}-\d{2})', (\d), (\d+), (\d+), '/g)]
            .map((m) => ({ effectiveFrom: m[1], weekStartsOn: Number(m[2]), closesAtMinute: Number(m[3]), paydayOffsetDays: Number(m[4]) }));
        expect(rows).toEqual(PAY_PERIOD_RULES);
    });
});

describe('payPeriodAt: bordes por instante (mismos que la prueba SQL)', () => {
    it.each([
        ['2026-10-31 20:30', '2026-11-01..2026-11-07'],
        ['2026-11-14 19:59', '2026-11-08..2026-11-14'],
        ['2026-11-14 20:00', '2026-11-08..2026-11-14'], // el cierre exacto es de la semana que cierra
        ['2026-11-14 20:00:01', '2026-11-15..2026-11-18'],
        ['2026-11-18 23:59', '2026-11-15..2026-11-18'],
        ['2026-11-19 00:00', '2026-11-15..2026-11-18'], // cierre de la transición
        ['2026-11-19 00:00:01', '2026-11-19..2026-11-25'],
        ['2026-11-25 23:59', '2026-11-19..2026-11-25'],
        ['2026-11-26 00:00', '2026-11-19..2026-11-25'],
        ['2026-11-26 00:00:01', '2026-11-26..2026-12-02'],
    ])('%s → %s', (local, expected) => {
        expect(span(payPeriodAt(mx(local), MX))).toBe(expected);
    });
});

describe('payPeriodForDate', () => {
    it('antes, durante y después de la transición, con su fecha de pago', () => {
        expect(payPeriodForDate('2026-11-14', MX)).toMatchObject({ start: '2026-11-08', end: '2026-11-14', payDate: '2026-11-14', days: 7, isTransition: false });
        expect(payPeriodForDate('2026-11-15', MX)).toMatchObject({ start: '2026-11-15', end: '2026-11-18', payDate: '2026-11-21', days: 4, isTransition: true });
        expect(payPeriodForDate('2026-11-18', MX)).toMatchObject({ start: '2026-11-15', end: '2026-11-18' });
        expect(payPeriodForDate('2026-11-19', MX)).toMatchObject({ start: '2026-11-19', end: '2026-11-25', payDate: '2026-11-28', isTransition: false });
        expect(payPeriodForDate('2026-11-26', MX)).toMatchObject({ start: '2026-11-26', end: '2026-12-02', payDate: '2026-12-05' });
        expect(payPeriodForDate('2026-12-31', MX)).toMatchObject({ start: '2026-12-31', end: '2027-01-06', payDate: '2027-01-09' });
        expect(payPeriodForDate('2026-08-05', MX)).toMatchObject({ start: '2026-08-02', end: '2026-08-08', payDate: '2026-08-08' });
    });

    it('ventanas exactas en la zona del negocio', () => {
        const old = payPeriodForDate('2026-11-08', MX);
        expect([old.windowStart, old.windowEnd]).toEqual(['2026-11-08T02:00:00.000Z', '2026-11-15T02:00:00.000Z']);
        const bridge = payPeriodForDate('2026-11-15', MX);
        expect([bridge.windowStart, bridge.windowEnd]).toEqual(['2026-11-15T02:00:00.000Z', '2026-11-19T06:00:00.000Z']);
        const first = payPeriodForDate('2026-11-19', MX);
        expect([first.windowStart, first.windowEnd]).toEqual(['2026-11-19T06:00:00.000Z', '2026-11-26T06:00:00.000Z']);
    });

    it('del 2 ago 2026 al 31 dic 2027: periodos seguidos, sin huecos ni traslapes, una sola transición', () => {
        let p = payPeriodForDate('2026-08-02', MX);
        const all = [p];
        while (p.end < '2027-12-31') {
            const n = nextPayPeriod(p, MX);
            expect(n.windowStart).toBe(p.windowEnd);
            expect(previousPayPeriod(n, MX)).toEqual(p);
            all.push(n);
            p = n;
        }
        expect(all.filter((x) => x.isTransition).map(span)).toEqual(['2026-11-15..2026-11-18']);
        for (const x of all.filter((y) => y.end < '2026-11-15')) {
            expect(new Date(`${x.start}T00:00:00Z`).getUTCDay()).toBe(0);
            expect(x.payDate).toBe(x.end);
        }
        for (const x of all.filter((y) => y.start > '2026-11-15')) {
            expect(new Date(`${x.start}T00:00:00Z`).getUTCDay()).toBe(4);
            expect(new Date(`${x.payDate}T00:00:00Z`).getUTCDay()).toBe(6);
        }
        // Cada instante (cada 7 minutos del 10 al 30 nov) en un solo periodo, el de payPeriodAt.
        for (let t = mx('2026-11-10 00:00').getTime(); t <= mx('2026-11-30 00:00').getTime(); t += 7 * 60_000) {
            const inside = all.filter((x) => Date.parse(x.windowStart) < t && t <= Date.parse(x.windowEnd));
            expect(inside).toHaveLength(1);
            expect(payPeriodAt(new Date(t), MX).start).toBe(inside[0].start);
        }
    });
});

describe('cierre, último cerrado y validación', () => {
    it('se puede pagar desde el cierre (jueves 00:00), no hasta el sábado', () => {
        const first = payPeriodForDate('2026-11-19', MX);
        expect(isPayPeriodClosed(first, mx('2026-11-25 23:59'))).toBe(false);
        expect(isPayPeriodClosed(first, mx('2026-11-26 00:00'))).toBe(true);
    });

    it('último periodo cerrado', () => {
        expect(latestClosedPayPeriod(mx('2026-11-14 19:59'), MX).start).toBe('2026-11-01');
        expect(latestClosedPayPeriod(mx('2026-11-14 20:00'), MX).start).toBe('2026-11-08');
        expect(latestClosedPayPeriod(mx('2026-11-18 23:00'), MX).start).toBe('2026-11-08');
        expect(latestClosedPayPeriod(mx('2026-11-19 00:00'), MX).start).toBe('2026-11-15');
        expect(latestClosedPayPeriod(mx('2026-11-21 10:00'), MX).start).toBe('2026-11-15');
        expect(latestClosedPayPeriod(mx('2026-11-26 00:00:01'), MX).start).toBe('2026-11-19');
    });

    it('solo acepta inicios de periodo', () => {
        expect(isPayPeriodStart('2026-11-08')).toBe(true);
        expect(isPayPeriodStart('2026-11-15')).toBe(true);
        expect(isPayPeriodStart('2026-11-19')).toBe(true);
        expect(isPayPeriodStart('2026-11-22')).toBe(false); // domingo con la regla nueva: lo que pedía la app anterior
        expect(isPayPeriodStart('2026-11-09')).toBe(false);
        expect(isPayPeriodStart('no-es-fecha')).toBe(false);
        expect(payPeriodEndOf('2026-11-15')).toBe('2026-11-18');
        expect(payPeriodEndOf('2026-11-19')).toBe('2026-11-25');
        expect(payPeriodEndOf('2026-11-22')).toBeNull();
    });

    it('zonedMinuteIso: 8:00 p. m. y fin del día', () => {
        expect(zonedMinuteIso('2026-11-14', 1200, MX)).toBe('2026-11-15T02:00:00.000Z');
        expect(zonedMinuteIso('2026-11-25', 1440, MX)).toBe('2026-11-26T06:00:00.000Z');
    });
});

describe('textos', () => {
    it('rótulos en español', () => {
        expect(payPeriodLabel('2026-11-19', '2026-11-25')).toBe('19 al 25 de noviembre de 2026');
        expect(payPeriodLabel('2026-11-26', '2026-12-02')).toBe('26 de noviembre al 2 de diciembre de 2026');
        expect(payPeriodLabel('2026-12-31', '2027-01-06')).toBe('31 de diciembre de 2026 al 6 de enero de 2027');
        expect(payPeriodDaysLabel('2026-11-19', '2026-11-25')).toBe('jueves 19 al miércoles 25 de noviembre');
        expect(payPeriodDaysLabel('2026-11-26', '2026-12-02')).toBe('jueves 26 de noviembre al miércoles 2 de diciembre');
        expect(payDateLabel('2026-11-28')).toBe('sábado 28 de noviembre');
        expect(payPeriodKind(payPeriodForDate('2026-11-16', MX))).toBe('Periodo de transición');
        expect(payPeriodKind(payPeriodForDate('2026-11-20', MX))).toBe('Semana');
    });
});
