import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from './Header';

describe('Header — Traducción al Español', () => {
    const mockToggle = vi.fn();

    it('muestra el placeholder de búsqueda en español', () => {
        render(<Header toggleSidebar={mockToggle} />);

        expect(screen.getByPlaceholderText('Buscar clientes, citas o artículos...')).toBeInTheDocument();
    });

    it('muestra el botón "Nueva Cita" en español', () => {
        render(<Header toggleSidebar={mockToggle} />);

        expect(screen.getByText('Nueva Cita')).toBeInTheDocument();
    });

    it('NO contiene texto en inglés (New Appointment, Search clients...)', () => {
        render(<Header toggleSidebar={mockToggle} />);

        expect(screen.queryByText('New Appointment')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText('Search clients, bookings, or items...')).not.toBeInTheDocument();
    });
});
