import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CashRegister from './CashRegister';
import { buildCashFlow, type CashFlowPayload } from '@/lib/cash/cash-flow';
import type { CashSessionRow } from '@/lib/cash/session-view';

// Cierre guiado: motivo obligatorio cuando lo contado no es lo que debe haber (decisión del dueño, 21 nov 2026).
const sessionView = {
    id: 'open-1', opened_by: 'Emi', initial_amount: 500, total_sales: 850, total_tips: 0, total_expenses: 0, total_cash: 850, total_card: 0, total_transfer: 0,
    physical_count: null, difference: null, status: 'open', opened_at: '2026-11-21T15:00:00Z', closed_at: null, expected_cash: 1350,
};
const openRow: CashSessionRow = { id: 'open-1', status: 'open', opening_cash: 500, counted_cash: null, difference_amount: null, opened_by: 'u1', opened_at: '2026-11-21T15:00:00Z', closed_at: null };

let closed = false;
let closeReply: { status: number; body: unknown } = { status: 200, body: {} };
const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

beforeEach(() => {
    closed = false;
    closeReply = { status: 200, body: {} };
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
        if (url === '/api/cash/session/close') {
            if (closeReply.status === 200) closed = true;
            return ok(closeReply.body, closeReply.status);
        }
        if (url.startsWith('/api/cash/session')) return ok(closed ? null : sessionView);
        if (url.startsWith('/api/cash/movements')) return ok([]);
        if (url.startsWith('/api/cash/settings')) return ok({ float_target: 500, reserve_amount: 600, reserve_label: 'Renta y gastos', last_float_left: 500, can_edit: false, can_see_history: false });
        if (url.startsWith('/api/cash/flow')) {
            const payload: CashFlowPayload = { flow: buildCashFlow(openRow, [], new Map([['u1', 'Emi']])), timezone: 'America/Mexico_City', day: '2026-11-21', otherExpenses: null };
            return ok(payload);
        }
        return ok({}, 404);
    }));
});
afterEach(() => { vi.unstubAllGlobals(); });

async function countTotal(amount: string) {
    render(<CashRegister />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar caja' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solo el total' }));
    fireEvent.change(screen.getByLabelText('Efectivo contado'), { target: { value: amount } });
}
const closeBody = () => calls.find((c) => c.url === '/api/cash/session/close')?.body;

