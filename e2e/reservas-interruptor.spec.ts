import { expect, test, type Browser } from '@playwright/test';
import { USERS, fillPinDialog, login, pinFor, submitPinDialog } from './helpers';

// Interruptor de reservas en línea (Configuración > Reservas en línea).
// La cuenta principal lo apaga y enciende con su PIN; gerencia lo ve en solo lectura; recepción no entra.
// La suite DEJA las reservas ENCENDIDAS: la última prueba y la red de seguridad lo vuelven a encender.

const REASON_OFF = 'Prueba de navegador: apago las reservas';
const REASON_ON = 'Prueba de navegador: vuelvo a encender las reservas';

async function publicConfigEnabled(request: import('@playwright/test').APIRequestContext): Promise<boolean> {
    const res = await request.get('/api/public/booking/config');
    expect(res.ok(), await res.text()).toBeTruthy();
    return (await res.json() as { enabled: boolean }).enabled === true;
}

/** Red de seguridad: si algo falló a medias, las reservas se encienden por la API con el PIN de la cuenta principal. */
async function ensureEnabled(browser: Browser, baseURL: string | undefined) {
    const context = await browser.newContext({ baseURL });
    try {
        const page = await context.newPage();
        await login(page, USERS.owner);
        const current = await (await page.request.get('/api/booking-settings')).json() as { settings: { enabled: boolean } };
        if (current.settings.enabled) return;
        const res = await page.request.put('/api/booking-settings', { data: { enabled: true, comment: 'Restaura las reservas tras las pruebas', pin: pinFor(USERS.owner) } });
        if (!res.ok()) console.error('[reservas] no se pudieron volver a encender:', await res.text());
    } finally {
        await context.close();
    }
}

