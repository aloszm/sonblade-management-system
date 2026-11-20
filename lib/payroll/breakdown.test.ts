import { describe, expect, it } from 'vitest';
import { buildBreakdown, progressText } from './breakdown';

const legacy = { gross_commission: 500, deductions: 50, tips: 30, total_amount: 480 };

describe('buildBreakdown', () => {
    it('sin los campos nuevos queda como antes: comisiones, ajustes y propinas; el neto es el total', () => {
        const b = buildBreakdown(legacy);
        expect(b.lines.map((l) => l.key)).toEqual(['commission', 'tips', 'adjustment']);
        expect(b.net).toBe(480);
        expect(b.paid).toBe(480);
        expect(b.pending).toBe(0);
        expect(b.negative).toBe(false);
        expect(b.bonusEnabled).toBe(false);
    });

    it('con todos los campos: bonos, adelantos, abonos, descuentos, ajustes y arrastre, en ese orden', () => {
        const b = buildBreakdown({
            gross_commission: 1000, deductions: 40, tips: 100, bonuses: 300, advances: 200, loan_payments: 150, staff_deductions: 60, carryover_in: 50,
            net_amount: 900, total_amount: 900, bonus_goals_enabled: true,
            bonus_lines: [{ name: 'Meta 25', metric: 'services_count', threshold: 25, value: 27, amount: 300 }],
            ledger_lines: [
                { entry_id: 'a', entry_type: 'advance', amount: 200, reason: 'Renta' },
                { entry_id: 'd', entry_type: 'deduction', amount: 60, reason: 'Pomada' },
                { entry_id: 'c', entry_type: 'carryover', amount: 50, reason: 'Saldo anterior' },
            ],
            loan_scheduled_lines: [{ loan_id: 'l1', amount: 150, outstanding_before: 600, outstanding_after: 450 }],
        });
        expect(b.lines.map((l) => l.key)).toEqual(['commission', 'tips', 'bonus', 'advance', 'loan', 'deduction', 'adjustment', 'carryover']);
        expect(b.lines.find((l) => l.key === 'bonus')!.details[0].text).toBe('Meta 25: 27 de 25 servicios');
        expect(b.lines.find((l) => l.key === 'advance')!.details).toEqual([{ key: 'advance-a', text: 'Renta', amount: 200 }]);
        expect(b.lines.find((l) => l.key === 'loan')!.details[0].text).toContain('queda debiendo $450.00');
        expect(b.net).toBe(900);
        expect(b.negative).toBe(false);
    });

    it('neto negativo: se paga $0 y el faltante pasa a la semana siguiente', () => {
        const b = buildBreakdown({ gross_commission: 200, tips: 0, advances: 500, net_amount: -300, total_amount: 0, carryover_out: 300 });
        expect(b.net).toBe(-300);
        expect(b.paid).toBe(0);
        expect(b.pending).toBe(300);
        expect(b.negative).toBe(true);
    });

    it('si solo llega net_amount negativo, el pendiente sale de ahí', () => {
        expect(buildBreakdown({ gross_commission: 100, advances: 250, net_amount: -150, total_amount: 0 }).pending).toBe(150);
    });

    it('sin metas activas no hay línea de bonos aunque lleguen otros campos', () => {
        const b = buildBreakdown({ ...legacy, bonuses: 0, bonus_goals_enabled: false, advances: 10, net_amount: 470 });
        expect(b.lines.some((l) => l.key === 'bonus')).toBe(false);
    });

    it('con metas activas la línea de bonos se muestra aunque nadie haya llegado a la meta', () => {
        const b = buildBreakdown({ ...legacy, bonuses: 0, bonus_goals_enabled: true, bonus_lines: [] });
        expect(b.lines.find((l) => l.key === 'bonus')!.amount).toBe(0);
    });

    it('un recibo pagado trae los bonos dentro de ledger_lines', () => {
        const b = buildBreakdown({
            ...legacy, bonuses: 300,
            ledger_lines: [{ entry_type: 'bonus', amount: 300, goal_name: 'Meta 25', details: { threshold: 25, value: 27 } }],
        });
        const bonus = b.lines.find((l) => l.key === 'bonus')!;
        expect(bonus.amount).toBe(300);
        expect(bonus.details[0].text).toBe('Meta 25: 27 de 25');
    });

    it('avisa de los préstamos cuyo abono no cupo esta semana', () => {
        const b = buildBreakdown({ ...legacy, loans_waiting: [{ loan_id: 'l1', scheduled: 250, charged: 100, outstanding: 900 }] });
        expect(b.waiting).toHaveLength(1);
        expect(b.waiting[0]).toContain('$250.00');
        expect(b.waiting[0]).toContain('$100.00');
    });

    it('el recibo con carryover_next muestra lo que queda pendiente', () => {
        const b = buildBreakdown({ gross_commission: 100, total_amount: 0, carryover_next: { amount: 80 } });
        expect(b.pending).toBe(80);
        expect(b.negative).toBe(true);
    });
});

