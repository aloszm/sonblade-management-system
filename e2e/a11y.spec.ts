import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { login, USERS } from './helpers';

// Reglas de axe (WCAG 2.2 AA) en cada pantalla que cada puesto puede abrir, en modo oscuro y claro,
// en escritorio y en teléfono: contraste, etiquetas de formulario, nombre accesible de botones y enlaces,
// y tamaño de los objetivos táctiles. SOLO LECTURA: no hace clics que creen datos.

const RULES = ['color-contrast', 'label', 'select-name', 'button-name', 'link-name', 'target-size'];
// Pantallas públicas: se miden sin sesión.
const PUBLIC_SCREENS = ['/login', '/privacidad', '/reservar'];

const SCREENS = ['/', '/barbero', '/pos', '/caja', '/citas', '/clientes', '/liquidaciones', '/ventas/historial', '/cuadre', '/gastos', '/inventario', '/servicios', '/equipo', '/reportes', '/administracion', '/admin/auditoria', '/configuracion', ...PUBLIC_SCREENS];

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

type Problem = { rule: string; role: string; theme: string; viewport: string; url: string; selector: string; ratio: string; needed: string; fg: string; bg: string };

type AxeResult = Awaited<ReturnType<AxeBuilder['analyze']>>;
type ContrastData = { contrastRatio?: number; expectedContrastRatio?: string; fgColor?: string; bgColor?: string };

function collect(result: AxeResult, base: { role: string; theme: string; viewport: string; url: string }): Problem[] {
    const found: Problem[] = [];
    for (const v of result.violations) {
        for (const node of v.nodes) {
            const data = (node.any[0]?.data ?? {}) as ContrastData;
            found.push({
                ...base, rule: v.id,
                selector: node.target.join(' '),
                ratio: String(data.contrastRatio ?? '—'), needed: data.expectedContrastRatio ?? '—',
                fg: data.fgColor ?? '—', bg: data.bgColor ?? '—',
            });
        }
    }
    return found;
}

for (const role of ROLES) {
    for (const theme of THEMES) {
        for (const viewport of VIEWPORTS) {
            test(`accesibilidad · ${role.name} · ${theme} · ${viewport.name}`, async ({ page }) => {
                test.setTimeout(420_000);
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await login(page, role.email);
                const problems: Problem[] = [];
                const visited: string[] = [];
                // El script del layout lee este valor y pone data-theme antes de pintar.
                await page.evaluate((t) => localStorage.setItem('barberos-theme', t), theme);

                for (const route of SCREENS) {
                    if (PUBLIC_SCREENS.includes(route)) {
                        // Las pantallas públicas se ven sin sesión: se revisan en una página aparte.
                        continue;
                    }
                    await page.goto(route, { waitUntil: 'networkidle' });
                    if (new URL(page.url()).pathname !== route) continue; // este puesto no puede abrirla
                    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                    await page.waitForTimeout(900); // termina la animación de entrada y cargan los datos
                    visited.push(route);
                    problems.push(...collect(await new AxeBuilder({ page }).withRules(RULES).analyze(), { role: role.name, theme, viewport: viewport.name, url: route }));
                }

                // Sin sesión: login, aviso de privacidad y reserva en línea.
                const guest = await page.context().browser()!.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
                const guestPage = await guest.newPage();
                for (const route of PUBLIC_SCREENS) {
                    await guestPage.goto(new URL(route, page.url()).toString(), { waitUntil: 'networkidle' });
                    await guestPage.evaluate((t) => localStorage.setItem('barberos-theme', t), theme);
                    await guestPage.reload({ waitUntil: 'networkidle' });
                    await guestPage.waitForTimeout(500);
                    visited.push(route);
                    problems.push(...collect(await new AxeBuilder({ page: guestPage }).withRules(RULES).analyze(), { role: role.name, theme, viewport: viewport.name, url: route }));
                }
                await guest.close();

                if (process.env.A11Y_REPORT) {
                    writeFileSync(`${process.env.A11Y_REPORT}-${role.name}-${theme}-${viewport.name}.json`, JSON.stringify({ visited, problems }, null, 2));
                }
                expect(visited.length, 'el puesto debe poder abrir al menos una pantalla').toBeGreaterThan(1);
                const report = problems.map((p) => `${p.url} [${p.theme}, ${p.viewport}] ${p.rule} · ${p.selector}${p.rule === 'color-contrast' ? ` · ${p.ratio}:1 (mínimo ${p.needed}) · texto ${p.fg} sobre ${p.bg}` : ''}`).join('\n');
                expect(problems, `Violaciones de accesibilidad (${problems.length}) en ${visited.join(' ')}:\n${report}`).toEqual([]);
            });
        }
    }
}
