import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import POS from './POS';
import { parseFreePrice } from '@/hooks/usePOS';

const BARBERS = [{ id: 'b1', name: 'Deya', is_active: true }];
const SERVICES = [
    { id: 'sv1', name: 'Corte', price: 200, duration_minutes: 30, is_active: true, variable_price: false },
    { id: 'sv2', name: 'Greca', price: 0, duration_minutes: 45, is_active: true, variable_price: true },
];

interface Mock { services?: unknown; products?: unknown; cash: unknown; cashStatus?: number; sales?: { status: number; body: unknown }; salesSeq?: { status: number; body: unknown }[]; authorizers?: unknown; openAppointments?: unknown; appointment?: unknown; salesBodies: unknown[] }

function mockApi(opts: Partial<Mock> = {}) {
    const state: Mock = { cash: { id: 'x' }, salesBodies: [], ...opts };
    const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes('/api/cash/session')) return json(state.cash, state.cashStatus ?? 200);
        if (url.includes('/api/auth/me')) return json({ authenticated: true, user: { id: 'u1', role: 'recepcion' } });
        if (url.includes('/api/barbers?scope=team')) return json(BARBERS);
        if (url.includes('/api/barbers')) return json(BARBERS);
        if (url.includes('/api/services')) return json(state.services ?? SERVICES);
        if (url.includes('/api/discount-authorizers')) return json({ authorizers: state.authorizers ?? [], current_user_id: 'u1' });
        if (url.includes('/api/sales')) {
            state.salesBodies.push(JSON.parse(String(init?.body)));
            const r = state.salesSeq?.shift() ?? state.sales ?? { status: 200, body: { sale_id: 's1' } };
            return json(r.body, r.status);
        }
        if (url.includes('/api/products')) return json(state.products ?? []);
        if (url.includes('/api/appointments?abiertas=1')) return json(state.openAppointments ?? []);
        if (url.includes('/api/appointments/')) return json(state.appointment ?? { error: 'Cita no encontrada.' }, state.appointment ? 200 : 404);
        return json([]);
    }));
    return state;
}

const addService = async (name: string) => fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));

beforeEach(() => { window.history.replaceState(null, '', '/pos'); });
afterEach(() => vi.unstubAllGlobals());

describe('precio libre: lectura del precio', () => {
    it('acepta de 1 a 5000 con hasta dos decimales y rechaza el resto', () => {
        expect(parseFreePrice('150')).toBe(150);
        expect(parseFreePrice('150,5')).toBe(150.5);
        expect(parseFreePrice('5000')).toBe(5000);
        for (const bad of ['', '0', '0.5', '5001', 'abc', '-3', '10.123']) expect(parseFreePrice(bad)).toBeNull();
    });
});

