import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Sidebar from './Sidebar';

describe('Sidebar — Traducción al Español', () => {
    it('muestra todos los labels del menú en español', async () => {
        render(<Sidebar isOpen={true} />);

        expect(await screen.findByText('Panel Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Punto de Venta')).toBeInTheDocument();
        expect(screen.getByText('Historial de Ventas')).toBeInTheDocument();
        expect(screen.getByText('Inventario / Stock')).toBeInTheDocument();
        expect(screen.getByText('Control de Caja')).toBeInTheDocument();
        expect(screen.getByText('Equipo de Barberos')).toBeInTheDocument();
        expect(screen.getByText('Mi Panel Personal')).toBeInTheDocument();
    });

    it('muestra la sección de administración y configuración en español', async () => {
        render(<Sidebar isOpen={true} />);

        await screen.findByText('ADMINISTRACIÓN');
        expect(screen.getByText('Resumen Financiero')).toBeInTheDocument();
        expect(screen.getByText('Catálogo de Servicios')).toBeInTheDocument();
    });

    it('muestra el nombre del administrador', async () => {
        render(<Sidebar isOpen={true} />);

        expect(await screen.findByText('Alonso Miranda')).toBeInTheDocument();
    });

    it('NO contiene texto en inglés (Dashboard, Settings, Manager, etc.)', async () => {
        render(<Sidebar isOpen={true} />);

        await screen.findByText('Panel Dashboard'); // wait for load
        expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
        expect(screen.queryByText('My Dashboard (Barber)')).not.toBeInTheDocument();
        expect(screen.queryByText('Settings')).not.toBeInTheDocument();
        expect(screen.queryByText('Shop Profile')).not.toBeInTheDocument();
        expect(screen.queryByText('Configuration')).not.toBeInTheDocument();
        expect(screen.queryByText('Manager')).not.toBeInTheDocument();
    });

    it('no renderiza nada cuando isOpen es false', () => {
        const { container } = render(<Sidebar isOpen={false} />);
        expect(container.innerHTML).toBe('');
    });
});
