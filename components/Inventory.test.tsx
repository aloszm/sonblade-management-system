import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// useSupabase está simulado globalmente (devuelve null); aquí carga de verdad con el fetch simulado.
vi.mock('@/hooks/useSupabase', () => ({
    useSupabase: <T,>(fn: () => Promise<T>) => {
        const [data, setData] = React.useState<T | null>(null);
        const [tick, setTick] = React.useState(0);
        React.useEffect(() => { fn().then(setData).catch(() => undefined); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
        return { data, loading: data === null, error: null, refetch: () => setTick((t) => t + 1) };
    },
}));

import Inventory from './Inventory';

const PRODUCT = { id: 'p1', name: 'Cera mate', sku: 'CER-1', category: 'Ceras', stock: 4, min_stock: 2, price: 180, status: 'ok', created_at: '', updated_at: '' };

const productPosts: unknown[] = [];
const productPatches: { url: string; body: Record<string, unknown> }[] = [];

function mockApi(user: Record<string, unknown>, opts: { receive?: { status: number; body: unknown }; cost?: number; product?: Record<string, unknown>; stats?: Record<string, unknown> } = {}) {
    const bodies: unknown[] = [];
    productPosts.length = 0;
    productPatches.length = 0;
    const base = { ...PRODUCT, ...(opts.product ?? {}) };
    let stock = base.stock as number;
    const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes('/api/auth/me')) return json({ authenticated: true, user });
        if (url.includes('/receive')) {
            bodies.push(JSON.parse(String(init?.body)));
            const r = opts.receive ?? { status: 200, body: { product_id: 'p1', received: 6, stock: stock + 6 } };
            if (r.status === 200) stock += 6;
            return json(r.body, r.status);
        }
        if (url.includes('/api/products/stats')) return json({ total: 1, lowStock: 0, outOfStock: 0, totalValue: 720, ...(opts.stats ?? {}) });
        if (url.includes('/api/products') && init?.method === 'PATCH') {
            productPatches.push({ url, body: JSON.parse(String(init.body)) });
            return json({ id: 'p1' });
        }
        if (url.includes('/api/products') && init?.method === 'POST') {
            productPosts.push(JSON.parse(String(init.body)));
            return json({ id: 'p2' }, 201);
        }
        if (url.includes('/api/products')) {
            // A recepción la API no le manda el costo (ni el campo).
            const product = user.role === 'recepcion' ? { ...base, stock } : { ...base, stock, cost: opts.cost ?? 80 };
            return json([product]);
        }
        return json([]);
    }));
    return bodies;
}

afterEach(() => vi.unstubAllGlobals());

const RECEPTION = { id: 'u-emi', name: 'Emi', role: 'recepcion', readOnly: false };
const MANAGER = { id: 'u-sonia', name: 'Sonia', role: 'admin', readOnly: false };
const VIEWER = { id: 'u-lucia', name: 'Lucía', role: 'admin', readOnly: true };

