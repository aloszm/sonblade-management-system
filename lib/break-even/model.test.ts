import { describe, expect, it } from 'vitest';
import {
    approxCount, heroMessage, heroTone, learningText, normalizeBreakEven, paceMessage, paceText, per100Rows, periodText, progressText,
    progressTier, projectionText, ringFraction, shiftMonth, summaryLine, unosText,
} from './model';
import { breakEvenFixture } from './fixture';

describe('redondeos', () => {
    it('"unos N" siempre hacia arriba y entero', () => {
        expect(approxCount(107.2)).toBe(108);
        expect(approxCount(108)).toBe(108);
        expect(approxCount(0.4)).toBe(1);
        expect(approxCount(0)).toBe(0);
        expect(approxCount(-3)).toBe(0);
        expect(approxCount(null)).toBe(0);
        expect(unosText(108)).toBe('unos 108 servicios');
        expect(unosText(1)).toBe('unos 1 servicio');
        expect(unosText(1234)).toBe('unos 1,234 servicios');
        expect(unosText(0)).toBe('0 servicios');
    });
    it('ritmo: entero desde 1, un decimal debajo de 1', () => {
        expect(paceText(12.6)).toBe('13');
        expect(paceText(0.64)).toBe('0.6');
        expect(paceText(0)).toBe('0');
        expect(paceText(null)).toBe('0');
    });
    it('el porcentaje nunca dice 100 % si no se ha cubierto', () => {
        expect(progressText(66.9)).toBe('66 %');
        expect(progressText(99.96)).toBe('99 %');
        expect(progressText(0.3)).toBe('menos del 1 %');
        expect(progressText(0)).toBe('0 %');
        expect(progressText(118.3, true)).toBe('118 %');
        expect(ringFraction(150)).toBe(1);
        expect(ringFraction(35)).toBeCloseTo(0.35);
        expect(ringFraction(null)).toBe(0);
    });
    it('periodicidad y meses', () => {
        expect(periodText({ base_amount: 1000, every_months: 2, amount: 500, kind: 'template' })).toBe('$1,000 cada 2 meses · $500 al mes');
        expect(periodText({ base_amount: 450, every_months: 1, amount: 450, kind: 'template' })).toBe('$450 al mes');
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
        expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    });
});

