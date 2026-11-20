'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getJson } from '@/lib/money/client';

export interface Envelope {
    id: string;
    name: string;
    is_default: boolean;
    balance: number;
    total_in: number;
    total_out: number;
    movements: number;
    last_movement_at: string | null;
}

export interface EnvelopeMovement {
    id?: string;
    direction: 'in' | 'out';
    amount: number;
    signed_amount: number;
    balance_after: number;
    source: string;
    reason: string | null;
    created_by_name: string | null;
    created_at: string;
    expense_id: string | null;
    cash_session_id: string | null;
}

/** Todas las consultas de sobres cuelgan de ['envelopes'] para refrescarlas juntas (también las de Gastos). */
export const envelopeKeys = {
    all: ['envelopes'] as const,
    list: ['envelopes', 'list'] as const,
    movements: (id: string, from: string, to: string) => ['envelopes', 'movements', id, from, to] as const,
};

export function useEnvelopes() {
    return useQuery({
        queryKey: envelopeKeys.list,
        queryFn: () => getJson<{ envelopes: Envelope[]; can_edit: boolean }>('/api/envelopes'),
        staleTime: 15_000,
    });
}

export function useEnvelopeMovements(id: string | null, from: string, to: string) {
    return useQuery({
        queryKey: envelopeKeys.movements(id ?? '', from, to),
        enabled: Boolean(id),
        queryFn: () => {
            const q = new URLSearchParams();
            if (from) q.set('from', from);
            if (to) q.set('to', to);
            q.set('limit', '200');
            return getJson<{ movements: EnvelopeMovement[] }>(`/api/envelopes/${id}/movements?${q.toString()}`);
        },
    });
}

export function useRefreshEnvelopes() {
    const client = useQueryClient();
    return () => client.invalidateQueries({ queryKey: envelopeKeys.all });
}

/** Concepto legible según el origen del movimiento. */
export const SOURCE_LABELS: Record<string, string> = {
    cash_close: 'Apartado del cierre de caja',
    expense: 'Gasto',
    expense_cancel: 'Devolución por gasto cancelado',
    bank_deposit: 'Depósito al banco',
    adjustment: 'Ajuste por conteo',
    staff_payout: 'Adelanto o préstamo al equipo',
    staff_payback: 'Devolución de adelanto o préstamo',
};

export function sourceLabel(source: string): string {
    return SOURCE_LABELS[source] ?? 'Movimiento';
}
