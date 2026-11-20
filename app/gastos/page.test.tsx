import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import GastosPage from '@/app/gastos/page';
import { bodyOf, json, mockFetch, renderWithQuery } from '@/app/citas/_components/test-utils';

const upload = vi.fn();
vi.mock('@/lib/supabase/browser', () => ({
    createSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: upload }) } }),
}));

beforeEach(() => {
    // Solo se congela la fecha (hoy = mié 18 nov 2026, mediodía en México); los temporizadores siguen reales.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T18:00:00Z'));
    upload.mockReset();
    upload.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const CATEGORIES = [
    { id: 'c-gen', name: 'General', is_active: true, sort_order: 0 },
    { id: 'c-serv', name: 'Servicios', is_active: true, sort_order: 10 },
    { id: 'c-old', name: 'Obras', is_active: false, sort_order: 20 },
];
const EXPENSES = [
    { id: 'x1', status: 'posted', description: 'Pago de luz', category: 'Servicios', category_id: 'c-serv', amount: 450, method: 'cash', paid_from: 'envelope', incurred_at: '2026-11-17T18:00:00Z', created_at: '2026-11-17T18:00:00Z', vendor: 'CFE', has_receipt: true, created_by_name: 'Sonia', cancel_reason: null, cancelled_by_name: null, recurring_expense_id: null },
    { id: 'x2', status: 'posted', description: 'Internet del local', category: 'Servicios', category_id: 'c-serv', amount: 600, method: 'transfer', paid_from: 'bank', incurred_at: '2026-11-10T18:00:00Z', created_at: '2026-11-10T18:00:00Z', vendor: null, has_receipt: false, created_by_name: 'Alonso', cancel_reason: null, cancelled_by_name: null, recurring_expense_id: null },
    { id: 'x3', status: 'cancelled', description: 'Compra repetida', category: 'General', category_id: 'c-gen', amount: 90, method: 'cash', paid_from: 'cash_drawer', incurred_at: '2026-11-09T18:00:00Z', created_at: '2026-11-09T18:00:00Z', vendor: null, has_receipt: false, created_by_name: 'Dago', cancel_reason: 'Se capturó dos veces', cancelled_by_name: 'Sonia', recurring_expense_id: null },
];
const TOTALS = { posted: 1050, cancelled: 90, by_paid_from: { envelope: 450, bank: 600, cash_drawer: 0 } };
const ENVELOPE = { id: 'env-1', name: 'Renta y gastos', is_default: true, balance: 500, total_in: 1200, total_out: 700, movements: 3, last_movement_at: null };
const PENDING = [
    { id: 'rec-1', name: 'Renta del local', category_id: 'c-serv', category_name: 'Servicios', suggested_amount: 1200, due_on: '2026-11-05', is_overdue: true, paid_from: 'envelope', method: 'cash' },
    { id: 'rec-2', name: 'Internet', category_id: 'c-serv', category_name: 'Servicios', suggested_amount: 600, due_on: '2026-11-25', is_overdue: false, paid_from: 'bank', method: 'transfer' },
];

interface Opts {
    canEdit?: boolean;
    owner?: boolean;
    expensesPost?: (body: Record<string, unknown>) => Response;
    extra?: Parameters<typeof mockFetch>[0];
}
function setup(o: Opts = {}) {
    const canEdit = o.canEdit ?? true;
    return mockFetch([
        ...(o.extra ?? []),
        ['/api/auth/me', () => json({ authenticated: true, user: { role: 'admin', readOnly: !canEdit } })],
        [/\/api\/expenses\/[^/]+\/receipt$/, () => json({ url: 'https://files.example/receipt.pdf', expires_in: 60 })],
        [/\/api\/expenses\/[^/]+\/cancel$/, () => json({ expense_id: 'x1', status: 'cancelled', returned_to: 'envelope', envelope_balance: 950 })],
        ['/api/expenses/receipts', () => json({ bucket: 'expense-receipts', path: 'biz/br/2026-11/abc.pdf', token: 'tok' }, 201)],
        [/\/api\/expenses(\?|$)/, (_u, init) => {
            if (init?.method === 'POST') return (o.expensesPost ?? (() => json({ expense_id: 'new', envelope_balance: 350, replayed: false }, 201)))(JSON.parse(String(init.body)));
            return json({ expenses: EXPENSES, totals: TOTALS, can_edit: canEdit });
        }],
        [/\/api\/expense-categories/, (_u, init) => (init?.method ? json({ id: 'c-new' }, init.method === 'POST' ? 201 : 200) : json({ categories: CATEGORIES, can_edit: o.owner === true }))],
        [/\/api\/recurring-expenses\/pending/, () => json({ pending: PENDING })],
        [/\/api\/recurring-expenses/, (_u, init) => (init?.method ? json({ id: 'tpl-new' }, init.method === 'POST' ? 201 : 200) : json({ templates: [
            { id: 'rec-1', name: 'Renta del local', category_id: 'c-serv', suggested_amount: 1200, day_of_month: 5, paid_from: 'envelope', method: 'cash', vendor: null, is_active: true },
            { id: 'rec-3', name: 'Gas', category_id: 'c-gen', suggested_amount: 300, day_of_month: 12, paid_from: 'bank', method: 'card', vendor: null, is_active: false },
        ], can_edit: true }))],
        [/\/api\/envelopes$/, () => json({ envelopes: [ENVELOPE], can_edit: true })],
    ]);
}

const openForm = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Registrar gasto/ }));
    return screen.findByRole('dialog', { name: 'Registrar gasto' });
};
const fill = (form: HTMLElement, v: { amount?: string; category?: string; description?: string }) => {
    if (v.amount !== undefined) fireEvent.change(within(form).getByLabelText('Monto ($)'), { target: { value: v.amount } });
    if (v.category) fireEvent.change(within(form).getByLabelText('Categoría'), { target: { value: v.category } });
    if (v.description !== undefined) fireEvent.change(within(form).getByLabelText('Concepto'), { target: { value: v.description } });
};
const pin = async (code = '123456') => {
    const dialog = await screen.findByTestId('pin-confirm');
    fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: code } });
    fireEvent.click(within(dialog).getByRole('button', { name: /con PIN/ }));
    return dialog;
};

