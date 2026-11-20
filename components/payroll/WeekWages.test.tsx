import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WeekWages, { type WeekWagesResponse } from './WeekWages';
import { stubFetch, type Call, type Reply } from './test-utils';

const WEEK = '2026-11-15';
const FIXED = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const day = (date: string, status = 'worked', amount = 320) => ({ date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), status, rate: 320, amount, exceptionId: null, reason: null });
const wageOf = (days: ReturnType<typeof day>[]) => {
    const paid = days.filter((d) => d.status !== 'absent');
    return {
        amount: paid.length * 320, paidDays: paid.length, workedDays: paid.length, absentDays: days.length - paid.length, extraDays: 0,
        groups: [{ rate: 320, days: paid.length, amount: paid.length * 320 }], days, summary: `${paid.length} días × $320 = $${(paid.length * 320).toLocaleString('en-US')}`,
    };
};
const FULL = wageOf(FIXED.map((d) => day(d)));
const ABSENT = '2026-11-18';
const withAbsence = wageOf(FIXED.map((d) => (d === ABSENT ? day(d, 'absent', 0) : day(d))));
const EXCEPTION = {
    id: 'x1', work_date: ABSENT, kind: 'absent' as const, reason: 'Avisó que estaba enfermo', created_at: '2026-11-19T15:00:00Z', voided_at: null, void_reason: null,
    can_void: true, label: 'Faltó', created_by_name: 'Sonia', voided_by_name: null,
};

function person(overrides: Record<string, unknown> = {}) {
    return {
        employee_id: 'e-dago', name: 'Dago', settled: false, settlement_id: null, receipt_number: null, can_edit: true,
        amount: 1600, summary: 'Sueldo: 5 días × $320 = $1,600', accrued_amount: 1600, accrued_days: 5, wage: FULL, exceptions: [], ...overrides,
    };
}
function week(people: unknown[], overrides: Partial<WeekWagesResponse> = {}) {
    return { period_start: WEEK, period_end: '2026-11-21', today: '2026-11-20', can_edit: true, people, ...overrides } as unknown as WeekWagesResponse;
}

function mount(first: unknown, extra: (c: Call) => Reply | undefined = () => undefined, props: { readOnly?: boolean } = {}) {
    const bodies = Array.isArray(first) ? first : [first];
    let reads = 0;
    const calls = stubFetch((c) => {
        const custom = extra(c);
        if (custom) return custom;
        if (c.url.startsWith('/api/wages/week')) return { body: bodies[Math.min(reads++, bodies.length - 1)] };
        return undefined;
    });
    const onChanged = vi.fn();
    render(<WeekWages periodStart={WEEK} onChanged={onChanged} {...props} />);
    return { calls, onChanged };
}

