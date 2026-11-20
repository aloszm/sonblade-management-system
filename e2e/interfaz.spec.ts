import { expect, test } from '@playwright/test';
import { USERS, createTestClient, login, stamp } from './helpers';

// Detalles de interfaz corregidos tras la revisión de capturas: teléfonos con formato, Ventas abre en la semana,
// bitácora en español, Panel en celular y la casilla de privacidad de /reservar.

test.describe('interfaz', () => {
    test('el teléfono de un cliente se ve como "55 7384 4043" en la lista y en la ficha', async ({ page }) => {
        await login(page, USERS.reception);
        const name = `Prueba Teléfono ${stamp()}`;
        const id = await createTestClient(page.request, name, '5573844043');
        await page.goto('/clientes', { waitUntil: 'networkidle' });
        await page.getByRole('searchbox', { name: 'Buscar clientes' }).fill(name);
        const row = page.getByTestId('client-row').filter({ hasText: name });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('55 7384 4043');
        await expect(row).not.toContainText('5573844043');
        await page.goto(`/clientes/${id}`, { waitUntil: 'networkidle' });
        await expect(page.getByText('55 7384 4043')).toBeVisible();
        const res = await page.request.patch(`/api/clients/${id}`, { data: { is_active: false } });
        expect(res.ok(), await res.text()).toBeTruthy();
    });

    test('Ventas abre en la semana y muestra el resumen del periodo', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/ventas/historial', { waitUntil: 'networkidle' });
        await expect(page.getByRole('button', { name: 'Semanal' })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText(/Esta semana: /)).toBeVisible();
        for (const t of ['Total generado', 'Ventas', 'Ticket promedio']) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    });

    test('la bitácora no muestra nombres técnicos de acciones', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/admin/auditoria', { waitUntil: 'networkidle' });
        const table = page.locator('table');
        await expect(table.locator('tbody tr').first()).toBeVisible();
        const text = await table.innerText();
        expect(text).not.toMatch(/[a-z]+_[a-z]+/); // sin guiones bajos (pin_reset_emergency, cash_opened…)
        expect(text).not.toMatch(/\b[a-z_]+\.(insert|update|delete)\b/);
    });

    test.describe('en celular', () => {
        test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

        test('el Panel no se corta por la derecha y el filtro por persona es un solo control', async ({ page }) => {
            await login(page, USERS.owner);
            await page.goto('/', { waitUntil: 'networkidle' });
            await expect(page.getByTestId('team-row').first()).toBeVisible({ timeout: 30_000 });
            const person = page.getByRole('combobox', { name: 'Filtrar por persona' });
            await expect(person).toBeVisible();
            await expect(page.getByRole('group', { name: 'Filtrar por persona' })).toBeHidden();
            // Nada se sale del ancho de la pantalla (las tablas son tarjetas).
            const overflow = await page.evaluate(() => {
                const w = document.documentElement.clientWidth;
                return Array.from(document.querySelectorAll('main *')).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > w + 1 && !el.closest('.overflow-x-auto, [class*="recharts"]'); }).length;
            });
            expect(overflow).toBe(0);
            await person.selectOption({ index: 1 });
            await expect(page.getByRole('region', { name: 'Indicadores principales' })).toContainText('Aporte', { timeout: 30_000 });
        });

        test('la casilla del aviso de privacidad se ve como casilla y se marca', async ({ page }) => {
            await page.goto('/reservar', { waitUntil: 'networkidle' });
            await page.waitForTimeout(1500);
            // Flujo rediseñado: tocar una opción la elige y avanza (servicio, barbero, hora).
            await page.locator('label', { hasText: /^Corte adulto/ }).click();
            await expect(page.getByRole('heading', { name: '¿Con quién?' })).toBeVisible();
            await page.locator('label', { hasText: /^Cualquier barbero/ }).click();
            const slots = page.locator('label:has(input[name="slot"])');
            await expect(slots.first()).toBeVisible({ timeout: 30_000 });
            await slots.last().click();
            const box = page.locator('#bk-accept');
            await expect(box).toBeVisible();
            await expect(box).toHaveClass(/bos-check/);
            expect(await box.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
            await box.check();
            await expect(box).toBeChecked();
        });
    });
});
