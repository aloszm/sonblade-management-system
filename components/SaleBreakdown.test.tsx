import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import SaleBreakdownBlock from '@/components/SaleBreakdown';
import TicketPage from '@/app/ticket/[id]/page';
import { buildSaleBreakdown, type BreakdownInput } from '@/lib/sales/breakdown';

const params = { id: 's1' };
vi.mock('next/navigation', () => ({
    useParams: () => params,
    usePathname: () => '/',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

type Reply = { status?: number; body: unknown };
function stub(handler: (url: string) => Reply) {
    const fn = vi.fn(async (url: string) => {
        const r = handler(String(url));
        const status = r.status ?? 200;
        return { ok: status < 400, status, json: async () => r.body };
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

const NAMES = { sonia: 'Sonia Martínez', dani: 'Dani Pérez' };
function input(over: Partial<BreakdownInput> = {}): BreakdownInput {
    return {
        sale: { id: 's1', folio: 'V2611-0177', status: 'paid', subtotal_amount: 330, discount_amount: 0, total_amount: 330 },
        items: [
            { id: 'i1', item_type: 'service', item_name_snapshot: 'Corte adulto', quantity: 1, unit_price: 150, discount_amount: 0, line_total: 150, employee_id: 'sonia', commission_employee_id: null },
            { id: 'i2', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Pomada Negra', quantity: 1, unit_price: 180, discount_amount: 0, line_total: 180, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: 45 },
        ],
        commissions: [
            { sale_item_id: 'i1', employee_id: 'sonia', basis: 'price_before_discount', basis_amount: 150, calculation_type: 'percentage', percentage_snapshot: 50, fixed_amount_snapshot: null, commission_amount: 75, status: 'generated' },
            { sale_item_id: 'i2', employee_id: 'dani', basis: 'price_after_discount', basis_amount: 180, calculation_type: 'percentage', percentage_snapshot: 20, fixed_amount_snapshot: null, commission_amount: 36, status: 'generated' },
        ],
        tips: [{ employee_id: 'sonia', amount: 30, method: 'cash', status: 'generated' }],
        payments: [{ method: 'cash', amount: 330, status: 'confirmed' }],
        names: NAMES,
        ...over,
    };
}
const full = (over?: Partial<BreakdownInput>) => buildSaleBreakdown(input(over), 'full');
const frontDesk = (over?: Partial<BreakdownInput>) => buildSaleBreakdown(input(over), 'front_desk');

describe('Desglose de la venta: contenido', () => {
    it('gerencia: una fila por partida, propina, resumen y "le queda a la barbería"', async () => {
        stub(() => ({ body: full() }));
        render(<SaleBreakdownBlock saleId="s1" />);
        expect(await screen.findAllByTestId('sale-breakdown-line')).toHaveLength(2);
        const [servicio, producto] = screen.getAllByTestId('sale-breakdown-line');
        expect(servicio).toHaveTextContent('Corte adulto');
        expect(servicio).toHaveTextContent('$150.00');
        expect(servicio).toHaveTextContent('50 %');
        expect(servicio).toHaveTextContent('Sonia');
        expect(servicio).toHaveTextContent('$75.00');
        expect(producto).toHaveTextContent('Dani');
        expect(producto).toHaveTextContent('20 %');
        expect(producto).toHaveTextContent('$36.00');
        const tip = screen.getByTestId('sale-breakdown-tip');
        expect(tip).toHaveTextContent('Propina');
        expect(tip).toHaveTextContent('100 %');
        expect(tip).toHaveTextContent('Sonia');
        const summary = screen.getByTestId('sale-breakdown-summary');
        expect(summary).toHaveTextContent('Total cobrado al cliente');
        expect(summary).toHaveTextContent('$360.00');
        expect(summary).toHaveTextContent('Efectivo $360.00');
        expect(summary).toHaveTextContent('Va al equipo');
        expect(summary).toHaveTextContent('$141.00');
        expect(summary).toHaveTextContent('Costo de producto');
        // 330 − 111 − 45
        expect(screen.getByTestId('sale-breakdown-keeps')).toHaveTextContent('$174.00');
        expect(summary).toHaveTextContent('No incluye sueldos ni gastos del periodo');
    });

    it('recepción: ve comisiones y propina, pero ni costo ni "le queda a la barbería"', async () => {
        stub(() => ({ body: frontDesk() }));
        render(<SaleBreakdownBlock saleId="s1" />);
        await screen.findAllByTestId('sale-breakdown-line');
        const summary = screen.getByTestId('sale-breakdown-summary');
        expect(summary).toHaveTextContent('Va al equipo');
        expect(summary).toHaveTextContent('$141.00');
        expect(summary).not.toHaveTextContent('Costo de producto');
        expect(summary).not.toHaveTextContent('Le queda a la barbería');
        expect(screen.queryByTestId('sale-breakdown-keeps')).toBeNull();
        expect(screen.getByTestId('sale-breakdown')).not.toHaveTextContent('$45.00');
    });

    it('producto con descuento en una venta nueva: la base es el precio de lista y la nota lo dice', async () => {
        stub(() => ({ body: full({
            items: [{ id: 'i1', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Pomada', quantity: 1, unit_price: 180, discount_amount: 20, line_total: 160, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: 45 }],
            commissions: [{ sale_item_id: 'i1', employee_id: 'dani', basis: 'price_before_discount', basis_amount: 180, calculation_type: 'percentage', percentage_snapshot: 20, fixed_amount_snapshot: null, commission_amount: 36, status: 'generated' }],
            tips: [], payments: [{ method: 'cash', amount: 160, status: 'confirmed' }],
        }) }));
        render(<SaleBreakdownBlock saleId="s1" />);
        const row = await screen.findByTestId('sale-breakdown-line');
        expect(row).toHaveTextContent('Base sin descuento');
        expect(row).toHaveTextContent('$180.00');
        expect(row).toHaveTextContent('$36.00');
    });

    it('venta anterior con base con descuento: se nota que la base no es el precio de lista y cuál fue', async () => {
        stub(() => ({ body: full({
            items: [{ id: 'i1', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Pomada', quantity: 1, unit_price: 180, discount_amount: 20, line_total: 160, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: 45 }],
            commissions: [{ sale_item_id: 'i1', employee_id: 'dani', basis: 'price_after_discount', basis_amount: 160, calculation_type: 'percentage', percentage_snapshot: 20, fixed_amount_snapshot: null, commission_amount: 32, status: 'generated' }],
            tips: [], payments: [{ method: 'cash', amount: 160, status: 'confirmed' }],
        }) }));
        render(<SaleBreakdownBlock saleId="s1" />);
        const row = await screen.findByTestId('sale-breakdown-line');
        expect(row).toHaveTextContent('$160.00');
        expect(row).toHaveTextContent('Base con descuento');
        expect(row).toHaveTextContent('$180.00');
    });

    it('comisión en espera: lo dice y no la muestra como $0', async () => {
        stub(() => ({ body: full({ commissions: [input().commissions[0]] }) }));
        render(<SaleBreakdownBlock saleId="s1" />);
        const rows = await screen.findAllByTestId('sale-breakdown-line');
        expect(rows[1]).toHaveTextContent('En espera');
        expect(rows[1]).toHaveTextContent('sin beneficiario');
        expect(rows[1]).not.toHaveTextContent('$0.00');
        expect(rows[1]).not.toHaveTextContent('Dani');
        expect(screen.getByTestId('sale-breakdown-partial')).toHaveTextContent('1 renglón');
    });

    it('sin comisiones generadas todavía: explica qué pasa', async () => {
        stub(() => ({ body: full({ commissions: [], tips: [] }) }));
        render(<SaleBreakdownBlock saleId="s1" />);
        expect(await screen.findByTestId('sale-breakdown-empty')).toHaveTextContent('todavía no tiene comisiones generadas');
        expect(screen.queryByTestId('sale-breakdown-summary')).toBeNull();
    });

    it('venta anulada: aviso claro, montos tachados y revertidos', async () => {
        const base = input();
        stub(() => ({ body: full({
            sale: { ...base.sale, status: 'refunded' },
            commissions: base.commissions.map((c) => ({ ...c, status: 'reversed' })),
            tips: base.tips.map((t) => ({ ...t, status: 'reversed' })),
            payments: base.payments.map((p) => ({ ...p, status: 'reversed' })),
        }) }));
        render(<SaleBreakdownBlock saleId="s1" />);
        expect(await screen.findByTestId('sale-breakdown-voided')).toHaveTextContent('las comisiones y la propina se revirtieron');
        const rows = screen.getAllByTestId('sale-breakdown-line');
        expect(within(rows[0]).getAllByText('Revertida').length).toBeGreaterThan(0);
        expect(within(rows[0]).getByText('$75.00')).toHaveClass('line-through');
        expect(screen.getByTestId('sale-breakdown-keeps')).toHaveClass('line-through');
        expect(screen.getByTestId('sale-breakdown-summary')).toHaveTextContent('Efecto neto de la venta anulada: $0.00');
    });
});

describe('Desglose de la venta: pantalla', () => {
    it('no sale al imprimir (clase print:hidden) y es independiente del ticket', async () => {
        stub(() => ({ body: full() }));
        render(<SaleBreakdownBlock saleId="s1" />);
        await screen.findAllByTestId('sale-breakdown-line');
        expect(screen.getByTestId('sale-breakdown')).toHaveClass('print:hidden');
    });

    it('en celular las filas son tarjetas: tabla bos-stack con etiqueta en cada celda', async () => {
        stub(() => ({ body: full() }));
        const { container } = render(<SaleBreakdownBlock saleId="s1" />);
        await screen.findAllByTestId('sale-breakdown-line');
        const table = container.querySelector('table.bos-stack');
        expect(table).not.toBeNull();
        const row = table!.querySelector('tbody tr')!;
        const labels = Array.from(row.querySelectorAll('td')).map((td) => td.getAttribute('data-label'));
        expect(labels).toEqual(['', 'Base', '%', 'Para quién', 'Comisión']);
        expect(table!.querySelector('thead')).not.toBeNull();
    });

    it('cargando: muestra un estado de carga', () => {
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
        render(<SaleBreakdownBlock saleId="s1" />);
        expect(screen.getByRole('status', { name: 'Cargando el desglose' })).toBeInTheDocument();
    });

    it('error: mensaje en español y Reintentar que vuelve a pedir', async () => {
        let calls = 0;
        stub(() => { calls++; return calls === 1 ? { status: 500, body: { error: 'x' } } : { body: full() }; });
        render(<SaleBreakdownBlock saleId="s1" />);
        expect(await screen.findByText('No se pudo cargar el desglose')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        await waitFor(() => expect(calls).toBe(2));
        expect(await screen.findAllByTestId('sale-breakdown-line')).toHaveLength(2);
    });

    it('una respuesta sin renglones se trata como error (nunca una tabla rota)', async () => {
        stub(() => ({ body: {} }));
        render(<SaleBreakdownBlock saleId="s1" />);
        expect(await screen.findByText('No se pudo cargar el desglose')).toBeInTheDocument();
    });

    it('sin permiso (403): lo explica, sin Reintentar inútil', async () => {
        stub(() => ({ status: 403, body: { error: 'No tienes permiso.' } }));
        render(<SaleBreakdownBlock saleId="s1" />);
        expect(await screen.findByText('No puedes ver el desglose')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull();
    });
});

describe('Ticket /ticket/[id] con desglose', () => {
    const TICKET = {
        id: 's1', folio: 'V2611-0177', created_at: '2026-11-15T20:57:00Z', cancelled: false, client_name: null, attended_by: ['Sonia'], cashier_name: 'Emi',
        lines: [{ name: 'Corte adulto', quantity: 1, unit_price: 150, discount: 0, total: 150 }],
        subtotal: 150, discount: 0, total: 150, tip: 0, grand_total: 150, payments: [{ method: 'cash', amount: 150 }],
        business: { name: 'Gallo 4:20', currency: 'MXN', timezone: 'America/Mexico_City' }, branch: { name: 'Centro', address: null, phone: null },
    };
    it('el desglose va debajo y FUERA del ticket del cliente (que es lo que se imprime)', async () => {
        stub((url) => (url.endsWith('/breakdown') ? { body: full() } : { body: TICKET }));
        render(<TicketPage />);
        const breakdown = await screen.findByTestId('sale-breakdown');
        const ticket = screen.getByTestId('ticket');
        expect(ticket.contains(breakdown)).toBe(false);
        expect(breakdown).toHaveClass('print:hidden');
        expect(ticket).not.toHaveTextContent('Desglose');
        // sigue en el documento después del ticket
        expect(ticket.compareDocumentPosition(breakdown) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    it('si el ticket no carga, no se pide el desglose', async () => {
        const fn = stub(() => ({ status: 404, body: { error: 'Venta no encontrada.' } }));
        render(<TicketPage />);
        expect(await screen.findByText('No encontramos este ticket')).toBeInTheDocument();
        expect(fn.mock.calls.some(([u]) => String(u).endsWith('/breakdown'))).toBe(false);
    });
});

describe('Ventas: el renglón abre el detalle', () => {
    it('el control se llama "Ver venta", muestra texto y enlaza al ticket', () => {
        const src = readFileSync(path.resolve(__dirname, '../app/ventas/historial/page.tsx'), 'utf8');
        expect(src).toMatch(/href=\{`\/ticket\/\$\{sale\.id\}`\}[\s\S]{0,400}Ver venta/);
        expect(src).not.toContain('aria-label="Ver ticket"');
    });
});
