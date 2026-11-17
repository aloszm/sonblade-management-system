import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BARBER_COLORS, TINT_HOVER_PCT, TINT_PCT, initialOf, longDayTitle } from './agenda-ui';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
const block = (selector: string) => {
    const start = css.indexOf(selector);
    return css.slice(start, css.indexOf('}', start));
};
const tokens = (selector: string) => Object.fromEntries([...block(selector).matchAll(/--bos-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const THEMES = { claro: tokens("[data-theme='light'] {"), oscuro: tokens("[data-theme='dark'] {") };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
/** Igual que color-mix(in srgb, color pct%, surface): interpolación en sRGB. */
const mix = (color: string, surface: string, pct: number) => rgb(color).map((c, i) => c * (pct / 100) + rgb(surface)[i] * (1 - pct / 100));

/** Tabla de contraste: texto y texto secundario sobre el tinte de cada color, en claro y oscuro (normal y hover). */
export function contrastTable() {
    const rows: { tema: string; color: string; fondo: string; texto: number; secundario: number }[] = [];
    for (const [tema, t] of Object.entries(THEMES)) {
        for (const color of BARBER_COLORS) {
            for (const [fondo, pct] of [['normal', TINT_PCT], ['hover', TINT_HOVER_PCT]] as const) {
                const bg = mix(color, t.surface, pct);
                rows.push({ tema, color, fondo, texto: ratio(rgb(t.text), bg), secundario: ratio(rgb(t.muted), bg) });
            }
        }
    }
    return rows;
}

describe('contraste del texto de las tarjetas', () => {
    it('lee los tokens de los dos temas', () => {
        expect(THEMES.claro.surface).toBe('#FFFFFF');
        expect(THEMES.oscuro.text).toBeDefined();
    });
    it.each(contrastTable())('$tema · $color · $fondo: texto y texto secundario cumplen AA (4.5:1)', (row) => {
        expect(row.texto).toBeGreaterThanOrEqual(4.5);
        expect(row.secundario).toBeGreaterThanOrEqual(4.5);
    });
    it('los colores de barbero se distinguen de la superficie (3:1) para barras y puntos', () => {
        for (const t of Object.values(THEMES)) for (const c of BARBER_COLORS) expect(ratio(rgb(c), rgb(t.surface))).toBeGreaterThanOrEqual(3);
    });
});

describe('textos del encabezado', () => {
    it('título del día legible, sin coma', () => expect(longDayTitle('2026-11-16')).toBe('Lunes 16 de noviembre'));
    it('inicial del avatar', () => expect(initialOf('dani')).toBe('D'));
});
