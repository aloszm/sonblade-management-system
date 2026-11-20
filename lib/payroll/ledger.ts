import { num } from '@/lib/money/api';

/**
 * Libro del empleado (B7): adelantos, préstamos, abonos, descuentos, bonos, arrastres y sueldos (20261120090000).
 * La regla vive en la base (public.record_employee_ledger_entry, cancel_employee_ledger_entry, RLS);
 * aquí solo están los nombres, etiquetas y conversiones que comparten las rutas y las pantallas.
 */
export const ENTRY_TYPES = ['advance', 'loan', 'loan_payment', 'deduction', 'bonus', 'carryover', 'reversal', 'wage'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

/** Lo que se registra a mano (bonos, sueldos, arrastres y reversas los crea la base). */
export const MANUAL_ENTRY_TYPES = ['advance', 'loan', 'loan_payment', 'deduction'] as const;
export type ManualEntryType = (typeof MANUAL_ENTRY_TYPES)[number];

export const LEDGER_PAID_FROM = ['envelope', 'cash_drawer', 'bank'] as const;
export type LedgerPaidFrom = (typeof LEDGER_PAID_FROM)[number];

export const ENTRY_LABELS: Record<EntryType, string> = {
    advance: 'Adelanto',
    loan: 'Préstamo',
    loan_payment: 'Abono a préstamo',
    deduction: 'Descuento',
    bonus: 'Bono',
    carryover: 'Saldo de la semana anterior',
    reversal: 'Cancelación',
    wage: 'Sueldo',
};

export const PAID_FROM_LABELS: Record<LedgerPaidFrom, string> = {
    envelope: 'Sobre',
    cash_drawer: 'Caja del día',
    bank: 'Banco',
};

export const BONUS_METRICS = ['services_count', 'service_revenue'] as const;
export type BonusMetric = (typeof BONUS_METRICS)[number];
export const BONUS_METRIC_LABELS: Record<BonusMetric, string> = {
    services_count: 'Servicios completados en la semana',
    service_revenue: 'Ventas de servicios en la semana (pesos)',
};

/** Regla de forma (la base la vuelve a validar): qué tipo lleva o no lleva origen del dinero. */
export function paidFromRule(type: ManualEntryType, paidFrom: LedgerPaidFrom | null | undefined): string | null {
    if ((type === 'advance' || type === 'loan') && !paidFrom) return 'Indica de dónde sale el dinero: sobre, caja del día o banco.';
    if (type === 'deduction' && paidFrom) return 'Un descuento no entrega dinero: se resta en el siguiente recibo.';
    return null;
}

type Numeric = number | string | null | undefined;
const optNum = (value: Numeric) => (value === null || value === undefined ? null : num(value));

export type LedgerRow = {
    id: string; branch_id: string; employee_id: string; employee_name: string; entry_type: EntryType; amount: Numeric;
    receipt_effect: Numeric; paid_from: LedgerPaidFrom | null; method: string | null; reason: string; loan_id: string | null;
    bonus_goal_id: string | null; reverses_entry_id: string | null; reversed_by_entry_id: string | null; settlement_id: string | null;
    receipt_number: string | null; origin_settlement_id: string | null; week_start: string; effective_at: string;
    is_pending: boolean; created_by: string; created_at: string;
};

export function mapLedgerRow(row: LedgerRow, names: Map<string, string>) {
    const cancellable = row.settlement_id === null && row.reversed_by_entry_id === null
        && (row.entry_type === 'advance' || row.entry_type === 'deduction' || row.entry_type === 'loan'
            || (row.entry_type === 'loan_payment' && row.paid_from === null && row.receipt_number === null));
    return {
        ...row,
        amount: num(row.amount),
        receipt_effect: num(row.receipt_effect),
        label: ENTRY_LABELS[row.entry_type] ?? row.entry_type,
        is_cancelled: row.reversed_by_entry_id !== null,
        can_cancel: cancellable,
        created_by_name: names.get(row.created_by) ?? null,
    };
}

export type LoanRow = {
    id: string; branch_id: string; employee_id: string; principal: Numeric; weekly_amount: Numeric; paid: Numeric; outstanding: Numeric;
    status: 'active' | 'paid' | 'cancelled'; reason: string; created_by: string; created_at: string;
};

export function mapLoanRow(row: LoanRow) {
    return { ...row, principal: num(row.principal), weekly_amount: num(row.weekly_amount), paid: num(row.paid), outstanding: num(row.outstanding) };
}

/** Convierte a número las cantidades del resultado de record/cancel (Postgres manda numeric como texto o número). */
export function mapLedgerResult(value: Record<string, unknown> | null | undefined): Record<string, unknown> & {
    amount: number | null; receipt_effect: number | null; envelope_balance: number | null; cash_available: number | null;
    loan_outstanding: number | null; replayed: boolean;
} {
    const v = value ?? {};
    return {
        ...v,
        amount: optNum(v.amount as Numeric),
        receipt_effect: optNum(v.receipt_effect as Numeric),
        envelope_balance: optNum(v.envelope_balance as Numeric),
        cash_available: optNum(v.cash_available as Numeric),
        loan_outstanding: optNum(v.loan_outstanding as Numeric),
        replayed: Boolean(v.replayed),
    };
}

/** Totales de lo pendiente (lo que se descontará o sumará en el siguiente recibo), en centavos para no perder precisión. */
export function pendingSummary(rows: { receipt_effect: number; is_pending: boolean; entry_type: EntryType }[]) {
    const pending = rows.filter((row) => row.is_pending);
    const cents = (list: typeof pending) => list.reduce((sum, row) => sum + Math.round(row.receipt_effect * 100), 0) / 100;
    return {
        count: pending.length,
        receipt_effect: cents(pending),
        advances: -cents(pending.filter((row) => row.entry_type === 'advance')),
        deductions: -cents(pending.filter((row) => row.entry_type === 'deduction')),
        loan_payments: -cents(pending.filter((row) => row.entry_type === 'loan_payment')),
        carryover: -cents(pending.filter((row) => row.entry_type === 'carryover')),
    };
}
