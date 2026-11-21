import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MyWeek } from '@/lib/barber/my-week';
import BarberDashboard from '@/components/BarberDashboard';
import { stubFetch, type Call, type Reply } from '@/components/payroll/test-utils';
import { FrontDeskWeek } from './front-desk';

// Periodo de pago del jueves 19 al miércoles 25 nov 2026 (se paga el sábado 28): Dago lunes a viernes.
const FIXED = ['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25'];
const day = (date: string, status = 'worked', amount = 320) => ({ date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), status, rate: 320, amount, exceptionId: null, reason: null });
const WAGE = {
    amount: 1600, paidDays: 5, workedDays: 5, absentDays: 0, extraDays: 0, groups: [{ rate: 320, days: 5, amount: 1600 }],
    days: FIXED.map((d) => day(d)), summary: '5 días × $320 = $1,600',
};
const PERSON = {
    employee_id: 'e-dago', name: 'Dago', settled: false, settlement_id: null, receipt_number: null, can_edit: false,
    amount: 1600, summary: 'Sueldo: 5 días × $320 = $1,600', accrued_amount: 1600, accrued_days: 5, wage: WAGE, exceptions: [],
};
const WEEK = { period_start: '2026-11-19', period_end: '2026-11-25', today: '2026-11-25', can_edit: false, people: [PERSON] };
const STATS = { earnings: { totalCents: 4500, serviceCents: 0, productCents: 3000, tipsCents: 1500 } } as unknown as MyWeek;

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Mi semana de recepción: sueldo por día', () => {
    it('muestra lo devengado, la semana completa, cada día y lo que lleva por cobrar (sueldo + comisión de productos + propinas)', async () => {
        stubFetch(() => ({ body: WEEK }));
        render(<FrontDeskWeek employeeId="e-dago" data={STATS} mine />);
        expect(await screen.findByTestId('my-wage-accrued')).toHaveTextContent('$1,600.00');
        const wage = screen.getByTestId('my-wage');
        expect(wage).toHaveTextContent('5 días · $1,600 devengados');
        expect(wage).toHaveTextContent('Semana completa: $1,600.00 (5 días × $320 = $1,600)');
        for (const d of FIXED) expect(screen.getByTestId(`my-day-${d}`)).toHaveAttribute('data-status', 'worked');
        expect(screen.getByTestId('my-day-2026-11-21')).toHaveAttribute('data-status', 'rest');
        expect(screen.getByTestId('my-day-2026-11-22')).toHaveAttribute('data-status', 'rest');
        // Los días van de jueves a miércoles y el rótulo dice el periodo y cuándo se paga.
        expect([...wage.querySelectorAll('li[data-testid^="my-day-"]')].map((li) => li.getAttribute('data-testid')))
            .toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'].map((d) => `my-day-${d}`));
        expect(wage).toHaveTextContent('Semana del 19 al 25 de noviembre de 2026');
        expect(wage).toHaveTextContent('se paga el sábado 28 de noviembre');
        // 1,600 de sueldo + 30 de comisión de productos + 15 de propinas.
        expect(screen.getByTestId('my-owed-total')).toHaveTextContent('$1,645.00');
        expect(screen.getByTestId('my-owed')).toHaveTextContent('Comisión de productos$30');
        expect(screen.getByTestId('my-owed')).not.toHaveTextContent('Comisión de servicios');
    });

    it('una falta aparece marcada y con su motivo; el sueldo devengado ya no cuenta ese día', async () => {
        const absent = { ...WAGE, amount: 1280, days: FIXED.map((d) => (d === '2026-11-24' ? day(d, 'absent', 0) : day(d))) };
        const exception = { id: 'x1', work_date: '2026-11-24', kind: 'absent', reason: 'Avisó que estaba enfermo', voided_at: null, label: 'Faltó' };
        stubFetch(() => ({ body: { ...WEEK, people: [{ ...PERSON, amount: 1280, accrued_amount: 1280, accrued_days: 4, wage: absent, exceptions: [exception] }] } }));
        render(<FrontDeskWeek employeeId="e-dago" data={STATS} mine />);
        expect(await screen.findByTestId('my-wage-accrued')).toHaveTextContent('$1,280.00');
        expect(screen.getByTestId('my-day-2026-11-24')).toHaveAttribute('data-status', 'absent');
        expect(screen.getByTestId('my-wage-exceptions')).toHaveTextContent('Faltó · martes 24 nov');
        expect(screen.getByTestId('my-wage-exceptions')).toHaveTextContent('Avisó que estaba enfermo');
    });

    it('sin sueldo por día: lo dice y no inventa montos', async () => {
        stubFetch(() => ({ body: { ...WEEK, people: [] } }));
        render(<FrontDeskWeek employeeId="e-dago" data={STATS} mine />);
        expect(await screen.findByTestId('my-wage-empty')).toHaveTextContent('No tienes un sueldo por día asignado');
        expect(screen.queryByTestId('my-wage-accrued')).toBeNull();
    });

    it('solo lee lo suyo: si la API trae varias personas, toma la suya', async () => {
        stubFetch(() => ({ body: { ...WEEK, people: [{ ...PERSON, employee_id: 'e-emi', name: 'Emi', amount: 640, accrued_amount: 640, accrued_days: 2 }, PERSON] } }));
        render(<FrontDeskWeek employeeId="e-dago" data={null} mine />);
        expect(await screen.findByTestId('my-wage-accrued')).toHaveTextContent('$1,600.00');
    });

    it('un fallo se explica y deja reintentar', async () => {
        stubFetch(() => ({ status: 500, body: { error: 'Hubo un problema en el servidor.' } }));
        render(<FrontDeskWeek employeeId="e-dago" data={null} mine />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Hubo un problema en el servidor.');
        expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
    });
});

