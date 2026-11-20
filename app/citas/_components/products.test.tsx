import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AddProductModal, AppointmentProductsSection, productPieces, productsBadgeText } from './products';
import { LINE, PRODUCTS_OPEN, appointment } from './fixtures';
import { bodyOf, json, mockFetch, renderWithQuery } from './test-utils';

afterEach(() => vi.unstubAllGlobals());

const CATALOG = [
    { id: 'p1', name: 'Prueba cera', price: 160, stock: 4 },
    { id: 'p2', name: 'Prueba shampoo', price: 90, stock: 10 },
    { id: 'p3', name: 'Prueba agotado', price: 50, stock: 0 },
];
const SELLERS = [{ id: 'e-deya', name: 'Deya', is_barber: true }, { id: 'e-dago', name: 'Dago', is_barber: false }, { id: 'e-sonia', name: 'Sonia', is_barber: true }];

function api(extra: Parameters<typeof mockFetch>[0] = []) {
    return mockFetch([
        ...extra,
        [/\/api\/products$/, () => json(CATALOG)],
        [/\/api\/appointments\/a1\/products$/, (_u, init) => (init?.method === 'POST' ? json({ line: LINE }, 201) : json({ appointment_id: 'a1', ...PRODUCTS_OPEN, seller_options: SELLERS }))],
    ]);
}

const noop = () => undefined;
const section = (apt = appointment(), over: Partial<React.ComponentProps<typeof AppointmentProductsSection>> = {}) => render(
    <AppointmentProductsSection apt={apt} ownEmployeeId={null} showPrices busyLineId={null} error="" onAdd={noop} onRemove={noop} onSeller={noop} {...over} />);

describe('marca de productos en la agenda', () => {
    it('cuenta piezas y escribe "+2 productos"', () => {
        const apt = appointment({ products: { ...PRODUCTS_OPEN, lines: [LINE, { ...LINE, id: 'l2', quantity: 1 }] } });
        expect(productPieces(apt)).toBe(3);
        expect(productsBadgeText(3)).toBe('+3 productos');
        expect(productsBadgeText(1)).toBe('+1 producto');
        expect(productPieces(appointment())).toBe(0);
    });
});

