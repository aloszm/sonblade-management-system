import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WeekSummary from './WeekSummary';
import WeekBreakdown from './WeekBreakdown';
import type { PersonLineApi, PersonWeekApi } from '@/lib/team/person-week';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const WINDOW = { start: '2026-11-15T02:00:00Z', end: '2026-11-22T02:00:00Z', startDay: '2026-11-15', endDay: '2026-11-21' };
const kind = (count: number, revenue: number, commission: number, percent: number | null) => ({ count, revenue, commission, percent });
const PERSON: PersonWeekApi = {
    employeeId: 'e1', name: 'Deya', isBarber: true, services: kind(2, 240, 120, 50), products: kind(1, 180, 36, 20),
    tips: 20, revenue: 420, commission: 156, earned: 176,
};

describe('tarjeta: resumen de la semana', () => {
    it('explica servicios, producto, propinas, ventas y lo que gana, con su periodo', () => {
        render(<WeekSummary person={PERSON} window={WINDOW} />);
        expect(screen.getByTestId('week-caption')).toHaveTextContent('Esta semana · 15 al 21 de noviembre de 2026');
        expect(screen.getByTestId('week-services')).toHaveTextContent('Servicios: 2 · $240 → comisión 50 % = $120');
        expect(screen.getByTestId('week-products')).toHaveTextContent('Productos: 1 · $180 → comisión 20 % = $36');
        expect(screen.getByTestId('week-tips')).toHaveTextContent('Propinas: $20');
        expect(screen.getByTestId('week-total')).toHaveTextContent('Ventas: $420Gana: $176');
        expect(screen.queryByText(/cortes/i)).toBeNull();
    });

    it('sin propinas no las menciona; con varios porcentajes muestra solo el monto', () => {
        render(<WeekSummary person={{ ...PERSON, tips: 0, earned: 156, services: kind(2, 240, 108, null) }} window={WINDOW} />);
        expect(screen.queryByTestId('week-tips')).toBeNull();
        expect(screen.getByTestId('week-services')).toHaveTextContent('Servicios: 2 · $240 → comisión $108');
        expect(screen.getByTestId('week-total')).toHaveTextContent('Gana: $156');
    });

    it('sin ventas lo dice', () => {
        const empty: PersonWeekApi = { ...PERSON, services: kind(0, 0, 0, null), products: kind(0, 0, 0, null), tips: 0, revenue: 0, commission: 0, earned: 0 };
        render(<WeekSummary person={empty} window={WINDOW} />);
        expect(screen.getByTestId('week-empty')).toHaveTextContent('Sin ventas esta semana.');
        expect(screen.queryByTestId('week-total')).toBeNull();
    });

    it('con sueldo por día avisa que no está sumado', () => {
        render(<WeekSummary person={PERSON} window={WINDOW} hasWage />);
        expect(screen.getByText(/No incluye el sueldo por día/)).toBeInTheDocument();
    });
});

const LINES: PersonLineApi[] = [
    { key: 'a', saleId: 's2', folio: 'V2611-0002', paidAt: '2026-11-17T18:00:00Z', kind: 'product', concept: 'Cera', quantity: 1, revenue: 180, base: 180, percent: 20, commission: 36, tip: 0, courtesy: false },
    { key: 'b', saleId: 's1', folio: 'V2611-0001', paidAt: '2026-11-16T17:00:00Z', kind: 'service', concept: 'Barba', quantity: 1, revenue: 120, base: 120, percent: 50, commission: 60, tip: 20, courtesy: false },
];

function stub(reply: () => { ok: boolean; status?: number; body: unknown } | Promise<never>) {
    const fn = vi.fn(async () => { const r = await reply(); return { ok: r.ok, status: r.status ?? 200, json: async () => r.body }; });
    vi.stubGlobal('fetch', fn);
    return fn;
}