describe('Gastos: lista', () => {
    it('muestra totales por origen y cada fila con su categoría, proveedor, origen, quién y estado', async () => {
        setup();
        renderWithQuery(<GastosPage />);
        const rows = await screen.findAllByTestId('expense-row');
        expect(rows).toHaveLength(3);
        expect(screen.getByTestId('total-posted')).toHaveTextContent('$1,050.00');
        expect(screen.getByTestId('total-envelope')).toHaveTextContent('$450.00');
        expect(screen.getByTestId('total-bank')).toHaveTextContent('$600.00');
        expect(rows[0]).toHaveTextContent('Pago de luz');
        expect(rows[0]).toHaveTextContent('Servicios');
        expect(rows[0]).toHaveTextContent('CFE');
        expect(rows[0]).toHaveTextContent('Sobre');
        expect(rows[0]).toHaveTextContent('Sonia');
        expect(rows[1]).toHaveTextContent('Banco · Transferencia');
        expect(rows[2]).toHaveTextContent('Caja del día');
        expect(rows[2]).toHaveTextContent('Motivo: Se capturó dos veces');
        expect(within(rows[2]).getByText('Compra repetida')).toHaveClass('line-through');
        // El cancelado ya no se puede cancelar de nuevo.
        expect(within(rows[2]).queryByRole('button', { name: /Cancelar/ })).toBeNull();
    });

    it('"Ver" abre el comprobante firmado en una pestaña nueva', async () => {
        setup();
        const tab = { location: { href: '' }, close: vi.fn(), opener: {} };
        const open = vi.fn(() => tab);
        vi.stubGlobal('open', open);
        renderWithQuery(<GastosPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }));
        expect(open).toHaveBeenCalledWith('about:blank', '_blank');
        await waitFor(() => expect(tab.location.href).toBe('https://files.example/receipt.pdf'));
    });

    it('los atajos de periodo piden el rango de la semana o del mes', async () => {
        const fetchMock = setup();
        renderWithQuery(<GastosPage />);
        await screen.findAllByTestId('expense-row');
        const listUrl = () => String(fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/api/expenses?')).at(-1));
        expect(listUrl()).toContain('from=2026-11-01');
        expect(listUrl()).toContain('to=2026-11-30');
        fireEvent.click(screen.getByRole('button', { name: 'Esta semana' }));
        await waitFor(() => expect(listUrl()).toContain('from=2026-11-15'));
        expect(listUrl()).toContain('to=2026-11-21');
        fireEvent.change(screen.getByLabelText('Pagado desde'), { target: { value: 'bank' } });
        await waitFor(() => expect(listUrl()).toContain('paid_from=bank'));
    });

    it('si falla la carga muestra el error con Reintentar', async () => {
        let fail = true;
        mockFetch([
            ['/api/auth/me', () => json({ authenticated: true, user: { role: 'admin' } })],
            [/\/api\/expenses\?/, () => (fail ? json({ error: 'x' }, 500) : json({ expenses: [], totals: { posted: 0, cancelled: 0, by_paid_from: {} }, can_edit: true }))],
            [/\/api\/expense-categories/, () => json({ categories: CATEGORIES, can_edit: false })],
            [/\/api\/recurring-expenses/, () => json({ pending: [] })],
        ]);
        renderWithQuery(<GastosPage />);
        expect(await screen.findByText('No se pudieron cargar los gastos')).toBeInTheDocument();
        fail = false;
        fireEvent.click(screen.getAllByRole('button', { name: /Reintentar/ })[0]);
        expect(await screen.findByText('No hay gastos en este periodo')).toBeInTheDocument();
    });
});