describe('Inventario para recepción', () => {
    it('ve "Registrar entrada" y no ve costo, editar, dar de baja ni agregar producto', async () => {
        mockApi(RECEPTION);
        render(<Inventory />);
        expect(await screen.findByRole('button', { name: 'Registrar entrada de Cera mate' })).toBeInTheDocument();
        expect(screen.queryByText('Costo:')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Editar Cera mate' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Dar de baja Cera mate' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Agregar producto/ })).toBeNull();
    });

    it('pide cantidad y comentario, después su PIN, y suma la entrada', async () => {
        const bodies = mockApi(RECEPTION);
        render(<Inventory />);
        fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrada de Cera mate' }));
        const dialog = await screen.findByTestId('receive-stock');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
        expect(await within(dialog).findByText('Escribe cuántas piezas llegaron (al menos 1).')).toBeInTheDocument();
        expect(within(dialog).getByText('Escribe un comentario de la entrada (de 3 a 300 letras).')).toBeInTheDocument();

        fireEvent.change(within(dialog).getByLabelText('¿Cuántas piezas llegaron?'), { target: { value: '501' } });
        fireEvent.change(within(dialog).getByLabelText('Comentario'), { target: { value: 'Llegó pedido' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
        expect(await within(dialog).findByText(/no puede pasar de 500 piezas/)).toBeInTheDocument();

        fireEvent.change(within(dialog).getByLabelText('¿Cuántas piezas llegaron?'), { target: { value: '6' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
        const pinDialog = await screen.findByTestId('pin-confirm');
        expect(within(pinDialog).getByText(/Entrada de 6/)).toBeInTheDocument();
        expect(within(pinDialog).getByText('Llegó pedido')).toBeInTheDocument();
        fireEvent.change(within(pinDialog).getByLabelText(/Tu PIN/), { target: { value: '482913' } });
        fireEvent.click(within(pinDialog).getByRole('button', { name: /Registrar con PIN/ }));

        expect(await screen.findByText('Entrada registrada: 6 de Cera mate. Ahora hay 10.')).toBeInTheDocument();
        expect(bodies).toEqual([{ quantity: 6, comment: 'Llegó pedido', pin: '482913' }]);
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());
    });

    it('si el PIN es incorrecto lo dice y no cierra', async () => {
        mockApi(RECEPTION, { receive: { status: 400, body: { error: 'El PIN no es correcto.', pin_error: true } } });
        render(<Inventory />);
        fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrada de Cera mate' }));
        const dialog = await screen.findByTestId('receive-stock');
        fireEvent.change(within(dialog).getByLabelText('¿Cuántas piezas llegaron?'), { target: { value: '2' } });
        fireEvent.change(within(dialog).getByLabelText('Comentario'), { target: { value: 'Pedido' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Continuar' }));
        const pinDialog = await screen.findByTestId('pin-confirm');
        fireEvent.change(within(pinDialog).getByLabelText(/Tu PIN/), { target: { value: '111112' } });
        fireEvent.click(within(pinDialog).getByRole('button', { name: /Registrar con PIN/ }));
        expect(await within(pinDialog).findByRole('alert')).toHaveTextContent('El PIN no es correcto.');
        expect(screen.getByTestId('pin-confirm')).toBeInTheDocument();
    });
});

describe('Inventario para gerencia y consulta', () => {
    it('gerencia ve costo, editar, dar de baja y también "Registrar entrada"', async () => {
        mockApi(MANAGER);
        render(<Inventory />);
        expect(await screen.findByRole('button', { name: 'Editar Cera mate' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Registrar entrada de Cera mate' })).toBeInTheDocument();
        expect(screen.getByText('Costo:')).toBeInTheDocument();
    });
    it('consulta solo mira: sin entradas ni edición', async () => {
        mockApi(VIEWER);
        render(<Inventory />);
        expect(await screen.findByText('Cera mate')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('Costo:')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'Registrar entrada de Cera mate' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Editar Cera mate' })).toBeNull();
    });
});

describe('Costo obligatorio del producto', () => {
    it('gerencia: aviso de productos sin costo con acceso directo a capturarlo', async () => {
        mockApi(MANAGER, { cost: 0 });
        render(<Inventory />);
        const alert = await screen.findByTestId('inventory-missing-cost');
        expect(alert).toHaveTextContent('1 producto sin costo: la utilidad no es confiable hasta capturarlo.');
        expect(alert).toHaveTextContent('Cera mate');
        fireEvent.click(within(alert).getByRole('button', { name: 'Capturar costo' }));
        expect(await screen.findByRole('heading', { name: 'Editar producto' })).toBeInTheDocument();
        expect(screen.getByLabelText('Precio costo *')).toHaveValue(null);
        expect(screen.getByText('Lo que te cuesta a ti cada pieza; se usa para calcular la utilidad.')).toBeInTheDocument();
    });
    it('consulta ve el aviso pero no el botón de capturar', async () => {
        mockApi(VIEWER, { cost: 0 });
        render(<Inventory />);
        const alert = await screen.findByTestId('inventory-missing-cost');
        expect(within(alert).queryByRole('button', { name: /Capturar costo/ })).toBeNull();
        expect(within(alert).getByRole('button', { name: 'Ver cuáles' })).toBeInTheDocument();
    });
    it('recepción no ve nada del costo ni el aviso', async () => {
        mockApi(RECEPTION, { cost: 0 });
        render(<Inventory />);
        expect(await screen.findByRole('button', { name: 'Registrar entrada de Cera mate' })).toBeInTheDocument();
        expect(screen.queryByTestId('inventory-missing-cost')).toBeNull();
        expect(screen.queryByText(/sin costo/i)).toBeNull();
    });
    it('con todos los costos capturados no hay aviso', async () => {
        mockApi(MANAGER);
        render(<Inventory />);
        expect(await screen.findByRole('button', { name: 'Editar Cera mate' })).toBeInTheDocument();
        expect(screen.queryByTestId('inventory-missing-cost')).toBeNull();
    });
    it('alta: sin costo no se manda; con costo sí', async () => {
        mockApi(MANAGER);
        render(<Inventory />);
        fireEvent.click(await screen.findByRole('button', { name: /Agregar producto/ }));
        fireEvent.change(screen.getByLabelText('Nombre del producto *'), { target: { value: 'Pomada nueva' } });
        fireEvent.change(screen.getByLabelText('Código o SKU (opcional)'), { target: { value: 'POM-9' } });
        fireEvent.change(screen.getByLabelText('Precio venta *'), { target: { value: '200' } });
        fireEvent.click(screen.getByRole('button', { name: /Guardar producto/ }));
        expect(await screen.findByText('Captura el costo del producto antes de activarlo.')).toBeInTheDocument();
        expect(productPosts).toHaveLength(0);

        fireEvent.change(screen.getByLabelText('Precio costo *'), { target: { value: '85.5' } });
        expect(screen.queryByText('Captura el costo del producto antes de activarlo.')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Guardar producto/ }));
        await waitFor(() => expect(productPosts).toHaveLength(1));
        expect(productPosts[0]).toMatchObject({ name: 'Pomada nueva', sku: 'POM-9', cost: 85.5, price: 200 });
    });
});

// Auditoría del 21 nov 2026: ningún producto real se podía editar (el SKU era obligatorio y todos lo tienen vacío),
// el formulario abría en «Ceras» aunque el producto fuera «General», pedía fechas que no se guardan en ningún lado,
// y la lista mostraba «SKU:» vacío, «100% capacidad» y un «Valor del inventario» sin decir que es a precio de venta.
describe('Editar un producto real (sin código, categoría General)', () => {
    const REAL = { name: 'Peine de textura', sku: '', category: 'General', stock: 54, min_stock: 5, price: 80 };

    it('cambiar el precio se guarda sin pedir código, y manda la categoría real', async () => {
        mockApi(MANAGER, { product: REAL, cost: 27 });
        render(<Inventory />);
        fireEvent.click(await screen.findByRole('button', { name: 'Editar Peine de textura' }));
        expect(await screen.findByRole('heading', { name: 'Editar producto' })).toBeInTheDocument();
        // El código ya no es obligatorio y la categoría es la del producto, no la primera de la lista.
        expect(screen.getByLabelText('Código o SKU (opcional)')).toHaveValue('');
        expect(screen.getByLabelText('Código o SKU (opcional)')).not.toBeRequired();
        expect(screen.getByLabelText('Categoría')).toHaveValue('General');
        expect(screen.getByLabelText('Existencias')).toHaveValue(54);
        // Las fechas no se guardaban en ningún lado: ya no se piden.
        expect(screen.queryByText('Fechas')).toBeNull();
        expect(screen.queryByLabelText(/Fecha de ingreso|Fecha de egreso/)).toBeNull();

        fireEvent.change(screen.getByLabelText('Precio venta *'), { target: { value: '85' } });
        fireEvent.click(screen.getByRole('button', { name: /Guardar producto/ }));
        await waitFor(() => expect(productPatches).toHaveLength(1));
        expect(productPatches[0].url).toContain('/api/products/p1');
        expect(productPatches[0].body).toMatchObject({ name: 'Peine de textura', sku: '', category: 'General', price: 85, cost: 27, stock: 54, min_stock: 5 });
        expect(productPatches[0].body).not.toHaveProperty('entry_date');
        expect(productPatches[0].body).not.toHaveProperty('exit_date');
        await waitFor(() => expect(screen.queryByRole('heading', { name: 'Editar producto' })).toBeNull());
    });

    it('una categoría guardada que no está en la lista sugerida se conserva al abrir', async () => {
        mockApi(MANAGER, { product: { ...REAL, category: 'Fijación media' } });
        render(<Inventory />);
        fireEvent.click(await screen.findByRole('button', { name: 'Editar Peine de textura' }));
        const select = await screen.findByLabelText('Categoría');
        expect(select).toHaveValue('Fijación media');
        expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['General', 'Ceras', 'Pomadas', 'Geles', 'Shampoos', 'Aceites', 'Accesorios', 'Fijación media']);
    });

    it('los avisos del formulario son propios y en español (no el globo del navegador)', async () => {
        mockApi(MANAGER, { product: REAL, cost: 27 });
        const { container } = render(<Inventory />);
        fireEvent.click(await screen.findByRole('button', { name: /Agregar producto/ }));
        expect(container.ownerDocument.querySelector('form')).toHaveAttribute('novalidate');
        expect(screen.getByLabelText('Categoría')).toHaveValue('General');
        fireEvent.change(screen.getByLabelText('Código o SKU (opcional)'), { target: { value: 'A' } });
        fireEvent.change(screen.getByLabelText('Precio venta *'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /Guardar producto/ }));
        expect(await screen.findByText('Escribe el nombre del producto (al menos 2 letras).')).toBeInTheDocument();
        expect(screen.getByText('El código debe tener al menos 2 caracteres, o déjalo vacío.')).toBeInTheDocument();
        expect(screen.getByText('Escribe el precio de venta (en pesos).')).toBeInTheDocument();
        expect(productPosts).toHaveLength(0);
        // Al corregir un campo se quita su aviso.
        fireEvent.change(screen.getByLabelText('Nombre del producto *'), { target: { value: 'Polvo nuevo' } });
        expect(screen.queryByText('Escribe el nombre del producto (al menos 2 letras).')).toBeNull();
    });

    it('alta sin código: se manda con el código vacío', async () => {
        mockApi(MANAGER);
        render(<Inventory />);
        fireEvent.click(await screen.findByRole('button', { name: /Agregar producto/ }));
        fireEvent.change(screen.getByLabelText('Nombre del producto *'), { target: { value: '  Polvo nuevo ' } });
        fireEvent.change(screen.getByLabelText('Precio venta *'), { target: { value: '200' } });
        fireEvent.change(screen.getByLabelText('Precio costo *'), { target: { value: '100' } });
        fireEvent.click(screen.getByRole('button', { name: /Guardar producto/ }));
        await waitFor(() => expect(productPosts).toHaveLength(1));
        expect(productPosts[0]).toMatchObject({ name: 'Polvo nuevo', sku: '', category: 'General', cost: 100, price: 200 });
    });
});

describe('Lista de inventario: sin datos que no dicen nada', () => {
    it('un producto sin código no muestra «SKU:» vacío; con código lo muestra', async () => {
        mockApi(MANAGER, { product: { sku: '' } });
        const first = render(<Inventory />);
        expect(await screen.findByText('Cera mate')).toBeInTheDocument();
        expect(screen.queryByText(/SKU:/)).toBeNull();
        expect(screen.queryByText(/Código:/)).toBeNull();
        first.unmount();
        mockApi(MANAGER);
        render(<Inventory />);
        expect(await screen.findByText('Código: CER-1')).toBeInTheDocument();
    });

    it('en vez de «100% capacidad» dice el mínimo del producto', async () => {
        mockApi(MANAGER);
        render(<Inventory />);
        expect(await screen.findByText('Mínimo: 2')).toBeInTheDocument();
        expect(screen.queryByText(/capacidad/)).toBeNull();
    });

    it('gerencia: el valor del inventario dice que es a precio de venta y muestra aparte el valor a costo', async () => {
        mockApi(MANAGER, { stats: { totalValue: 35280, totalCost: 12018 } });
        render(<Inventory />);
        const card = await screen.findByTestId('inventory-value');
        await waitFor(() => expect(card).toHaveTextContent('$35,280.00'));
        expect(card).toHaveTextContent('A precio de venta: lo que entraría si se vende todo.');
        expect(within(card).getByTestId('inventory-value-cost')).toHaveTextContent('A costo: $12,018.00');
    });

    it('recepción: solo el valor a precio de venta, rotulado; nada del costo', async () => {
        mockApi(RECEPTION, { stats: { totalValue: 35280 } });
        render(<Inventory />);
        const card = await screen.findByTestId('inventory-value');
        await waitFor(() => expect(card).toHaveTextContent('$35,280.00'));
        expect(card).toHaveTextContent('A precio de venta');
        expect(within(card).queryByTestId('inventory-value-cost')).toBeNull();
        expect(card).not.toHaveTextContent('A costo');
    });
});
