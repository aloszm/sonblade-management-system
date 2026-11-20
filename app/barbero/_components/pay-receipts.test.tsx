import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildMyWeek, periodWindow, type MyWeek } from '@/lib/barber/my-week';
import BarberDashboard from '@/components/BarberDashboard';
import { stubFetch, type Call, type Reply } from '@/components/payroll/test-utils';
import { EarningsSection, ReceiptsSection } from './sections';
import { FrontDeskWeek } from './front-desk';

// Recibos de pago: solo owner, admin y viewer (decisión temporal del dueño, 20 nov 2026). «Mi semana» conserva sus números.
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const TZ = 'America/Mexico_City';
// Domingo 22 nov 2026: la semana del 15 al 21 ya cerró.
const NOW = new Date('2026-11-22T16:00:00Z');
const PAID = [{ id: 'r1', receipt_number: 'R-0007', period_start: '2026-11-15', period_end: '2026-11-21', total_amount: 145, paid_at: '2026-11-21T22:00:00Z', status: 'paid' }];
/** «Mi semana» armada con la misma función del servidor: $100 de servicios, $30 de producto y $15 de propina = $145. */
function week(visible: boolean): MyWeek {
    return buildMyWeek({
        window: periodWindow('last_week', NOW, TZ), now: NOW, serviceRatePct: 50,
        current: { barber: { cuts: 3, service_revenue: 200, product_revenue: 60, service_commission: 100, product_commission: 30, service_breakdown: [] }, sales: [] },
        previous: { barber: null, sales: [] }, counts: { week: 0, lastWeek: 3, month: 3 },
        tips: [{ sale_id: 's1', amount: 15, created_at: '2026-11-18T18:00:00Z', settlement_id: null }], previousTips: [],
        settlements: visible ? PAID : [], recentSettlements: visible ? PAID : [], clientRows: [], todayRows: [], receiptsVisible: visible,
    });
}

