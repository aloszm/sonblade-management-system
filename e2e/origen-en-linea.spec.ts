import { expect, test } from '@playwright/test';
import { USERS, login, randomInt, stamp } from './helpers';

// Una reserva hecha en la página pública se distingue en la agenda interna: etiqueta "En línea" en la tarjeta
// y en su detalle. Crea una cita real de prueba ("Prueba En Línea …") y la cancela al final por su enlace personal.

test.describe('origen de la cita', () => {
    test('la reserva en línea aparece en la agenda con la etiqueta "En línea"', async ({ page }) => {
        const clientName = `Prueba En Línea ${stamp()}`;
        // Teléfono ficticio válido (10 dígitos, sin repetir un solo número) distinto en cada corrida.
        const phone = `55${randomInt(1000, 9999)}${randomInt(1000, 9999)}`;
        let token = '';
        try {
            await page.goto('/reservar', { waitUntil: 'networkidle' });
            await page.locator('label', { hasText: /^Corte adulto/ }).click();
            await page.locator('label', { hasText: /^Cualquier barbero/ }).click();
            const days = page.locator('label[data-day]:has(input[name="day"]:not([disabled]))');
            await expect(days.first()).toBeVisible({ timeout: 30_000 });
            await days.last().click();
            const slots = page.locator('label:has(input[name="slot"])');
            await expect(slots.first()).toBeVisible({ timeout: 30_000 });
            await slots.last().click();

            await expect(page.getByRole('heading', { name: '¿A nombre de quién?' })).toBeVisible();
            // Un teléfono con todos los dígitos iguales no se acepta y lo dice junto al campo.
            await page.locator('#bk-name').fill(clientName);
            await page.locator('#bk-phone').fill('0000000000');
            await page.getByRole('button', { name: 'Confirmar cita' }).click();
            await expect(page.locator('#bk-phone-err')).toBeVisible();
            await page.locator('#bk-phone').fill('5555555555');
            await page.getByRole('button', { name: 'Confirmar cita' }).click();
            await expect(page.locator('#bk-phone-err')).toBeVisible();

            await page.locator('#bk-phone').fill(phone);
            await expect(page.locator('#bk-phone-err')).toHaveCount(0);
            await page.getByRole('checkbox').check();
            await page.getByRole('button', { name: 'Confirmar cita' }).click();
            await expect(page.getByRole('heading', { name: 'Listo, te esperamos' })).toBeVisible({ timeout: 30_000 });

            await page.getByRole('link', { name: 'Ver o cancelar mi cita' }).click();
            await expect(page).toHaveURL(/\/reservar\/[0-9a-f]{64}$/);
            token = page.url().split('/').pop()!;
            const view = await (await page.request.get(`/api/public/booking/${token}`)).json() as { booking: { date: string } };
            const day = view.booking.date;

            // Recepción abre ese día en la agenda: la tarjeta y el detalle llevan la etiqueta.
            await login(page, USERS.reception);
            await page.goto(`/citas?fecha=${day}`, { waitUntil: 'networkidle' });
            const card = page.getByTestId('day-appointment').filter({ hasText: clientName });
            await expect(card).toHaveCount(1, { timeout: 30_000 });
            await expect(card.getByTestId('origen-en-linea')).toBeVisible();
            await card.click();
            await expect(page.getByTestId('appointment').filter({ hasText: clientName }).getByTestId('origen-en-linea')).toBeVisible();
        } finally {
            if (token) {
                const cancelled = await page.request.delete(`/api/public/booking/${token}`);
                expect(cancelled.ok(), 'la cita de prueba debe quedar cancelada').toBeTruthy();
            }
        }
    });
});
