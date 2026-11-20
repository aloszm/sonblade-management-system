import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import SobresPage from '@/app/sobres/page';
import { bodyOf, json, mockFetch, renderWithQuery } from '@/app/citas/_components/test-utils';

afterEach(() => vi.unstubAllGlobals());

const ENVELOPE = { id: 'env-1', name: 'Renta y gastos', is_default: true, balance: 1250, total_in: 3000, total_out: 1750, movements: 4, last_movement_at: '2026-11-18T03:10:00Z' };
const MOVEMENTS = [
    { id: 'm4', direction: 'out', amount: 500, signed_amount: -500, balance_after: 1250, source: 'bank_deposit', reason: 'Depósito semanal', created_by_name: 'Sonia', created_at: '2026-11-18T03:10:00Z', expense_id: null, cash_session_id: null },
    { id: 'm3', direction: 'in', amount: 150, signed_amount: 150, balance_after: 1750, source: 'expense_cancel', reason: null, created_by_name: 'Alonso', created_at: '2026-11-17T20:00:00Z', expense_id: 'e1', cash_session_id: null },
    { id: 'm2', direction: 'out', amount: 150, signed_amount: -150, balance_after: 1600, source: 'expense', reason: 'Luz', created_by_name: 'Alonso', created_at: '2026-11-17T19:00:00Z', expense_id: 'e1', cash_session_id: null },
    { id: 'm1', direction: 'in', amount: 600, signed_amount: 600, balance_after: 1750, source: 'cash_close', reason: null, created_by_name: 'Dago', created_at: '2026-11-16T04:00:00Z', expense_id: null, cash_session_id: 's1' },
];

function routes(opts: { canEdit?: boolean; movements?: unknown[]; extra?: Parameters<typeof mockFetch>[0] } = {}) {
    return mockFetch([
        ...(opts.extra ?? []),
        ['/api/auth/me', () => json({ authenticated: true, user: { role: 'admin', readOnly: opts.canEdit === false } })],
        [/\/api\/envelopes\/env-1\/movements/, () => json({ movements: opts.movements ?? MOVEMENTS })],
        [/\/api\/envelopes$/, () => json({ envelopes: [ENVELOPE], can_edit: opts.canEdit ?? true })],
    ]);
}

const pinStep = async (pin = '123456', comment?: string) => {
    const dialog = await screen.findByTestId('pin-confirm');
    if (comment !== undefined) fireEvent.change(within(dialog).getByLabelText(/Comentario/), { target: { value: comment } });
    fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: pin } });
    fireEvent.click(within(dialog).getByRole('button', { name: /con PIN/ }));
    return dialog;
};