async function fillAndConfirm(dialogName: RegExp, reason: string, pinLabel = /Tu PIN/) {
    const dialog = await screen.findByTestId('pin-confirm');
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: reason } });
    fireEvent.change(within(dialog).getByLabelText(pinLabel), { target: { value: '482913' } });
    fireEvent.click(within(dialog).getByRole('button', { name: dialogName }));
    return dialog;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Pago semanal: sueldo por día de la semana', () => {
    it('muestra el sueldo de la semana y qué días cuenta cada uno, con "hasta hoy"', async () => {
        mount(week([person()]));
        const card = await screen.findByTestId('week-wage-e-dago');
        expect(within(card).getByTestId('wage-summary-line')).toHaveTextContent('Sueldo: 5 días × $320 = $1,600');
        expect(within(card).getByTestId('wage-amount')).toHaveTextContent('$1,600.00');
        expect(within(card).getByTestId('wage-accrued')).toHaveTextContent('Hasta hoy: 5 días · $1,600 devengados');
        for (const d of FIXED) expect(within(card).getByTestId(`day-${d}`)).toHaveAttribute('data-status', 'worked');
        expect(within(card).getByTestId('day-2026-11-15')).toHaveAttribute('data-status', 'rest');
        expect(within(card).getByTestId('day-2026-11-21')).toHaveAttribute('data-status', 'rest');
    });

    it('sin nadie con sueldo: estado vacío que manda a Equipo', async () => {
        mount(week([]));
        expect(await screen.findByText('Nadie tiene sueldo por día en esta semana')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Registrar/ })).toBeNull();
    });

    it('un fallo de carga se explica y deja reintentar', async () => {
        let n = 0;
        stubFetch((c) => {
            if (c.url.startsWith('/api/wages/week')) { n += 1; return n === 1 ? { status: 503, body: { error: 'x' } } : { body: week([person()]) }; }
            return undefined;
        });
        render(<WeekWages periodStart={WEEK} />);
        expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el sueldo por día');
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByTestId('week-wage-e-dago')).toBeInTheDocument();
    });

    it('registrar una falta: elige un día fijo, pide motivo y PIN, y el monto baja con la semana que devuelve la API', async () => {
        const { calls, onChanged } = mount([week([person()]), week([person({ amount: 1280, summary: 'Sueldo: 4 días × $320 = $1,280', accrued_amount: 1280, accrued_days: 4, wage: withAbsence, exceptions: [EXCEPTION] })])],
            (c) => (c.method === 'POST' ? { status: 201, body: { replayed: false, week: withAbsence } } : undefined));
        fireEvent.click(await screen.findByRole('button', { name: /Registrar falta/ }));
        const dialog = await screen.findByTestId('pin-confirm');
        // Solo se ofrecen los días fijos (lunes a viernes), nunca domingo ni sábado.
        const options = within(within(dialog).getByTestId('exception-day')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
        expect(options).toEqual(FIXED);
        fireEvent.change(within(dialog).getByTestId('exception-day'), { target: { value: ABSENT } });
        await fillAndConfirm(/Registrar falta con PIN/, 'Avisó que estaba enfermo');
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());

        const post = calls.find((c) => c.method === 'POST')!;
        expect(post.url).toBe('/api/wages/exceptions');
        expect(post.body).toEqual({ employee_id: 'e-dago', work_date: ABSENT, kind: 'absent', reason: 'Avisó que estaba enfermo', pin: '482913' });
        const card = screen.getByTestId('week-wage-e-dago');
        await waitFor(() => expect(within(card).getByTestId('wage-amount')).toHaveTextContent('$1,280.00'));
        expect(within(card).getByTestId('day-2026-11-18')).toHaveAttribute('data-status', 'absent');
        expect(within(card).getByTestId('wage-summary-line')).toHaveTextContent('4 días × $320 = $1,280');
        await waitFor(() => expect(within(card).getByTestId('wage-exception')).toHaveTextContent('Faltó · miércoles 18 nov'));
        expect(onChanged).toHaveBeenCalled();
    });

    it('registrar un día extra ofrece solo los días de descanso', async () => {
        mount(week([person()]));
        fireEvent.click(await screen.findByRole('button', { name: /Registrar día extra/ }));
        const dialog = await screen.findByTestId('pin-confirm');
        const options = within(within(dialog).getByTestId('exception-day')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
        expect(options).toEqual(['2026-11-15', '2026-11-21']);
    });

    it('anular una excepción: motivo y PIN; el monto vuelve con la semana que devuelve la API', async () => {
        const { calls } = mount([week([person({ amount: 1280, summary: 'Sueldo: 4 días × $320 = $1,280', accrued_amount: 1280, accrued_days: 4, wage: withAbsence, exceptions: [EXCEPTION] })]),
            week([person({ exceptions: [{ ...EXCEPTION, voided_at: '2026-11-20T16:00:00Z', void_reason: 'Se anotó el día equivocado', can_void: false, voided_by_name: 'Sonia' }] })])],
            (c) => (c.method === 'POST' ? { status: 200, body: { week: FULL } } : undefined));
        fireEvent.click(await screen.findByRole('button', { name: /Anular falta del miércoles 18 nov/ }));
        await fillAndConfirm(/Anular con PIN/, 'Se anotó el día equivocado');
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());
        const post = calls.find((c) => c.method === 'POST')!;
        expect(post.url).toBe('/api/wages/exceptions/x1/void');
        expect(post.body).toEqual({ reason: 'Se anotó el día equivocado', pin: '482913' });
        const card = screen.getByTestId('week-wage-e-dago');
        await waitFor(() => expect(within(card).getByTestId('wage-amount')).toHaveTextContent('$1,600.00'));
        // Queda a la vista como anulada (no se borra) y ya sin botón para anular.
        await waitFor(() => expect(within(card).getByTestId('wage-exception')).toHaveTextContent('Anulado por Sonia'));
        expect(within(card).queryByRole('button', { name: /Anular/ })).toBeNull();
    });

    it('PIN incorrecto: el error aparece en la ventana y no cambia el monto', async () => {
        mount(week([person()]), (c) => (c.method === 'POST' ? { status: 400, body: { error: 'El PIN no es correcto.', pin_error: true } } : undefined));
        fireEvent.click(await screen.findByRole('button', { name: /Registrar falta/ }));
        const dialog = await fillAndConfirm(/Registrar falta con PIN/, 'Avisó que estaba enfermo');
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('El PIN no es correcto.');
        expect(screen.getByTestId('wage-amount')).toHaveTextContent('$1,600.00');
    });

    it('semana pagada: todo en solo lectura, sin botones de registrar ni de anular', async () => {
        mount(week([person({ settled: true, receipt_number: 'REC-0009', can_edit: false, exceptions: [EXCEPTION] })]));
        const card = await screen.findByTestId('week-wage-e-dago');
        expect(within(card).getByTestId('wage-settled')).toHaveTextContent('Semana pagada (recibo REC-0009)');
        expect(within(card).queryByRole('button')).toBeNull();
    });

    it('cuenta de consulta: ve el sueldo y las excepciones pero no puede registrar ni anular', async () => {
        mount(week([person({ exceptions: [EXCEPTION], can_edit: false })], { can_edit: false }), () => undefined, { readOnly: true });
        const card = await screen.findByTestId('week-wage-e-dago');
        expect(within(card).getByTestId('wage-exception')).toHaveTextContent('Faltó');
        expect(within(card).queryByRole('button')).toBeNull();
        expect(card).toHaveTextContent('Tu cuenta es de consulta');
    });
});
