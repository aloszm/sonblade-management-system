'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson } from '@/lib/money/client';

export type EntryType = 'advance' | 'loan' | 'loan_payment' | 'deduction' | 'bonus' | 'carryover' | 'reversal' | 'wage';
export type ManualType = 'advance' | 'loan' | 'loan_payment' | 'deduction';
export type LedgerPaidFrom = 'envelope' | 'cash_drawer' | 'bank';

export interface LedgerEntry {
    id: string;
    employee_id: string;
    employee_name: string;
    entry_type: EntryType;
    amount: number;
    receipt_effect: number;
    paid_from: LedgerPaidFrom | null;
    reason: string;
    loan_id: string | null;
    settlement_id: string | null;
    receipt_number: string | null;
    week_start: string;
    effective_at: string;
    created_at: string;
    is_pending: boolean;
    label: string;
    is_cancelled: boolean;
    can_cancel: boolean;
    created_by_name: string | null;
}

export interface Loan {
    id: string;
    employee_id: string;
    principal: number;
    weekly_amount: number;
    paid: number;
    outstanding: number;
    status: 'active' | 'paid' | 'cancelled';
    reason: string;
    created_at: string;
}

export interface PendingSummary {
    count: number;
    receipt_effect: number;
    advances: number;
    deductions: number;
    loan_payments: number;
    carryover: number;
}

export interface LedgerResponse {
    employee_id: string | null;
    entries: LedgerEntry[];
    loans: Loan[];
    pending: PendingSummary;
    can_edit: boolean;
}

export const ledgerKeys = {
    all: ['ledger'] as const,
    of: (employeeId: string | null) => ['ledger', employeeId ?? 'all'] as const,
};

export const TYPE_LABELS: Record<ManualType, string> = {
    advance: 'Adelanto',
    loan: 'Préstamo',
    loan_payment: 'Abono a préstamo',
    deduction: 'Descuento',
};

/** Una línea por tipo: qué hace y si entrega dinero. */
export const TYPE_HELP: Record<ManualType, string> = {
    advance: 'Entregas dinero hoy y se descuenta completo en el siguiente recibo.',
    loan: 'Entregas dinero hoy y se descuenta en abonos semanales.',
    loan_payment: 'Abono extra a un préstamo; no entrega dinero y se descuenta en el siguiente recibo.',
    deduction: 'No entrega dinero (producto que se llevó, daños); se descuenta en el siguiente recibo.',
};

export const GIVES_MONEY: Record<ManualType, boolean> = { advance: true, loan: true, loan_payment: false, deduction: false };

export const PAID_FROM_LABELS: Record<LedgerPaidFrom, string> = { envelope: 'Sobre', cash_drawer: 'Caja del día', bank: 'Transferencia' };

/** Libro de uno o de todo el equipo. Quien no es gerencia recibe solo lo suyo aunque pida a otra persona. */
export function useLedger(employeeId: string | null, enabled = true) {
    return useQuery({
        queryKey: ledgerKeys.of(employeeId),
        enabled,
        queryFn: () => getJson<LedgerResponse>(`/api/employee-ledger${employeeId ? `?employee_id=${employeeId}` : ''}`),
    });
}

/** Refresca el libro y los sobres (un adelanto del sobre cambia su saldo). */
export function useRefreshLedger() {
    const client = useQueryClient();
    return () => Promise.all([
        client.invalidateQueries({ queryKey: ledgerKeys.all }),
        client.invalidateQueries({ queryKey: ['envelopes'] }),
    ]);
}