describe('Sobres', () => {
    it('muestra el saldo, los totales y el libro con saldo corrido y conceptos legibles', async () => {
        routes();
        renderWithQuery(<SobresPage />);
        expect(await screen.findByTestId('envelope-balance')).toHaveTextContent('$1,250.00');
        expect(screen.getByTestId('envelope-total-in')).toHaveTextContent('$3,000.00');
        expect(screen.getByTestId('envelope-total-out')).toHaveTextContent('$1,750.00');
        const rows = await screen.findAllByTestId('ledger-row');
        expect(rows).toHaveLength(4);
        expect(rows[0]).toHaveTextContent('Depósito al banco');
        expect(rows[0]).toHaveTextContent('-$500.00');
        expect(rows[0]).toHaveTextContent('$1,250.00');
        expect(rows[1]).toHaveTextContent('Devolución por gasto cancelado');
        expect(rows[2]).toHaveTextContent('Gasto');
        expect(rows[3]).toHaveTextContent('Apartado del cierre de caja');
        expect(rows[3]).toHaveTextContent('+$600.00');
        expect(rows[3]).toHaveTextContent('Dago');
    });

    it('sin movimientos: estado vacío con la explicación', async () => {
        routes({ movements: [] });
        renderWithQuery(<SobresPage />);
        expect(await screen.findByText('Aún no hay apartados. El primero entrará cuando cierres una caja con apartado.')).toBeInTheDocument();
    });

    it('si falla la carga muestra el error y Reintentar vuelve a pedir', async () => {
        let fail = true;
        mockFetch([
            ['/api/auth/me', () => json({ authenticated: true, user: { role: 'admin' } })],
            [/\/api\/envelopes\/env-1\/movements/, () => json({ movements: [] })],
            [/\/api\/envelopes$/, () => (fail ? json({ error: 'Falla del servidor.' }, 500) : json({ envelopes: [ENVELOPE], can_edit: true }))],
        ]);
        renderWithQuery(<SobresPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar los sobres');
        fail = false;
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByTestId('envelope-balance')).toHaveTextContent('$1,250.00');
    });

    it('filtrar por fechas pide los movimientos con desde y hasta', async () => {
        const fetchMock = routes();
        renderWithQuery(<SobresPage />);
        await screen.findAllByTestId('ledger-row');
        const calls = fetchMock.mock.calls.map(([u]) => String(u));
        expect(calls.some((u) => /movements\?limit=200$/.test(u))).toBe(true);
    });

    it('ajustar por conteo: muestra la diferencia antes de confirmar y manda lo contado con PIN', async () => {
        const fetchMock = routes({ extra: [[/\/adjust$/, () => json({ movement_id: 'm9', previous_balance: 1250, difference: -250, balance: 1000, replayed: false }, 201)]] });
        renderWithQuery(<SobresPage />);
        await screen.findByTestId('envelope-balance');
        fireEvent.click(screen.getByRole('button', { name: /Ajustar por conteo/ }));
        fireEvent.change(await screen.findByLabelText(/Lo que contaste/), { target: { value: '1000' } });
        expect(screen.getByTestId('adjust-diff')).toHaveTextContent('El sistema dice $1,250.00, contaste $1,000.00, diferencia -$250.00');
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        expect(await screen.findByTestId('adjust-summary')).toHaveTextContent('El sistema dice $1,250.00, contaste $1,000.00, diferencia -$250.00');
        await pinStep('123456', 'Conteo de la semana');
        await waitFor(() => expect(bodyOf(fetchMock, '/adjust', 'POST')).toBeDefined());
        const body = bodyOf(fetchMock, '/adjust', 'POST');
        expect(body).toMatchObject({ counted_balance: 1000, comment: 'Conteo de la semana', pin: '123456' });
        expect(typeof body.idempotency_key).toBe('string');
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());
    });

    it('el ajuste valida lo contado antes de pedir el PIN', async () => {
        routes();
        renderWithQuery(<SobresPage />);
        await screen.findByTestId('envelope-balance');
        fireEvent.click(screen.getByRole('button', { name: /Ajustar por conteo/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
        expect(await screen.findByText('Escribe lo que contaste en el sobre.')).toBeInTheDocument();
        expect(screen.queryByTestId('pin-confirm')).toBeNull();
    });

    it('depósito: si el servidor responde 409 (no alcanza) lo dice y deja reintentar con la misma clave', async () => {
        let attempts = 0;
        const fetchMock = routes({ extra: [[/\/deposit$/, () => { attempts += 1; return json({ error: 'El sobre no tiene saldo suficiente.' }, 409); }]] });
        renderWithQuery(<SobresPage />);
        await screen.findByTestId('envelope-balance');
        fireEvent.click(screen.getByRole('button', { name: /Depositar al banco/ }));
        fireEvent.change(await screen.findByLabelText(/Monto a depositar/), { target: { value: '300' } });
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        const dialog = await pinStep('123456', 'Depósito semanal');
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('El sobre no tiene saldo suficiente.');
        await pinStep('123456');
        await waitFor(() => expect(attempts).toBe(2));
        const keys = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/deposit')).map(([, init]) => JSON.parse(String((init as RequestInit).body)).idempotency_key);
        expect(keys[0]).toBe(keys[1]);
    });

    it('depósito mayor al saldo: avisa y no deja continuar', async () => {
        routes();
        renderWithQuery(<SobresPage />);
        await screen.findByTestId('envelope-balance');
        fireEvent.click(screen.getByRole('button', { name: /Depositar al banco/ }));
        fireEvent.change(await screen.findByLabelText(/Monto a depositar/), { target: { value: '5000' } });
        expect(await screen.findByText('No alcanza: el sobre tiene $1,250.00.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    });

    it('PIN incorrecto: muestra el mensaje del servidor (400 pin_error)', async () => {
        routes({ extra: [[/\/adjust$/, () => json({ error: 'El PIN no es correcto.', pin_error: true }, 400)]] });
        renderWithQuery(<SobresPage />);
        await screen.findByTestId('envelope-balance');
        fireEvent.click(screen.getByRole('button', { name: /Ajustar por conteo/ }));
        fireEvent.change(await screen.findByLabelText(/Lo que contaste/), { target: { value: '1250' } });
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        const dialog = await pinStep('000000', 'Conteo de prueba');
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('El PIN no es correcto.');
    });

    it('consulta: ve el saldo y el libro pero no hay botones de acción', async () => {
        routes({ canEdit: false });
        renderWithQuery(<SobresPage />);
        expect(await screen.findByTestId('envelope-balance')).toHaveTextContent('$1,250.00');
        await screen.findAllByTestId('ledger-row');
        expect(screen.queryByRole('button', { name: /Ajustar por conteo/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Depositar al banco/ })).toBeNull();
    });
});
