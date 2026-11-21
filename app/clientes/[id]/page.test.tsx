import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClientDetailPage from './page';

vi.mock('next/navigation', () => ({
    useParams: () => ({ id: 'c1' }),
    usePathname: () => '/clientes/c1',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const CLIENT = {
    id: 'c1', name: 'Marco Pérez', full_name: 'Marco Pérez', phone: '5512345678', email: 'marco@ejemplo.com', notes: 'Llega temprano', preferences: 'Degradado bajo',
    is_active: true, created_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z', visits: 3, last_visit_at: '2026-11-10T18:00:00Z',
    total_spent: 900, no_shows: 1, next_appointment_at: '2026-11-25T17:00:00Z', next_appointment_id: 'a1',
};
const HISTORY = [
    { kind: 'sale', id: 's1', at: '2026-11-10T18:00:00Z', ends_at: null, status: 'paid', source: null, barber: 'Deya', services: ['Corte'], products: ['Cera'], notes: null, sale_id: 's1', folio: 'F-0042', sale_status: 'paid', total: 350 },
    { kind: 'appointment', id: 'a0', at: '2026-10-01T18:00:00Z', ends_at: null, status: 'no_show', source: 'online', barber: 'Deya', services: ['Corte'], products: [], notes: null, sale_id: null, folio: null, sale_status: null, total: null },
];
const BARBER_CLIENT = { ...CLIENT, phone: null, total_spent: null };
const BARBER_HISTORY = HISTORY.map((h) => ({ ...h, total: null }));

function mockApi(role: 'recepcion' | 'barber', opts: { client?: unknown; history?: unknown; readOnly?: boolean } = {}) {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/api/auth/me')) return { ok: true, status: 200, json: async () => ({ authenticated: true, user: { id: 'u1', role, readOnly: opts.readOnly ?? false } }) };
        if (init?.method === 'PATCH') {
            const body = JSON.parse(String(init.body));
            return { ok: true, status: 200, json: async () => ({ ...CLIENT, ...body }) };
        }
        if (u.endsWith('/history')) return { ok: true, status: 200, json: async () => ({ items: opts.history ?? HISTORY }) };
        return { ok: true, status: 200, json: async () => opts.client ?? CLIENT };
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('Ficha del cliente', () => {
    it('recepción ve resumen, historial con folio al ticket y edita notas con el aviso de privacidad', async () => {
        const fn = mockApi('recepcion');
        render(<ClientDetailPage />);
        expect(await screen.findByRole('heading', { name: 'Marco Pérez' })).toBeInTheDocument();
        const summary = screen.getByRole('region', { name: 'Resumen' });
        expect(summary).toHaveTextContent('$900.00');
        expect(summary).toHaveTextContent('Faltas');
        const rows = await screen.findAllByTestId('history-row');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('Pagada');
        expect(rows[0]).toHaveTextContent('$350.00');
        expect(rows[0]).toHaveTextContent('Corte, Cera');
        expect(rows[1]).toHaveTextContent('No llegó');
        expect(screen.getByRole('link', { name: 'Folio F-0042' })).toHaveAttribute('href', '/ticket/s1');
        expect(screen.getByRole('link', { name: /Agendar cita/ })).toHaveAttribute('href', '/citas?nueva=1&cliente=c1');
        expect(screen.getByText('No anotes datos de salud ni información sensible.')).toBeInTheDocument();

        const notes = await screen.findByLabelText('Notas');
        fireEvent.change(notes, { target: { value: 'Prefiere tarde' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar notas' }));
        await waitFor(() => {
            const patch = fn.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
            expect(patch).toBeTruthy();
            expect(JSON.parse(String((patch![1] as RequestInit).body))).toMatchObject({ notes: 'Prefiere tarde' });
        });
    });

    it('el barbero ve la ficha en solo lectura: sin importes, sin teléfono nulo y sin botones de edición', async () => {
        mockApi('barber', { client: BARBER_CLIENT, history: BARBER_HISTORY });
        render(<ClientDetailPage />);
        expect(await screen.findByRole('heading', { name: 'Marco Pérez' })).toBeInTheDocument();
        await screen.findAllByTestId('history-row');
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
        expect(screen.queryByText('Gasto total')).not.toBeInTheDocument();
        expect(screen.queryByText('Teléfono')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Guardar notas' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Editar contacto/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
        expect(screen.getByText('Llega temprano')).toBeInTheDocument();
    });

    // Auditoría del 21 nov 2026: al barbero «Agendar cita» lo llevaba a la agenda en solo lectura, sin formulario.
    it('«Agendar cita» solo lo ve quien puede agendar: recepción sí; barbero y consulta no', async () => {
        mockApi('recepcion');
        const first = render(<ClientDetailPage />);
        expect(await screen.findByRole('link', { name: 'Agendar cita' })).toHaveAttribute('href', '/citas?nueva=1&cliente=c1');
        first.unmount();

        mockApi('barber', { client: BARBER_CLIENT, history: BARBER_HISTORY });
        const second = render(<ClientDetailPage />);
        expect(await screen.findByRole('heading', { name: 'Marco Pérez' })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('Historial')).toBeInTheDocument());
        expect(screen.queryByRole('link', { name: 'Agendar cita' })).toBeNull();
        second.unmount();

        mockApi('recepcion', { readOnly: true });
        render(<ClientDetailPage />);
        expect(await screen.findByRole('heading', { name: 'Marco Pérez' })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('Historial')).toBeInTheDocument());
        expect(screen.queryByRole('link', { name: 'Agendar cita' })).toBeNull();
    });

    it('desactivar pide confirmación, explica que no se borra nada y envía is_active false', async () => {
        const fn = mockApi('recepcion');
        render(<ClientDetailPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
        const dialog = await screen.findByTestId('confirm-dialog');
        expect(dialog).toHaveTextContent('No se borra nada');
        expect(fn.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(false);
        fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' }).at(-1)!);
        await waitFor(() => {
            const patch = fn.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
            expect(JSON.parse(String((patch![1] as RequestInit).body))).toEqual({ is_active: false });
        });
    });

    it('un fallo al cargar muestra el error con Reintentar', async () => {
        let attempt = 0;
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const u = String(url);
            if (u.includes('/api/auth/me')) return { ok: true, status: 200, json: async () => ({ authenticated: true, user: { role: 'recepcion' } }) };
            if (u.endsWith('/history')) return { ok: true, status: 200, json: async () => ({ items: [] }) };
            attempt += 1;
            if (attempt === 1) throw new TypeError('Failed to fetch');
            return { ok: true, status: 200, json: async () => CLIENT };
        }));
        render(<ClientDetailPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent(/no hay conexión/i);
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByRole('heading', { name: 'Marco Pérez' })).toBeInTheDocument();
        expect(await screen.findByText('Todavía no hay historial')).toBeInTheDocument();
    });
});
