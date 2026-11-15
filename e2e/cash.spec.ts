import { expect, test } from '@playwright/test';
import { USERS, ensureOpenCashSession, login } from './helpers';

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

test.describe('caja', () => {
    test('gasto, límite de efectivo, cierre guiado y reapertura con el fondo', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        const settings = await (await page.request.get('/api/cash/settings')).json();
        const before = await (await page.request.get('/api/cash/session')).json();

        // Si la caja de pruebas está corta, se le mete efectivo para poder registrar un gasto.
        if (before.expected_cash < 100) {
            const top = await page.request.post('/api/cash/movements', { data: { cash_session_id: before.id, movement_type: 'deposit', method: 'cash', amount: 1500, description: 'Fondo de prueba E2E' } });
            expect(top.ok(), await top.text()).toBeTruthy();
        }

        await page.goto('/caja', { waitUntil: 'networkidle' });
        const expectedBefore = (await (await page.request.get('/api/cash/session')).json()).expected_cash as number;
        await expect(page.getByTestId('cash-expected')).toHaveText(money(expectedBefore));

        // Un gasto pequeño (el agua, la basura) queda registrado y baja el efectivo.
        await page.getByRole('button', { name: 'Gasto, retiro o entrada' }).click();
        await page.locator('#movement-concept').fill('Agua E2E');
        await page.locator('#movement-amount').fill('20');
        await page.getByRole('button', { name: 'Registrar', exact: true }).click();
        await expect(page.getByTestId('cash-expected')).toHaveText(money(expectedBefore - 20));
        await expect(page.getByTestId('cash-movement').first()).toContainText('Agua E2E');
        await expect(page.getByTestId('cash-movement').first()).toContainText('−$20');

        // No puede salir más efectivo del que hay.
        await page.getByRole('button', { name: 'Gasto, retiro o entrada' }).click();
        await page.getByRole('button', { name: /^Retiro/ }).click();
        await page.locator('#movement-concept').fill('Retiro imposible E2E');
        await page.locator('#movement-amount').fill(String(expectedBefore + 5000));
        await page.getByRole('button', { name: 'Registrar', exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: 'No hay suficiente efectivo en caja' })).toBeVisible();
        await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

        // Cierre guiado: contar.
        const expected = expectedBefore - 20;
        await page.getByRole('button', { name: 'Cerrar caja' }).click();
        await page.getByLabel('Cantidad de billetes de 500').fill('2');
        await page.getByLabel('Cantidad de monedas de 0.5').fill('1');
        await expect(page.getByTestId('close-counted')).toHaveText('$1,000.50');
        await page.getByRole('button', { name: 'Solo el total' }).click();
        await page.locator('#counted-total').fill(String(expected));
        await expect(page.getByTestId('close-difference')).toHaveText('Cuadra');
        await page.getByRole('button', { name: 'Continuar' }).click();

        // Repartir: fondo, apartado y retiro propuestos.
        const float = Math.min(expected, settings.float_target);
        const reserve = Math.min(expected - float, settings.reserve_amount);
        await expect(page.locator('#close-float')).toHaveValue(String(float));
        await expect(page.locator('#close-reserve')).toHaveValue(String(reserve));
        await expect(page.getByTestId('close-withdrawn')).toHaveText(money(expected - float - reserve));
        await page.getByRole('dialog').getByRole('button', { name: 'Cerrar caja' }).click();

        const summary = page.getByTestId('close-summary');
        await expect(summary).toContainText('Caja cerrada');
        await expect(summary).toContainText('Cuadra');
        await expect(summary).toContainText(money(float));

        // Al día siguiente: propone abrir con lo que se dejó.
        await expect(page.locator('#open-amount')).toHaveValue(String(float));
        await page.getByRole('button', { name: 'Abrir caja' }).click();
        await expect(page.getByTestId('cash-expected')).toHaveText(money(float));
        const reopened = await (await page.request.get('/api/cash/session')).json();
        expect(reopened.initial_amount).toBe(float);
        expect(reopened.opening_expected).toBe(float);
    });
});
