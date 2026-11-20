/**
 * Reglas de gastos (B6) que la pantalla y la API comparten. La base las vuelve a aplicar
 * (public.record_expense, cancel_expense, bucket expense-receipts); aquí están para avisar antes de enviar.
 */
export const PAID_FROM = ['cash_drawer', 'envelope', 'bank'] as const;
export type PaidFrom = (typeof PAID_FROM)[number];

export const PAID_FROM_LABELS: Record<PaidFrom, string> = {
    cash_drawer: 'Caja del día',
    envelope: 'Sobre (efectivo apartado)',
    bank: 'Banco (transferencia o tarjeta)',
};

/** Medios aceptados en un gasto de banco (enum payment_method sin 'cash'). */
export const BANK_METHODS = ['transfer', 'card', 'other'] as const;

/** Un gasto se puede fechar hasta 31 días atrás (nunca en el futuro); el de caja solo hoy. */
export const EXPENSE_MAX_DAYS_BACK = 31;

export const EXPENSE_STATUSES = ['posted', 'cancelled'] as const;

/** Comprobantes: mismo límite y tipos que el bucket privado expense-receipts. */
export const RECEIPTS_BUCKET = 'expense-receipts';
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_TYPES: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
};

/** Día 'YYYY-MM-DD' de hace n días a partir de otro día 'YYYY-MM-DD' (calendario, sin zona). */
export function daysBefore(day: string, n: number): string {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
}

/** null si la fecha sirve; si no, el mensaje (mismo texto que la base). */
export function incurredOnProblem(day: string, today: string, paidFrom: PaidFrom): string | null {
    if (day > today) return 'La fecha del gasto no puede ser futura.';
    if (day < daysBefore(today, EXPENSE_MAX_DAYS_BACK)) return `Solo se registran gastos de hasta ${EXPENSE_MAX_DAYS_BACK} días atrás.`;
    if (paidFrom === 'cash_drawer' && day !== today) return 'Un gasto pagado con la caja del día lleva la fecha de hoy.';
    return null;
}
