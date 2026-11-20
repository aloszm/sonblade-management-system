import { describe, expect, it } from 'vitest';
import { sourceLabel } from './data';

describe('sourceLabel', () => {
    it('nombra todos los orígenes del libro del sobre, también los del equipo', () => {
        for (const s of ['cash_close', 'expense', 'expense_cancel', 'bank_deposit', 'adjustment', 'staff_payout', 'staff_payback']) {
            expect(sourceLabel(s)).not.toBe('Movimiento');
        }
    });
});
