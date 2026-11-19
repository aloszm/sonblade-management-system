import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PRACTICE_BANNER_TEXT, PRACTICE_PRINT_MARK, appMode, isPracticeMode, withPracticeTitle } from '@/lib/app-mode';
import PracticeBanner from '@/components/PracticeBanner';
import PracticePrintMark from '@/components/PracticePrintMark';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => '/login' }));

afterEach(() => { vi.unstubAllEnvs(); });

describe('modo práctica', () => {
    it('sin la variable es producción', () => {
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', '');
        expect(isPracticeMode()).toBe(false);
        expect(appMode()).toBe('production');
        expect(withPracticeTitle('Gallo 4:20 · BarberOS')).toBe('Gallo 4:20 · BarberOS');
    });
    it('otro valor tampoco activa la práctica', () => {
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'Practice ');
        expect(isPracticeMode()).toBe(false);
    });
    it('con NEXT_PUBLIC_APP_MODE=practice se activa y el título lleva el prefijo', () => {
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'practice');
        expect(isPracticeMode()).toBe(true);
        expect(appMode()).toBe('practice');
        expect(withPracticeTitle('Reservar')).toBe('PRÁCTICA · Reservar');
    });

    it('la franja es un role=status con el texto exacto solo en práctica', () => {
        const { rerender } = render(<PracticeBanner />);
        expect(screen.queryByRole('status')).toBeNull();
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'practice');
        rerender(<PracticeBanner />);
        expect(screen.getByRole('status')).toHaveTextContent(PRACTICE_BANNER_TEXT);
        expect(PRACTICE_BANNER_TEXT).toBe('MODO PRÁCTICA — nada de lo que hagas aquí es real');
    });

    it('los tickets y recibos llevan la marca solo en práctica', () => {
        const { container, rerender } = render(<PracticePrintMark />);
        expect(container).toBeEmptyDOMElement();
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'practice');
        rerender(<PracticePrintMark />);
        expect(screen.getByTestId('practice-print-mark')).toHaveTextContent(PRACTICE_PRINT_MARK);
        expect(PRACTICE_PRINT_MARK).toBe('PRÁCTICA — SIN VALOR');
    });

    it('/login muestra la línea de práctica solo con la variable', async () => {
        const { default: LoginPage } = await import('@/app/login/page');
        const { unmount } = render(<LoginPage />);
        expect(screen.queryByTestId('practice-login-note')).toBeNull();
        unmount();
        vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'practice');
        render(<LoginPage />);
        expect(screen.getByTestId('practice-login-note')).toHaveTextContent('Estás en la versión de práctica. Usa tu PIN de práctica, no el real.');
    });
});
