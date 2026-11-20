import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PuntoDeEquilibrioPage from './page';
import BreakEvenView from './_components/BreakEvenView';
import { breakEvenFixture } from '@/lib/break-even/fixture';
import type { BreakEvenData } from '@/lib/break-even/model';

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

type Reply = { ok?: boolean; status?: number; body: unknown };
function mockFetch(handler: (url: string, init?: RequestInit) => Reply | Promise<Reply>) {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const r = await handler(url, init);
        return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body };
    }));
}
const api = (data: BreakEvenData, canEdit: boolean) => ({ ...data, can_edit: canEdit });

afterEach(() => { vi.unstubAllGlobals(); });

describe('Punto de equilibrio — pantalla', () => {
    it('cargando: esqueleto; luego el avance, las cubetas en orden y el reparto', async () => {
        let release: (v: unknown) => void = () => {};
        const gate = new Promise((r) => { release = r; });
        mockFetch(async (url) => {
            if (url.startsWith('/api/break-even')) { await gate; return { body: api(breakEvenFixture({ margin: 6318 }), true) }; }
            return { body: {} };
        });
        render(<PuntoDeEquilibrioPage />);
        expect(screen.getByTestId('be-loading')).toBeInTheDocument();
        await act(async () => { release(null); });
        expect(await screen.findByTestId('be-hero-title')).toHaveTextContent('Llevas cubierto el 35 % del mes');
        expect(screen.getByTestId('be-hero-detail')).toHaveTextContent('Te faltan unos 124 servicios para cubrirlo todo.');
        const names = screen.getAllByTestId('be-bucket').map((li) => li.querySelector('span.truncate')?.textContent);
        expect(names).toEqual(['Renta', 'Luz', 'Internet', 'Sueldos']);
        expect(screen.getAllByText('estimado')).toHaveLength(2);
        expect(screen.getByText('$1,000 cada 2 meses · $500 al mes')).toBeInTheDocument();
        expect(within(screen.getByTestId('be-per100')).getByText('Te queda')).toBeInTheDocument();
        expect(screen.getByTestId('be-pace')).toHaveTextContent('Para cubrir el mes necesitas unos 7 servicios al día; esta semana vas en 8.');
        expect(screen.getByTestId('be-note')).toHaveTextContent('Es una estimación: cada servicio deja distinto.');
    });

    it('cuenta principal: Editar, flechas y Agregar; guarda con la ruta de gastos fijos y recarga', async () => {
        const data = breakEvenFixture({ margin: 6318 });
        mockFetch((url, init) => {
            if (url.startsWith('/api/break-even')) return { body: api(data, true) };
            if (url === '/api/recurring-expenses' && init?.method === 'PATCH') return { body: { id: 'l' } };
            if (url === '/api/recurring-expenses/reorder') return { body: { order: [] } };
            return { body: { categories: [] } };
        });
        render(<PuntoDeEquilibrioPage />);
        await screen.findByTestId('be-hero-title');
        expect(screen.getAllByRole('button', { name: /^Editar/ })).toHaveLength(3);
        expect(screen.getByRole('button', { name: /Agregar gasto fijo/ })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Bajar Renta' }));
        await waitFor(() => expect(calls.some((c) => c.url === '/api/recurring-expenses/reorder')).toBe(true));
        const reorder = calls.find((c) => c.url === '/api/recurring-expenses/reorder');
        expect(JSON.parse(String(reorder?.init?.body))).toEqual({ ids: ['l', 'r', 'i'] });

        fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }));
        const amount = await screen.findByLabelText('Monto que pagas ($)');
        expect(screen.getByLabelText('Es un monto estimado (lo ajusto después)')).toBeChecked();
        fireEvent.change(amount, { target: { value: '1200' } });
        expect(screen.getByLabelText('Es un monto estimado (lo ajusto después)')).not.toBeChecked();
        expect(screen.getByTestId('be-monthly')).toHaveTextContent('$600.00');
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
        await waitFor(() => expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true));
        const patch = calls.find((c) => c.init?.method === 'PATCH');
        expect(JSON.parse(String(patch?.init?.body))).toEqual({ id: 'l', name: 'Luz', suggested_amount: 1200, every_months: 2, is_estimate: false });
        await waitFor(() => expect(calls.filter((c) => c.url.startsWith('/api/break-even')).length).toBeGreaterThanOrEqual(3));
    });

    it('gerencia y consulta: solo lectura (sin Editar, flechas ni Agregar)', async () => {
        mockFetch((url) => ({ body: url.startsWith('/api/break-even') ? api(breakEvenFixture({ margin: 6318 }), false) : {} }));
        render(<PuntoDeEquilibrioPage />);
        await screen.findByTestId('be-hero-title');
        expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Subir|Bajar/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Agregar gasto fijo/ })).toBeNull();
    });

    it('sin gastos fijos: invita a capturarlos (botón solo para la cuenta principal)', async () => {
        mockFetch((url) => ({ body: url.startsWith('/api/break-even') ? api(breakEvenFixture({ setup: true, margin: 0 }), true) : { categories: [] } }));
        render(<PuntoDeEquilibrioPage />);
        expect(await screen.findByTestId('be-setup')).toHaveTextContent('Captura tus gastos fijos para empezar');
        fireEvent.click(screen.getByRole('button', { name: /Agregar gasto fijo/ }));
        expect(await screen.findByRole('dialog')).toHaveTextContent('Agregar gasto fijo');
    });

    it('error con Reintentar', async () => {
        let fail = true;
        mockFetch((url) => {
            if (url.startsWith('/api/break-even') && fail) return { ok: false, status: 500, body: { error: 'No se pudo completar la operación.' } };
            return { body: api(breakEvenFixture({ margin: 6318 }), false) };
        });
        render(<PuntoDeEquilibrioPage />);
        const retry = await screen.findByRole('button', { name: /Reintentar/ });
        fail = false;
        fireEvent.click(retry);
        expect(await screen.findByTestId('be-hero-title')).toHaveTextContent('35 %');
    });

    it('selector de mes: anterior pide el mes; siguiente se apaga en el mes en curso', async () => {
        mockFetch((url) => ({ body: api(url.includes('month=2026-10') ? { ...breakEvenFixture({ status: 'past', margin: 9000 }), month: '2026-10' } : breakEvenFixture({ today: '2026-11-20' }), false) }));
        render(<PuntoDeEquilibrioPage />);
        await screen.findByTestId('be-hero-title');
        expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
        await waitFor(() => expect(calls.some((c) => c.url === '/api/break-even?month=2026-10')).toBe(true));
        expect(await screen.findByText('El mes cerró con el 49 % cubierto')).toBeInTheDocument();
        expect(screen.getByTestId('be-month')).toHaveTextContent('octubre 2026');
        expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeEnabled();
    });
});

