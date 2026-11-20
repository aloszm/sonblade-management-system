// Desglose del pago semanal (vista previa y recibo): cálculo puro, sin red ni reloj.
//
// neto = comisiones − ajustes por anulaciones + propinas + bonos − adelantos − abonos de préstamo − descuentos − arrastre.
// Si el neto es negativo, el recibo se paga en $0 y el faltante pasa a la semana siguiente.
// Todos los campos nuevos son OPCIONALES: si no llegan (servidor anterior), el desglose queda como antes
// (comisiones, ajustes y propinas) y el neto es `total_amount`.

import { formatMoney } from '@/lib/utils/money';

type Num = number | string | null | undefined;

export interface LedgerLineIn {
    entry_id?: string;
    entry_type: string;
    amount: Num;
    receipt_effect?: Num;
    reason?: string | null;
    created_at?: string;
    paid_from?: string | null;
    loan_id?: string | null;
    goal_name?: string | null;
    details?: { threshold?: Num; value?: Num; metric?: string } | null;
}
export interface BonusLineIn { goal_id?: string; name: string; metric?: string; threshold?: Num; value?: Num; amount: Num }
export interface LoanScheduledIn { loan_id: string; amount: Num; outstanding_before?: Num; outstanding_after?: Num }
export interface LoanWaitingIn { loan_id: string; scheduled: Num; charged: Num; outstanding: Num }
export interface AdjustmentLineIn { reason: string; amount: Num }

export interface PayInput {
    gross_commission: Num;
    deductions?: Num;
    tips?: Num;
    tips_total?: Num;
    total_amount: Num;
    bonuses?: Num;
    advances?: Num;
    loan_payments?: Num;
    staff_deductions?: Num;
    carryover_in?: Num;
    carryover_out?: Num;
    net_amount?: Num;
    ledger_lines?: LedgerLineIn[] | null;
    bonus_lines?: BonusLineIn[] | null;
    bonus_goals_enabled?: boolean | null;
    loan_scheduled_lines?: LoanScheduledIn[] | null;
    loans_waiting?: LoanWaitingIn[] | null;
    adjustment_lines?: AdjustmentLineIn[] | null;
    carryover_next?: { amount: Num; week_start?: string; reason?: string | null } | null;
}

export type LineKey = 'commission' | 'tips' | 'bonus' | 'advance' | 'loan' | 'deduction' | 'adjustment' | 'carryover';

export interface BreakdownDetail { key: string; text: string; amount?: number }
export interface BreakdownLine {
    key: LineKey;
    label: string;
    /** +1 suma, −1 resta. */
    sign: 1 | -1;
    amount: number;
    details: BreakdownDetail[];
}
export interface Breakdown {
    lines: BreakdownLine[];
    /** Neto de la semana; puede ser negativo. */
    net: number;
    /** Lo que se paga de verdad (nunca menos de $0). */
    paid: number;
    /** Lo que pasa a la semana siguiente. */
    pending: number;
    negative: boolean;
    bonusEnabled: boolean;
    waiting: string[];
}

const n = (value: Num): number => {
    const x = Number(value ?? 0);
    return Number.isFinite(x) ? x : 0;
};
const money = (value: number) => formatMoney(value, { cents: true });
const round = (value: number) => Math.round(value * 100) / 100;

export const METRIC_UNIT: Record<string, string> = { services_count: 'servicios', service_revenue: 'en ventas de servicios' };

/** "Llevas 27 de 25 servicios" / "$4,200.00 de $5,000.00 en ventas de servicios". */
export function progressText(metric: string | undefined, value: number, threshold: number): string {
    if (metric === 'service_revenue') return `${money(value)} de ${money(threshold)} en ventas de servicios`;
    if (metric === undefined) return `${value} de ${threshold}`;
    return `${value} de ${threshold} servicios`;
}

function ledgerDetails(lines: LedgerLineIn[], type: string): BreakdownDetail[] {
    return lines.filter((l) => l.entry_type === type).map((l, i) => ({
        key: `${type}-${l.entry_id ?? i}`,
        text: (l.reason ?? '').trim() || '—',
        amount: n(l.amount),
    }));
}

