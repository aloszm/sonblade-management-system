import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const motionConfig = vi.hoisted(() => vi.fn());
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
    return {
        ...actual,
        MotionConfig: (props: { reducedMotion?: string; children: React.ReactNode }) => { motionConfig(props.reducedMotion); return <>{props.children}</>; },
    };
});
vi.mock('@/components/Sidebar', () => ({ default: () => <aside data-testid="sidebar"><a href="/x">Menú</a></aside> }));
vi.mock('@/components/Header', () => ({ default: () => <header>Encabezado</header> }));
vi.mock('@/components/MobileNav', () => ({ default: () => <nav>Inferior</nav> }));

import AppShell from './AppShell';

afterEach(() => { motionConfig.mockClear(); vi.unstubAllGlobals(); });

describe('AppShell', () => {
    it('respeta prefers-reduced-motion con MotionConfig reducedMotion="user"', () => {
        render(<AppShell><p>Contenido</p></AppShell>);
        expect(motionConfig).toHaveBeenCalledWith('user');
        expect(screen.getByText('Contenido')).toBeInTheDocument();
    });

    it('no bloquea la navegación esperando una animación de salida ni usa desenfoque', () => {
        const source = readFileSync(path.resolve(__dirname, 'AppShell.tsx'), 'utf8');
        expect(source).not.toMatch(/AnimatePresence/);
        expect(source).not.toMatch(/mode="wait"/);
        expect(source).not.toMatch(/blur/);
    });

    it('usa dvh y no h-screen', () => {
        const { container } = render(<AppShell><p>Contenido</p></AppShell>);
        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toContain('100dvh');
        expect(root.className).not.toContain('100vh');
    });

    it('el contenido crece con la página: el hueco para la barra inferior del celular queda después del último botón', () => {
        const { container } = render(<AppShell><p>Contenido</p></AppShell>);
        const main = container.querySelector('main') as HTMLElement;
        const wrapper = screen.getByText('Contenido').parentElement as HTMLElement;
        // El hueco (5rem, más alto que la barra de 4rem) vive en <main>…
        expect(main.className).toContain('pb-[calc(5rem+env(safe-area-inset-bottom))]');
        expect(wrapper.parentElement).toBe(main);
        // …y solo protege al contenido si el envoltorio no tiene alto fijo (con h-full el contenido se desbordaba por debajo de la barra).
        expect(wrapper.className.split(/\s+/)).toContain('min-h-full');
        expect(wrapper.className.split(/\s+/)).not.toContain('h-full');
    });

    it('el cajón del menú queda inerte y oculto en celular mientras está cerrado', () => {
        const { container } = render(<AppShell><p>Contenido</p></AppShell>);
        const drawer = container.querySelector('[data-testid="sidebar"]')!.parentElement as HTMLElement;
        expect(drawer).toHaveAttribute('inert');
        expect(drawer).toHaveAttribute('aria-hidden', 'true');
    });

    it('en escritorio el menú está activo', () => {
        vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
        const { container } = render(<AppShell><p>Contenido</p></AppShell>);
        const drawer = container.querySelector('[data-testid="sidebar"]')!.parentElement as HTMLElement;
        expect(drawer).not.toHaveAttribute('inert');
        expect(drawer).not.toHaveAttribute('aria-hidden');
    });
});
