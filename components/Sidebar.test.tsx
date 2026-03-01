import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Sidebar from './Sidebar';

describe('Sidebar — Traducción al Español', () => {
    it('muestra todos los labels del menú en español', () => {
        render(<Sidebar isOpen={true} />);

        expect(screen.getByText('Panel')).toBeInTheDocument();
        expect(screen.getByText('POS')).toBeInTheDocument();
        expect(screen.getByText('Ventas')).toBeInTheDocument();
        expect(screen.getByText('Inventario')).toBeInTheDocument();
        expect(screen.getByText('Caja')).toBeInTheDocument();
        expect(screen.getByText('Equipo')).toBeInTheDocument();
        expect(screen.getByText('Mi Panel (Barbero)')).toBeInTheDocument();
    });

    it('muestra la sección de configuración en español', () => {
        render(<Sidebar isOpen={true} />);

        const configElements = screen.getAllByText('Configuración');
        expect(configElements.length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Perfil del Negocio')).toBeInTheDocument();
    });

    it('muestra el nombre del administrador', () => {
        render(<Sidebar isOpen={true} />);

        expect(screen.getByText('Alonso Miranda')).toBeInTheDocument();
    });

    it('NO contiene texto en inglés (Dashboard, Settings, Manager, etc.)', () => {
        render(<Sidebar isOpen={true} />);

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
