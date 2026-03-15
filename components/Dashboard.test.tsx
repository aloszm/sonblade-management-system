import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';

describe('Dashboard — Traducción al Español', () => {
    it('muestra el título "Super Dashboard"', async () => {
        render(<Dashboard />);

        expect(await screen.findByText('Super Dashboard')).toBeInTheDocument();
    });

    it('muestra las métricas en español', async () => {
        render(<Dashboard />);

        expect(await screen.findByText('Ingresos Totales')).toBeInTheDocument();
        expect(screen.getByText('Servicios (Cortes)')).toBeInTheDocument();
        expect(screen.getByText('Propinas Generadas')).toBeInTheDocument();
        expect(screen.getByText('Egresos Caja')).toBeInTheDocument();
    });

    it('muestra las secciones del dashboard en español', async () => {
        render(<Dashboard />);

        expect(await screen.findByText('Flujo de Caja (Hoy)')).toBeInTheDocument();
        expect(screen.getByText('Ingresos (Semana Actual)')).toBeInTheDocument();
        expect(screen.getByText('Métodos de Pago')).toBeInTheDocument();
        expect(screen.getByText('Rendimiento de Barberos')).toBeInTheDocument();
    });

    it('muestra los selectores de periodo en español', async () => {
        render(<Dashboard />);

        expect(await screen.findByText('Día')).toBeInTheDocument();
        expect(screen.getByText('Semana')).toBeInTheDocument();
        expect(screen.getByText('Mes')).toBeInTheDocument();
    });

    it('muestra nombres de barberos reales (Deya, Sonny)', async () => {
        render(<Dashboard />);

        expect(await screen.findByText('Deya')).toBeInTheDocument();
        expect(screen.getByText('Sonny')).toBeInTheDocument();
    });

    it('NO contiene texto en inglés', async () => {
        render(<Dashboard />);

        await screen.findByText('Super Dashboard'); // wait for load
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
