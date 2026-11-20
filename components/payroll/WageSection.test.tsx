import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WageSection, { type WagesResponse } from './WageSection';
import { stubFetch, type Call, type Reply } from './test-utils';

const DAGO = { id: 'e-dago', name: 'Dago' };
const RATE = {
    id: 'r1', employee_id: 'e-dago', employee_name: 'Dago', daily_amount: 320, work_days: [1, 2, 3, 4, 5], work_days_label: 'lunes a viernes',
    effective_from: '2026-11-15', reason: 'Acuerdo inicial con la gerencia', created_by_name: 'Alonso', created_at: '2026-11-20T15:00:00Z',
};
const NEXT = { ...RATE, id: 'r2', daily_amount: 350, work_days: [1, 2, 3, 4, 5, 6], work_days_label: 'lunes a sábado', effective_from: '2026-11-29', reason: 'Aumento acordado' };

function wages(overrides: Partial<WagesResponse> = {}): WagesResponse {
    return {
        employee_id: 'e-dago', today: '2026-11-20', min_effective_from: '2026-11-15', can_edit: true,
        rates: [RATE], current: [{ employee_id: 'e-dago', employee_name: 'Dago', current: RATE, next: null }], ...overrides,
    };
}

function mount(response: WagesResponse | Reply, extra: (c: Call) => Reply | undefined = () => undefined) {
    const calls = stubFetch((c) => {
        const custom = extra(c);
        if (custom) return custom;
        if (c.url.startsWith('/api/wages') && c.method === 'GET') return 'body' in response ? response : { body: response };
        return undefined;
    });
    const onChanged = vi.fn();
    render(<WageSection employee={DAGO} onChanged={onChanged} />);
    return { calls, onChanged };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Sueldo por día en la ficha (Equipo)', () => {
    it('muestra el sueldo vigente con sus días y la fecha desde la que vale, y el historial', async () => {
        mount(wages());
        expect(await screen.findByTestId('wage-current')).toHaveTextContent('$320 por día · lunes a viernes · desde 15 nov 2026');
        const history = screen.getByTestId('wage-history');
        expect(history).toHaveTextContent('Acuerdo inicial con la gerencia');
        expect(history).toHaveTextContent('Registrado por Alonso');
    });

    it('muestra el próximo cambio cuando existe', async () => {
        mount(wages({ current: [{ employee_id: 'e-dago', employee_name: 'Dago', current: RATE, next: NEXT }], rates: [NEXT, RATE] }));
        expect(await screen.findByTestId('wage-next')).toHaveTextContent('Próximo cambio: $350 por día · lunes a sábado · desde 29 nov 2026');
    });

    it('la cuenta principal ve "Cambiar sueldo"; quien no puede editar lo ve en solo lectura, sin botones ni formulario', async () => {
        mount(wages({ can_edit: false }));
        expect(await screen.findByTestId('wage-readonly')).toHaveTextContent('solo lectura');
        expect(screen.queryByRole('button', { name: /Cambiar sueldo|Asignar sueldo/ })).toBeNull();
        expect(screen.queryByTestId('wage-form')).toBeNull();
    });

    it('sin sueldo: "Sin sueldo fijo: gana por comisión y propinas"; "Asignar sueldo" solo para la cuenta principal', async () => {
        const empty = wages({ rates: [], current: [] });
        mount(empty);
        expect(await screen.findByText('Sin sueldo fijo: gana por comisión y propinas')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Asignar sueldo/ })).toBeInTheDocument();
    });

    it('sin sueldo y sin permiso: el mismo mensaje y ningún botón', async () => {
        mount(wages({ rates: [], current: [], can_edit: false }));
        expect(await screen.findByText('Sin sueldo fijo: gana por comisión y propinas')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Asignar sueldo/ })).toBeNull();
    });

    it('una ficha en $0 se lee como "sin sueldo"', async () => {
        const zero = { ...RATE, daily_amount: 0, work_days: [], work_days_label: 'sin días fijos' };
        mount(wages({ rates: [zero], current: [{ employee_id: 'e-dago', employee_name: 'Dago', current: zero, next: null }] }));
        expect(await screen.findByText('Sin sueldo fijo: gana por comisión y propinas')).toBeInTheDocument();
    });

    it('un fallo de carga se explica y deja reintentar', async () => {
        let attempts = 0;
        const calls = stubFetch((c) => {
            if (c.url.startsWith('/api/wages')) { attempts += 1; return attempts === 1 ? { status: 500, body: { error: 'x' } } : { body: wages() }; }
            return undefined;
        });
        render(<WageSection employee={DAGO} />);
        expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el sueldo');
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        expect(await screen.findByTestId('wage-current')).toBeInTheDocument();
        expect(calls.filter((c) => c.url.startsWith('/api/wages'))).toHaveLength(2);
    });

    it('el formulario trae los botones L M M J V S D con los días actuales marcados y valida antes de pedir el PIN', async () => {
        const { calls } = mount(wages());
        fireEvent.click(await screen.findByRole('button', { name: /Cambiar sueldo/ }));
        const form = await screen.findByTestId('wage-form');
        const days = within(form).getByRole('group', { name: 'Días de trabajo' });
        const buttons = within(days).getAllByRole('button');
        expect(buttons.map((b) => b.textContent)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
        expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true', 'true', 'true', 'false', 'false']);
        expect(within(form).getByLabelText('Sueldo por día ($)')).toHaveValue('320');

        // Monto vacío y sin días: no pasa al PIN.
        fireEvent.change(within(form).getByLabelText('Sueldo por día ($)'), { target: { value: '' } });
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        expect(await within(form).findByText(/Escribe el sueldo por día/)).toBeInTheDocument();
        fireEvent.change(within(form).getByLabelText('Sueldo por día ($)'), { target: { value: '350' } });
        for (const b of buttons.filter((x) => x.getAttribute('aria-pressed') === 'true')) fireEvent.click(b);
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));
        expect(await within(form).findByText('Elige al menos un día de trabajo.')).toBeInTheDocument();
        expect(screen.queryByTestId('pin-confirm')).toBeNull();
        expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    });

    it('guarda con PIN y motivo: manda monto, días, vigencia y motivo; refresca la ficha y avisa a Equipo', async () => {
        const { calls, onChanged } = mount(wages(), (c) => (c.method === 'PUT' ? { status: 200, body: { id: 'r3' } } : undefined));
        fireEvent.click(await screen.findByRole('button', { name: /Cambiar sueldo/ }));
        const form = await screen.findByTestId('wage-form');
        fireEvent.change(within(form).getByLabelText('Sueldo por día ($)'), { target: { value: '350' } });
        fireEvent.click(within(form).getByRole('button', { name: 'sábado' }));
        fireEvent.click(within(form).getByRole('button', { name: 'Continuar' }));

        const dialog = await screen.findByTestId('pin-confirm');
        expect(within(dialog).getByTestId('wage-summary')).toHaveTextContent('Dago: $350 por día · lunes, martes, miércoles, jueves, viernes, sábado · desde 15 nov 2026');
        fireEvent.change(within(dialog).getByLabelText(/Motivo del cambio/), { target: { value: 'Aumento acordado' } });
        fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: '482913' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /Guardar sueldo con PIN/ }));
        await waitFor(() => expect(screen.queryByTestId('pin-confirm')).toBeNull());

        const put = calls.find((c) => c.method === 'PUT')!;
        expect(put.url).toBe('/api/wages');
        expect(put.body).toEqual({ employee_id: 'e-dago', daily_amount: 350, work_days: [1, 2, 3, 4, 5, 6], effective_from: '2026-11-15', reason: 'Aumento acordado', pin: '482913' });
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        // Se vuelve a leer la ficha (2 lecturas: la primera y la de después de guardar).
        expect(calls.filter((c) => c.method === 'GET' && c.url.startsWith('/api/wages'))).toHaveLength(2);
    });

    it('si la base rechaza el cambio (409 o PIN incorrecto), el mensaje se muestra en la ventana del PIN', async () => {
        mount(wages(), (c) => (c.method === 'PUT' ? { status: 409, body: { error: 'Ya hay un recibo pagado (REC-0007) que cubre esa fecha; elige una vigencia posterior.' } } : undefined));
        fireEvent.click(await screen.findByRole('button', { name: /Cambiar sueldo/ }));
        fireEvent.click(within(await screen.findByTestId('wage-form')).getByRole('button', { name: 'Continuar' }));
        const dialog = await screen.findByTestId('pin-confirm');
        fireEvent.change(within(dialog).getByLabelText(/Motivo del cambio/), { target: { value: 'Ajuste de prueba' } });
        fireEvent.change(within(dialog).getByLabelText(/Tu PIN/), { target: { value: '482913' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /Guardar sueldo con PIN/ }));
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ya hay un recibo pagado (REC-0007)');
    });
});
