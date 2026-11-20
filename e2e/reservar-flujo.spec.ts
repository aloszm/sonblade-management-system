import AxeBuilder from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import { randomInt, stamp } from './helpers';

// Reserva en línea de punta a punta: solo con teclado y con axe en cada paso, y la barra fija inferior en celulares
// chicos y con el teclado virtual abierto. Crea UNA cita real de prueba ("Prueba Teclado") y la cancela por su enlace.
// Cada prueba usa su propia "huella" (x-forwarded-for) y un teléfono distinto para no gastar el límite de 5 reservas
// por hora de la base de desarrollo.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const axe = (page: Page) => new AxeBuilder({ page }).withTags(WCAG).withRules(['target-size']).analyze();
const fakeIp = () => `10.${randomInt(60, 250)}.${randomInt(1, 250)}.${randomInt(1, 250)}`;
const fakePhone = () => `5500${randomInt(100000, 999999)}`;

async function violations(page: Page, step: string): Promise<string[]> {
    const results = await axe(page);
    return results.violations.map((v) => `${step}: ${v.id} (${v.nodes.length}) ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

/** Espera a que cargue la configuración: true si hay servicios para elegir, false si las reservas están apagadas. */
async function bookingOn(page: Page): Promise<boolean> {
    await page.locator('input[name="service"], #gr-off-title').first().waitFor({ state: 'attached', timeout: 30_000 });
    return (await page.locator('input[name="service"]').count()) > 0;
}

/** Pulsa Tab hasta que el foco cae en lo que pide `match` (selector CSS, o "texto:<texto del botón>"; máximo 40 veces). */
async function tabTo(page: Page, match: string) {
    for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const hit = await page.evaluate((m) => {
            const el = document.activeElement;
            if (!el) return false;
            return m.startsWith('texto:') ? (el.textContent ?? '').trim() === m.slice(6) : el.matches(m);
        }, match);
        if (hit) return;
    }
    throw new Error(`El foco nunca llegó a ${match}`);
}

for (const theme of ['dark', 'light'] as const) {
    test(`reserva solo con teclado y sin violaciones de axe en cada paso (${theme})`, async ({ browser, baseURL }) => {
        test.setTimeout(150_000);
        const context = await browser.newContext({ baseURL, locale: 'es-MX', timezoneId: 'America/Mexico_City', viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
        await context.addInitScript((t) => { try { localStorage.setItem('barberos-theme', t); } catch { /* sin almacenamiento */ } }, theme);
        const page = await context.newPage();
        const found: string[] = [];
        try {
            await page.goto('/reservar', { waitUntil: 'networkidle' });
            test.skip(!(await bookingOn(page)), 'Reservas en línea apagadas en este entorno.');
            await expect(page.getByRole('heading', { name: '¿Qué te hacemos?' })).toBeFocused();
            found.push(...await violations(page, 'servicio'));

            await tabTo(page, 'input[name="service"]');
            await page.keyboard.press('Enter');
            await expect(page.getByRole('heading', { name: '¿Con quién?' })).toBeFocused();
            found.push(...await violations(page, 'barbero'));

            await tabTo(page, 'input[name="barber"]'); // "Cualquier barbero disponible"
            await page.keyboard.press('Enter');
            await expect(page.getByRole('heading', { name: '¿Cuándo?' })).toBeFocused();
            await expect(page.locator('input[name="slot"]').first()).toBeAttached({ timeout: 30_000 });
            found.push(...await violations(page, 'cuándo'));

            await tabTo(page, 'input[name="slot"]');
            await page.keyboard.press('Enter');
            await expect(page.getByRole('heading', { name: '¿A nombre de quién?' })).toBeFocused();
            await tabTo(page, '#bk-name');
            await page.keyboard.type(`Prueba Teclado ${stamp()}`);
            await page.keyboard.press('Tab');
            await expect(page.locator('#bk-phone')).toBeFocused();
            await page.keyboard.type(fakePhone());
            found.push(...await violations(page, 'datos'));
            // Con la casilla sin marcar, Enter en el campo avisa y deja el foco en la casilla.
            await page.keyboard.press('Enter');
            await expect(page.locator('#bk-accept')).toBeFocused();
            found.push(...await violations(page, 'datos con aviso'));
            await page.keyboard.press('Space');
            await expect(page.locator('#bk-accept')).toBeChecked();
            await tabTo(page, 'button[type="submit"]');
            await page.keyboard.press('Enter');

            await expect(page.getByRole('heading', { name: 'Listo, te esperamos' })).toBeFocused({ timeout: 30_000 });
            found.push(...await violations(page, 'listo'));

            // El enlace de la cita: se ve y se cancela con el teclado.
            await page.getByRole('link', { name: 'Ver o cancelar mi cita' }).click();
            await expect(page.getByRole('region', { name: 'Mi reserva' })).toBeVisible();
            found.push(...await violations(page, 'mi cita'));
            await tabTo(page, 'texto:Cancelar mi cita');
            await page.keyboard.press('Enter');
            await expect(page.getByRole('heading', { name: '¿Seguro que quieres cancelar?' })).toBeFocused();
            found.push(...await violations(page, 'confirmar cancelación'));
            await tabTo(page, 'texto:Sí, cancelar mi cita');
            await page.keyboard.press('Enter');
            await expect(page.getByText('Listo, cancelamos tu cita')).toBeVisible({ timeout: 20_000 });
            found.push(...await violations(page, 'cancelada'));
        } finally {
            await context.close();
        }
        expect(found, found.join('\n')).toEqual([]);
    });
}

test.describe('barra fija inferior en celulares chicos', () => {
    const { defaultBrowserType: _ignored, ...phone } = devices['iPhone 13'];
    void _ignored;

    test('320x568: la última opción de cada paso se puede desplazar por encima de la barra', async ({ browser, baseURL }) => {
        const context = await browser.newContext({ ...phone, baseURL, viewport: { width: 320, height: 568 }, locale: 'es-MX', timezoneId: 'America/Mexico_City', extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
        const page = await context.newPage();
        try {
            await page.goto('/reservar', { waitUntil: 'networkidle' });
            test.skip(!(await bookingOn(page)), 'Reservas en línea apagadas en este entorno.');
            const lastAboveBar = async (selector: string) => {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.waitForTimeout(250);
                const gap = await page.evaluate((s) => {
                    const items = [...document.querySelectorAll(s)];
                    const last = items[items.length - 1].getBoundingClientRect();
                    const bar = document.querySelector('[data-testid=booking-bar]')?.getBoundingClientRect();
                    return bar ? bar.top - last.bottom : 999;
                }, selector);
                expect(gap, `la última opción (${selector}) debe quedar por encima de la barra`).toBeGreaterThanOrEqual(0);
            };
            // El servicio de 2 horas deja la tira de horas más corta; el de 30 minutos, la más larga.
            await page.locator('label').filter({ hasText: /^Corte adulto/ }).click();
            await page.getByRole('heading', { name: '¿Con quién?' }).waitFor();
            await page.waitForTimeout(400);
            await page.locator('label').filter({ hasText: /^Cualquier barbero/ }).click();
            await expect(page.locator('input[name="slot"]').first()).toBeAttached({ timeout: 30_000 });
            await lastAboveBar('label:has(input[name="slot"])');
            await page.locator('label:has(input[name="slot"])').last().click();
            await expect(page.locator('#bk-name')).toBeVisible();
            await lastAboveBar('#bk-accept');
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
        } finally {
            await context.close();
        }
    });

    test('teclado virtual abierto (390x420): el campo enfocado con Tab queda por encima de la barra y se puede confirmar', async ({ browser, baseURL }) => {
        const context = await browser.newContext({ ...phone, baseURL, locale: 'es-MX', timezoneId: 'America/Mexico_City', extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
        const page = await context.newPage();
        try {
            await page.goto('/reservar', { waitUntil: 'networkidle' });
            test.skip(!(await bookingOn(page)), 'Reservas en línea apagadas en este entorno.');
            await page.locator('label').filter({ hasText: /^Corte adulto/ }).click();
            await page.getByRole('heading', { name: '¿Con quién?' }).waitFor();
            await page.waitForTimeout(400);
            await page.locator('label').filter({ hasText: /^Cualquier barbero/ }).click();
            await expect(page.locator('input[name="slot"]').first()).toBeAttached({ timeout: 30_000 });
            await page.locator('label:has(input[name="slot"])').last().click();
            await expect(page.locator('#bk-name')).toBeVisible();
            await page.setViewportSize({ width: 390, height: 420 }); // el teclado se come la mitad de la pantalla
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(300);
            for (const sel of ['#bk-name', '#bk-phone', '#bk-accept']) {
                await page.locator(sel).focus();
                await page.waitForTimeout(250);
                const covered = await page.evaluate((s) => {
                    const el = document.querySelector(s)!;
                    const r = el.getBoundingClientRect();
                    const bar = document.querySelector('[data-testid=booking-bar]')!.getBoundingClientRect();
                    return { bottom: r.bottom, barTop: bar.top, top: r.top };
                }, sel);
                expect(covered.bottom, `${sel} no debe quedar bajo la barra`).toBeLessThanOrEqual(covered.barTop + 1);
                expect(covered.top, `${sel} debe verse dentro de la pantalla`).toBeGreaterThanOrEqual(0);
            }
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            const box = await page.getByRole('button', { name: 'Confirmar cita' }).boundingBox();
            expect(box && box.y + box.height <= 420).toBe(true);
        } finally {
            await context.close();
        }
    });
});