describe('Cierre guiado · motivo de la diferencia', () => {
    it('si cuadra, no aparece ni «Revisa primero» ni el campo, y se cierra sin motivo', async () => {
        await countTotal('1350');
        expect(screen.getByTestId('close-difference')).toHaveTextContent('Cuadra');
        expect(screen.queryByTestId('close-check-first')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        expect(screen.queryByTestId('close-difference-box')).toBeNull();
        expect(screen.queryByTestId('close-blocked')).toBeNull();
        const submit = screen.getByTestId('close-submit');
        expect(submit).toBeEnabled();
        fireEvent.click(submit);
        await screen.findByTestId('close-summary');
        expect(closeBody()).toMatchObject({ physical_count: 1350, difference_reason: '' });
        expect(screen.queryByTestId('close-summary-reason')).toBeNull();
    });

    it('con faltante: «Revisa primero» abre el camino del efectivo antes de pedir el motivo', async () => {
        await countTotal('1320');
        expect(screen.getByTestId('close-difference')).toHaveTextContent('Faltan $30');
        const box = screen.getByTestId('close-check-first');
        expect(box).toHaveTextContent('Revisa primero');
        expect(calls.some((c) => c.url.startsWith('/api/cash/flow'))).toBe(false);
        fireEvent.click(within(box).getByTestId('close-check-first-toggle'));
        await waitFor(() => expect(within(box).getByTestId('cash-flow')).toBeInTheDocument());
        expect(calls.some((c) => c.url === '/api/cash/flow?session_id=open-1')).toBe(true);
    });

    it('con faltante: el campo aparece con la cifra; el botón está deshabilitado y explica por qué hasta que el motivo sirve', async () => {
        await countTotal('1320');
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        const box = screen.getByTestId('close-difference-box');
        expect(within(box).getByTestId('close-difference-amount')).toHaveTextContent('Faltan $30');
        expect(within(box).getByLabelText('¿Por qué hay diferencia?')).toHaveValue('');
        const submit = screen.getByTestId('close-submit');
        expect(submit).toBeDisabled();
        expect(screen.getByTestId('close-blocked')).toHaveTextContent('Para cerrar, escribe por qué faltan $30 (de 5 a 300 letras).');
        expect(submit).toHaveAttribute('aria-describedby', 'close-blocked');

        fireEvent.change(within(box).getByLabelText('¿Por qué hay diferencia?'), { target: { value: 'abcd' } });
        expect(within(box).getByTestId('close-difference-count')).toHaveTextContent('4/300 · mínimo 5 letras');
        expect(submit).toBeDisabled();
        fireEvent.change(within(box).getByLabelText('¿Por qué hay diferencia?'), { target: { value: 'Le di cambio de más' } });
        expect(within(box).getByTestId('close-difference-count')).toHaveTextContent('19/300');
        expect(submit).toBeEnabled();
        expect(screen.queryByTestId('close-blocked')).toBeNull();
    });

    it('las sugerencias rellenan el texto, se pueden editar, y «Otro» lo deja vacío', async () => {
        await countTotal('1400');
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        const box = screen.getByTestId('close-difference-box');
        expect(within(box).getByTestId('close-difference-amount')).toHaveTextContent('Sobran $50');
        const chips = within(box).getAllByTestId('close-difference-suggestion').map((b) => b.textContent);
        expect(chips).toEqual(['Cambio mal dado', 'Gasto sin registrar', 'Propina entregada en efectivo sin registrar', 'Error al contar', 'Otro']);
        const field = within(box).getByLabelText('¿Por qué hay diferencia?');
        fireEvent.click(within(box).getByRole('button', { name: 'Propina entregada en efectivo sin registrar' }));
        expect(field).toHaveValue('Propina entregada en efectivo sin registrar');
        expect(within(box).getByRole('button', { name: 'Propina entregada en efectivo sin registrar' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.change(field, { target: { value: 'Propina entregada en efectivo sin registrar, de Dani' } });
        expect(within(box).getByRole('button', { name: 'Propina entregada en efectivo sin registrar' })).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(within(box).getByRole('button', { name: 'Otro' }));
        expect(field).toHaveValue('');
        expect(screen.getByTestId('close-submit')).toBeDisabled();

        fireEvent.click(within(box).getByRole('button', { name: 'Gasto sin registrar' }));
        fireEvent.click(screen.getByTestId('close-submit'));
        await screen.findByTestId('close-summary');
        expect(closeBody()).toMatchObject({ physical_count: 1400, difference_reason: 'Gasto sin registrar' });
        expect(screen.getByTestId('close-summary')).toHaveTextContent('Sobran $50');
        expect(screen.getByTestId('close-summary-reason')).toHaveTextContent('Gasto sin registrar');
    });

    it('si la base encuentra una diferencia que la pantalla no veía, muestra su mensaje y recarga lo esperado', async () => {
        await countTotal('1350');
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        const before = calls.filter((c) => c.url === '/api/cash/session').length;
        closeReply = { status: 400, body: { error: 'Hay una diferencia de $30 (sobrante): escribe el motivo para cerrar (de 5 a 300 letras).' } };
        fireEvent.click(screen.getByTestId('close-submit'));
        expect(await screen.findByText('Hay una diferencia de $30 (sobrante): escribe el motivo para cerrar (de 5 a 300 letras).')).toBeInTheDocument();
        await waitFor(() => expect(calls.filter((c) => c.url === '/api/cash/session').length).toBeGreaterThan(before));
    });

    it('«Revisar» desde el paso 2 regresa a contar con el camino del efectivo abierto', async () => {
        await countTotal('1320');
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        fireEvent.click(screen.getByTestId('close-review'));
        expect(screen.getByTestId('close-check-first-toggle')).toHaveAttribute('aria-expanded', 'true');
        await waitFor(() => expect(screen.getByTestId('cash-flow')).toBeInTheDocument());
    });
});