test.describe.serial('reservas en línea: interruptor', () => {
    test.afterAll(async ({ browser, baseURL }) => { await ensureEnabled(browser, baseURL); });

    test('la cuenta principal ve el interruptor, la ayuda y el último cambio', async ({ page }) => {
        await login(page, USERS.owner);
        await expect(page.getByRole('navigation').getByRole('link', { name: 'Reservas en línea' }).first()).toBeVisible();
        await page.goto('/configuracion/reservas', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { level: 1, name: 'Reservas en línea' })).toBeVisible();
        const toggle = page.getByRole('switch', { name: 'Reservas en línea' });
        await expect(toggle).toBeEnabled();
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByTestId('booking-state')).toHaveText('encendidas');
        await expect(page.getByText(/Agenda por WhatsApp/)).toBeVisible();
        await expect(page.getByText(/hasta 5 minutos/)).toBeVisible();
        await expect(page.getByLabel('Días hacia adelante')).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
        // La entrada del menú de Configuración marca solo «Reservas en línea», no también «Configuración».
        const nav = page.getByRole('complementary');
        if (await nav.isVisible()) {
            await expect(nav.getByRole('link', { name: 'Reservas en línea' })).toHaveAttribute('aria-current', 'page');
            await expect(nav.getByRole('link', { name: 'Configuración', exact: true })).not.toHaveAttribute('aria-current', 'page');
        }
    });

    test('un PIN incorrecto no cambia nada (un solo intento a propósito)', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/configuracion/reservas', { waitUntil: 'networkidle' });
        await page.getByRole('switch', { name: 'Reservas en línea' }).click();
        await page.getByRole('button', { name: 'Guardar cambios' }).click();
        const dialog = page.getByTestId('pin-confirm');
        await dialog.getByLabel(/Comentario/).fill(REASON_OFF);
        await dialog.locator('input[type="password"]').fill('135791');
        await dialog.getByRole('button', { name: /con PIN/ }).click();
        await expect(dialog.getByRole('alert')).toContainText(/PIN/);
        await expect(dialog).toBeVisible();
        expect(await publicConfigEnabled(page.request)).toBe(true);
    });

    test('alonso apaga con PIN: la configuración pública dice apagado y /reservar muestra "Agenda por WhatsApp"', async ({ page, browser, baseURL }) => {
        await login(page, USERS.owner);
        await page.goto('/configuracion/reservas', { waitUntil: 'networkidle' });
        await page.getByRole('switch', { name: 'Reservas en línea' }).click();
        await expect(page.getByTestId('booking-state')).toHaveText('apagadas');
        await page.getByRole('button', { name: 'Guardar cambios' }).click();
        await fillPinDialog(page, USERS.owner, REASON_OFF);
        await submitPinDialog(page);
        await expect(page.getByTestId('booking-state')).toHaveText('apagadas');
        await expect(page.getByTestId('booking-last-change')).toContainText('Último cambio: Alonso');

        // La API lo confirma y la página pública (otro visitante, sin sesión) lo muestra apagado.
        const apiAfter = await (await page.request.get('/api/booking-settings')).json() as { settings: { enabled: boolean } };
        expect(apiAfter.settings.enabled).toBe(false);
        const visitor = await browser.newContext({ baseURL });
        try {
            const vp = await visitor.newPage();
            expect(await publicConfigEnabled(vp.request)).toBe(false);
            await vp.goto('/reservar', { waitUntil: 'networkidle' });
            await expect(vp.getByRole('heading', { name: 'Por ahora agendamos por WhatsApp o por teléfono' })).toBeVisible();
            await expect(vp.getByRole('link', { name: /Agenda por WhatsApp/ })).toBeVisible();
            await expect(vp.getByRole('heading', { name: '¿Qué te hacemos?' })).toHaveCount(0);
        } finally {
            await visitor.close();
        }
    });

    test('gerencia lo ve en solo lectura y la API le niega el cambio', async ({ page }) => {
        await login(page, USERS.manager);
        await page.goto('/configuracion/reservas', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { level: 1, name: 'Reservas en línea' })).toBeVisible();
        await expect(page.getByTestId('booking-readonly')).toContainText('Solo la cuenta principal puede cambiar esto.');
        await expect(page.getByRole('switch', { name: 'Reservas en línea' })).toBeDisabled();
        await expect(page.getByLabel('Máximo de reservas en línea por día')).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
        // Sigue apagado (lo dejó así la prueba anterior).
        await expect(page.getByTestId('booking-state')).toHaveText('apagadas');
        const denied = await page.request.put('/api/booking-settings', { data: { enabled: true, comment: 'Intento de gerencia', pin: pinFor(USERS.manager) } });
        expect(denied.status()).toBe(403);
        // Su menú también la trae, y «Configuración» (solo dueño) no.
        await expect(page.getByRole('navigation').getByRole('link', { name: 'Reservas en línea' }).first()).toBeVisible();
        await expect(page.getByRole('navigation').getByRole('link', { name: 'Configuración', exact: true })).toHaveCount(0);
    });

    test('recepción no entra a Reservas en línea ni a su API', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/configuracion/reservas');
        await expect(page).not.toHaveURL(/\/configuracion/);
        expect((await page.request.get('/api/booking-settings')).status()).toBe(403);
        await expect(page.getByRole('navigation').getByRole('link', { name: 'Reservas en línea' })).toHaveCount(0);
    });

    test('alonso vuelve a encender con PIN y deja las reservas ENCENDIDAS', async ({ page, browser, baseURL }) => {
        await login(page, USERS.owner);
        await page.goto('/configuracion/reservas', { waitUntil: 'networkidle' });
        const toggle = page.getByRole('switch', { name: 'Reservas en línea' });
        await expect(toggle).toHaveAttribute('aria-checked', 'false');
        await toggle.click();
        await page.getByRole('button', { name: 'Guardar cambios' }).click();
        await fillPinDialog(page, USERS.owner, REASON_ON);
        await submitPinDialog(page);
        await expect(page.getByTestId('booking-state')).toHaveText('encendidas');
        const visitor = await browser.newContext({ baseURL });
        try {
            const vp = await visitor.newPage();
            expect(await publicConfigEnabled(vp.request)).toBe(true);
            await vp.goto('/reservar', { waitUntil: 'networkidle' });
            await expect(vp.getByRole('heading', { name: '¿Qué te hacemos?' })).toBeVisible();
        } finally {
            await visitor.close();
        }
        const final = await (await page.request.get('/api/booking-settings')).json() as { settings: { enabled: boolean } };
        expect(final.settings.enabled).toBe(true);
    });
});
