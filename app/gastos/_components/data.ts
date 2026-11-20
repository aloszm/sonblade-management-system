'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson } from '@/lib/money/client';

export type PaidFrom = 'cash_drawer' | 'envelope' | 'bank';
export type PayMethod = 'cash' | 'card' | 'transfer' | 'other';

export interface Expense {
    id: string;
    status: 'posted' | 'cancelled';
    category: string;
    category_id: string;
    description: string;
    amount: number;
    method: PayMethod;
    incurred_at: string;
    created_at: string;
    paid_from: PaidFrom;
    vendor: string | null;
    has_receipt: boolean;
    created_by_name: string | null;
    cancel_reason: string | null;
    cancelled_by_name: string | null;
    recurring_expense_id: string | null;
}

export interface ExpenseTotals {
    posted: number;
    cancelled: number;
    by_paid_from: Partial<Record<PaidFrom, number>>;
    count?: number;
}

export interface ExpenseCategory { id: string; name: string; is_active: boolean; sort_order: number }

export interface RecurringTemplate {
    id: string;
    name: string;
    category_id: string;
    suggested_amount: number;
    day_of_month: number;
    paid_from: 'envelope' | 'bank';
    method: PayMethod;
    vendor: string | null;
    is_active: boolean;
}

export interface PendingRecurring {
    id: string;
    name: string;
    category_id?: string;
    category_name: string;
    suggested_amount: number;
    due_on: string;
    is_overdue: boolean;
    paid_from: 'envelope' | 'bank';
    method: PayMethod;
    vendor?: string | null;
}

export interface ExpenseFilters {
    from: string;
    to: string;
    categoryId: string;
    paidFrom: '' | PaidFrom;
    status: 'all' | 'posted' | 'cancelled';
}

/** Todas las consultas cuelgan de estas raíces para refrescarlas juntas tras un cambio. */
export const expenseKeys = {
    list: (f: ExpenseFilters) => ['expenses', 'list', f] as const,
    categories: (all: boolean) => ['expenses', 'categories', all] as const,
    pending: (month: string) => ['expenses', 'pending', month] as const,
    templates: ['expenses', 'templates'] as const,
    root: ['expenses'] as const,
};

export function useExpenses(f: ExpenseFilters) {
    return useQuery({
        queryKey: expenseKeys.list(f),
        queryFn: () => {
            const q = new URLSearchParams({ status: f.status, limit: '500' });
            if (f.from) q.set('from', f.from);
            if (f.to) q.set('to', f.to);
            if (f.categoryId) q.set('category_id', f.categoryId);
            if (f.paidFrom) q.set('paid_from', f.paidFrom);
            return getJson<{ expenses: Expense[]; totals: ExpenseTotals; can_edit: boolean }>(`/api/expenses?${q.toString()}`);
        },
    });
}

/** `all` incluye las desactivadas (para administrarlas); el formulario de gasto usa solo las activas. */
export function useCategories(all: boolean) {
    return useQuery({
        queryKey: expenseKeys.categories(all),
        queryFn: () => getJson<{ categories: ExpenseCategory[]; can_edit: boolean }>(`/api/expense-categories${all ? '?all=1' : ''}`),
        staleTime: 60_000,
    });
}

export function usePendingRecurring(month: string) {
    return useQuery({
        queryKey: expenseKeys.pending(month),
        queryFn: () => getJson<{ pending: PendingRecurring[] }>(`/api/recurring-expenses/pending?month=${month}`),
    });
}

export function useTemplates(enabled: boolean) {
    return useQuery({
        queryKey: expenseKeys.templates,
        enabled,
        queryFn: () => getJson<{ templates: RecurringTemplate[]; can_edit: boolean }>('/api/recurring-expenses?all=1'),
    });
}

/** Refresca gastos, pendientes y también los sobres (un gasto del sobre cambia su saldo). */
export function useRefreshMoney() {
    const client = useQueryClient();
    return () => Promise.all([
        client.invalidateQueries({ queryKey: expenseKeys.root }),
        client.invalidateQueries({ queryKey: ['envelopes'] }),
    ]);
}

export const METHOD_LABELS: Record<PayMethod, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' };

/** "Sobre", "Banco · Transferencia", "Banco · Tarjeta", "Caja del día". */
export function paidFromLabel(paidFrom: PaidFrom, method?: PayMethod): string {
    if (paidFrom === 'envelope') return 'Sobre';
    if (paidFrom === 'cash_drawer') return 'Caja del día';
    return method && method !== 'cash' ? `Banco · ${METHOD_LABELS[method]}` : 'Banco';
}
