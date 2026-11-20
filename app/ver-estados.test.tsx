import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LiquidacionesPage from '@/app/liquidaciones/page';
import ReciboPage from '@/app/liquidaciones/[id]/page';
import TicketPage from '@/app/ticket/[id]/page';
import Dashboard from '@/components/Dashboard';
import { renderWithQuery } from '@/app/citas/_components/test-utils';

// Auditoría de los botones «Ver…»: cada destino muestra contenido, un estado vacío o un error con salida; nunca una pantalla en blanco.
const params: { id: string } = { id: 'x' };
vi.mock('next/navigation', () => ({
    useParams: () => params,
    usePathname: () => '/',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

type Reply = { status?: number; body: unknown };
function stub(handler: (url: string) => Reply | undefined) {
    const fn = vi.fn(async (url: string) => {
        const r = handler(String(url)) ?? { body: {} };
        const status = r.status ?? 200;
        return { ok: status < 400, status, json: async () => r.body };
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

describe('Recibo de pago semanal /liquidaciones/[id]', () => {
    it('id inexistente (404): explica y ofrece volver, sin pantalla en blanco ni Reintentar inútil', async () => {
        stub(() => ({ status: 404, body: { error: 'Recibo no encontrado.' } }));
        render(<ReciboPage />);
        expect(await screen.findByText('No encontramos este recibo')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Volver al pago semanal' })).toHaveAttribute('href', '/liquidaciones');
    });

    it('recibo de otra persona o sin permiso (403): lo dice y ofrece volver', async () => {
        stub(() => ({ status: 403, body: { error: 'No tienes permiso.' } }));
        render(<ReciboPage />);
        expect(await screen.findByText('No puedes ver este recibo')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Volver al pago semanal' })).toBeInTheDocument();
    });

    it('fallo del servidor: error con Reintentar que vuelve a pedir el recibo', async () => {
        let calls = 0;
        stub(() => { calls++; return { status: 500, body: { error: 'x' } }; });
        render(<ReciboPage />);
        expect(await screen.findByText('No se pudo cargar el recibo')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        await waitFor(() => expect(calls).toBe(2));
        expect(screen.getByRole('link', { name: 'Volver al pago semanal' })).toBeInTheDocument();
    });
});

describe('Ticket /ticket/[id]', () => {
    it('venta inexistente (404): estado vacío con explicación y enlace para volver', async () => {
        stub(() => ({ status: 404, body: { error: 'Venta no encontrada.' } }));
        render(<TicketPage />);
        expect(await screen.findByText('No encontramos este ticket')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Volver al cobro' })).toHaveAttribute('href', '/pos');
    });

    it('sin permiso (403): lo dice', async () => {
        stub(() => ({ status: 403, body: { error: 'No tienes permiso.' } }));
        render(<TicketPage />);
        expect(await screen.findByText('No puedes ver este ticket')).toBeInTheDocument();
    });

    it('error de red o servidor: mensaje en español y Reintentar', async () => {
        let calls = 0;
        stub(() => { calls++; return { status: 500, body: null }; });
        render(<TicketPage />);
        expect(await screen.findByText('No se pudo cargar el ticket')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        await waitFor(() => expect(calls).toBe(2));
    });
});

const WEEK = {
    period_start: '2026-11-08', period_end: '2026-11-14', timezone: 'America/Mexico_City', is_latest_closed: true,
    rows: [{ employee_id: 'e1', name: 'Emi', gross_commission: 0, deductions: 0, tips: 0, total_amount: 0, entry_count: 0, can_settle: false, reason: 'nothing_to_pay', settlement_id: null, receipt_number: null }],
};
const adminApi = (history: Reply): ((url: string) => Reply | undefined) => (url) => {
    if (url.includes('/api/auth/me')) return { body: { user: { role: 'admin' } } };
    if (url.includes('/api/settlements/history')) return history;
    if (url.includes('/api/settlements')) return { body: WEEK };
    return { body: {} };
};

describe('Pago semanal: «Ver desglose» y «Ver» recibo', () => {
    it('«Ver desglose» de una persona sin movimientos explica que no hay nada que desglosar', async () => {
        stub(adminApi({ body: [] }));
        renderWithQuery(<LiquidacionesPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Ver desglose de Emi' }));
        expect(await screen.findByTestId('breakdown-empty')).toHaveTextContent('Sin movimientos en esta semana');
        expect(screen.getByTestId('pay-breakdown')).toBeInTheDocument();
    });

    it('sin recibos: lo dice y no dibuja ningún «Ver»', async () => {
        stub(adminApi({ body: [] }));
        renderWithQuery(<LiquidacionesPage />);
        expect(await screen.findByText('Todavía no hay recibos.')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Ver/ })).toBeNull();
    });

    it('si la lista de recibos no carga, NO dice "Todavía no hay recibos": muestra el error con Reintentar', async () => {
        let fail = true;
        stub(adminApi({ body: [] }) && ((url) => (url.includes('/api/settlements/history')
            ? (fail ? { status: 500, body: { error: 'x' } } : { body: [{ id: 'h1', receipt_number: 'R-1', employee_name: 'Emi', period_start: '2026-11-01', period_end: '2026-11-07', total_amount: 100, paid_at: null }] })
            : adminApi({ body: [] })(url))));
        renderWithQuery(<LiquidacionesPage />);
        expect(await screen.findByText('No se pudieron cargar los recibos')).toBeInTheDocument();
        expect(screen.queryByText('Todavía no hay recibos.')).toBeNull();
        fail = false;
        fireEvent.click(screen.getAllByRole('button', { name: /Reintentar/ }).at(-1)!);
        expect(await screen.findByText('R-1')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Ver/ })).toHaveAttribute('href', '/liquidaciones/h1');
    });

    it.each(['barber', 'recepcion'])('%s: la pantalla explica que los recibos los ve la administración y no pide recibos', async (role) => {
        const fn = stub((url) => (url.includes('/api/auth/me') ? { body: { user: { role } } } : { body: [] }));
        renderWithQuery(<LiquidacionesPage />);
        expect(await screen.findByText('Los recibos de pago los ve la administración')).toBeInTheDocument();
        expect(fn.mock.calls.some(([u]) => String(u).includes('/api/settlements'))).toBe(false);
        expect(screen.queryByText('Todavía no hay recibos.')).toBeNull();
    });

    it('si la sesión no carga: error con Reintentar (no tablas vacías)', async () => {
        stub((url) => (url.includes('/api/auth/me') ? { status: 500, body: { error: 'x' } } : { body: [] }));
        renderWithQuery(<LiquidacionesPage />);
        expect(await screen.findByText('No se pudo cargar la pantalla')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    });
});

describe('Panel: «Ver reportes» y «Ver más»', () => {
    it('si no cargan las métricas: error en español con Reintentar', async () => {
        let ok = false;
        stub((url) => {
            if (url.startsWith('/api/metrics')) return ok ? undefined : { status: 500, body: { error: 'Failed to fetch' } };
            return { body: [] };
        });
        render(<Dashboard />);
        expect(await screen.findByText('No se pudieron cargar las métricas')).toBeInTheDocument();
        expect(screen.queryByText('Failed to fetch')).toBeNull();
        ok = true;
        expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    });
});