describe('sección Productos del detalle de la cita', () => {
    it('cita abierta: lista nombre, cantidad, vendedor y precio de referencia, y ofrece Agregar producto', () => {
        const onAdd = vi.fn();
        section(appointment({ products: { ...PRODUCTS_OPEN, lines: [LINE] } }), { onAdd });
        const line = screen.getByTestId('product-line');
        expect(line).toHaveTextContent('Prueba cera × 2');
        expect(line).toHaveTextContent('Vende: Deya');
        expect(line).toHaveTextContent('Precio de referencia $150 c/u');
        fireEvent.click(screen.getByRole('button', { name: /Agregar producto/ }));
        expect(onAdd).toHaveBeenCalled();
    });

    it('avisa "Sin existencias suficientes" cuando la API marca short_stock', () => {
        section(appointment({ products: { ...PRODUCTS_OPEN, lines: [{ ...LINE, stock: 1, short_stock: true }] } }));
        expect(screen.getByTestId('product-short')).toHaveTextContent('Sin existencias suficientes');
    });

    it('recepción cambia el vendedor de una línea con los dos botones con nombre', () => {
        const onSeller = vi.fn();
        section(appointment({ products: { ...PRODUCTS_OPEN, lines: [LINE] } }), { onSeller });
        const group = screen.getByRole('group', { name: 'Cambiar quién vendió Prueba cera' });
        expect(within(group).getByRole('button', { name: 'Deya' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(group).getByRole('button', { name: 'Dago' }));
        expect(onSeller).toHaveBeenCalledWith(expect.anything(), LINE, 'e-dago');
    });

    it('quitar pide confirmar desde fuera (llama a onRemove con la línea)', () => {
        const onRemove = vi.fn();
        section(appointment({ products: { ...PRODUCTS_OPEN, lines: [LINE] } }), { onRemove });
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Prueba cera de la cita' }));
        expect(onRemove).toHaveBeenCalledWith(expect.anything(), LINE);
    });

    it('el barbero (no elige vendedor) no ve el cambio de vendedor y solo quita las líneas que son suyas', () => {
        const mine = { ...LINE, id: 'mine' };
        const other = { ...LINE, id: 'other', name: 'Prueba shampoo', seller_employee_id: 'e-dago', seller_name: 'Dago' };
        section(appointment({ products: { ...PRODUCTS_OPEN, can_choose_seller: false, session_employee: null, lines: [mine, other] } }), { ownEmployeeId: 'e-deya', showPrices: false });
        expect(screen.queryByRole('group', { name: /Cambiar quién vendió/ })).toBeNull();
        expect(screen.getByRole('button', { name: 'Quitar Prueba cera de la cita' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Quitar Prueba shampoo de la cita' })).toBeNull();
        // El barbero no ve importes.
        expect(screen.queryByText(/Precio de referencia/)).toBeNull();
    });

    it('cita cobrada, cancelada o "no vino": historial sin acciones', () => {
        section(appointment({ status: 'cancelled', products: { ...PRODUCTS_OPEN, open: false, lines: [{ ...LINE, short_stock: true }] } }));
        expect(screen.getByText('Productos (historial)')).toBeInTheDocument();
        expect(screen.getByTestId('product-line')).toHaveTextContent('Prueba cera');
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByTestId('product-short')).toBeNull();
    });

    it('cita cerrada sin productos: la sección no aparece; abierta sin productos: dice que no hay y deja agregar', () => {
        const { unmount } = section(appointment({ products: { ...PRODUCTS_OPEN, open: false, lines: [] } }));
        expect(screen.queryByTestId('appointment-products')).toBeNull();
        unmount();
        section(appointment());
        expect(screen.getByText('Todavía no hay productos en esta cita.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Agregar producto/ })).toBeInTheDocument();
    });

    it('sin permiso de editar (consulta): ve las líneas pero no hay botones', () => {
        section(appointment({ products: { ...PRODUCTS_OPEN, can_edit: false, can_choose_seller: false, lines: [LINE] } }));
        expect(screen.getByTestId('product-line')).toBeInTheDocument();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('muestra el error de una operación', () => {
        section(appointment(), { error: 'No se pudo quitar el producto.' });
        expect(screen.getByRole('alert')).toHaveTextContent('No se pudo quitar el producto.');
    });
});

describe('Agregar producto', () => {
    it('recepción ve ¿Quién lo vendió? con DOS botones con nombre (barbero y quien tiene la sesión), el barbero preseleccionado', async () => {
        const fetchMock = api();
        renderWithQuery(<AddProductModal apt={appointment()} canPickOther={false} showPrices onClose={noop} onAdded={noop} />);
        fireEvent.click(await screen.findByRole('button', { name: /Prueba cera/ }));
        const group = screen.getByRole('group', { name: '¿Quién lo vendió?' });
        const buttons = within(group).getAllByRole('button');
        expect(buttons.map((b) => b.textContent)).toEqual(['Deya', 'Dago']);
        expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
        expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByText('Otra persona')).toBeNull();
        expect(screen.queryByText('Yo')).toBeNull();
        fireEvent.click(buttons[1]);
        fireEvent.click(screen.getByRole('button', { name: 'Agregar una pieza' }));
        fireEvent.click(screen.getByTestId('add-product-confirm'));
        await waitFor(() => expect(bodyOf(fetchMock, '/api/appointments/a1/products', 'POST')).toBeDefined());
        expect(bodyOf(fetchMock, '/api/appointments/a1/products', 'POST')).toEqual({ product_id: 'p1', quantity: 2, seller_employee_id: 'e-dago' });
    });

    it('si quien tiene la sesión es el mismo barbero o no es empleado, queda un solo botón', async () => {
        api();
        const products = { ...PRODUCTS_OPEN, session_employee: null };
        renderWithQuery(<AddProductModal apt={appointment({ products })} canPickOther={false} showPrices onClose={noop} onAdded={noop} />);
        fireEvent.click(await screen.findByRole('button', { name: /Prueba shampoo/ }));
        const group = screen.getByRole('group', { name: '¿Quién lo vendió?' });
        expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Deya']);
    });

    it('gerencia y cuenta principal tienen "Otra persona" como enlace con la lista de vendedores', async () => {
        const fetchMock = api();
        renderWithQuery(<AddProductModal apt={appointment()} canPickOther showPrices onClose={noop} onAdded={noop} />);
        fireEvent.click(await screen.findByRole('button', { name: /Prueba cera/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Otra persona' }));
        const select = await screen.findByLabelText('Otra persona');
        await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(4));
        fireEvent.change(select, { target: { value: 'e-sonia' } });
        fireEvent.click(screen.getByTestId('add-product-confirm'));
        await waitFor(() => expect(bodyOf(fetchMock, '/api/appointments/a1/products', 'POST')).toMatchObject({ seller_employee_id: 'e-sonia' }));
    });

    it('el barbero no elige: dice "Se apunta a tu nombre" y no manda vendedor', async () => {
        const fetchMock = api();
        const products = { ...PRODUCTS_OPEN, can_choose_seller: false, session_employee: null };
        const onAdded = vi.fn();
        renderWithQuery(<AddProductModal apt={appointment({ products })} canPickOther={false} showPrices={false} onClose={noop} onAdded={onAdded} />);
        fireEvent.click(await screen.findByRole('button', { name: /Prueba cera/ }));
        expect(screen.getByTestId('seller-self')).toHaveTextContent('Se apunta a tu nombre');
        expect(screen.queryByRole('group', { name: '¿Quién lo vendió?' })).toBeNull();
        fireEvent.click(screen.getByTestId('add-product-confirm'));
        await waitFor(() => expect(onAdded).toHaveBeenCalled());
        expect(bodyOf(fetchMock, '/api/appointments/a1/products', 'POST')).toEqual({ product_id: 'p1', quantity: 1 });
    });

    it('buscador, producto agotado deshabilitado y cantidad limitada a las existencias', async () => {
        api();
        renderWithQuery(<AddProductModal apt={appointment()} canPickOther={false} showPrices onClose={noop} onAdded={noop} />);
        expect(await screen.findByRole('button', { name: /Prueba agotado/ })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'shamp' } });
        expect(screen.queryByRole('button', { name: /Prueba cera/ })).toBeNull();
        fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'cera' } });
        fireEvent.click(screen.getByRole('button', { name: /Prueba cera/ }));
        const plus = screen.getByRole('button', { name: 'Agregar una pieza' });
        for (let i = 0; i < 6; i += 1) fireEvent.click(plus);
        expect(screen.getByTestId('product-qty')).toHaveTextContent('4');
        expect(plus).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'xyz' } });
        expect(screen.getByText('Ningún producto se llama así.')).toBeInTheDocument();
    });

    it('sin producto elegido no deja agregar; si el servidor rechaza, lo dice y no cierra', async () => {
        api([[/\/api\/appointments\/a1\/products$/, (_u, init) => (init?.method === 'POST' ? json({ error: 'Ese producto ya no está disponible.' }, 409) : json({ ...PRODUCTS_OPEN, seller_options: [] }))]]);
        const onAdded = vi.fn();
        renderWithQuery(<AddProductModal apt={appointment()} canPickOther={false} showPrices onClose={noop} onAdded={onAdded} />);
        expect(screen.getByTestId('add-product-confirm')).toBeDisabled();
        fireEvent.click(await screen.findByRole('button', { name: /Prueba cera/ }));
        fireEvent.click(screen.getByTestId('add-product-confirm'));
        expect(await screen.findByRole('alert')).toHaveTextContent('Ese producto ya no está disponible.');
        expect(onAdded).not.toHaveBeenCalled();
    });

    it('catálogo vacío y error de carga', async () => {
        mockFetch([[/\/api\/products$/, () => json([])]]);
        const { unmount } = renderWithQuery(<AddProductModal apt={appointment()} canPickOther={false} showPrices onClose={noop} onAdded={noop} />);
        expect(await screen.findByText('Todavía no hay productos en el catálogo.')).toBeInTheDocument();
        unmount();
        mockFetch([[/\/api\/products$/, () => json({ error: 'x' }, 500)]]);
        renderWithQuery(<AddProductModal apt={appointment()} canPickOther={false} showPrices onClose={noop} onAdded={noop} />);
        expect(await screen.findByText(/Hubo un problema en el servidor/)).toBeInTheDocument();
    });
});
