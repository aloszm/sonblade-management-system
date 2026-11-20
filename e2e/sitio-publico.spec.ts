import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Página pública de inicio (/inicio) y separación por dominio.
//  - Los casos de "todo junto" corren contra cualquier compilación (práctica, localhost).
//  - Los casos por dominio solo corren si la app se compiló con NEXT_PUBLIC_SITE_DOMAIN y se indica el mismo valor en
//    E2E_SITE_DOMAIN (p. ej. `barbergallo420.site`): se manda el encabezado Host con la petición, sin tocar DNS.
// No crean ni cambian datos.

test.describe('página pública /inicio (todo junto)', () => {
    test('muestra nombre, desde, horario, ubicación y contacto sin pedir sesión', async ({ page }) => {
        await page.goto('/inicio', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/inicio$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Gallo 4:20 · Barber Shop' })).toBeVisible();
        await expect(page.getByText('Desde 2016')).toBeVisible();
        await expect(page.getByRole('region', { name: 'Horario' })).toContainText('10:00 a. m. a 7:00 p. m.');
        await expect(page.getByRole('region', { name: 'Horario' })).toContainText('12:30 p. m. a 8:00 p. m.');
        await expect(page.getByRole('region', { name: 'Dónde estamos' })).toContainText('Efeso 2');
        await expect(page.getByRole('link', { name: /Cómo llegar/ })).toHaveAttribute('href', /google\.com\/maps\/search/);
        await expect(page.locator('iframe')).toHaveCount(0);
        // Sin menú ni encabezado del sistema interno.
        await expect(page.getByRole('navigation', { name: /principal|menú/i })).toHaveCount(0);
    });

    test('en práctica se ve la franja', async ({ page }) => {
        await page.goto('/inicio', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('practice-banner')).toContainText('MODO PRÁCTICA');
    });

    test('con reservas encendidas: servicios del catálogo, "Reservar cita" y equipo; si no, WhatsApp', async ({ page }) => {
        await page.goto('/inicio', { waitUntil: 'networkidle' });
        const book = page.getByRole('link', { name: 'Reservar cita' });
        if (await book.count()) {
            await expect(book).toHaveAttribute('href', '/reservar');
            await expect(page.getByRole('region', { name: 'Servicios y precios' }).locator('li').first()).toBeVisible();
            await expect(page.getByRole('region', { name: 'Nuestro equipo' })).toBeVisible();
        } else {
            await expect(page.getByRole('link', { name: /Agenda por WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/52/);
            await expect(page.getByRole('link', { name: 'Llamar' })).toBeVisible();
        }
    });

    test('el pie enlaza a privacidad y al acceso del equipo', async ({ page }) => {
        await page.goto('/inicio', { waitUntil: 'networkidle' });
        await page.getByRole('link', { name: 'Aviso de privacidad' }).click();
        await expect(page).toHaveURL(/\/privacidad$/);
        await page.goBack();
        await page.getByRole('link', { name: 'Acceso del equipo' }).click();
        await expect(page).toHaveURL(/\/login/);
    });

    test('no tiene fallas de accesibilidad (axe, WCAG AA)', async ({ page }) => {
        await page.goto('/inicio', { waitUntil: 'networkidle' });
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test('celular: sin desplazamiento horizontal', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
        const page = await context.newPage();
        await page.goto('/inicio', { waitUntil: 'networkidle' });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await context.close();
    });

    test('/reservar?barbero=<nombre> preselecciona al barbero (sin acentos ni mayúsculas) y un nombre inexistente se ignora', async ({ page }) => {
        await page.goto('/reservar?barbero=DEYA', { waitUntil: 'networkidle' });
        const first = page.locator('label', { hasText: /^Corte adulto/ });
        test.skip(!(await first.count()), 'Reservas en línea apagadas en este entorno.');
        await first.click();
        await page.getByRole('button', { name: /Continuar/ }).click();
        await expect(page.getByText(/Vienes del enlace de/)).toContainText('Deya');
        await page.getByRole('button', { name: /Elegir barbero/ }).click();
        await expect(page.getByRole('button', { name: /Ver días de Deya/ })).toBeEnabled();

        await page.goto('/reservar?barbero=nadie-existe', { waitUntil: 'networkidle' });
        await page.locator('label', { hasText: /^Corte adulto/ }).click();
        await page.getByRole('button', { name: /Continuar/ }).click();
        await expect(page.getByText(/Vienes del enlace de/)).toHaveCount(0);
    });

    test('robots y sitemap en "todo junto": no se indexa', async ({ request }) => {
        const robots = await request.get('/robots.txt');
        expect(robots.status()).toBe(200);
        expect(await robots.text()).toMatch(/Disallow: \//);
    });
});

const DOMAIN = process.env.E2E_SITE_DOMAIN;

test.describe('separación por dominio', () => {
    test.skip(!DOMAIN, 'Define E2E_SITE_DOMAIN (el mismo NEXT_PUBLIC_SITE_DOMAIN con que se compiló).');
    const get = (request: import('@playwright/test').APIRequestContext, host: string, path: string) =>
        request.get(path, { headers: { host }, maxRedirects: 0 });

    test('el dominio principal sirve la página pública y manda lo interno a admin.', async ({ request }) => {
        const home = await get(request, DOMAIN!, '/');
        expect(home.status()).toBe(200);
        expect(await home.text()).toContain('Gallo 4:20 · Barber Shop');
        const login = await get(request, DOMAIN!, '/login');
        expect(login.status()).toBe(308);
        expect(login.headers()['location']).toBe(`https://admin.${DOMAIN}/login`);
        const book = await get(request, `www.${DOMAIN}`, '/reservar');
        expect(book.status()).toBe(308);
        expect(book.headers()['location']).toBe(`https://citas.${DOMAIN}/`);
        expect((await get(request, DOMAIN!, '/api/sales')).status()).toBe(404);
        expect((await get(request, DOMAIN!, '/api/health')).status()).toBe(200);
    });

    test('citas. sirve la reserva y el enlace corto por barbero; lo interno va a admin.', async ({ request }) => {
        const host = `citas.${DOMAIN}`;
        expect((await get(request, host, '/')).status()).toBe(200);
        expect((await get(request, host, '/deya')).status()).toBe(200);
        expect((await get(request, host, '/privacidad')).status()).toBe(200);
        expect((await get(request, host, '/a/b')).status()).toBe(404);
        const pos = await get(request, host, '/pos');
        expect(pos.status()).toBe(308);
        expect(pos.headers()['location']).toBe(`https://admin.${DOMAIN}/pos`);
        expect((await get(request, host, '/api/equipo')).status()).toBe(404);
    });

    test('admin. conserva el comportamiento actual, no se indexa y manda las páginas públicas a su dominio', async ({ request }) => {
        const host = `admin.${DOMAIN}`;
        const root = await get(request, host, '/');
        expect(root.status()).toBe(307); // sin sesión: al login
        expect(root.headers()['location']).toContain('/login');
        const login = await get(request, host, '/login');
        expect(login.status()).toBe(200);
        expect(login.headers()['x-robots-tag']).toBe('noindex, nofollow');
        expect((await get(request, host, '/inicio')).status()).toBe(308);
        expect((await get(request, host, '/reservar')).status()).toBe(308);
        const robots = await get(request, host, '/robots.txt');
        expect(await robots.text()).toMatch(/Disallow: \//);
    });

    test('las cabeceras de seguridad aplican en los tres sitios', async ({ request }) => {
        for (const host of [DOMAIN!, `citas.${DOMAIN}`, `admin.${DOMAIN}`]) {
            const res = await get(request, host, '/privacidad');
            expect(res.headers()['content-security-policy'], host).toContain("frame-ancestors 'none'");
            expect(res.headers()['x-frame-options'], host).toBe('DENY');
        }
    });
});
