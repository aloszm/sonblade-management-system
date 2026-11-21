import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DaySummaryView from './DaySummaryView';
import DaySummaryButton from './DaySummaryModal';
import ResumenCajaPage from '@/app/caja/resumen/page';
import { buildDayCash, buildDaySummary, type DaySummaryPayload } from '@/lib/cash/day-summary';
import { buildWhatsAppText } from '@/lib/cash/day-summary-text';

// Los generadores de archivos se sustituyen aquí (su contenido se prueba en lib/cash/day-summary-files.test.ts).
const files = vi.hoisted(() => ({
    xlsx: vi.fn<(...a: unknown[]) => Promise<Uint8Array>>(),
    pdf: vi.fn<(...a: unknown[]) => Promise<Uint8Array>>(),
}));
vi.mock('@/lib/cash/day-summary-xlsx', () => ({ buildDaySummaryXlsx: (...a: unknown[]) => files.xlsx(...a) }));
vi.mock('@/lib/cash/day-summary-pdf', () => ({ buildDaySummaryPdf: (...a: unknown[]) => files.pdf(...a) }));

const build = (over: Partial<DaySummaryPayload> = {}, empty = false): DaySummaryPayload => {
    const summary = empty ? buildDaySummary({ date: '2026-11-20', sales: [], items: [], payments: [], tips: [], employees: [], cutServiceIds: [] }) : buildDaySummary({
        date: '2026-11-20',
        sales: [{ id: 'a', folio: 'V1', status: 'paid', total_amount: 350, paid_at: '2026-11-20T20:00:00Z' }, { id: 'b', folio: 'V2', status: 'paid', total_amount: 200, paid_at: '2026-11-20T21:00:00Z' }, { id: 'x', folio: 'V3', status: 'refunded', total_amount: 100, paid_at: '2026-11-20T22:00:00Z' }],
        items: [
            { sale_id: 'a', item_type: 'service', item_name_snapshot: 'Corte', service_id: 'c', quantity: 1, line_total: 200, employee_id: 'deya', commission_employee_id: null },
            { sale_id: 'a', item_type: 'product', item_name_snapshot: 'Cera', service_id: null, quantity: 1, line_total: 150, employee_id: 'deya', commission_employee_id: 'emi' },
            { sale_id: 'b', item_type: 'service', item_name_snapshot: 'Corte', service_id: 'c', quantity: 1, line_total: 200, employee_id: 'dani', commission_employee_id: null },
        ],
        payments: [{ sale_id: 'a', method: 'cash', amount: 350, status: 'confirmed' }, { sale_id: 'b', method: 'cash', amount: 50, status: 'confirmed' }, { sale_id: 'b', method: 'card', amount: 150, status: 'confirmed' }],
        tips: [{ sale_id: 'a', employee_id: 'deya', amount: 30, method: 'cash', status: 'generated' }],
        employees: [{ id: 'deya', display_name: 'Deya' }, { id: 'dani', display_name: 'Dani' }, { id: 'emi', display_name: 'Emi' }],
        cutServiceIds: ['c'],
    });
    const cash = buildDayCash(
        empty ? [] : [{ id: 's', status: 'closed', opening_cash: 500, counted_cash: 1000, difference_amount: 0, opened_by: 'u1', opened_at: '2026-11-20T15:00:00Z', closed_at: '2026-11-21T01:00:00Z', closed_by: 'u2', reserve_amount: 400 }],
        empty ? [] : [{ cash_session_id: 's', amount: 430, method: 'cash', movement_type: 'sale_payment', direction: 'in' }, { cash_session_id: 's', amount: 50, method: 'cash', movement_type: 'expense', direction: 'out', description: 'Agua' }, { cash_session_id: 's', amount: 120, method: 'cash', movement_type: 'deposit', direction: 'in', description: 'Cambio' }],
        new Map([['u1', 'Emi'], ['u2', 'Dago']]),
    );
    return { date: '2026-11-20', timezone: 'America/Mexico_City', businessName: 'Gallo 4:20', today: '2026-11-21', minDay: null, summary, cash, ...over };
};

