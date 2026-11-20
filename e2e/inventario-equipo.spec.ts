import { expect, test } from '@playwright/test';
import { USERS, fillPinDialog, login, stamp } from './helpers';

// Inventario (recepción registra entradas con PIN; gerencia ve costos y ajusta) y Equipo (títulos y insignia).

type Product = { id: string; name: string; stock: number; cost?: number };

test.describe('inventario por puesto', () => {
    test('recepción registra una entrada con comentario y PIN, y no ve costos ni ajustes', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/inventario', { waitUntil: 'networkidle' });
        const products = await (await page.request.get('/api/products')).json() as Product[];
        expect(products.length).toBeGreaterThan(0);
        const target = products.find((p) => /prueba/i.test(p.name)) ?? products[0];

        // Ni costos ni botones de edición o baja en pantalla.
        await expect(page.getByText('Costo:')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Editar / })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Dar de baja / })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Nuevo producto|Agregar producto/ })).toHaveCount(0);

        await page.getByRole('button', { name: `Registrar entrada de ${target.name}` }).click();
        const modal = page.getByTestId('receive-stock');
        await expect(modal).toContainText(`Existencias actuales: ${target.stock}`);
        // Sin comentario no avanza.
        await modal.getByRole('button', { name: 'Continuar' }).click();
        await expect(modal.getByText(/Escribe un comentario de la entrada/)).toBeVisible();
        await modal.getByLabel('¿Cuántas piezas llegaron?').fill('1');
        await modal.getByLabel('Comentario').fill(`Prueba de navegador ${stamp()}`);
        await modal.getByRole('button', { name: 'Continuar' }).click();

        const pin = page.getByTestId('pin-confirm');
        await expect(pin).toContainText(`existencias ${target.stock} → ${target.stock + 1}`);
        await fillPinDialog(page, USERS.reception);
        await pin.getByRole('button', { name: 'Registrar con PIN' }).click();
        await expect(page.getByText(`Entrada registrada: 1 de ${target.name}`)).toBeVisible({ timeout: 20_000 });

        const after = (await (await page.request.get('/api/products')).json() as Product[]).find((p) => p.id === target.id)!;
        expect(after.stock).toBe(target.stock + 1);
    });

    test('la gerente ve costos y puede editar productos', async ({ page }) => {
        await login(page, USERS.manager);
        await page.goto('/inventario', { waitUntil: 'networkidle' });
        await expect(page.getByText('Costo:').first()).toBeVisible();
        await expect(page.getByRole('button', { name: /^Editar / }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /^Registrar entrada de / }).first()).toBeVisible();
    });

    test('el barbero no abre el inventario', async ({ page }) => {
        await login(page, USERS.barber);
        await page.goto('/inventario');
        await expect(page).not.toHaveURL(/\/inventario/);
    });
});

test.describe('equipo: títulos', () => {
    test('Sonia se lee "Gerente Barbera"; Alonso, "Gerente" con la insignia "Cuenta principal"', async ({ page }) => {
        await login(page, USERS.owner);
        await expect(page.getByRole('complementary').getByText('Gerente', { exact: true })).toBeVisible(); // pie del menú: el título de Alonso
        await page.goto('/equipo', { waitUntil: 'networkidle' });
        const soniaCard = page.locator('h3', { hasText: 'Sonia' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
        await expect(soniaCard.getByTestId('member-title')).toHaveText('Gerente Barbera');
        // Accesos: la fila de Alonso lleva la insignia y su título "Gerente".
        const access = page.getByRole('region', { name: 'Accesos a la app' });
        const alonsoRow = access.locator('li, div').filter({ hasText: /usuario alonso/ }).last();
        await expect(alonsoRow).toContainText('Cuenta principal');
        await expect(alonsoRow).toContainText('Gerente');
        const soniaRow = access.locator('li, div').filter({ hasText: /usuario sonia/ }).last();
        await expect(soniaRow).toContainText('Gerente Barbera');
        await expect(soniaRow).not.toContainText('Cuenta principal');
    });

    test('solo Alonso ve el campo "Título visible"', async ({ page, browser }) => {
        await login(page, USERS.owner);
        await page.goto('/equipo', { waitUntil: 'networkidle' });
        const card = page.locator('h3', { hasText: 'Sonia' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
        await card.getByRole('button', { name: 'Editar' }).click();
        const dialog = page.getByRole('dialog', { name: 'Editar persona' });
        await expect(dialog.getByLabel('Título visible (opcional)')).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancelar' }).click();

        const ctx = await browser.newContext();
        const manager = await ctx.newPage();
        await login(manager, USERS.manager);
        await expect(manager.getByRole('complementary').getByText('Gerente Barbera', { exact: true })).toBeVisible();
        await manager.goto('/equipo', { waitUntil: 'networkidle' });
        const mCard = manager.locator('h3', { hasText: 'Dani' }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
        await mCard.getByRole('button', { name: 'Editar' }).click();
        await expect(manager.getByRole('dialog', { name: 'Editar persona' })).toBeVisible();
        await expect(manager.getByLabel('Título visible (opcional)')).toHaveCount(0);
        await ctx.close();
    });
});
