import { expect, test } from '@playwright/test';
import { USERS, login } from './helpers';

// Panel y Finanzas: "Utilidad" sin filtro, "Aporte" al filtrar por una persona, y que la utilidad del Panel
// coincida con la de Finanzas para el mismo periodo (el Panel muestra pesos enteros; Finanzas, centavos).

/** Primer importe de un texto ("Utilidad $1,234 …" o "-$50.00"), como número. */
function firstAmount(text: string): number {
    const match = text.match(/([−-])?\s*\$\s*([\d,]+(?:\.\d+)?)/);
    if (!match) throw new Error(`No hay importe en: ${text}`);
    return (match[1] ? -1 : 1) * Number(match[2].replace(/,/g, ''));
}

test.describe('panel y finanzas', () => {
    test('Utilidad sin filtro, Aporte al filtrar por un barbero, y vuelve a Utilidad', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/', { waitUntil: 'networkidle' });
        const kpis = page.getByRole('region', { name: 'Indicadores principales' });
        await page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Mes', exact: true }).click();
        await expect(page.getByTestId('profit-note')).toContainText('Utilidad = ingresos − comisiones − costo de producto');
        await expect(kpis).toContainText('Utilidad');

        await page.getByRole('group', { name: 'Filtrar por persona' }).getByRole('button', { name: 'Deya' }).click();
        await expect(kpis).toContainText('Aporte');
        await expect(kpis).not.toContainText('Utilidad');
        await expect(page.getByTestId('profit-note')).toHaveCount(0); // la utilidad del negocio no se explica sobre una persona

        await page.getByRole('group', { name: 'Filtrar por persona' }).getByRole('button', { name: 'Toda la barbería' }).click();
        await expect(kpis).toContainText('Utilidad');
    });

    test('la utilidad del Panel coincide con la de Finanzas en el mismo periodo (mes)', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/', { waitUntil: 'networkidle' });
        const kpis = page.getByRole('region', { name: 'Indicadores principales' });
        // Mientras llegan las cifras del mes, el Panel aún muestra las de la semana: se espera a Finanzas del mes.
        await Promise.all([
            page.waitForResponse((r) => /\/api\/admin\/profit\?from=\d{4}-\d{2}-01/.test(r.url())),
            page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Mes', exact: true }).click(),
        ]);
        // La cifra definitiva llega de Finanzas; antes se muestra una provisional sin el costo del producto.
        await expect(page.getByTestId('profit-note')).toContainText(/costo de producto \(\$/);
        await expect(kpis).toContainText('Utilidad');
        const panelValue = firstAmount(await page.getByTestId('kpi-net').innerText());

        await page.goto('/administracion', { waitUntil: 'networkidle' });
        await page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Este mes' }).click();
        const profit = page.getByTestId('profit-total');
        await expect(profit).toBeVisible();
        const financeValue = firstAmount(await profit.innerText());
        // El Panel redondea a pesos enteros: puede diferir menos de un peso.
        expect(Math.abs(panelValue - financeValue), `Panel ${panelValue} contra Finanzas ${financeValue}`).toBeLessThan(1);
    });
});