describe('cobro: caja', () => {
    it('con la caja cerrada muestra el aviso, el enlace y no deja cobrar', async () => {
        mockApi({ cash: null });
        render(<POS />);
        expect(await screen.findByText('La caja está cerrada. Ábrela antes de cobrar.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Abrir caja' })).toHaveAttribute('href', '/caja');
        await addService('Corte');
        const button = screen.getByRole('button', { name: 'Abre la caja para cobrar' });
        expect(button).toBeDisabled();
    });

    it('mientras consulta la primera vez no muestra el aviso ni deja cobrar', async () => {
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
            const url = input.toString();
            if (url.includes('/api/cash/session')) return new Promise(() => undefined);
            if (url.includes('/api/services')) return Promise.resolve({ ok: true, status: 200, json: async () => SERVICES });
            return Promise.resolve({ ok: true, status: 200, json: async () => [] });
        }));
        render(<POS />);
        await addService('Corte');
        expect(screen.queryByTestId('pos-cash-closed')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Cobrar/ })).toBeDisabled();
    });

    it('un 403 (persona sin acceso a caja) no muestra el aviso', async () => {
        mockApi({ cash: { error: 'x' }, cashStatus: 403 });
        render(<POS />);
        await addService('Corte');
        await waitFor(() => expect(screen.getByRole('button', { name: /^Cobrar/ })).toBeEnabled());
        expect(screen.queryByTestId('pos-cash-closed')).not.toBeInTheDocument();
    });

    it('vuelve a consultar al regresar a la pestaña y el aviso aparece sin recargar', async () => {
        const api = mockApi();
        render(<POS />);
        await addService('Corte');
        await waitFor(() => expect(screen.getByRole('button', { name: /^Cobrar/ })).toBeEnabled());
        expect(screen.queryByTestId('pos-cash-closed')).not.toBeInTheDocument();
        api.cash = null;
        document.dispatchEvent(new Event('visibilitychange'));
        expect(await screen.findByTestId('pos-cash-closed')).toBeInTheDocument();
    });

    it('un 409 de caja cerrada al cobrar muestra el aviso y bloquea el botón', async () => {
        mockApi({ sales: { status: 409, body: { error: 'La caja está cerrada. Ábrela en Caja antes de cobrar.', detail: 'interno' } } });
        render(<POS />);
        fireEvent.click(await screen.findByRole('button', { name: /Deya/ }));
        await addService('Corte');
        const cobrar = await screen.findByRole('button', { name: 'Cobrar $200' });
        await waitFor(() => expect(cobrar).toBeEnabled());
        fireEvent.click(cobrar);
        expect(await screen.findByTestId('pos-cash-closed')).toBeInTheDocument();
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('La caja está cerrada. Ábrela en Caja antes de cobrar.');
        expect(alert).not.toHaveTextContent('interno');
        expect(screen.getByRole('button', { name: 'Abre la caja para cobrar' })).toBeDisabled();
    });
});

