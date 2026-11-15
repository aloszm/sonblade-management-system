// Va primero (00-): corre antes de que otra prueba abra la caja; al final e2e/cash-guard.ts la deja como estaba.
import { expect, test } from '@playwright/test';
import { USERS, login } from './helpers';

// Solo lectura: no abre ni cierra caja y no crea ventas. La base es compartida.
test.describe('cobro: caja cerrada y precio libre', () => {
    test('con la caja cerrada avisa, ofrece abrirla y no deja cobrar', async ({ page }) => {
        await login(page, USERS.reception);
        const cash = await page.request.get('/api/cash/session');
        expect(cash.ok()).toBeTruthy();
        test.skip(Boolean(await cash.json()), 'La caja está abierta en la base compartida; esta prueba solo corre con la caja cerrada');

        await page.goto('/pos');
        const notice = page.getByTestId('pos-cash-closed');
        await expect(notice).toContainText('La caja está cerrada. Ábrela antes de cobrar.');
        await expect(notice.getByRole('link', { name: 'Abrir caja' })).toHaveAttribute('href', '/caja');

        // Se puede armar la venta, pero no cobrarla.
        const firstService = page.locator('section[aria-labelledby="pos-services"] button[aria-pressed]').first();
        await firstService.click();
        const charge = page.getByRole('button', { name: 'Abre la caja para cobrar' });
        await expect(charge).toBeVisible();
        await expect(charge).toBeDisabled();
    });

    test('un servicio de precio libre pide el precio al agregarlo', async ({ page }) => {
        await login(page, USERS.reception);
        const services = await (await page.request.get('/api/services')).json() as { id: string; name: string; variable_price?: boolean; is_active?: boolean }[];
        const free = services.find((s) => s.variable_price && s.is_active !== false);
        test.skip(!free, 'No hay ningún servicio de precio libre en el catálogo');

        await page.goto('/pos');
        const card = page.locator('section[aria-labelledby="pos-services"]').getByRole('button', { name: new RegExp(`^${free!.name}`) });
        await expect(card).toContainText('Precio al cobrar');
        await card.click();
        const field = page.getByLabel(`Precio de ${free!.name}`);
        await expect(field).toBeVisible();
        await expect(field).toHaveValue('');
        await field.fill('250');
        await expect(page.getByTestId('pos-total')).toHaveText('$250');
    });
});
