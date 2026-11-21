import { devices, expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { USERS, barberIdByName, ensureOpenCashSession, farWednesday, login, stamp } from './helpers';

// Productos en la cita, de punta a punta:
//  1. Deya (barbera, en celular) agrega un producto a su propia cita: queda a su nombre y no se le pregunta nada.
//  2. Dago (recepción) agrega otro y ve DOS botones con nombre, «Deya» y «Dago»; elige «Dago». También cambia el
//     vendedor de una línea y quita un producto con confirmación.
//  3. Al tocar «Cobrar» el cobro trae el servicio y los dos productos con su vendedor; se confirma el pago.
//  4. Cada persona recibe su comisión (servicio y producto de Deya; producto de Dago) y el inventario baja UNA vez.
// Requiere caja abierta: se usa ensureOpenCashSession y la guarda global (cash-guard) deja la caja como estaba.
// La venta de prueba cobrada no se borra (las ventas no se borran): queda a nombre de «Prueba Productos …».

const suffix = stamp();
const CLIENT = `Prueba Productos ${suffix}`;
const PRODUCT_A = 'Pomada mate (prueba)';   // la agrega Deya
const PRODUCT_B = 'Cera modeladora (prueba)'; // la agrega Dago, vendida por Dago
const PRODUCT_C = 'Peine de textura';        // se agrega y se quita (no se cobra)

type Product = { id: string; name: string; price: number; stock: number };
type Row = { name: string; gross_commission: number; entry_count: number };

const products = async (request: APIRequestContext) => await (await request.get('/api/products')).json() as Product[];
const byName = (list: Product[], name: string) => {
    const found = list.find((p) => p.name === name);
    expect(found, `debe existir el producto ${name}`).toBeTruthy();
    return found!;
};

/**
 * Inicio del periodo de pago en curso (de jueves a miércoles desde el 19 nov 2026): lo dice el servidor, con la misma
 * regla que la base (lib/payroll/pay-period.ts). Ya no es el domingo de la semana.
 */
async function currentPayPeriodStart(request: APIRequestContext): Promise<string> {
    const res = await request.get('/api/settlements');
    expect(res.ok(), await res.text()).toBeTruthy();
    const start = (await res.json() as { current_start?: string }).current_start;
    expect(start, 'el servidor debe decir el periodo de pago en curso').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    return start!;
}

async function commissionRows(request: APIRequestContext): Promise<Map<string, Row>> {
    const res = await request.get(`/api/settlements?period_start=${await currentPayPeriodStart(request)}`);
    expect(res.ok(), await res.text()).toBeTruthy();
    const rows = (await res.json() as { rows: Row[] }).rows;
    return new Map(rows.map((r) => [r.name, r]));
}

async function mobileContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
    return browser.newContext({ ...devices['iPhone 13'], baseURL, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
}

async function noHorizontalScroll(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test.describe.serial('productos en la cita: Deya, Dago, cobro y comisiones', () => {
    let day = '';
    let aptId = '';
    let deyaId = '';
    let corte = { id: '', price: 0 };
    let before: { a: Product; b: Product; c: Product } | null = null;
    let commissionBefore: Map<string, Row> | null = null;
    let sold = false;

    test.beforeAll(async ({ browser, baseURL }) => {
        const dago = await browser.newContext({ baseURL });
        const page = await dago.newPage();
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        deyaId = await barberIdByName(page.request, 'Deya');
        const services = await (await page.request.get('/api/services')).json() as { id: string; name: string; price: number }[];
        const s = services.find((x) => x.name === 'Corte adulto');
        expect(s, 'debe existir el servicio Corte adulto').toBeTruthy();
        corte = { id: s!.id, price: Number(s!.price) };
        const catalog = await products(page.request);
        before = { a: byName(catalog, PRODUCT_A), b: byName(catalog, PRODUCT_B), c: byName(catalog, PRODUCT_C) };
        // Con existencias suficientes (se cobra una pieza de cada uno); si faltaran, hay que registrar una entrada desde Inventario.
        for (const p of [before.a, before.b]) expect(p.stock, `existencias de ${p.name}`).toBeGreaterThanOrEqual(2);
        day = farWednesday();
        const created = await page.request.post('/api/appointments', {
            data: { customer_name: CLIENT, barber_id: deyaId, service_ids: [corte.id], scheduled_at: new Date(`${day}T19:00:00-06:00`).toISOString() },
        });
        expect(created.status(), await created.text()).toBe(201);
        aptId = (await created.json() as { id: string }).id;
        await dago.close();

        const manager = await browser.newContext({ baseURL });
        const mp = await manager.newPage();
        await login(mp, USERS.manager);
        commissionBefore = await commissionRows(mp.request);
        await manager.close();
    });

    test.afterAll(async ({ browser, baseURL }) => {
        if (sold) return;
        // Si la prueba se detuvo antes de cobrar, la cita de prueba se cancela para no dejarla abierta.
        const context = await browser.newContext({ baseURL });
        const page = await context.newPage();
        await login(page, USERS.reception);
        const res = await page.request.patch(`/api/appointments/${aptId}`, { data: { status: 'cancelled', reason: 'Cancelo la cita de prueba de productos' } });
        if (!res.ok() && res.status() !== 409) console.error('[productos] no se pudo cancelar la cita', await res.text());
        await context.close();
    });

    test('Deya agrega un producto a su propia cita desde el celular: queda a su nombre y no se le pregunta nada', async ({ browser, baseURL }) => {
        const context = await mobileContext(browser, baseURL);
        const page = await context.newPage();
        try {
            await login(page, USERS.barber);
            await page.goto(`/citas?fecha=${day}`, { waitUntil: 'networkidle' });
            await page.getByTestId('day-appointment').filter({ hasText: CLIENT }).first().tap();
            const detail = page.getByTestId('appointment').filter({ hasText: CLIENT });
            await expect(detail).toBeVisible();
            // La barbera no ve botones de WhatsApp ni importes.
            await expect(detail.getByRole('button', { name: /Enviar (confirmación|recordatorio)/ })).toHaveCount(0);
            const section = detail.getByTestId('appointment-products');
            await expect(section).toContainText('Todavía no hay productos en esta cita.');
            const add = section.getByTestId('add-product');
            expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
            await add.tap();

            const modal = page.getByTestId('add-product-modal');
            await expect(modal.getByRole('heading', { name: 'Agregar producto' })).toBeVisible();
            await modal.getByRole('button', { name: new RegExp(PRODUCT_A.replace(/[()]/g, '\\$&')) }).tap();
            // Sin pregunta de vendedor: se apunta a su nombre.
            await expect(modal.getByTestId('seller-self')).toContainText('Se apunta a tu nombre');
            await expect(modal.getByText('¿Quién lo vendió?')).toHaveCount(0);
            await expect(modal.getByRole('button', { name: 'Otra persona' })).toHaveCount(0);
            const confirm = modal.getByTestId('add-product-confirm');
            expect((await confirm.boundingBox())!.height).toBeGreaterThanOrEqual(44);
            await noHorizontalScroll(page);
            await confirm.tap();

            // Vuelve el detalle de la cita con la línea a nombre de Deya.
            const line = page.getByTestId('appointment').filter({ hasText: CLIENT }).getByTestId('product-line');
            await expect(line).toHaveCount(1, { timeout: 20_000 });
            await expect(line).toContainText(PRODUCT_A);
            await expect(line).toContainText('× 1');
            await expect(line.getByTestId('product-seller')).toHaveText('Vende: Deya');
            await expect(line).not.toContainText('Precio de referencia'); // el barbero no ve importes
            // Puede quitar la suya, y no cambia el vendedor.
            await expect(line.getByRole('button', { name: `Quitar ${PRODUCT_A} de la cita` })).toBeVisible();
            await expect(page.getByRole('group', { name: /Cambiar quién vendió/ })).toHaveCount(0);
            await noHorizontalScroll(page);

            const saved = await (await page.request.get(`/api/appointments/${aptId}/products`)).json() as { lines: { seller_name: string; name: string; quantity: number }[]; can_choose_seller: boolean };
            expect(saved.can_choose_seller).toBe(false);
            expect(saved.lines).toHaveLength(1);
            expect(saved.lines[0]).toMatchObject({ name: PRODUCT_A, quantity: 1, seller_name: 'Deya' });
        } finally {
            await context.close();
        }
    });

    test('Dago agrega otro producto: ve los dos botones «Deya» y «Dago», elige «Dago»; cambia vendedor y quita con confirmación', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&cita=${aptId}`, { waitUntil: 'networkidle' });
        const detail = page.getByTestId('appointment').filter({ hasText: CLIENT });
        await expect(detail).toBeVisible();
        // Dago ve la línea de Deya, con su precio de referencia.
        await expect(detail.getByTestId('product-line')).toHaveCount(1);
        await expect(detail.getByTestId('product-line')).toContainText('Vende: Deya');
        await expect(detail.getByTestId('product-line')).toContainText('Precio de referencia');

        await detail.getByTestId('add-product').click();
        const modal = page.getByTestId('add-product-modal');
        await modal.getByLabel('Buscar producto').fill('cera');
        await modal.getByRole('button', { name: new RegExp(PRODUCT_B.replace(/[()]/g, '\\$&')) }).click();
        const who = modal.getByRole('group', { name: '¿Quién lo vendió?' });
        const buttons = who.getByRole('button');
        await expect(buttons).toHaveText(['Deya', 'Dago']);
        await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true'); // el barbero de la cita, preseleccionado
        await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'false');
        await expect(modal.getByText('Yo', { exact: true })).toHaveCount(0);
        await expect(modal.getByRole('button', { name: 'Otra persona' })).toHaveCount(0); // recepción no la tiene
        await buttons.nth(1).click();
        await expect(buttons.nth(1)).toHaveAttribute('aria-pressed', 'true');
        await modal.getByTestId('add-product-confirm').click();

        const lines = page.getByTestId('appointment').filter({ hasText: CLIENT }).getByTestId('product-line');
        await expect(lines).toHaveCount(2, { timeout: 20_000 });
        const lineB = lines.filter({ hasText: PRODUCT_B });
        await expect(lineB.getByTestId('product-seller')).toHaveText('Vende: Dago');
        await expect(lines.filter({ hasText: PRODUCT_A }).getByTestId('product-seller')).toHaveText('Vende: Deya');

        // Cambiar el vendedor de una línea con los mismos dos botones (PATCH) y regresarlo.
        const change = lineB.getByRole('group', { name: `Cambiar quién vendió ${PRODUCT_B}` });
        await change.getByRole('button', { name: 'Deya' }).click();
        await expect(lineB.getByTestId('product-seller')).toHaveText('Vende: Deya', { timeout: 20_000 });
        await lineB.getByRole('group', { name: `Cambiar quién vendió ${PRODUCT_B}` }).getByRole('button', { name: 'Dago' }).click();
        await expect(lineB.getByTestId('product-seller')).toHaveText('Vende: Dago', { timeout: 20_000 });

        // Un tercer producto se agrega y se quita con la confirmación.
        await page.getByTestId('appointment').filter({ hasText: CLIENT }).getByTestId('add-product').click();
        await modal.getByRole('button', { name: new RegExp(PRODUCT_C) }).click();
        await modal.getByTestId('add-product-confirm').click();
        await expect(lines).toHaveCount(3, { timeout: 20_000 });
        await lines.filter({ hasText: PRODUCT_C }).getByRole('button', { name: `Quitar ${PRODUCT_C} de la cita` }).click();
        const confirmDialog = page.getByTestId('confirm-dialog');
        await expect(confirmDialog).toContainText(`¿Quitar ${PRODUCT_C}`);
        await confirmDialog.getByRole('button', { name: 'Cancelar' }).click();
        await expect(lines).toHaveCount(3);
        await lines.filter({ hasText: PRODUCT_C }).getByRole('button', { name: `Quitar ${PRODUCT_C} de la cita` }).click();
        await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Quitar' }).click();
        await expect(lines).toHaveCount(2, { timeout: 20_000 });
        await expect(lines.filter({ hasText: PRODUCT_C })).toHaveCount(0);

        // La tarjeta de la agenda avisa "+2 productos" (día y semana).
        await page.keyboard.press('Escape');
        await page.goto(`/citas?fecha=${day}&barbero=${deyaId}`, { waitUntil: 'networkidle' });
        await expect(page.getByTestId('day-appointment').filter({ hasText: CLIENT }).getByTestId('products-mark')).toHaveText(/\+2 productos/);
        await page.getByRole('button', { name: 'Semana' }).click();
        await expect(page.getByTestId('week-appointment').filter({ hasText: CLIENT })).toContainText('+2 productos');
    });

    test('«Cobrar» trae el servicio y los dos productos con su vendedor, y el pago se confirma', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        await page.goto(`/citas?fecha=${day}&cita=${aptId}`, { waitUntil: 'networkidle' });
        await page.getByTestId('appointment').filter({ hasText: CLIENT }).getByTestId('charge-appointment').click();
        await expect(page).toHaveURL(new RegExp(`/pos\\?cita=${aptId}`));
        await expect(page.getByTestId('pos-appointment')).toContainText(`Cobrando la cita de ${CLIENT}`);

        const catalog = await products(page.request);
        const a = byName(catalog, PRODUCT_A);
        const b = byName(catalog, PRODUCT_B);
        const total = corte.price + a.price + b.price;
        await expect(page.getByTestId('pos-total')).toHaveText(`$${total}`);
        const cart = page.getByRole('complementary', { name: 'Resumen de la venta' });
        await expect(cart).toContainText('Corte adulto');
        const lineA = cart.getByRole('listitem').filter({ hasText: PRODUCT_A });
        const lineB = cart.getByRole('listitem').filter({ hasText: PRODUCT_B });
        await expect(lineA.getByTestId('pos-line-seller')).toHaveText('Vendido por Deya');
        await expect(lineB.getByTestId('pos-line-seller')).toHaveText('Vendido por Dago');
        await expect(page.getByTestId('pos-preload-skipped')).toHaveCount(0);
        // Cada producto ya trae su vendedor: no se pide uno general.
        await expect(cart.getByText('Cada producto se apunta a quien lo vendió en la cita.')).toBeVisible();

        await page.getByRole('button', { name: `Cobrar $${total}` }).click();
        await expect(page.getByTestId('pos-success')).toBeVisible({ timeout: 25_000 });
        sold = true;

        const after = await (await page.request.get(`/api/appointments/${aptId}`)).json() as { status: string; sale: { id: string; total: number } | null; products: { open: boolean } };
        expect(after.status).toBe('completed');
        expect(after.sale?.total).toBe(total);
        expect(after.products.open).toBe(false);
    });

    test('la cita cobrada muestra los productos como historial, sin acciones', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&cita=${aptId}`, { waitUntil: 'networkidle' });
        const detail = page.getByTestId('appointment').filter({ hasText: CLIENT });
        await expect(detail).toContainText('Cobrada');
        const section = detail.getByTestId('appointment-products');
        await expect(section).toContainText('Productos (historial)');
        await expect(section.getByTestId('product-line')).toHaveCount(2);
        await expect(section.getByRole('button')).toHaveCount(0);
        await expect(detail.getByTestId('wa-actions')).toHaveCount(0);
    });

    test('comisiones: Deya recibe servicio y producto, Dago el suyo; el inventario bajó una sola vez por producto', async ({ browser, baseURL, page }) => {
        const manager = await browser.newContext({ baseURL });
        const mp = await manager.newPage();
        await login(mp, USERS.manager);
        const commissionAfter = await commissionRows(mp.request);
        await manager.close();
        const get = (m: Map<string, Row> | null, name: string) => {
            const row = m?.get(name);
            expect(row, `fila de ${name} en el pago semanal`).toBeTruthy();
            return row!;
        };
        // Tasas generales: 50 % servicios y 20 % productos (Configuración > Comisiones).
        const deyaDelta = get(commissionAfter, 'Deya').gross_commission - get(commissionBefore, 'Deya').gross_commission;
        const dagoDelta = get(commissionAfter, 'Dago').gross_commission - get(commissionBefore, 'Dago').gross_commission;
        await login(page, USERS.reception);
        const catalog = await products(page.request);
        const a = byName(catalog, PRODUCT_A);
        const b = byName(catalog, PRODUCT_B);
        const c = byName(catalog, PRODUCT_C);
        expect(deyaDelta).toBeCloseTo(corte.price * 0.5 + a.price * 0.2, 2);
        expect(dagoDelta).toBeCloseTo(b.price * 0.2, 2);
        // Una partida por comisión: Deya (servicio + producto) y Dago (producto).
        expect(get(commissionAfter, 'Deya').entry_count - get(commissionBefore, 'Deya').entry_count).toBe(2);
        expect(get(commissionAfter, 'Dago').entry_count - get(commissionBefore, 'Dago').entry_count).toBe(1);

        expect(a.stock).toBe(before!.a.stock - 1);
        expect(b.stock).toBe(before!.b.stock - 1);
        expect(c.stock).toBe(before!.c.stock); // el producto que se quitó de la cita no se cobró ni bajó
    });
});
