import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';

const kpis = { revenue: 3000, cuts: 12, products: 2, tickets: 10, clients: 4, tips: 120, commissions: 1300, expenses: 200, avg_ticket: 300, net: 1500 };
const previous = { ...kpis, revenue: 2000, cuts: 12, avg_ticket: 0, net: 1200 };
const metrics = {
    range: { from: '2026-11-15', to: '2026-11-18', days: 4, timezone: 'America/Mexico_City', previous_from: '2026-11-11', previous_to: '2026-11-14' },
    kpis, previous, new_clients: 1,
    daily: [{ day: '2026-11-15', revenue: 3000, cuts: 12 }],
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, cuts: hour === 18 ? 5 : 0, revenue: hour === 18 ? 1000 : 0 })),
    weekday: Array.from({ length: 7 }, (_, dow) => ({ dow, cuts: dow === 6 ? 7 : 0, revenue: 0 })),
    barbers: [{ id: 'b1', name: 'Deya', is_barber: true, cuts: 12, revenue: 3000, tickets: 10, tips: 120, commission: 1300, avg_ticket: 300 }],
    services: [{ name: 'Corte de cabello', type: 'service', count: 12, revenue: 2400 }],
    payments: { cash: 2000, card: 1000, transfer: 0, other: 0 },
    activity: [{ at: '2026-11-15T02:30:05Z', sale_id: 's1', type: 'service', item: 'Corte de cabello', quantity: 1, amount: 200, employee: 'Deya', client: null, methods: 'cash' }],
};

function mockApi() {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (url.startsWith('/api/metrics') ? metrics : [{ id: 'b1', name: 'Deya' }]),
    })));
}

afterEach(() => vi.unstubAllGlobals());

describe('Panel del dueño', () => {
    it('muestra los indicadores con su comparación contra el periodo anterior', async () => {
        mockApi();
        render(<Dashboard />);
        expect(await screen.findByTestId('kpi-revenue')).toHaveTextContent('$3,000');
        expect(screen.getByTestId('kpi-cuts')).toHaveTextContent('12');
        expect(screen.getByText('+50%')).toBeInTheDocument();
        expect(screen.getByText('Igual que el periodo anterior')).toBeInTheDocument();
        expect(screen.getByText('Sin datos para comparar')).toBeInTheDocument();
    });

    it('señala la hora fuerte, el equipo y el registro con hora exacta', async () => {
        mockApi();
        render(<Dashboard />);
        expect(await screen.findByText('La hora con más cortes es de 6pm a 7pm.')).toBeInTheDocument();
        expect(screen.getAllByTestId('team-row')).toHaveLength(1);
        expect(screen.getAllByTestId('log-row')[0]).toHaveTextContent('Deya');
    });

    it('ofrece los periodos y el filtro por persona', async () => {
        mockApi();
        render(<Dashboard />);
        await screen.findByTestId('kpi-revenue');
        for (const name of ['Hoy', 'Semana', 'Mes', '30 días', 'Fechas', 'Toda la barbería']) {
            expect(screen.getByRole('button', { name })).toBeInTheDocument();
        }
    });
});