describe('Sección de recibos en «Mi semana»', () => {
    it('quien puede verlos: título, lista y enlaces a /liquidaciones', () => {
        render(<ReceiptsSection data={week(true)} mine />);
        expect(screen.getByRole('heading', { name: 'Mis recibos de pago' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ver todos mis recibos' })).toHaveAttribute('href', '/liquidaciones');
        expect(screen.getByRole('link', { name: /Semana del/ })).toHaveAttribute('href', '/liquidaciones/r1');
    });

    it('quien no puede: la sección no se dibuja (ni título huérfano ni enlaces)', () => {
        const { container } = render(<ReceiptsSection data={week(false)} mine />);
        expect(container).toBeEmptyDOMElement();
    });

    it('lo ganado sigue visible y el aviso de pago no menciona recibos si no se pueden ver', () => {
        render(<EarningsSection data={week(false)} mine />);
        expect(screen.getByTestId('week-earned')).toHaveTextContent('$145');
        expect(screen.getByText('La semana ya cerró. Administración registra el pago.')).toBeInTheDocument();
        expect(screen.queryByText(/recibo/i)).toBeNull();
    });

    it('con permiso, el aviso conserva el número de recibo', () => {
        render(<EarningsSection data={week(true)} mine={false} />);
        expect(screen.getByText(/Recibo R-0007/)).toBeInTheDocument();
    });
});

const FIXED = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const day = (date: string) => ({ date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), status: 'worked', rate: 320, amount: 320, exceptionId: null, reason: null });
const WAGE = {
    amount: 1600, paidDays: 5, workedDays: 5, absentDays: 0, extraDays: 0, groups: [{ rate: 320, days: 5, amount: 1600 }],
    days: FIXED.map(day), summary: '5 días × $320 = $1,600',
};
const WAGE_PERSON = {
    employee_id: 'e-dago', name: 'Dago', settled: true, settlement_id: 's1', receipt_number: 'R-0009', can_edit: false,
    amount: 1600, summary: 'Sueldo: 5 días × $320 = $1,600', accrued_amount: 1600, accrued_days: 5, wage: WAGE, exceptions: [],
};
const WEEK_WAGES = { period_start: '2026-11-15', period_end: '2026-11-21', today: '2026-11-20', can_edit: false, people: [WAGE_PERSON] };

describe('Mi semana de recepción', () => {
    it('sigue mostrando lo que lleva por cobrar y su sueldo; sin «Ver mis recibos» ni número de recibo', async () => {
        stubFetch(() => ({ body: WEEK_WAGES }));
        render(<FrontDeskWeek employeeId="e-dago" data={week(false)} mine />);
        expect(await screen.findByTestId('my-owed-total')).toHaveTextContent('$1,745.00');
        expect(screen.getByTestId('my-owed')).toHaveTextContent('Comisión de productos$30');
        expect(screen.queryByRole('link', { name: /Ver (mis )?recibos/ })).toBeNull();
        expect(screen.getByText('Esta semana ya se pagó.')).toBeInTheDocument();
        expect(document.body.innerHTML).not.toContain('/liquidaciones');
    });

    it('la gerencia viendo a esa persona conserva el enlace y el número de recibo', async () => {
        stubFetch(() => ({ body: WEEK_WAGES }));
        render(<FrontDeskWeek employeeId="e-dago" data={week(true)} mine={false} />);
        expect(await screen.findByRole('link', { name: 'Ver recibos' })).toHaveAttribute('href', '/liquidaciones');
        expect(screen.getByText(/recibo R-0009/)).toBeInTheDocument();
    });
});

describe('Pantalla «Mi semana» completa por puesto', () => {
    function mount(role: 'recepcion' | 'barber' | 'admin', receiptsFromServer: boolean) {
        const handler = (c: Call): Reply | undefined => {
            if (c.url.includes('/api/auth/me')) return { body: { authenticated: true, user: { id: 'u1', role, employeeId: 'e-dago', name: 'Dago' } } };
            if (c.url.startsWith('/api/barbers/e-dago/stats')) return { body: { ...week(receiptsFromServer), period: 'week', barber: { id: 'e-dago', name: 'Dago' } } };
            if (c.url.startsWith('/api/barbers')) return { body: [{ id: 'e-dago', name: 'Dago' }] };
            if (c.url.startsWith('/api/wages/week')) return { body: { ...WEEK_WAGES, people: [{ ...WAGE_PERSON, settled: false }] } };
            if (c.url.startsWith('/api/employee-ledger')) return { body: { employee_id: 'e-dago', entries: [], loans: [], pending: { count: 0, receipt_effect: 0, advances: 0, deductions: 0, loan_payments: 0, carryover: 0 }, can_edit: false } };
            if (c.url.startsWith('/api/ranking')) return { status: 500, body: { error: 'Sin ranking en la prueba.' } };
            if (c.url.startsWith('/api/bonus-goals')) return { body: { enabled: false, people: [] } };
            return { body: {} };
        };
        stubFetch(handler);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        return render(<QueryClientProvider client={client}><BarberDashboard /></QueryClientProvider>);
    }

    // Aunque el servidor mandara recibos, la pantalla de estos puestos no los dibuja (doble candado).
    it.each(['recepcion', 'barber'] as const)('%s: ve sus números y ningún recibo ni enlace a /liquidaciones', async (role) => {
        mount(role, true);
        await screen.findByTestId(role === 'recepcion' ? 'my-owed-total' : 'week-earned');
        expect(screen.queryByRole('heading', { name: /recibos de pago/i })).toBeNull();
        expect(screen.queryByRole('link', { name: /Ver (todos )?(mis )?recibos/ })).toBeNull();
        expect(document.querySelector('a[href^="/liquidaciones"]')).toBeNull();
    });

    it('barbero: Mi semana conserva lo ganado', async () => {
        mount('barber', false);
        expect(await screen.findByTestId('week-earned')).toHaveTextContent('$145');
    });

    it('gerencia viendo la semana de alguien: conserva la sección de recibos', async () => {
        mount('admin', true);
        expect(await screen.findByRole('heading', { name: /recibos de pago/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Ver (todos )?(mis )?recibos/ })).toHaveAttribute('href', '/liquidaciones');
    });
});