describe('Mi semana: pantalla completa', () => {
    function mount(role: 'recepcion' | 'barber', extra: (c: Call) => Reply | undefined = () => undefined) {
        const calls = stubFetch((c) => {
            const custom = extra(c);
            if (custom) return custom;
            if (c.url.includes('/api/auth/me')) return { body: { authenticated: true, user: { id: 'e-dago', role, employeeId: 'e-dago', name: 'Dago' } } };
            if (c.url.startsWith('/api/barbers/e-dago/stats')) return { status: 500, body: { error: 'Sin cifras en la prueba.' } };
            if (c.url.startsWith('/api/barbers')) return { body: [{ id: 'e-dago', name: 'Dago' }] };
            if (c.url.startsWith('/api/wages/week')) return { body: WEEK };
            if (c.url.startsWith('/api/employee-ledger')) return { body: { employee_id: 'e-dago', entries: [], loans: [], pending: { count: 0, receipt_effect: 0, advances: 0, deductions: 0, loan_payments: 0, carryover: 0 }, can_edit: false } };
            return undefined;
        });
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(<QueryClientProvider client={client}><BarberDashboard /></QueryClientProvider>);
        return calls;
    }

    it('recepción ve SU sueldo y nada de lo que solo aplica a barberos (periodo, agenda del día, cortes, clientes, ranking)', async () => {
        const calls = mount('recepcion');
        expect(await screen.findByTestId('my-wage')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hola, Dago');
        expect(screen.queryByTestId('period')).toBeNull();
        for (const title of ['Hoy', 'Mis servicios', 'Mis clientes', 'Propinas']) expect(screen.queryByRole('heading', { name: title })).toBeNull();
        expect(screen.queryByTestId('podium')).toBeNull();
        // Pide únicamente lo suyo: su ficha, su semana de sueldo y su libro (la API limita lo mismo).
        expect(calls.some((c) => c.url.startsWith('/api/ranking') || c.url.startsWith('/api/podium'))).toBe(false);
        expect(calls.some((c) => c.url.startsWith('/api/barbers/e-dago/stats?view=my-week'))).toBe(true);
    });

    it('recepción sin ficha de empleado: lo explica en vez de quedar en blanco', async () => {
        mount('recepcion', (c) => (c.url.includes('/api/auth/me') ? { body: { authenticated: true, user: { id: 'u1', role: 'recepcion', employeeId: null, name: 'Dago' } } } : undefined));
        expect(await screen.findByText(/no tiene ficha de empleado/)).toBeInTheDocument();
    });

    it('un barbero sigue viendo su periodo y sin la sección de sueldo de recepción', async () => {
        mount('barber');
        expect(await screen.findByTestId('period')).toBeInTheDocument();
        expect(within(document.body).queryByTestId('my-wage')).toBeNull();
    });
});
