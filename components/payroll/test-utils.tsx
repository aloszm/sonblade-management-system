import React from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export type Call = { url: string; method: string; body?: Record<string, unknown> };
export type Reply = { status?: number; body: unknown };

/** Pantalla dentro del proveedor de react-query, como en la app (sin reintentos para que los errores se vean al instante). */
export function renderWithClient(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** fetch falso: `handler` contesta por URL y método; guarda cada llamada para revisarla. */
export function stubFetch(handler: (call: Call) => Reply | undefined) {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const call: Call = { url: String(url), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined };
        calls.push(call);
        const reply = handler(call) ?? { body: {} };
        const status = reply.status ?? 200;
        return { ok: status >= 200 && status < 300, status, json: async () => reply.body };
    }));
    return calls;
}

export const ENTRY = {
    id: 'e1', employee_id: 'b1', employee_name: 'Deya', entry_type: 'advance', amount: 200, receipt_effect: -200, paid_from: 'envelope',
    reason: 'Adelanto para la renta', loan_id: null, settlement_id: null, receipt_number: null, week_start: '2026-11-15',
    effective_at: '2026-11-18T18:00:00Z', created_at: '2026-11-18T18:00:00Z', is_pending: true, label: 'Adelanto',
    is_cancelled: false, can_cancel: true, created_by_name: 'Alonso',
};

export const LEDGER = {
    employee_id: null,
    entries: [ENTRY],
    loans: [{ id: 'l1', employee_id: 'b1', principal: 1000, weekly_amount: 250, paid: 0, outstanding: 1000, status: 'active', reason: 'Para una moto', created_at: '2026-11-10T18:00:00Z' }],
    pending: { count: 1, receipt_effect: -200, advances: 200, deductions: 0, loan_payments: 0, carryover: 0 },
    can_edit: true,
};

export const ENVELOPES = { envelopes: [{ id: 'env1', name: 'Sobre', is_default: true, balance: 500, total_in: 800, total_out: 300, movements: 3, last_movement_at: null }], can_edit: true };