describe('Gastos: registrar', () => {
    it('valida por campo antes de pedir el PIN', async () => {
        setup();
        renderWithQuery(<GastosPage />);
        const form = await openForm();
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        expect(within(form).getByText('Escribe el monto del gasto (más de $0).')).toBeInTheDocument();
        expect(within(form).getByText('Elige una categoría.')).toBeInTheDocument();
        expect(within(form).getByText('Describe el gasto con al menos 5 letras.')).toBeInTheDocument();
        expect(screen.queryByTestId('pin-confirm')).toBeNull();
    });

    it('del sobre con saldo insuficiente: avisa y no deja continuar; Banco sí', async () => {
        setup();
        renderWithQuery(<GastosPage />);
        const form = await openForm();
        await waitFor(() => expect(within(form).getByTestId('envelope-available')).toHaveTextContent('Saldo disponible: $500.00'));
        fill(form, { amount: '900', category: 'c-serv', description: 'Compra de cera' });
        expect(await within(form).findByTestId('envelope-short')).toHaveTextContent('No alcanza: el sobre tiene $500.00 y el gasto es de $900.00');
        expect(within(form).getByRole('button', { name: 'Continuar' })).toBeDisabled();
        fireEvent.click(within(form).getByLabelText(/Banco/));
        expect(within(form).getByRole('button', { name: 'Continuar' })).toBeEnabled();
    });

    it('del sobre: PIN incorrecto, luego correcto con la misma clave; manda el sobre y el efectivo', async () => {
        let attempt = 0;
        const fetchMock = setup({ expensesPost: (body) => {
            attempt += 1;
            return body.pin === '000000' ? json({ error: 'El PIN no es correcto.', pin_error: true }, 400) : json({ expense_id: 'new', envelope_balance: 350, replayed: false }, 201);
        } });
        renderWithQuery(<GastosPage />);
        const form = await openForm();
        await waitFor(() => expect(within(form).getByTestId('envelope-available')).toHaveTextContent('$500.00'));
        fill(form, { amount: '150', category: 'c-serv', description: 'Compra de cera' });
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        expect(await screen.findByTestId('expense-summary')).toHaveTextContent('$150.00');
        const dialog = await pin('000000');
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('El PIN no es correcto.');
        await pin('123456');
        await waitFor(() => expect(attempt).toBe(2));
        const posts = fetchMock.mock.calls.filter(([u, i]) => /\/api\/expenses$/.test(String(u)) && (i as RequestInit | undefined)?.method === 'POST').map(([, i]) => JSON.parse(String((i as RequestInit).body)));
        expect(posts[1]).toMatchObject({ paid_from: 'envelope', amount: 150, category_id: 'c-serv', description: 'Compra de cera', pin: '123456', envelope_id: 'env-1' });
        expect(posts[1].incurred_on).toBeUndefined();
        expect(posts[1].method).toBeUndefined();
        expect(typeof posts[1].idempotency_key).toBe('string');
        expect(posts[0].idempotency_key).toBe(posts[1].idempotency_key);
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());
    });

    it('desde el banco: pide el medio (tarjeta) y no manda sobre', async () => {
        const fetchMock = setup();
        renderWithQuery(<GastosPage />);
        const form = await openForm();
        fill(form, { amount: '2000', category: 'c-serv', description: 'Anuncio en redes' });
        fireEvent.click(within(form).getByLabelText(/Banco/));
        fireEvent.change(within(form).getByLabelText('Medio de pago'), { target: { value: 'card' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        await pin();
        await waitFor(() => expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST')).toBeDefined());
        const body = bodyOf(fetchMock, /\/api\/expenses$/, 'POST');
        expect(body).toMatchObject({ paid_from: 'bank', method: 'card', amount: 2000 });
        expect(body.envelope_id).toBeUndefined();
    });

    it('con fecha anterior: manda incurred_on; hoy es la fecha por omisión y el máximo', async () => {
        const fetchMock = setup();
        renderWithQuery(<GastosPage />);
        const form = await openForm();
        expect(within(form).getByRole('button', { name: /Fecha del gasto/ })).toHaveTextContent(/18/);
        fill(form, { amount: '100', category: 'c-gen', description: 'Papelería del lunes' });
        fireEvent.click(within(form).getByRole('button', { name: /Fecha del gasto/ }));
        fireEvent.click(await screen.findByRole('button', { name: /lunes 16 de noviembre de 2026/ }));
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        expect(await screen.findByTestId('expense-summary')).toHaveTextContent('fecha 2026-11-16');
        await pin();
        await waitFor(() => expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST')).toBeDefined());
        expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST').incurred_on).toBe('2026-11-16');
    });

    it('la caja del día es una opción secundaria y solo permite hoy', async () => {
        const fetchMock = setup();
        renderWithQuery(<GastosPage />);
        const form = await openForm();
        expect(within(form).queryByLabelText(/Caja del día/)).toBeNull();
        fireEvent.click(within(form).getByRole('button', { name: /caja del día \(solo por compatibilidad\)/ }));
        fireEvent.click(within(form).getByLabelText(/Caja del día/));
        expect(within(form).getByText('Un gasto de la caja del día solo puede ser de hoy.')).toBeInTheDocument();
        fill(form, { amount: '40', category: 'c-gen', description: 'Garrafón de agua' });
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        await pin();
        await waitFor(() => expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST')).toBeDefined());
        expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST')).toMatchObject({ paid_from: 'cash_drawer' });
    });

    it('comprobante: rechaza archivos de más de 5 MB; sube el válido y manda receipt_path', async () => {
        const fetchMock = setup();
        renderWithQuery(<GastosPage />);
        const form = await openForm();
        const input = within(form).getByLabelText(/Comprobante/) as HTMLInputElement;
        const big = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
        Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
        fireEvent.change(input, { target: { files: [big] } });
        expect(await within(form).findByText('El comprobante no puede pasar de 5 MB.')).toBeInTheDocument();
        fireEvent.change(within(form).getByLabelText(/Comprobante/), { target: { files: [new File(['%PDF'], 'luz.pdf', { type: 'application/pdf' })] } });
        expect(await within(form).findByTestId('receipt-preview')).toHaveTextContent('luz.pdf');
        fill(form, { amount: '150', category: 'c-serv', description: 'Pago de luz octubre' });
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        await pin();
        await waitFor(() => expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST')).toBeDefined());
        expect(upload).toHaveBeenCalledWith('biz/br/2026-11/abc.pdf', 'tok', expect.any(File));
        expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST').receipt_path).toBe('biz/br/2026-11/abc.pdf');
    });

    it('si la subida del comprobante falla, lo dice y no pide el PIN', async () => {
        setup();
        upload.mockResolvedValue({ data: null, error: { message: 'boom' } });
        renderWithQuery(<GastosPage />);
        const form = await openForm();
        fireEvent.change(within(form).getByLabelText(/Comprobante/), { target: { files: [new File(['%PDF'], 'luz.pdf', { type: 'application/pdf' })] } });
        fill(form, { amount: '150', category: 'c-serv', description: 'Pago de luz octubre' });
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        expect(await within(form).findByText(/No se pudo subir el comprobante/)).toBeInTheDocument();
        expect(screen.queryByTestId('pin-confirm')).toBeNull();
    });
});

describe('Gastos: cancelar', () => {
    it('pide motivo y PIN y explica a dónde vuelve el dinero', async () => {
        const fetchMock = setup();
        renderWithQuery(<GastosPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Cancelar gasto Pago de luz' }));
        const dialog = await screen.findByTestId('pin-confirm');
        expect(within(dialog).getByTestId('cancel-explanation')).toHaveTextContent('El dinero vuelve al sobre.');
        fireEvent.change(within(dialog).getByLabelText(/Motivo de la cancelación/), { target: { value: 'Se pagó dos veces' } });
        await pin();
        await waitFor(() => expect(bodyOf(fetchMock, /\/cancel$/, 'POST')).toBeDefined());
        expect(bodyOf(fetchMock, /\/cancel$/, 'POST')).toEqual({ reason: 'Se pagó dos veces', pin: '123456' });
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());
    });

    it('explica distinto un gasto de banco', async () => {
        setup();
        renderWithQuery(<GastosPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Cancelar gasto Internet del local' }));
        expect(await screen.findByTestId('cancel-explanation')).toHaveTextContent('no se mueve efectivo');
    });
});

describe('Gastos: gastos fijos del mes', () => {
    it('lista los pendientes, marca los vencidos y abre el formulario prellenado', async () => {
        const fetchMock = setup();
        renderWithQuery(<GastosPage />);
        const rows = await screen.findAllByTestId('pending-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Vencido');
        expect(rows[1]).not.toHaveTextContent('Vencido');
        expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/pending?month=2026-11'))).toBe(true);
        fireEvent.click(within(rows[0]).getByRole('button', { name: 'Registrar Renta del local' }));
        const form = await screen.findByRole('dialog', { name: /Renta del local/ });
        expect(within(form).getByLabelText('Monto ($)')).toHaveValue('1200');
        expect(within(form).getByLabelText('Concepto')).toHaveValue('Renta del local');
        expect(within(form).getByLabelText('Categoría')).toHaveValue('c-serv');
        // El monto sugerido se puede corregir.
        fireEvent.change(within(form).getByLabelText('Monto ($)'), { target: { value: '450' } });
        await waitFor(() => expect(within(form).getByTestId('envelope-available')).toHaveTextContent('$500.00'));
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        await pin();
        await waitFor(() => expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST')).toBeDefined());
        expect(bodyOf(fetchMock, /\/api\/expenses$/, 'POST')).toMatchObject({ recurring_expense_id: 'rec-1', amount: 450, paid_from: 'envelope' });
    });

    it('el gestor crea una plantilla y activa o desactiva otra', async () => {
        const fetchMock = setup();
        renderWithQuery(<GastosPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Administrar gastos fijos' }));
        const manager = await screen.findByTestId('template-manager');
        expect(await within(manager).findByText(/Gas/)).toBeInTheDocument();
        fireEvent.click(within(manager).getByRole('button', { name: 'Activar' }));
        await waitFor(() => expect(bodyOf(fetchMock, '/api/recurring-expenses', 'PATCH')).toEqual({ id: 'rec-3', is_active: true }));
        fireEvent.click(within(manager).getByRole('button', { name: 'Nuevo gasto fijo' }));
        const modal = await screen.findByRole('dialog', { name: 'Nuevo gasto fijo' });
        fireEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));
        expect(within(modal).getByText('El nombre del gasto fijo lleva de 2 a 80 letras.')).toBeInTheDocument();
        fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: 'Agua' } });
        fireEvent.change(within(modal).getByLabelText('Categoría'), { target: { value: 'c-serv' } });
        fireEvent.change(within(modal).getByLabelText('Monto sugerido ($)'), { target: { value: '280' } });
        fireEvent.change(within(modal).getByLabelText('Día del mes'), { target: { value: '8' } });
        fireEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(bodyOf(fetchMock, '/api/recurring-expenses', 'POST')).toMatchObject({ name: 'Agua', category_id: 'c-serv', suggested_amount: 280, day_of_month: 8, paid_from: 'envelope' }));
    });
});

describe('Gastos: categorías (solo cuenta principal)', () => {
    it('la cuenta principal crea, renombra, desactiva y ordena', async () => {
        const fetchMock = setup({ owner: true });
        renderWithQuery(<GastosPage />);
        const list = await screen.findByTestId('categories-list');
        expect(within(list).getByText('General')).toBeInTheDocument();
        fireEvent.click(within(list).getByRole('button', { name: 'Bajar General' }));
        await waitFor(() => expect(bodyOf(fetchMock, '/api/expense-categories', 'PATCH')).toBeDefined());
        const sorts = fetchMock.mock.calls.filter(([u, i]) => String(u).includes('/api/expense-categories') && (i as RequestInit | undefined)?.method === 'PATCH').map(([, i]) => JSON.parse(String((i as RequestInit).body)));
        expect(sorts).toEqual(expect.arrayContaining([{ id: 'c-gen', sort_order: 10 }, { id: 'c-serv', sort_order: 0 }]));
        fireEvent.click(within(list).getByRole('button', { name: 'Activar' }));
        await waitFor(() => expect(sorts.length).toBeGreaterThan(0));
        await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => String(u).includes('/api/expense-categories') && String((i as RequestInit | undefined)?.body).includes('is_active'))).toBe(true));
        fireEvent.click(screen.getByRole('button', { name: 'Nueva categoría' }));
        const modal = await screen.findByRole('dialog', { name: 'Nueva categoría' });
        fireEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));
        expect(within(modal).getByText('El nombre de la categoría lleva de 2 a 60 letras.')).toBeInTheDocument();
        fireEvent.change(within(modal).getByLabelText('Nombre'), { target: { value: 'Mantenimiento' } });
        fireEvent.click(within(modal).getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(bodyOf(fetchMock, '/api/expense-categories', 'POST')).toEqual({ name: 'Mantenimiento' }));
    });

    it('gerencia sin cuenta principal no ve el gestor de categorías', async () => {
        setup({ owner: false });
        renderWithQuery(<GastosPage />);
        await screen.findAllByTestId('expense-row');
        expect(screen.queryByTestId('categories-list')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Nueva categoría' })).toBeNull();
    });
});

describe('Gastos: permisos', () => {
    it('consulta ve todo sin botones de acción', async () => {
        setup({ canEdit: false, owner: false });
        renderWithQuery(<GastosPage />);
        await screen.findAllByTestId('expense-row');
        await screen.findAllByTestId('pending-row');
        expect(screen.getByText(/Tu cuenta es de consulta/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Registrar gasto/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Cancelar gasto/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^Registrar / })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Administrar gastos fijos' })).toBeNull();
        // Pero sí puede abrir el comprobante.
        expect(screen.getByRole('button', { name: 'Ver comprobante' })).toBeInTheDocument();
    });
});
