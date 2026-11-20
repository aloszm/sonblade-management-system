import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import TeamLedger from './TeamLedger';
import { ENVELOPES, LEDGER, renderWithClient, stubFetch, type Call, type Reply } from './test-utils';

const PEOPLE = [{ id: 'b1', name: 'Deya' }, { id: 'b2', name: 'Dani' }];

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function routes(extra: (c: Call) => Reply | undefined = () => undefined, ledger: unknown = LEDGER) {
    return stubFetch((c) => {
        const custom = extra(c);
        if (custom) return custom;
        if (c.url.startsWith('/api/employee-ledger') && c.method === 'GET') return { body: ledger };
        if (c.url.startsWith('/api/envelopes')) return { body: ENVELOPES };
        return undefined;
    });
}

async function fillAdvance(amount: string, open = true) {
    if (open) fireEvent.click(await screen.findByRole('button', { name: /Registrar/ }));
    const form = await screen.findByTestId('ledger-form');
    fireEvent.change(within(form).getByLabelText('Persona'), { target: { value: 'b1' } });
    fireEvent.change(within(form).getByLabelText('Monto ($)'), { target: { value: amount } });
    fireEvent.change(within(form).getByLabelText('Motivo (obligatorio)'), { target: { value: 'Adelanto para la renta' } });
    await waitFor(() => expect(screen.getByTestId('ledger-envelope-balance')).toHaveTextContent('Saldo disponible: $500.00'));
    return form;
}