describe('ventana: desglose de la semana', () => {
    it('lista cada venta con folio, base, % y comisión, un enlace a su ticket y totales iguales a la tarjeta', async () => {
        const fn = stub(() => ({ ok: true, body: { timezone: 'America/Mexico_City', window: WINDOW, summary: PERSON, lines: LINES } }));
        render(<WeekBreakdown employeeId="e1" name="Deya" />);
        expect(screen.getByLabelText('Cargando el desglose de la semana')).toBeInTheDocument();
        const rows = await screen.findAllByTestId('week-line');
        expect(rows).toHaveLength(2);
        expect(fn).toHaveBeenCalledWith('/api/team-week/e1', { cache: 'no-store' });
        expect(within(rows[0]).getByText(/Cera/)).toBeInTheDocument();
        expect(rows[0]).toHaveTextContent('Folio V2611-0002');
        expect(rows[0]).toHaveTextContent('20 %');
        expect(within(rows[0]).getByRole('link', { name: /Ver venta/ })).toHaveAttribute('href', '/ticket/s2');
        expect(within(rows[1]).getByRole('link', { name: /Ver venta/ })).toHaveAttribute('href', '/ticket/s1');
        expect(rows[1]).toHaveTextContent('Propina$20');
        const totals = screen.getByTestId('week-totals');
        expect(within(totals).getByTestId('totals-services')).toHaveTextContent('Servicios: 2 · $240 → comisión 50 % = $120');
        expect(within(totals).getByTestId('totals-products')).toHaveTextContent('Productos: 1 · $180 → comisión 20 % = $36');
        expect(within(totals).getByTestId('totals-revenue')).toHaveTextContent('Ventas: $420');
        expect(within(totals).getByTestId('totals-earned')).toHaveTextContent('Gana: $176');
    });

    it('un producto regalado dice "Cortesía · sin comisión", sin base ni %', async () => {
        const gift: PersonLineApi = { key: 'c', saleId: 's3', folio: 'V2611-0003', paidAt: '2026-11-18T18:00:00Z', kind: 'product', concept: 'Cera', quantity: 1, revenue: 0, base: null, percent: null, commission: 0, tip: 0, courtesy: true };
        stub(() => ({ ok: true, body: { timezone: 'America/Mexico_City', window: WINDOW, summary: PERSON, lines: [gift, ...LINES] } }));
        render(<WeekBreakdown employeeId="e1" name="Deya" />);
        const rows = await screen.findAllByTestId('week-line');
        expect(within(rows[0]).getByTestId('week-line-courtesy')).toHaveTextContent('Cortesía · sin comisión');
        expect(rows[0]).toHaveTextContent('Cobrado$0');
        expect(rows[0]).toHaveTextContent('Base de comisión—');
        expect(rows[0]).not.toHaveTextContent('En espera');
        expect(within(rows[1]).queryByTestId('week-line-courtesy')).toBeNull();
    });

    it('sin ventas dice "Sin ventas esta semana"', async () => {
        stub(() => ({ ok: true, body: { timezone: 'America/Mexico_City', window: WINDOW, summary: { ...PERSON, revenue: 0 }, lines: [] } }));
        render(<WeekBreakdown employeeId="e1" name="Deya" />);
        expect(await screen.findByText('Sin ventas esta semana')).toBeInTheDocument();
        expect(screen.queryByTestId('week-totals')).toBeNull();
    });

    it('si falla muestra el error y Reintentar vuelve a pedirlo', async () => {
        let fail = true;
        const fn = stub(() => (fail ? { ok: false, status: 500, body: { error: 'x' } } : { ok: true, body: { timezone: 'America/Mexico_City', window: WINDOW, summary: PERSON, lines: LINES } }));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        render(<WeekBreakdown employeeId="e1" name="Deya" />);
        expect(await screen.findByText('No se pudo cargar el desglose')).toBeInTheDocument();
        fail = false;
        fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
        await waitFor(() => expect(screen.getAllByTestId('week-line')).toHaveLength(2));
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
