import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import POS from './POS';
import { parseFreePrice } from '@/hooks/usePOS';

const BARBERS = [{ id: 'b1', name: 'Deya', is_active: true }];
const SERVICES = [
    { id: 'sv1', name: 'Corte', price: 200, duration_minutes: 30, is_active: true, variable_price: false },
    { id: 'sv2', name: 'Greca', price: 0, duration_minutes: 45, is_active: true, variable_price: true },
];

interface Mock { cash: unknown; cashStatus?: number; sales?: { status: number; body: unknown }; salesBodies: unknown[] }

function mockApi(opts: Partial<Mock> = {}) {
    const state: Mock = { cash: { id: 'x' }, salesBodies: [], ...opts };
    const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (url.includes('/api/cash/session')) return json(state.cash, state.cashStatus ?? 200);
        if (url.includes('/api/auth/me')) return json({ authenticated: true, user: { id: 'u1', role: 'recepcion' } });
        if (url.includes('/api/barbers?scope=team')) return json(BARBERS);
        if (url.includes('/api/barbers')) return json(BARBERS);
        if (url.includes('/api/services')) return json(SERVICES);
        if (url.includes('/api/discount-authorizers')) return json({ authorizers: [], current_user_id: 'u1' });
        if (url.includes('/api/sales')) {
            state.salesBodies.push(JSON.parse(String(init?.body)));
            const r = state.sales ?? { status: 200, body: { sale_id: 's1' } };
            return json(r.body, r.status);
        }
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
