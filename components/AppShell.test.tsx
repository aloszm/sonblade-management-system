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