describe('cobro: errores en línea', () => {
    it('sin barbero muestra el error junto al bloque, sin alert del navegador, y se limpia al elegirlo', async () => {
        mockApi();
        const spy = vi.fn();
        vi.stubGlobal('alert', spy);
        render(<POS />);
        await addService('Corte');
        const cobrar = await screen.findByRole('button', { name: 'Cobrar $200' });
        await waitFor(() => expect(cobrar).toBeEnabled());
        fireEvent.click(cobrar);
        expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona al barbero que hizo el servicio.');
        expect(spy).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByRole('button', { name: /Deya/ }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

describe('cobro: precio libre', () => {
    it('muestra "Precio al cobrar", suma el precio escrito y lo envía como unit_price solo en ese renglón', async () => {
        const api = mockApi();
        render(<POS />);
        fireEvent.click(await screen.findByRole('button', { name: /Deya/ }));
        expect(await screen.findByText('Precio al cobrar')).toBeInTheDocument();
        await addService('Greca');
        await addService('Corte');
        fireEvent.change(screen.getByLabelText('Precio de Greca'), { target: { value: '350' } });
        expect(screen.getByTestId('pos-total')).toHaveTextContent('$550');
        const cobrar = screen.getByRole('button', { name: 'Cobrar $550' });
        await waitFor(() => expect(cobrar).toBeEnabled());
        fireEvent.click(cobrar);
        await waitFor(() => expect(api.salesBodies).toHaveLength(1));
        const items = (api.salesBodies[0] as { items: Record<string, unknown>[] }).items;
        expect(items.find((i) => i.catalog_id === 'sv2')).toMatchObject({ unit_price: 350 });
        expect(items.find((i) => i.catalog_id === 'sv1')).not.toHaveProperty('unit_price');
    });

    it('cada agregado es un renglón propio', async () => {
        mockApi();
        render(<POS />);
        await addService('Greca');
        await addService('Greca');
        expect(screen.getAllByLabelText('Precio de Greca')).toHaveLength(2);
    });

    it('sin precio o con precio inválido no cobra y avisa en línea', async () => {
        const api = mockApi();
        render(<POS />);
        fireEvent.click(await screen.findByRole('button', { name: /Deya/ }));
        await addService('Greca');
        const cobrar = screen.getByRole('button', { name: /^Cobrar/ });
        await waitFor(() => expect(cobrar).toBeEnabled());
        fireEvent.click(cobrar);
        expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el precio de Greca');
        fireEvent.change(screen.getByLabelText('Precio de Greca'), { target: { value: '9000' } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /^Cobrar/ }));
        expect(await screen.findByRole('alert')).toHaveTextContent('de $1 a $5,000');
        expect(api.salesBodies).toHaveLength(0);
    });
});

describe('cobro: servicios agrupados por categoría', () => {
    const svc = (id: string, name: string, category: string, sort_order: number, extra: Record<string, unknown> = {}) =>
        ({ id, name, price: 100, duration_minutes: 30, is_active: true, variable_price: false, category, sort_order, ...extra });
    const CATALOG = [
        svc('d1', 'Demo (prueba)', 'otros', 0),
        svc('p1', 'Corte y barba', 'paquetes', 1, { description: 'Corte más barba', duration_minutes: 90 }),
        svc('b1', 'Barba', 'barba', 2),
        svc('b2', 'Bigote', 'barba', 1),
        svc('c2', 'Corte niño', 'cortes', 2),
        svc('c1', 'Corte adulto', 'cortes', 1),
    ];
    const PRODUCTS = [
        { id: 'pr1', name: 'Pomada (prueba)', price: 50, stock: 3, sku: 'a', category: 'x', min_stock: 1 },
        { id: 'pr2', name: 'Peine', price: 80, stock: 5, sku: 'b', category: 'x', min_stock: 1 },
    ];

    it('en Todos muestra una sección por categoría en el orden del cartel, con los (prueba) al final', async () => {
        mockApi({ services: CATALOG, products: PRODUCTS });
        render(<POS />);
        await screen.findByRole('button', { name: /^Corte adulto/ });
        const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
        expect(titles).toEqual(['Cortes', 'Barba y afeitado', 'Paquetes', 'Otros']);
        const barba = within(screen.getByTestId('pos-category-barba')).getAllByRole('button').map((b) => b.textContent);
        expect(barba[0]).toMatch(/^Bigote/);
        expect(barba[1]).toMatch(/^Barba/);
        expect(within(screen.getByTestId('pos-category-paquetes')).getByText('Corte más barba')).toBeInTheDocument();
        expect(within(screen.getByTestId('pos-category-paquetes')).getByText('1 h 30 min')).toBeInTheDocument();
        const products = screen.getAllByRole('button', { name: /^(Pomada|Peine)/ }).map((b) => b.textContent);
        expect(products[0]).toMatch(/^Peine/);
        expect(products[1]).toMatch(/^Pomada \(prueba\)/);
    });

    it('los chips filtran por categoría, marcan aria-pressed y Todos regresa todo', async () => {
        mockApi({ services: CATALOG });
        render(<POS />);
        await screen.findByRole('button', { name: /^Corte adulto/ });
        const group = screen.getByRole('group', { name: 'Categorías de servicios' });
        expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todos', 'Cortes', 'Barba y afeitado', 'Paquetes', 'Otros']);
        expect(within(group).getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(group).getByRole('button', { name: 'Barba y afeitado' }));
        expect(within(group).getByRole('button', { name: 'Barba y afeitado' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Barba y afeitado']);
        expect(screen.queryByRole('button', { name: /^Corte adulto/ })).not.toBeInTheDocument();
        fireEvent.click(within(group).getByRole('button', { name: 'Todos' }));
        expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
    });

    it('no muestra el chip de Otros si no hay servicios ahí', async () => {
        mockApi({ services: CATALOG.filter((s) => s.category !== 'otros') });
        render(<POS />);
        await screen.findByRole('button', { name: /^Corte adulto/ });
        expect(screen.queryByRole('button', { name: 'Otros' })).not.toBeInTheDocument();
    });

    it('la búsqueda mira todas las categorías aunque haya un chip elegido', async () => {
        mockApi({ services: [...CATALOG, svc('x1', 'Extra 1', 'cortes', 9), svc('x2', 'Extra 2', 'cortes', 10), svc('x3', 'Extra 3', 'cortes', 11), svc('x4', 'Extra 4', 'cortes', 12)] });
        render(<POS />);
        await screen.findByRole('button', { name: /^Corte adulto/ });
        fireEvent.click(screen.getByRole('button', { name: 'Paquetes' }));
        fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar servicios y productos' }), { target: { value: 'barba' } });
        expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Barba y afeitado', 'Paquetes']);
        expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('elegir un servicio sigue agregándolo a la venta', async () => {
        mockApi({ services: CATALOG });
        render(<POS />);
        await addService('Bigote');
        expect(screen.getByRole('button', { name: /^Bigote/ })).toHaveAttribute('aria-pressed', 'true');
    });
});

describe('cobro: descuento con PIN de quien autoriza', () => {
    const withDiscount = async () => {
        render(<POS />);
        fireEvent.click(await screen.findByRole('button', { name: /Deya/ }));
        await addService('Corte');
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar descuento' }));
        fireEvent.change(screen.getByLabelText('Descuento para Corte'), { target: { value: '30' } });
        fireEvent.change(screen.getByLabelText('Motivo del descuento'), { target: { value: 'Cliente frecuente' } });
        fireEvent.change(screen.getByLabelText('Quién autoriza el descuento'), { target: { value: 'u-alonso' } });
        const cobrar = screen.getByRole('button', { name: 'Cobrar $170' });
        await waitFor(() => expect(cobrar).toBeEnabled());
        fireEvent.click(cobrar);
        return within(await screen.findByTestId('pin-confirm'));
    };

    it('pide el PIN de quien autoriza antes de enviar y manda la venta con ese PIN', async () => {
        const api = mockApi({ authorizers: [{ user_id: 'u-alonso', name: 'Alonso' }] });
        const dialog = await withDiscount();
        expect(api.salesBodies).toHaveLength(0);
        expect(dialog.getByText('Alonso confirma el descuento con su PIN. Queda en la bitácora.')).toBeInTheDocument();
        const pin = dialog.getByLabelText('PIN de Alonso (6 números)');
        expect(pin).toHaveAttribute('type', 'password');
        fireEvent.change(pin, { target: { value: '482913' } });
        fireEvent.click(dialog.getByRole('button', { name: /Autorizar y cobrar/ }));
        await waitFor(() => expect(api.salesBodies).toHaveLength(1));
        expect(api.salesBodies[0]).toMatchObject({ discount_reason: 'Cliente frecuente', discount_authorized_by: 'u-alonso', discount_pin: '482913' });
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).not.toBeInTheDocument());
    });

    it('si el PIN es incorrecto la ventana se queda abierta con el mensaje y se puede reintentar', async () => {
        const api = mockApi({
            authorizers: [{ user_id: 'u-alonso', name: 'Alonso' }],
            salesSeq: [{ status: 400, body: { error: 'El PIN de quien autoriza no es correcto.', pin_error: true } }, { status: 201, body: { sale_id: 's9' } }],
        });
        const dialog = await withDiscount();
        fireEvent.change(dialog.getByLabelText('PIN de Alonso (6 números)'), { target: { value: '000001' } });
        fireEvent.click(dialog.getByRole('button', { name: /Autorizar y cobrar/ }));
        expect(await dialog.findByRole('alert')).toHaveTextContent('El PIN de quien autoriza no es correcto.');
        expect(dialog.getByLabelText('PIN de Alonso (6 números)')).toHaveValue('');
        fireEvent.change(dialog.getByLabelText('PIN de Alonso (6 números)'), { target: { value: '482913' } });
        fireEvent.click(dialog.getByRole('button', { name: /Autorizar y cobrar/ }));
        await waitFor(() => expect(api.salesBodies).toHaveLength(2));
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).not.toBeInTheDocument());
        // Misma venta: el reintento conserva la clave de idempotencia.
        expect((api.salesBodies[0] as { idempotency_key: string }).idempotency_key).toBe((api.salesBodies[1] as { idempotency_key: string }).idempotency_key);
    });

    it('cancelar la ventana no registra la venta', async () => {
        const api = mockApi({ authorizers: [{ user_id: 'u-alonso', name: 'Alonso' }] });
        const dialog = await withDiscount();
        fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).not.toBeInTheDocument());
        expect(api.salesBodies).toHaveLength(0);
    });
});

describe('cobro: citas abiertas del barbero (B3)', () => {
    const APT = {
        id: 'a1', client_id: null, barber_id: 'b1', client_name: 'Luis', customer_phone: null, barber: { id: 'b1', name: 'Deya' },
        scheduled_at: '2026-11-20T19:00:00Z', end_at: '2026-11-20T19:30:00Z', duration_minutes: 30, status: 'checked_in',
        notes: null, created_at: '2026-11-20T10:00:00Z', walk_in: false, online: false, sale: null,
    };

    it('al elegir barbero ofrece su cita y, al elegirla, la venta queda ligada a ella', async () => {
        const api = mockApi({ openAppointments: [APT] });
        render(<POS />);
        await addService('Corte');
        fireEvent.click(await screen.findByRole('button', { name: /Deya/ }));
        const box = await screen.findByTestId('pos-open-appointments');
        expect(box).toHaveTextContent('Deya tiene una cita abierta hoy.');
        fireEvent.click(within(box).getByRole('button', { name: /^Es la cita de Luis a las/ }));
        expect(await screen.findByTestId('pos-appointment')).toHaveTextContent('Cobrando la cita de Luis');
        expect(screen.queryByTestId('pos-open-appointments')).not.toBeInTheDocument();
        const cobrar = await screen.findByRole('button', { name: 'Cobrar $200' });
        await waitFor(() => expect(cobrar).toBeEnabled());
        fireEvent.click(cobrar);
        await waitFor(() => expect(api.salesBodies).toHaveLength(1));
        expect(api.salesBodies[0]).toMatchObject({ appointment_id: 'a1' });
    });

    it('"Es sin cita" quita el aviso y cobra sin cita', async () => {
        const api = mockApi({ openAppointments: [APT] });
        render(<POS />);
        await addService('Corte');
        fireEvent.click(await screen.findByRole('button', { name: /Deya/ }));
        const box = await screen.findByTestId('pos-open-appointments');
        fireEvent.click(within(box).getByRole('button', { name: 'Es sin cita' }));
        expect(screen.queryByTestId('pos-open-appointments')).not.toBeInTheDocument();
        const cobrar = await screen.findByRole('button', { name: 'Cobrar $200' });
        await waitFor(() => expect(cobrar).toBeEnabled());
        fireEvent.click(cobrar);
        await waitFor(() => expect(api.salesBodies).toHaveLength(1));
        expect(api.salesBodies[0]).toMatchObject({ appointment_id: null });
    });

    it('sin citas abiertas no muestra nada', async () => {
        mockApi({ openAppointments: [] });
        render(<POS />);
        fireEvent.click(await screen.findByRole('button', { name: /Deya/ }));
        await waitFor(() => expect(screen.getByRole('button', { name: /Deya/ })).toHaveAttribute('aria-pressed', 'true'));
        expect(screen.queryByTestId('pos-open-appointments')).not.toBeInTheDocument();
    });
});

describe('cobro desde la agenda: productos de la cita con su vendedor', () => {
    const PRODUCTS = [{ id: 'p1', name: 'Prueba cera', price: 160, stock: 4, sku: '', category: '', min_stock: 0, cost: 0, status: 'ok', created_at: '', updated_at: '' }];
    const APT = {
        id: 'a1', client_id: null, barber_id: 'b1', client_name: 'Luis', customer_phone: null, barber: { id: 'b1', name: 'Deya' },
        scheduled_at: '2026-11-20T19:00:00Z', end_at: '2026-11-20T19:30:00Z', duration_minutes: 30, status: 'checked_in',
        notes: null, created_at: '2026-11-20T10:00:00Z', walk_in: false, online: false, sale: null,
        services: [{ service_id: 'sv1', name: 'Corte', price: 200, duration_minutes: 30 }],
        products: {
            barber: { id: 'b1', name: 'Deya' }, session_employee: { id: 'e-dago', name: 'Dago' }, open: true, can_edit: true, can_choose_seller: true,
            lines: [{ id: 'l1', appointment_id: 'a1', product_id: 'p1', name: 'Prueba cera', quantity: 2, unit_price: 150, product_active: true,
                tracks_inventory: true, stock: 4, short_stock: false, seller_employee_id: 'e-dago', seller_name: 'Dago', added_by: 'u-dago',
                added_by_name: 'Dago', added_at: '2026-11-20T15:00:00Z', updated_at: null }],
        },
    };

    it('precarga servicio y producto; la partida de producto se cobra a nombre de su vendedor', async () => {
        window.history.replaceState(null, '', '/pos?cita=a1');
        const api = mockApi({ appointment: APT, products: PRODUCTS });
        render(<POS />);
        expect(await screen.findByTestId('pos-appointment')).toHaveTextContent('Cobrando la cita de Luis');
        // 200 del corte + 2 × 160 (precio vigente del catálogo, no el de la cita).
        const cobrar = await screen.findByRole('button', { name: 'Cobrar $520' });
        await waitFor(() => expect(cobrar).toBeEnabled());
        fireEvent.click(cobrar);
        await waitFor(() => expect(api.salesBodies).toHaveLength(1));
        const body = api.salesBodies[0] as { appointment_id: string; items: Record<string, unknown>[] };
        expect(body.appointment_id).toBe('a1');
        expect(body.items).toEqual([
            expect.objectContaining({ item_type: 'service', catalog_id: 'sv1', employee_id: 'b1' }),
            expect.objectContaining({ item_type: 'product', catalog_id: 'p1', quantity: 2, commission_employee_ids: ['e-dago'] }),
        ]);
    });

    it('cada producto precargado muestra a quién se apunta ("Vendido por Dago") y no pide un vendedor general', async () => {
        window.history.replaceState(null, '', '/pos?cita=a1');
        mockApi({ appointment: APT, products: PRODUCTS });
        render(<POS />);
        expect(await screen.findByTestId('pos-line-seller')).toHaveTextContent('Vendido por Dago');
        expect(screen.queryByLabelText('Vendió el producto')).not.toBeInTheDocument();
        expect(screen.getByText('Cada producto se apunta a quien lo vendió en la cita.')).toBeInTheDocument();
        expect(screen.queryByTestId('pos-preload-skipped')).not.toBeInTheDocument();
    });

    it('avisa qué producto no se pudo cargar y cuál se cargó con menos piezas, y por qué', async () => {
        window.history.replaceState(null, '', '/pos?cita=a1');
        const lines = [
            { ...APT.products.lines[0], quantity: 3 },
            { ...APT.products.lines[0], id: 'l2', product_id: 'p2', name: 'Prueba pomada', seller_employee_id: 'b1', seller_name: 'Deya', quantity: 1 },
        ];
        const products = [{ ...PRODUCTS[0], stock: 1 }, { ...PRODUCTS[0], id: 'p2', name: 'Prueba pomada', stock: 0 }];
        mockApi({ appointment: { ...APT, products: { ...APT.products, lines } }, products });
        render(<POS />);
        const warning = await screen.findByTestId('pos-preload-skipped');
        expect(warning).toHaveTextContent('«Prueba cera» se cargó con menos piezas de las que pidió la cita, porque no hay suficientes en existencia.');
        expect(warning).toHaveTextContent('«Prueba pomada» no tiene existencias, así que no se cargó al cobro.');
        expect(warning).toHaveAttribute('role', 'alert');
    });
});