describe('Punto de equilibrio — estados de la vista', () => {
    const noop = () => {};
    it('aprendiendo el ritmo: lo dice y no muestra ritmo ni meta en pesos', () => {
        render(<BreakEvenView data={breakEvenFixture({ margin: 3249, enough: false, refDays: 6 })} canEdit={false} canGoNext={false} onPrev={noop} onNext={noop} />);
        expect(screen.getByTestId('be-learning')).toHaveTextContent('Aún estamos aprendiendo tu ritmo');
        expect(screen.queryByTestId('be-pace')).toBeNull();
        expect(screen.queryByText('Ventas para cubrirlo (aprox.)')).toBeNull();
    });
    it('mes cubierto: festejo sobrio y ganancia', () => {
        render(<BreakEvenView data={breakEvenFixture({ margin: 19900, coveredOn: '2026-11-19' })} canEdit={false} canGoNext={false} onPrev={noop} onNext={noop} />);
        expect(screen.getByTestId('be-hero-title')).toHaveTextContent('¡Mes cubierto el día 19!');
        expect(screen.getByText('Meta del mes cumplida')).toBeInTheDocument();
        expect(screen.getAllByText('Cubierto')).toHaveLength(4);
    });
    it('mes sin ventas: lo dice sin alarma', () => {
        render(<BreakEvenView data={breakEvenFixture({ margin: 0, sales: 0 })} canEdit={false} canGoNext={false} onPrev={noop} onNext={noop} />);
        expect(screen.getByTestId('be-no-sales')).toHaveTextContent('Todavía no hay ventas este mes');
    });
    it('modo práctica: "Datos de ensayo"', () => {
        render(<BreakEvenView data={breakEvenFixture()} practice canEdit={false} canGoNext={false} onPrev={noop} onNext={noop} />);
        expect(screen.getByTestId('be-practice')).toHaveTextContent('Datos de ensayo');
    });
    it('nada en rojo: ni el anillo ni las barras usan el color de peligro', () => {
        const { container } = render(<BreakEvenView data={breakEvenFixture({ today: '2026-11-28', margin: 1000 })} canEdit canGoNext={false} onPrev={noop} onNext={noop} />);
        expect(container.innerHTML).not.toMatch(/bos-danger/);
    });
});
