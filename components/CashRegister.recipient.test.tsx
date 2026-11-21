import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CashRegister from './CashRegister';
import CashSettingsEditor from './CashSettingsEditor';

// El retiro del cierre se entrega a una persona fija (decisión del dueño, 21 nov 2026):
// «El efectivo sobrante es después de los sobres. El efectivo sobrante se le tiene que entregar a Sonia.»
const sessionView = {
    id: 'open-1', opened_by: 'Emi', initial_amount: 500, total_sales: 1900, total_tips: 0, total_expenses: 0, total_cash: 1900, total_card: 0, total_transfer: 0,
    physical_count: null, difference: null, status: 'open', opened_at: '2026-11-21T15:00:00Z', closed_at: null, expected_cash: 2400,
};
const SONIA = { user_id: '00000000-0000-4000-8000-000000000002', name: 'Sonia' };

let closed = false;
let recipient: typeof SONIA | null = SONIA;
let closeBodyReply: Record<string, unknown> = {};
const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

beforeEach(() => {
    closed = false;
    recipient = SONIA;
    closeBodyReply = { withdrawal_delivered_to: 'Sonia' };
    calls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
        if (url === '/api/cash/session/close') { closed = true; return ok(closeBodyReply); }
        if (url === '/api/cash/settings/withdrawal-recipient') return ok({ withdrawal_recipient: init?.body && JSON.parse(String(init.body)).user_id ? { user_id: JSON.parse(String(init.body)).user_id, name: 'Sonia' } : null });
        if (url.startsWith('/api/cash/session')) return ok(closed ? null : sessionView);
        if (url.startsWith('/api/cash/movements')) return ok([]);
        if (url.startsWith('/api/cash/settings')) return ok({ float_target: 500, reserve_amount: 600, reserve_label: 'Renta y gastos', last_float_left: 500, can_edit: false, can_see_history: false, withdrawal_recipient: recipient, can_set_withdrawal_recipient: false });
        if (url.startsWith('/api/accounts')) return ok({ accounts: [
            { userId: 'u-alonso', name: 'Alonso', role: 'owner', isActive: true },
            { userId: SONIA.user_id, name: 'Sonia', role: 'admin', isActive: true },
            { userId: 'u-lucia', name: 'Lucía', role: 'viewer', isActive: true },
            { userId: 'u-dago', name: 'Dago', role: 'receptionist', isActive: true },
            { userId: 'u-ex', name: 'Gerente anterior', role: 'admin', isActive: false },
        ] });
        return ok({}, 404);
    }));
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Cuenta $2,400 (cuadra): fondo $500, sobre $600, retiro $1,300. */
async function toSplit() {
    render(<CashRegister />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar caja' }));
    fireEvent.click(screen.getByRole('button', { name: 'Solo el total' }));
    fireEvent.change(screen.getByLabelText('Efectivo contado'), { target: { value: '2400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}
const closeBody = () => calls.find((c) => c.url === '/api/cash/session/close')?.body;

describe('Cierre de caja · a quién se entrega el retiro', () => {
    it('con receptor fijo: el retiro es lo que sobra después del fondo y del sobre, y dice a quién entregarlo sin preguntar', async () => {
        await toSplit();
        expect(screen.getByLabelText('Se queda de fondo para mañana')).toHaveValue(500);
        expect(screen.getByLabelText(/^Apartado/)).toHaveValue(600);
        expect(screen.getByTestId('close-withdrawn')).toHaveTextContent('$1,300');
        const note = screen.getByTestId('close-recipient');
        expect(note).toHaveTextContent('Entrega los $1,300 del retiro a Sonia');
        expect(screen.queryByLabelText(/A quién se entrega el retiro/)).toBeNull(); // ya no es un texto opcional

        fireEvent.click(screen.getByTestId('close-submit'));
        const summary = await screen.findByTestId('close-summary');
        // La pantalla no manda el nombre: lo guarda la base. El resumen muestra lo que la base guardó.
        expect(closeBody()).not.toHaveProperty('withdrawal_delivered_to');
        expect(closeBody()).toMatchObject({ physical_count: 2400, float_left: 500, reserve_amount: 600 });
        expect(summary).toHaveTextContent('Retiro · entregado a Sonia');
        expect(summary).toHaveTextContent('$1,300');
    });

    it('con receptor fijo y sin retiro (no sobra nada después del sobre): no menciona entrega', async () => {
        await toSplit();
        fireEvent.change(screen.getByLabelText(/^Apartado/), { target: { value: '1900' } });
        expect(screen.getByTestId('close-withdrawn')).toHaveTextContent('$0');
        expect(screen.queryByTestId('close-recipient')).toBeNull();
        expect(screen.queryByLabelText(/A quién se entrega el retiro/)).toBeNull();
    });

    it('sin receptor configurado: sigue el texto opcional de antes y viaja en el cierre', async () => {
        recipient = null;
        closeBodyReply = { withdrawal_delivered_to: 'Depósito al banco' };
        await toSplit();
        expect(screen.queryByTestId('close-recipient')).toBeNull();
        fireEvent.change(screen.getByLabelText('¿A quién se entrega el retiro? (opcional)'), { target: { value: ' Depósito al banco ' } });
        fireEvent.click(screen.getByTestId('close-submit'));
        const summary = await screen.findByTestId('close-summary');
        expect(closeBody()).toMatchObject({ withdrawal_delivered_to: 'Depósito al banco' });
        expect(summary).toHaveTextContent('Retiro · entregado a Depósito al banco');
    });
});

describe('Ajustes de caja · quién recibe el retiro', () => {
    const initial = { float_target: 500, reserve_amount: 600, reserve_label: 'Renta y gastos' };

    it('gerencia y los demás solo lo leen', () => {
        render(<CashSettingsEditor initial={initial} recipient={SONIA} canSetRecipient={false} />);
        const box = screen.getByTestId('cash-recipient');
        expect(box).toHaveTextContent('Se entrega a Sonia.');
        expect(box).toHaveTextContent('Solo la cuenta principal lo cambia.');
        expect(within(box).queryByRole('combobox')).toBeNull();
        expect(calls.some((c) => c.url.startsWith('/api/accounts'))).toBe(false);
    });

    it('sin receptor: lo dice claro', () => {
        render(<CashSettingsEditor initial={initial} recipient={null} canSetRecipient={false} />);
        expect(screen.getByTestId('cash-recipient')).toHaveTextContent('Todavía no hay una persona fija: se escribe al cerrar.');
    });

    it('la cuenta principal elige entre gerencia y cuenta principal activas, y lo guarda con PIN y comentario', async () => {
        const onRecipientSaved = vi.fn();
        render(<CashSettingsEditor initial={initial} recipient={null} canSetRecipient onRecipientSaved={onRecipientSaved} />);
        const select = screen.getByLabelText('Persona que recibe el retiro');
        await waitFor(() => expect(within(select).getByRole('option', { name: 'Sonia' })).toBeInTheDocument());
        // Solo gerencia o cuenta principal con acceso activo; consulta, recepción y accesos desactivados no aparecen.
        expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin persona fija (se escribe al cerrar)', 'Alonso', 'Sonia']);
        const save = screen.getByRole('button', { name: 'Guardar quién recibe el retiro' });
        expect(save).toBeDisabled(); // sin cambio no hay nada que guardar

        fireEvent.change(select, { target: { value: SONIA.user_id } });
        fireEvent.click(save);
        const dialog = screen.getByTestId('pin-confirm');
        expect(dialog).toHaveTextContent('Sin persona fija');
        expect(dialog).toHaveTextContent('Sonia');
        fireEvent.change(within(dialog).getByLabelText(/Comentario/), { target: { value: 'El sobrante de cada cierre se entrega a Sonia' } });
        fireEvent.change(within(dialog).getByLabelText(/PIN/), { target: { value: '482917' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar con PIN' }));

        await waitFor(() => expect(onRecipientSaved).toHaveBeenCalledWith(SONIA));
        expect(calls.find((c) => c.url === '/api/cash/settings/withdrawal-recipient')?.body)
            .toEqual({ user_id: SONIA.user_id, pin: '482917', comment: 'El sobrante de cada cierre se entrega a Sonia' });
        expect(screen.getByRole('status')).toHaveTextContent('El retiro se entrega a Sonia.');
    });
});
