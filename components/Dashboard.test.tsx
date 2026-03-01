import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';

describe('Dashboard — Traducción al Español', () => {
    it('muestra el título "Resumen General"', () => {
        render(<Dashboard />);

        expect(screen.getByText('Resumen General')).toBeInTheDocument();
    });

    it('muestra la navegación breadcrumb en español', () => {
        render(<Dashboard />);

        expect(screen.getByText('Inicio')).toBeInTheDocument();
        expect(screen.getByText('Panel')).toBeInTheDocument();
    });

    it('muestra las métricas en español', () => {
        render(<Dashboard />);

        expect(screen.getByText('Citas Totales')).toBeInTheDocument();
        expect(screen.getByText('Ingresos de Hoy')).toBeInTheDocument();
        expect(screen.getByText('Nuevos Clientes')).toBeInTheDocument();
        expect(screen.getByText('Productos con Stock Bajo')).toBeInTheDocument();
    });

    it('muestra las secciones del dashboard en español', () => {
        render(<Dashboard />);

        expect(screen.getByText('Resumen de Ingresos')).toBeInTheDocument();
        expect(screen.getByText('Próximas Citas')).toBeInTheDocument();
        expect(screen.getByText('Ver Todas')).toBeInTheDocument();
        expect(screen.getByText('Ver Calendario')).toBeInTheDocument();
    });

    it('muestra los selectores de periodo en español', () => {
        render(<Dashboard />);

        expect(screen.getByText('Esta Semana')).toBeInTheDocument();
        expect(screen.getByText('Semana Pasada')).toBeInTheDocument();
    });

    it('muestra "Hoy" en la lista de citas', () => {
        render(<Dashboard />);

        const todayElements = screen.getAllByText('Hoy');
        expect(todayElements.length).toBeGreaterThan(0);
    });

    it('muestra nombres de barberos reales (Deya, Sonny)', () => {
        render(<Dashboard />);

        expect(screen.getByText('Corte y Barba')).toBeInTheDocument();
        expect(screen.getByText('Afeitado Completo')).toBeInTheDocument();
        expect(screen.getByText('Corte y Ceja')).toBeInTheDocument();
    });

    it('NO contiene texto en inglés', () => {
        render(<Dashboard />);

        expect(screen.queryByText('Dashboard Overview')).not.toBeInTheDocument();
        expect(screen.queryByText('Home')).not.toBeInTheDocument();
        expect(screen.queryByText('Total Appointments')).not.toBeInTheDocument();
        expect(screen.queryByText("Today's Revenue")).not.toBeInTheDocument();
        expect(screen.queryByText('New Clients')).not.toBeInTheDocument();
        expect(screen.queryByText('Low Stock Items')).not.toBeInTheDocument();
        expect(screen.queryByText('Revenue Overview')).not.toBeInTheDocument();
        expect(screen.queryByText('Upcoming Appointments')).not.toBeInTheDocument();
        expect(screen.queryByText('This Week')).not.toBeInTheDocument();
        expect(screen.queryByText('Last Week')).not.toBeInTheDocument();
        expect(screen.queryByText('View All')).not.toBeInTheDocument();
        expect(screen.queryByText('View Calendar')).not.toBeInTheDocument();
    });
});