describe('buildBreakdown con sueldo por día', () => {
    const dagoWeek = {
        enabled: true, amount: 1280, paid_days: 4, worked_days: 4, absent_days: 1, extra_days: 0,
        groups: [{ rate: 320, days: 4, amount: 1280 }],
        summary: '4 días × $320 = $1,280',
        days: [
            { date: '2026-11-16', weekday: 1, status: 'worked', rate: 320, amount: 320 },
            { date: '2026-11-17', weekday: 2, status: 'absent', rate: 320, amount: 0, exception_id: 'x1', reason: 'Enfermo' },
            { date: '2026-11-18', weekday: 3, status: 'worked', rate: 320, amount: 320 },
            { date: '2026-11-19', weekday: 4, status: 'worked', rate: 320, amount: 320 },
            { date: '2026-11-20', weekday: 5, status: 'worked', rate: 320, amount: 320 },
        ],
    };

    it('sin sueldo (wages 0, wage null) queda exactamente como antes', () => {
        const b = buildBreakdown({ ...legacy, wages: 0, wage: null });
        expect(b.lines.map((l) => l.key)).toEqual(['commission', 'tips', 'adjustment']);
        expect(b.net).toBe(480);
    });

    it('el sueldo va primero, con su texto y el detalle día por día, y suma al neto', () => {
        const b = buildBreakdown({ gross_commission: 40, total_amount: 1320, wages: 1280, wage: dagoWeek });
        expect(b.lines.map((l) => l.key)).toEqual(['wage', 'commission']);
        const wage = b.lines[0];
        expect(wage.label).toBe('Sueldo: 4 días × $320 = $1,280');
        expect(wage.amount).toBe(1280);
        expect(wage.sign).toBe(1);
        expect(wage.details.map((d) => d.text)).toEqual([
            'lun 16 nov · Trabajado', 'mar 17 nov · Faltó (Enfermo)', 'mié 18 nov · Trabajado', 'jue 19 nov · Trabajado', 'vie 20 nov · Trabajado',
        ]);
        expect(b.net).toBe(1320);
    });

    it('neto = sueldo + comisiones + bonos − adelantos − descuentos; negativo pasa a la semana siguiente', () => {
        const b = buildBreakdown({
            gross_commission: 200, tips: 50, bonuses: 100, advances: 1300, staff_deductions: 40, total_amount: 0, carryover_out: 350,
            wages: 640, wage: { amount: 640, summary: '2 días × $320 = $640', days: [] }, bonus_goals_enabled: true, bonus_lines: [],
        });
        expect(b.net).toBe(640 + 200 + 50 + 100 - 1300 - 40);
        expect(b.paid).toBe(0);
        expect(b.pending).toBe(350);
        expect(b.lines[0]).toMatchObject({ key: 'wage', label: 'Sueldo: 2 días × $320 = $640' });
    });

    it('si solo llega `wage` (sin `wages`), el monto sale del detalle', () => {
        const b = buildBreakdown({ gross_commission: 0, total_amount: 1280, wage: dagoWeek });
        expect(b.lines[0].amount).toBe(1280);
        expect(b.net).toBe(1280);
    });
});

describe('progressText', () => {
    it('servicios y pesos', () => {
        expect(progressText('services_count', 18, 25)).toBe('18 de 25 servicios');
        expect(progressText('service_revenue', 3200, 5000)).toBe('$3,200.00 de $5,000.00 en ventas de servicios');
    });
});