describe('mensajes por tramo de avance', () => {
    it('tramos', () => {
        expect(progressTier(breakEvenFixture({ setup: true }))).toBe('setup');
        expect(progressTier(breakEvenFixture({ margin: 1000 }))).toBe('start');
        expect(progressTier(breakEvenFixture({ margin: 6318 }))).toBe('building');
        expect(progressTier(breakEvenFixture({ margin: 14800 }))).toBe('over_half');
        expect(progressTier(breakEvenFixture({ margin: 17000 }))).toBe('almost');
        expect(progressTier(breakEvenFixture({ margin: 19900, coveredOn: '2026-11-19' }))).toBe('covered');
    });
    it('35 %: lleva cubierto y cuántos servicios faltan', () => {
        const m = heroMessage(breakEvenFixture({ margin: 6318, remainingSvc: 124 }));
        expect(m.title).toBe('Llevas cubierto el 35 % del mes');
        expect(m.detail).toBe('Te faltan unos 124 servicios para cubrirlo todo.');
        expect(m.learning).toBe(false);
    });
    it('82 %: más de la mitad', () => {
        expect(heroMessage(breakEvenFixture({ margin: 14800, remainingSvc: 35 })).title).toBe('¡Más de la mitad! Llevas el 82 % del mes cubierto');
    });
    it('mes cubierto: el día y la ganancia por encima', () => {
        const m = heroMessage(breakEvenFixture({ margin: 19900, coveredOn: '2026-11-19' }));
        expect(m.title).toBe('¡Mes cubierto el día 19!');
        expect(m.detail).toBe('Todo lo de aquí en adelante es ganancia: llevas $1,850.');
        expect(summaryLine(breakEvenFixture({ margin: 19900, coveredOn: '2026-11-19' }))).toBe('¡Mes cubierto el día 19! Llevas $1,850 de ganancia.');
    });
    it('aprendiendo el ritmo: no inventa servicios, dice lo que sí sabe', () => {
        const data = breakEvenFixture({ margin: 3249, enough: false, refDays: 6 });
        const m = heroMessage(data);
        expect(m.learning).toBe(true);
        expect(m.detail).toBe('Te faltan $14,801 de margen para cubrirlo todo.');
        expect(learningText(data)).toBe('Aún estamos aprendiendo tu ritmo: llevamos 6 días con ventas; con 8 días más te diremos cuántos servicios faltan.');
        expect(paceMessage(data)).toBeNull();
        expect(summaryLine(data)).toBe('Mes cubierto al 18 % · faltan $14,801 de margen.');
    });
    it('sin gastos fijos: invita a capturarlos', () => {
        expect(heroMessage(breakEvenFixture({ setup: true })).title).toBe('Captura tus gastos fijos para empezar');
    });
    it('mes pasado sin cubrir: cuenta lo que sí se logró, sin deuda', () => {
        const m = heroMessage(breakEvenFixture({ status: 'past', margin: 9000 }));
        expect(m.title).toBe('El mes cerró con el 49 % cubierto');
        expect(m.detail).not.toMatch(/mal|deb|falt/i);
    });
    it('nunca "vas mal" ni tono rojo; ámbar solo desde el día 25 si a este ritmo no se cubre', () => {
        for (const day of ['05', '15', '24']) {
            expect(heroTone(breakEvenFixture({ today: `2026-11-${day}`, margin: 2000 }))).toBe('accent');
        }
        expect(heroTone(breakEvenFixture({ today: '2026-11-25', margin: 2000 }))).toBe('attention');
        expect(heroTone(breakEvenFixture({ today: '2026-11-26', margin: 2000, projected: '2026-11-29' }))).toBe('accent');
        expect(heroTone(breakEvenFixture({ margin: 19900, coveredOn: '2026-11-19' }))).toBe('success');
        for (const margin of [0, 2000, 9000, 17000]) {
            const m = heroMessage(breakEvenFixture({ today: '2026-11-28', margin }));
            expect(`${m.title} ${m.detail}`).not.toMatch(/vas mal|debes|deuda/i);
        }
    });
});

describe('ritmo, proyección y reparto', () => {
    it('necesitas unos N al día; esta semana vas en M', () => {
        const p = paceMessage(breakEvenFixture({ needed: 6.2, recent: 8.4 }));
        expect(p?.text).toBe('Para cubrir el mes necesitas unos 7 servicios al día; esta semana vas en 8.');
        expect(p?.ahead).toBe(true);
        expect(paceMessage(breakEvenFixture({ needed: 10.1, recent: 8.4 }))?.ahead).toBe(false);
        expect(paceMessage(breakEvenFixture({ margin: 19900, coveredOn: '2026-11-19' }))).toBeNull();
    });
    it('día estimado solo dentro del mes', () => {
        expect(projectionText(breakEvenFixture({ projected: '2026-11-26' }))).toBe('A este ritmo, el mes queda cubierto alrededor del 26 de noviembre.');
        expect(projectionText(breakEvenFixture({ projected: null }))).toBeNull();
    });
    it('"te queda" nunca negativo; lo que falta se dice aparte', () => {
        expect(per100Rows(breakEvenFixture({ per100Left: -12.34 }))).toMatchObject({ left: 0, short: 12.3 });
        expect(per100Rows(breakEvenFixture({ per100Left: 19 }))).toMatchObject({ left: 19, short: 0 });
        expect(per100Rows(breakEvenFixture({ setup: true }))).toBeNull();
    });
    it('normaliza números que llegan como texto y datos faltantes', () => {
        const d = normalizeBreakEven({ fixed: { total: '18050.00', items: [{ key: 'x', amount: '500.00', every_months: '2' }] }, derived: { progress_pct: '35.0' } });
        expect(d.fixed.total).toBe(18050);
        expect(d.fixed.items[0]).toMatchObject({ amount: 500, every_months: 2, kind: 'template' });
        expect(d.derived.progress_pct).toBe(35);
        expect(d.derived.goal_revenue).toBeNull();
        expect(d.per_100).toBeNull();
        expect(d.buckets).toEqual([]);
    });
});
