import { describe, expect, it } from 'vitest';
import { rowBalanced, totals, type ReconciliationRow } from './reconciliation';

const row = (over: Partial<ReconciliationRow> = {}): ReconciliationRow => ({
    day: '2026-11-15', employee_id: 'e1', name: 'Deya', agenda_services: 3, agenda_walk_in: 1, charged_services: 3,
    charged_units: 3, charged_amount: 600, commission: 300, commission_in_receipt: 0, issues: 0, ...over,
});

describe('cuadre', () => {
    it('cuadra cuando agenda y cobros cuentan lo mismo y no hay pendientes', () => {
        expect(rowBalanced(row())).toBe(true);
        expect(rowBalanced(row({ charged_services: 2 }))).toBe(false);
        expect(rowBalanced(row({ issues: 1 }))).toBe(false);
    });

    it('suma los renglones (la base manda números como texto a veces)', () => {
        const t = totals([row(), row({ charged_amount: '150.50' as unknown as number, commission_in_receipt: 75 })]);
        expect(t).toEqual({ agenda: 6, charged: 6, amount: 750.5, commission: 600, inReceipt: 75 });
    });
});