describe('Movimientos del equipo', () => {
    it('muestra lo pendiente por descontar, los préstamos con saldo y el historial', async () => {
        routes();
        renderWithClient(<TeamLedger people={PEOPLE} />);
        expect(await screen.findByTestId('ledger-pending-summary')).toHaveTextContent('Adelantos $200.00');
        expect(screen.getByTestId('ledger-loans')).toHaveTextContent('Debe $1,000.00');
        expect(screen.getByTestId('ledger-loans')).toHaveTextContent('abono semanal $250.00');
        expect(screen.getByTestId('ledger-entry')).toHaveTextContent('Adelanto para la renta');
    });

    it('explica cada tipo en una línea y el efecto "Se descontará en su próximo recibo"', async () => {
        routes();
        renderWithClient(<TeamLedger people={PEOPLE} />);
        fireEvent.click(await screen.findByRole('button', { name: /Registrar/ }));
        const form = await screen.findByTestId('ledger-form');
        expect(form).toHaveTextContent('Entregas dinero hoy y se descuenta completo en el siguiente recibo.');
        expect(form).toHaveTextContent('Abono extra a un préstamo');
        expect(form).toHaveTextContent('No entrega dinero (producto que se llevó, daños)');
        expect(screen.getByTestId('ledger-effect')).toHaveTextContent('Se descontará en su próximo recibo.');
        // Un descuento no entrega dinero: no pide "Sale de".
        expect(within(form).getByText('Sale de')).toBeInTheDocument();
        fireEvent.click(within(form).getByLabelText(/^Descuento/));
        expect(within(form).queryByText('Sale de')).toBeNull();
    });

    it('valida antes de pedir el PIN: motivo obligatorio y saldo del sobre', async () => {
        const calls = routes();
        renderWithClient(<TeamLedger people={PEOPLE} />);
        fireEvent.click(await screen.findByRole('button', { name: /Registrar/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
        expect(await screen.findByText('Elige a la persona.')).toBeInTheDocument();
        expect(screen.getByText('Escribe el monto (más de $0).')).toBeInTheDocument();
        expect(screen.getByText(/Escribe el motivo/)).toBeInTheDocument();
        await fillAdvance('900', false);
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        expect(await screen.findByText('No alcanza: el sobre tiene $500.00. Elige otra salida o baja el monto.')).toBeInTheDocument();
        expect(screen.queryByTestId('pin-confirm')).toBeNull();
        expect(calls.some((c) => c.method === 'POST')).toBe(false);
    });

    it('no pasa al PIN mientras todavía se consulta el saldo del sobre (el servidor es quien decide, pero la pantalla no adivina)', async () => {
        const base = routes();
        void base;
        const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
            if (String(url).startsWith('/api/envelopes')) return new Promise(() => undefined); // nunca contesta
            const body = LEDGER;
            return { ok: true, status: 200, json: async () => body, init };
        });
        vi.stubGlobal('fetch', fetchMock);
        renderWithClient(<TeamLedger people={PEOPLE} />);
        fireEvent.click(await screen.findByRole('button', { name: /Registrar/ }));
        const form = await screen.findByTestId('ledger-form');
        fireEvent.change(within(form).getByLabelText('Persona'), { target: { value: 'b1' } });
        fireEvent.change(within(form).getByLabelText('Monto ($)'), { target: { value: '5600' } });
        fireEvent.change(within(form).getByLabelText('Motivo (obligatorio)'), { target: { value: 'Adelanto para la renta' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        expect(await screen.findByText(/se está consultando el saldo del sobre/)).toBeInTheDocument();
        expect(screen.queryByTestId('pin-confirm')).toBeNull();
    });

    it('alta de adelanto desde el sobre: un 409 por saldo insuficiente se muestra en la ventana del PIN y el reintento usa la misma clave', async () => {
        let attempt = 0;
        const calls = routes((c) => {
            if (c.url === '/api/employee-ledger' && c.method === 'POST') {
                attempt += 1;
                if (attempt === 1) return { status: 409, body: { error: 'El sobre no alcanza: tiene $120.00.' } };
                return { status: 201, body: { envelope_balance: 300, receipt_effect: -200 } };
            }
            return undefined;
        });
        renderWithClient(<TeamLedger people={PEOPLE} />);
        await fillAdvance('200');
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        const dialog = await screen.findByTestId('pin-confirm');
        expect(within(dialog).getByTestId('ledger-summary')).toHaveTextContent('Adelanto · $200.00 · Deya · sale de sobre');
        fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: '482913' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /Registrar con PIN/ }));
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('El sobre no alcanza: tiene $120.00.');
        // El PIN se borra al fallar; se vuelve a escribir y se reintenta.
        fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: '482913' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /Registrar con PIN/ }));
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());
        const posts = calls.filter((c) => c.method === 'POST');
        expect(posts).toHaveLength(2);
        expect(posts[0].body).toMatchObject({ employee_id: 'b1', entry_type: 'advance', amount: 200, paid_from: 'envelope', envelope_id: 'env1', reason: 'Adelanto para la renta', pin: '482913' });
        expect(posts[1].body?.idempotency_key).toBe(posts[0].body?.idempotency_key);
        expect(String(posts[0].body?.idempotency_key).length).toBeGreaterThanOrEqual(8);
    });

    it('PIN: sin PIN de 6 números no se envía nada; con un PIN incorrecto (400) muestra el error', async () => {
        const calls = routes((c) => (c.url === '/api/employee-ledger' && c.method === 'POST' ? { status: 400, body: { error: 'El PIN no es correcto.' } } : undefined));
        renderWithClient(<TeamLedger people={PEOPLE} />);
        await fillAdvance('100');
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        const dialog = await screen.findByTestId('pin-confirm');
        fireEvent.click(within(dialog).getByRole('button', { name: /Registrar con PIN/ }));
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Escribe tu PIN de 6 números.');
        expect(calls.some((c) => c.method === 'POST')).toBe(false);
        fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: '000000' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /Registrar con PIN/ }));
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('El PIN no es correcto.');
    });

    it('un préstamo pide el abono semanal y sale por transferencia', async () => {
        const calls = routes((c) => (c.url === '/api/employee-ledger' && c.method === 'POST' ? { status: 201, body: {} } : undefined));
        renderWithClient(<TeamLedger people={PEOPLE} />);
        fireEvent.click(await screen.findByRole('button', { name: /Registrar/ }));
        const form = await screen.findByTestId('ledger-form');
        fireEvent.click(within(form).getByLabelText(/^Préstamo/));
        fireEvent.change(within(form).getByLabelText('Persona'), { target: { value: 'b2' } });
        fireEvent.change(within(form).getByLabelText('Monto ($)'), { target: { value: '800' } });
        fireEvent.change(within(form).getByLabelText('Motivo (obligatorio)'), { target: { value: 'Para una moto' } });
        fireEvent.click(within(form).getByLabelText(/^Transferencia/));
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        expect(await screen.findByText('Escribe cuánto se abona por semana.')).toBeInTheDocument();
        fireEvent.change(within(form).getByLabelText('Abono por semana ($)'), { target: { value: '200' } });
        expect(screen.getByTestId('ledger-effect')).toHaveTextContent('Se descontará $200.00 cada semana en su recibo');
        fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
        const dialog = await screen.findByTestId('pin-confirm');
        fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: '482913' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /Registrar con PIN/ }));
        await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
        expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ entry_type: 'loan', paid_from: 'bank', method: 'transfer', weekly_amount: 200, amount: 800 });
    });

    it('cancelar: pide motivo y PIN, explica a dónde vuelve el dinero y solo aparece en lo que se puede cancelar', async () => {
        const ledger = { ...LEDGER, entries: [LEDGER.entries[0], { ...LEDGER.entries[0], id: 'e2', label: 'Descuento', entry_type: 'deduction', paid_from: null, can_cancel: false, settlement_id: 's1', receipt_number: 'REC-0001', is_pending: false, reason: 'Pomada' }] };
        const calls = routes((c) => (c.url === '/api/employee-ledger/e1/cancel' ? { body: { reversal_id: 'r1', returned_to: 'envelope', envelope_balance: 700 } } : undefined), ledger);
        renderWithClient(<TeamLedger people={PEOPLE} />);
        const buttons = await screen.findAllByRole('button', { name: /^Cancelar/ });
        expect(buttons).toHaveLength(1); // el descuento ya entró a un recibo: sin botón
        expect(screen.getByText('En el recibo REC-0001')).toBeInTheDocument();
        fireEvent.click(buttons[0]);
        const dialog = await screen.findByTestId('pin-confirm');
        expect(within(dialog).getByTestId('cancel-explanation')).toHaveTextContent('El dinero vuelve al sobre.');
        fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: '482913' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar movimiento con PIN/ }));
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Escribe un comentario (de 5 a 300 letras).');
        fireEvent.change(within(dialog).getByLabelText('Motivo de la cancelación'), { target: { value: 'Se capturó dos veces' } });
        fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: '482913' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /Cancelar movimiento con PIN/ }));
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());
        expect(calls.find((c) => c.url === '/api/employee-ledger/e1/cancel')!.body).toEqual({ reason: 'Se capturó dos veces', pin: '482913' });
    });

    it('un barbero (can_edit falso) ve solo lo suyo y no tiene botones de registrar ni cancelar', async () => {
        routes(undefined, { ...LEDGER, employee_id: 'b1', can_edit: false });
        renderWithClient(<TeamLedger people={[]} employeeId="b1" title="Mis movimientos" />);
        expect(await screen.findByTestId('ledger-entry')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Registrar/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Cancelar/ })).toBeNull();
    });

    it('la cuenta de consulta no ve botones aunque la API la deje leer', async () => {
        routes();
        renderWithClient(<TeamLedger people={PEOPLE} readOnly />);
        expect(await screen.findByTestId('ledger-entry')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Registrar/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Cancelar/ })).toBeNull();
    });
});