let handler: (url: string) => { status: number; body: unknown };
const calls: string[] = [];
beforeEach(() => {
    calls.length = 0;
    handler = () => ({ status: 200, body: build() });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        calls.push(url);
        const r = handler(url);
        return { ok: r.status < 400, status: r.status, json: async () => r.body };
    }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const settled = async () => { await screen.findByTestId('ds-grand-total'); };

describe('Resumen del día (pantalla)', () => {
    it('encabezado con la fecha larga, total, reparto por tipo, formas de pago, personas y caja', async () => {
        render(<DaySummaryView initialDay="2026-11-20" />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Resumen de caja · viernes 20 de noviembre de 2026');
        await settled();
        expect(calls[0]).toBe('/api/cash/day-summary?date=2026-11-20');
        expect(screen.getByText('Ayer')).toBeInTheDocument();
        expect(screen.getByTestId('ds-grand-total')).toHaveTextContent('$580');
        expect(screen.getByTestId('ds-services')).toHaveTextContent('$400');
        expect(screen.getByTestId('ds-products')).toHaveTextContent('$150');
        expect(screen.getByTestId('ds-tips')).toHaveTextContent('$30');
        expect(screen.getByTestId('ds-income')).toHaveTextContent('$550');
        expect(screen.getByTestId('ds-voided')).toHaveTextContent('1 venta anulada ($100)');
        const methods = screen.getAllByTestId('ds-method').map((m) => m.textContent);
        expect(methods[0]).toContain('Efectivo');
        expect(methods[0]).toContain('$430');
        expect(methods[1]).toContain('Tarjeta');
        expect(methods[1]).toContain('$150');
        expect(methods[2]).toContain('Transferencia');
        const people = screen.getAllByTestId('ds-person').map((p) => p.textContent);
        expect(people).toHaveLength(3);
        expect(people[0]).toContain('Deya');
        const cash = screen.getByTestId('cash-session');
        expect(within(cash).getByText('Efectivo esperado')).toBeInTheDocument();
        expect(cash).toHaveTextContent('Abrió Emi');
        expect(cash).toHaveTextContent('Cerró Dago');
        expect(cash).toHaveTextContent('Gasto: Agua');
        expect(cash).toHaveTextContent('Entrada: Cambio');
        expect(cash).toHaveTextContent('Apartado al sobre');
    });

    it('la ventana y la página muestran LO MISMO (mismo componente, misma ruta de datos)', async () => {
        const page = render(<ResumenCajaPage />);
        await settled();
        const pageText = screen.getByTestId('day-summary').textContent;
        const pageCalls = [...calls];
        page.unmount();

        calls.length = 0;
        render(<DaySummaryButton variant="primary" />);
        fireEvent.click(screen.getByTestId('open-day-summary'));
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('Resumen del día');
        await settled();
        // Mismo contenido; solo cambia el nivel del encabezado.
        expect(within(dialog).getByTestId('day-summary').textContent).toBe(pageText);
        expect(calls.map((c) => c.replace(/date=.*/, 'date=X'))).toEqual(pageCalls.map((c) => c.replace(/date=.*/, 'date=X')));
        expect(within(dialog).getByRole('heading', { level: 2, name: /Resumen de caja/ })).toBeInTheDocument();
        for (const id of ['ds-whatsapp', 'ds-copy', 'ds-pdf', 'ds-xlsx', 'ds-print']) expect(within(dialog).getByTestId(id)).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('día sin cobros: lo dice, sin tablas', async () => {
        handler = () => ({ status: 200, body: build({}, true) });
        render(<DaySummaryView initialDay="2026-11-20" />);
        expect(await screen.findByText('No hubo cobros este día')).toBeInTheDocument();
        expect(screen.getByTestId('ds-no-cash')).toHaveTextContent('No hubo caja abierta este día');
        expect(screen.queryByTestId('ds-grand-total')).toBeNull();
    });

    it('cargando: muestra el estado; error: mensaje con «Reintentar» que vuelve a pedir', async () => {
        handler = () => ({ status: 500, body: { error: 'x' } });
        render(<DaySummaryView initialDay="2026-11-20" />);
        expect(screen.getByLabelText('Cargando el resumen')).toBeInTheDocument();
        expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el resumen');
        handler = () => ({ status: 200, body: build() });
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        await settled();
        expect(calls).toHaveLength(2);
    });

    it('selector de día: anterior, siguiente, hoy; no pasa de hoy y recepción no baja de ayer', async () => {
        handler = (url) => ({ status: 200, body: build({ date: url.split('date=')[1], minDay: '2026-11-20' }) });
        render(<DaySummaryView initialDay="2026-11-21" />);
        await settled();
        expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Día anterior' })).not.toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
        await waitFor(() => expect(calls.at(-1)).toBe('/api/cash/day-summary?date=2026-11-20'));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Día anterior' })).toBeDisabled());
        expect(screen.getByRole('button', { name: 'Día siguiente' })).not.toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
        await waitFor(() => expect(calls.at(-1)).toBe('/api/cash/day-summary?date=2026-11-21'));
    });

    it('si el servidor dice que ese día no (403) se explica y se ofrece ver hoy', async () => {
        handler = (url) => (url.includes('2026-11-21') ? { status: 200, body: build({ date: '2026-11-21' }) } : { status: 403, body: { error: 'Tu puesto puede ver el resumen de hoy y de ayer.' } });
        render(<DaySummaryView initialDay="2026-11-01" />);
        expect(await screen.findByText('No puedes ver este día')).toBeInTheDocument();
        expect(screen.getByText('Tu puesto puede ver el resumen de hoy y de ayer.')).toBeInTheDocument();
    });
});

describe('Resumen del día: enviar y descargar', () => {
    it('WhatsApp abre wa.me con el texto del resumen, dentro del toque', async () => {
        const open = vi.fn(() => ({}) as Window);
        vi.stubGlobal('open', open);
        render(<DaySummaryView initialDay="2026-11-20" />);
        await settled();
        fireEvent.click(screen.getByTestId('ds-whatsapp'));
        const p = build();
        const text = buildWhatsAppText(p.date, p.summary, p.cash);
        expect(open).toHaveBeenCalledWith(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        expect(text).toContain('Total cobrado: $580');
        expect(screen.getByTestId('ds-notice')).toHaveTextContent('Se abrió WhatsApp');
    });

    it('si el navegador bloquea la pestaña queda un enlace «Abrir WhatsApp»', async () => {
        vi.stubGlobal('open', vi.fn(() => null));
        render(<DaySummaryView initialDay="2026-11-20" />);
        await settled();
        fireEvent.click(screen.getByTestId('ds-whatsapp'));
        expect(screen.getByTestId('ds-wa-fallback').getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    });

    it('Copiar resumen escribe el mismo texto en el portapapeles', async () => {
        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        render(<DaySummaryView initialDay="2026-11-20" />);
        await settled();
        fireEvent.click(screen.getByTestId('ds-copy'));
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        expect((writeText.mock.calls[0] as unknown as string[])[0]).toMatch(/^Resumen de caja · vie 20 nov 2026\nTotal cobrado: \$580/);
        expect(await screen.findByTestId('ds-notice')).toHaveTextContent('Resumen copiado');
    });

    it('Descargar Excel: muestra «Generando…», baja el archivo con su nombre y avisa', async () => {
        let release: (v: Uint8Array) => void = () => undefined;
        files.xlsx.mockImplementation(() => new Promise<Uint8Array>((r) => { release = r; }));
        const created: string[] = [];
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { created.push(this.download); });
        render(<DaySummaryView initialDay="2026-11-20" />);
        await settled();
        fireEvent.click(screen.getByTestId('ds-xlsx'));
        expect(await screen.findByText('Generando…')).toBeInTheDocument();
        await waitFor(() => expect(files.xlsx).toHaveBeenCalled());
        await act(async () => { release(new Uint8Array([1, 2, 3])); });
        await waitFor(() => expect(created).toEqual(['Resumen-caja-2026-11-20.xlsx']));
        expect(await screen.findByTestId('ds-notice')).toHaveTextContent('Excel descargado');
        expect((files.xlsx.mock.calls[0][0] as DaySummaryPayload).date).toBe('2026-11-20');
        click.mockRestore();
    });

    it('si falla la generación del PDF: mensaje claro con «Reintentar»', async () => {
        files.pdf.mockRejectedValueOnce(new Error('boom'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        render(<DaySummaryView initialDay="2026-11-20" />);
        await settled();
        fireEvent.click(screen.getByTestId('ds-pdf'));
        const alert = await screen.findByText('No se pudo generar el PDF. Inténtalo de nuevo.');
        expect(alert.closest('[role="alert"]')).toHaveTextContent('Reintentar');
        // Reintentar vuelve a generarlo.
        files.pdf.mockResolvedValueOnce(new Uint8Array([1]));
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }));
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        fireEvent.click(within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Reintentar' }));
        expect(await screen.findByTestId('ds-notice')).toHaveTextContent('PDF descargado');
    });

    it('Imprimir en la página llama a la impresión; en la ventana abre la página dedicada', async () => {
        const print = vi.fn();
        vi.stubGlobal('print', print);
        const { unmount } = render(<DaySummaryView initialDay="2026-11-20" />);
        await settled();
        fireEvent.click(screen.getByTestId('ds-print'));
        expect(print).toHaveBeenCalled();
        unmount();

        const open = vi.fn(() => ({}) as Window);
        vi.stubGlobal('open', open);
        render(<DaySummaryView initialDay="2026-11-20" printViaPage />);
        await settled();
        fireEvent.click(screen.getByTestId('ds-print'));
        expect(open).toHaveBeenCalledWith('/caja/resumen?fecha=2026-11-20&imprimir=1', '_blank');
    });
});
