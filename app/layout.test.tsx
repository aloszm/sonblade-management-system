import { describe, expect, it } from 'vitest';
import { viewport } from './layout';

describe('Viewport', () => {
    it('no bloquea el zoom (WCAG 1.4.4)', () => {
        expect(viewport).not.toHaveProperty('maximumScale');
        expect(viewport).not.toHaveProperty('userScalable');
        expect(viewport.width).toBe('device-width');
        expect(viewport.initialScale).toBe(1);
    });
});