export function buildBreakdown(input: PayInput): Breakdown {
    const ledger = input.ledger_lines ?? [];
    const gross = n(input.gross_commission);
    const adjustments = n(input.deductions);
    const tips = n(input.tips ?? input.tips_total);
    const bonuses = n(input.bonuses);
    const advances = n(input.advances);
    const loanPayments = n(input.loan_payments);
    const staffDeductions = n(input.staff_deductions);
    const carryIn = n(input.carryover_in);
    // El recibo ya pagado trae los bonos dentro de ledger_lines (entry_type 'bonus'); la vista previa trae bonus_lines.
    const bonusEntries = ledger.filter((l) => l.entry_type === 'bonus');
    const bonusLines: BonusLineIn[] = input.bonus_lines ?? bonusEntries.map((l) => ({
        goal_id: l.entry_id, name: l.goal_name ?? 'Meta', metric: l.details?.metric, threshold: l.details?.threshold, value: l.details?.value, amount: l.amount,
    }));
    const bonusEnabled = Boolean(input.bonus_goals_enabled ?? (bonusLines.length > 0 || bonuses > 0));

    const sum = round(gross - adjustments + tips + bonuses - advances - loanPayments - staffDeductions - carryIn);
    const total = n(input.total_amount);
    const net = input.net_amount !== undefined && input.net_amount !== null ? n(input.net_amount) : sum;
    const paid = Math.max(total, 0);
    const explicitOut = input.carryover_out !== undefined && input.carryover_out !== null ? n(input.carryover_out) : null;
    const pending = round(Math.max(explicitOut ?? (net < 0 ? -net : 0), Math.abs(n(input.carryover_next?.amount))));

    const lines: BreakdownLine[] = [{ key: 'commission', label: 'Comisiones', sign: 1, amount: gross, details: [] }];
    if (tips > 0) lines.push({ key: 'tips', label: 'Propinas', sign: 1, amount: tips, details: [] });
    // Sin metas activas no se muestra nada de bonos (ni la fila en $0).
    if (bonusEnabled) {
        const lineDetails = bonusLines.map((b, i) => ({
            key: `bonus-${b.goal_id ?? i}`,
            text: `${b.name}: ${progressText(b.metric, n(b.value), n(b.threshold))}`,
            amount: n(b.amount),
        }));
        lines.push({ key: 'bonus', label: 'Bonos por metas', sign: 1, amount: bonuses, details: lineDetails });
    }
    if (advances > 0) lines.push({ key: 'advance', label: 'Adelantos', sign: -1, amount: advances, details: ledgerDetails(ledger, 'advance') });
    if (loanPayments > 0) {
        const scheduled = (input.loan_scheduled_lines ?? []).map((s, i) => ({
            key: `sched-${s.loan_id}-${i}`,
            text: s.outstanding_after !== undefined && s.outstanding_after !== null
                ? `Abono semanal del préstamo (queda debiendo ${money(n(s.outstanding_after))})`
                : 'Abono semanal del préstamo',
            amount: n(s.amount),
        }));
        lines.push({ key: 'loan', label: 'Abono a préstamo', sign: -1, amount: loanPayments, details: [...scheduled, ...ledgerDetails(ledger, 'loan_payment')] });
    }
    if (staffDeductions > 0) lines.push({ key: 'deduction', label: 'Descuentos', sign: -1, amount: staffDeductions, details: ledgerDetails(ledger, 'deduction') });
    if (adjustments > 0) {
        const adj = (input.adjustment_lines ?? []).map((a, i) => ({ key: `adj-${i}`, text: a.reason, amount: n(a.amount) }));
        lines.push({ key: 'adjustment', label: 'Ajustes por anulaciones', sign: -1, amount: adjustments, details: adj });
    }
    if (carryIn > 0) lines.push({ key: 'carryover', label: 'Viene de la semana anterior', sign: -1, amount: carryIn, details: ledgerDetails(ledger, 'carryover') });

    const waiting = (input.loans_waiting ?? []).map((w) =>
        `El abono semanal de un préstamo no cupo completo: tocaba ${money(n(w.scheduled))} y esta semana se descuentan ${money(n(w.charged))}. Su saldo es ${money(n(w.outstanding))}.`);

    return { lines, net, paid, pending, negative: net < 0 || pending > 0, bonusEnabled, waiting };
}
