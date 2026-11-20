import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReceiptViewer from './ReceiptViewer';
import { ExpenseTable } from './ExpenseList';
import { json, mockFetch } from '@/app/citas/_components/test-utils';

const EXPENSE = { id: 'x1', description: 'Pago de luz', amount: 450, incurred_at: '2026-11-17T18:00:00Z', created_by_name: 'Sonia', vendor: 'CFE' };
const FILE_URL = (n: number) => `https://proj.supabase.co/storage/v1/object/sign/expense-receipts/biz/br/2026-11/luz.png?token=t${n}`;

/** Respuesta de archivo de prueba: lo que fetch daría al bajar el comprobante. */
const fileRes = (bytes: number, type: string, ok = true) => ({ ok, status: ok ? 200 : 400, blob: async () => new Blob([new Uint8Array(bytes)], { type }), headers: new Headers({ 'content-type': type }) }) as unknown as Response;

let natural = { w: 900, h: 1200 };
let links = 0;
beforeEach(() => {
    links = 0;
    natural = { w: 900, h: 1200 };
    let n = 0;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => `blob:test/${++n}`), revokeObjectURL: vi.fn() }));
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => natural.w });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => natural.h });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** fetch: la API de enlaces firmados + el archivo. `file` decide qué devuelve cada descarga (según cuántos enlaces se han pedido). */
function setup(file: (attempt: number) => Response | Promise<Response>, link?: (attempt: number) => Response) {
    return mockFetch([
        [/\/api\/expenses\/x1\/receipt$/, () => { links++; return link ? link(links) : json({ url: FILE_URL(links), expires_in: 60 }); }],
        [/supabase\.co\/storage/, () => file(links)],
    ]);
}
const open = () => render(<ReceiptViewer expense={EXPENSE} onClose={() => undefined} />);
const UNREADABLE = 'El archivo existe pero no se puede mostrar. Vuelve a subir el comprobante.';

describe('Visor de comprobantes', () => {
    it('muestra "Cargando comprobante…" y luego la imagen con los datos del gasto', async () => {
        setup(() => fileRes(2000, 'image/png'));
        open();
        expect(screen.getByText('Cargando comprobante…')).toBeInTheDocument();
        const img = await screen.findByTestId('receipt-image');
        expect(img).toHaveAttribute('src', 'blob:test/1');
        fireEvent.load(img);
        await waitFor(() => expect(screen.queryByText('Cargando comprobante…')).toBeNull());
        const info = screen.getByTestId('receipt-info');
        expect(info).toHaveTextContent('$450.00');
        expect(info).toHaveTextContent('Sonia');
        expect(info).toHaveTextContent('CFE');
        expect(screen.getByRole('dialog', { name: 'Comprobante' })).toHaveTextContent('Pago de luz');
        // Zoom: de "ajustada" a "tamaño completo" y de vuelta.
        fireEvent.click(screen.getByRole('button', { name: /Tamaño completo/ }));
        expect(screen.getByRole('button', { name: /Ajustar a la pantalla/ })).toBeInTheDocument();
        expect(screen.getByTestId('receipt-newtab')).toHaveAttribute('href', 'blob:test/1');
    });

    it('imagen de 1 píxel: dice que el archivo no se puede mostrar y pide volver a subirlo', async () => {
        natural = { w: 1, h: 1 };
        setup(() => fileRes(70, 'image/png'));
        open();
        fireEvent.load(await screen.findByTestId('receipt-image'));
        expect(await screen.findByText(UNREADABLE)).toBeInTheDocument();
        expect(screen.queryByTestId('receipt-image')).toBeNull();
    });

    it('archivo de 0 bytes: mismo aviso, sin pantalla en blanco', async () => {
        setup(() => fileRes(0, 'image/png'));
        open();
        expect(await screen.findByText(UNREADABLE)).toBeInTheDocument();
    });

    it('si falla el enlace firmado muestra el error y "Reintentar" pide un enlace NUEVO', async () => {
        const fetchMock = setup(() => fileRes(2000, 'image/png'), (n) => (n === 1 ? json({ error: 'x' }, 500) : json({ url: FILE_URL(n), expires_in: 60 })));
        open();
        expect(await screen.findByText('No se pudo abrir el comprobante')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        fireEvent.load(await screen.findByTestId('receipt-image'));
        expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/api/expenses/x1/receipt'))).toHaveLength(2);
        expect(fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('supabase.co'))).toEqual([FILE_URL(2)]);
    });

    it('si el archivo no se descarga o la imagen no carga, muestra el error con Reintentar', async () => {
        setup((n) => (n === 1 ? fileRes(10, 'image/png', false) : fileRes(2000, 'image/png')));
        open();
        expect(await screen.findByText('No se pudo abrir el comprobante')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        fireEvent.error(await screen.findByTestId('receipt-image'));
        expect(await screen.findByText('No se pudo abrir el comprobante')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    });

    it('PDF: no lo incrusta; ofrece "Abrir PDF" (con enlace nuevo en ese clic) y Descargar', async () => {
        const fetchMock = setup(() => fileRes(5000, 'application/pdf'));
        const tab = { location: { href: '' }, close: vi.fn(), opener: {} };
        vi.stubGlobal('open', vi.fn(() => tab));
        open();
        expect(await screen.findByTestId('receipt-pdf')).toHaveTextContent('luz.png');
        expect(document.querySelector('iframe, embed, object')).toBeNull();
        expect(screen.getByTestId('receipt-download')).toHaveAttribute('download');
        fireEvent.click(screen.getByRole('button', { name: /Abrir PDF/ }));
        await waitFor(() => expect(tab.location.href).toBe(FILE_URL(2)));
        expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/receipt'))).toHaveLength(2);
    });

    it('PDF: si no se puede pedir el enlace, cierra la pestaña y lo dice', async () => {
        setup(() => fileRes(5000, 'application/pdf'), (n) => (n === 1 ? json({ url: FILE_URL(1) }) : json({ error: 'x' }, 500)));
        const tab = { location: { href: '' }, close: vi.fn(), opener: {} };
        vi.stubGlobal('open', vi.fn(() => tab));
        open();
        fireEvent.click(await screen.findByRole('button', { name: /Abrir PDF/ }));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(tab.close).toHaveBeenCalled();
    });

    it('tipo no soportado: muestra el nombre del archivo y el botón Descargar', async () => {
        setup(() => fileRes(300, 'application/zip'));
        open();
        expect(await screen.findByTestId('receipt-other')).toHaveTextContent('luz.png');
        expect(screen.getByRole('link', { name: /Descargar/ })).toHaveAttribute('download', 'luz.png');
    });
});

describe('Lista de gastos: botón Ver', () => {
    const base = { status: 'posted', category: 'Servicios', category_id: 'c', method: 'cash', paid_from: 'envelope', created_at: '2026-11-17T18:00:00Z', cancel_reason: null, cancelled_by_name: null, recurring_expense_id: null, incurred_at: '2026-11-17T18:00:00Z', amount: 10, vendor: null, created_by_name: 'Sonia' } as const;
    it('solo hay "Ver" donde hay comprobante; el resto dice "Sin comprobante"', () => {
        render(<ExpenseTable expenses={[{ ...base, id: 'a', description: 'Con', has_receipt: true }, { ...base, id: 'b', description: 'Sin', has_receipt: false }]}
            loading={false} error={null} canEdit={false} filtered={false} onRetry={() => undefined} onCancel={() => undefined} />);
        expect(screen.getAllByRole('button', { name: 'Ver comprobante' })).toHaveLength(1);
        expect(screen.getAllByText('Sin comprobante')).toHaveLength(1);
    });
});
