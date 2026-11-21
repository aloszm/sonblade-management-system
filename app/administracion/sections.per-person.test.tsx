import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Barbers } from './sections';
import type { BarberRow } from '@/lib/admin/profit';

// Auditoría del 21 nov 2026: la tabla «Por barbero» de Finanzas incluye a recepción, y a Dago y Emi les salía
// «Deja al negocio» en negativo (−$1,328 y −$312) sin explicar que ahí se les resta su sueldo por día.
const row = (name: string, o: Partial<BarberRow>): BarberRow => ({
    employeeId: name, name, sales: 0, services: 0, products: 0, serviceUnits: 0, commission: 0, productCost: 0, wage: 0, bonus: 0, keeps: 0, tips: 0, tipCount: 0, ...o,
} as BarberRow);
const ROWS = [
    row('Deya', { services: 15190, products: 1690, sales: 16880, commission: 7948, keeps: 8378, tips: 1550 }),
    row('Dago', { products: 520, sales: 520, commission: 104, wage: 1600, keeps: -1328 }),
];

describe('Finanzas · resultado por persona', () => {
    it('se titula «Por persona» (incluye a recepción), no «Por barbero»', () => {
        render(<Barbers rows={ROWS} />);
        expect(screen.getByRole('heading', { name: 'Por persona' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Por barbero' })).toBeNull();
        const table = screen.getByRole('table', { name: /Resultado por persona/ });
        expect(within(table).getByRole('columnheader', { name: 'Persona' })).toBeInTheDocument();
        expect(within(table).queryByRole('columnheader', { name: 'Barbero' })).toBeNull();
    });

    it('la nota dice que «Deja al negocio» también resta el sueldo por día y por qué recepción sale en negativo', () => {
        render(<Barbers rows={ROWS} />);
        expect(screen.getByText(/su sueldo por día y sus bonos/)).toBeInTheDocument();
        const note = screen.getByTestId('fin-per-person-wage-note');
        expect(note).toHaveTextContent('Recepción cobra sueldo por día');
        expect(note).toHaveTextContent('No es una pérdida de esa persona');
        // El número no cambia: solo se explica.
        expect(within(screen.getByRole('table')).getByRole('row', { name: /Dago/ })).toHaveTextContent('-$1,328');
    });
});
