// @vitest-environment node
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_ITEM, NAV_SECTIONS, PAGE_TITLES, QUICK_LINKS } from '@/lib/nav';
import { ADMIN_ONLY_PATHS } from './route-access';
import { PUBLIC_PAGE_ROUTES, SCREENS } from './screens';

/**
 * CENTINELA de Configuración → «Quién ve qué». Si alguien agrega una pantalla, un elemento del menú o una ruta
 * protegida y no queda en el inventario de la página, esta prueba FALLA. Qué hacer cuando falla: agrega la pantalla
 * a SCREENS (lib/auth/screens.ts) —o, si es pública, a PUBLIC_PAGE_ROUTES— y, si trae acciones nuevas por puesto,
 * una capacidad en lib/auth/capabilities.ts. Nada de esto se escribe por puesto: lo demás se calcula solo.
 */
const APP_DIR = path.resolve(__dirname, '../../app');

function pageRoutes(dir: string, prefix = ''): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
            // Los grupos de rutas «(grupo)» no forman parte de la dirección.
            found.push(...pageRoutes(full, /^\(.*\)$/.test(name) ? prefix : `${prefix}/${name}`));
        } else if (name === 'page.tsx') {
            found.push(prefix === '' ? '/' : prefix);
        }
    }
    return found;
}

const catalogRoutes = SCREENS.map((s) => s.route);

describe('centinela: nada protegido queda fuera de «Quién ve qué»', () => {
    it('toda página de app/ está en el inventario de pantallas (o es pública a propósito)', () => {
        const actual = pageRoutes(APP_DIR).filter((r) => !PUBLIC_PAGE_ROUTES.includes(r));
        const missing = actual.filter((r) => !catalogRoutes.includes(r));
        expect(missing, `Pantallas nuevas sin agregar a SCREENS (lib/auth/screens.ts): ${missing.join(', ')}`).toEqual([]);
    });

    it('el inventario no lista pantallas que ya no existen, ni repetidas', () => {
        const actual = pageRoutes(APP_DIR);
        const stale = catalogRoutes.filter((r) => !actual.includes(r));
        expect(stale, `Pantallas listadas que ya no existen: ${stale.join(', ')}`).toEqual([]);
        expect(new Set(catalogRoutes).size).toBe(catalogRoutes.length);
        const publicStale = PUBLIC_PAGE_ROUTES.filter((r) => !actual.includes(r));
        expect(publicStale, `Públicas listadas que ya no existen: ${publicStale.join(', ')}`).toEqual([]);
    });

    it('todo elemento del menú (y Mi cuenta) corresponde a una pantalla del inventario', () => {
        const hrefs = [...NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href)), ACCOUNT_ITEM.href];
        const missing = hrefs.filter((h) => !catalogRoutes.includes(h));
        expect(missing, `Elementos del menú sin pantalla en el inventario: ${missing.join(', ')}`).toEqual([]);
    });

    it('los atajos de la barra inferior son elementos reales del menú', () => {
        const hrefs = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
        for (const [profile, links] of Object.entries(QUICK_LINKS)) {
            for (const link of links) expect(hrefs, `${profile}: ${link}`).toContain(link);
        }
    });

    // '/productos' está protegida en el middleware pero hoy no tiene pantalla (se conserva por si se crea).
    const PROTECTED_WITHOUT_PAGE = ['/productos'];
    it('toda ruta protegida por las guardas de página tiene pantalla en el inventario', () => {
        const uncovered = ADMIN_ONLY_PATHS.filter((p) => !PROTECTED_WITHOUT_PAGE.includes(p)
            && !catalogRoutes.some((r) => r === p || r.startsWith(`${p}/`)));
        expect(uncovered, `Rutas protegidas sin pantalla en el inventario: ${uncovered.join(', ')}`).toEqual([]);
        for (const p of PROTECTED_WITHOUT_PAGE) expect(catalogRoutes.some((r) => r === p || r.startsWith(`${p}/`))).toBe(false);
    });

    it('cada pantalla del inventario tiene título (el mismo del menú cuando lo hay)', () => {
        for (const screen of SCREENS) {
            expect(screen.title.length).toBeGreaterThan(1);
            if (PAGE_TITLES[screen.route]) expect(screen.title).toBe(PAGE_TITLES[screen.route]);
        }
    });
});
