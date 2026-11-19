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

function mockApi(user: Record<string, unknown>, opts: { receive?: { status: number; body: unknown } } = {}) {
    const bodies: unknown[] = [];
    let stock = PRODUCT.stock;
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
        if (url.includes('/api/products/stats')) return json({ total: 1, lowStock: 0, outOfStock: 0, totalValue: 720 });
        if (url.includes('/api/products')) {
            const product = user.role === 'recepcion' ? { ...PRODUCT, stock } : { ...PRODUCT, stock, cost: 80 };
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
