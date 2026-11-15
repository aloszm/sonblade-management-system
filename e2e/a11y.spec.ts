import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { login, USERS } from './helpers';

// Contraste medido con axe (regla color-contrast, WCAG 2.2 AA) en cada pantalla que cada puesto puede abrir,
// en modo oscuro y claro, en escritorio y en teléfono. SOLO LECTURA: no hace clics que creen datos.

const SCREENS = ['/', '/barbero', '/pos', '/caja', '/citas', '/clientes', '/liquidaciones', '/ventas/historial', '/cuadre', '/gastos', '/inventario', '/servicios', '/equipo', '/reportes', '/administracion', '/admin/auditoria', '/configuracion', '/login'];

const ROLES = [
    { name: 'dueño', email: USERS.owner },
    { name: 'recepción', email: USERS.reception },
    { name: 'barbero', email: USERS.barber },
];
const THEMES = ['dark', 'light'] as const;
const VIEWPORTS = [
    { name: 'escritorio', width: 1440, height: 900 },
    { name: 'teléfono', width: 390, height: 844 },
];

type Problem = { role: string; theme: string; viewport: string; url: string; selector: string; ratio: string; needed: string; fg: string; bg: string };

for (const role of ROLES) {
    for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
            test(`contraste · ${role.name} · ${theme} · ${viewport.name}`, async ({ page }) => {
                test.setTimeout(420_000);
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await login(page, role.email);
                const problems: Problem[] = [];
                const visited: string[] = [];
                // El script del layout lee este valor y pone data-theme antes de pintar.
                await page.evaluate((t) => localStorage.setItem('barberos-theme', t), theme);

                for (const route of SCREENS) {
                    if (route === '/login') {
                        // La pantalla de acceso solo se ve sin sesión: se revisa en una página aparte.
                        continue;
                    }
                    await page.goto(route, { waitUntil: 'networkidle' });
                    if (new URL(page.url()).pathname !== route) continue; // este puesto no puede abrirla
                    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                    await page.waitForTimeout(900); // termina la animación de entrada y cargan los datos
                    visited.push(route);
                    const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
                    for (const v of result.violations) {
                        for (const node of v.nodes) {
                            const data = (node.any[0]?.data ?? {}) as { contrastRatio?: number; expectedContrastRatio?: string; fgColor?: string; bgColor?: string };
                            problems.push({
                                role: role.name, theme, viewport: viewport.name, url: route,
                                selector: node.target.join(' '),
                                ratio: String(data.contrastRatio ?? '?'), needed: data.expectedContrastRatio ?? '?',
                                fg: data.fgColor ?? '?', bg: data.bgColor ?? '?',
                            });
                        }
                    }
                }

                // Sin sesión: la pantalla de acceso.
                const guest = await page.context().browser()!.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
                const guestPage = await guest.newPage();
                await guestPage.goto(new URL('/login', page.url()).toString(), { waitUntil: 'networkidle' });
                await guestPage.evaluate((t) => localStorage.setItem('barberos-theme', t), theme);
                await guestPage.reload({ waitUntil: 'networkidle' });
                await guestPage.waitForTimeout(500);
                visited.push('/login');
                const loginResult = await new AxeBuilder({ page: guestPage }).withRules(['color-contrast']).analyze();
                for (const v of loginResult.violations) {
                    for (const node of v.nodes) {
                        const data = (node.any[0]?.data ?? {}) as { contrastRatio?: number; expectedContrastRatio?: string; fgColor?: string; bgColor?: string };
                        problems.push({ role: role.name, theme, viewport: viewport.name, url: '/login', selector: node.target.join(' '), ratio: String(data.contrastRatio ?? '?'), needed: data.expectedContrastRatio ?? '?', fg: data.fgColor ?? '?', bg: data.bgColor ?? '?' });
                    }
                }
                await guest.close();

                if (process.env.A11Y_REPORT) {
                    writeFileSync(`${process.env.A11Y_REPORT}-${role.name}-${theme}-${viewport.name}.json`, JSON.stringify({ visited, problems }, null, 2));
                }
                expect(visited.length, 'el puesto debe poder abrir al menos una pantalla').toBeGreaterThan(1);
                const report = problems.map((p) => `${p.url} [${p.theme}, ${p.viewport}] ${p.selector} · ${p.ratio}:1 (mínimo ${p.needed}) · texto ${p.fg} sobre ${p.bg}`).join('\n');
                expect(problems, `Violaciones de contraste (${problems.length}) en ${visited.join(' ')}:\n${report}`).toEqual([]);
            });
        }
    }
}
