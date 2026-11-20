import { expect, test } from '@playwright/test';

// Pantallas públicas (sin sesión): franja del modo práctica, aviso de privacidad y reserva en línea completa.
// La reserva crea una cita real de prueba ("Prueba Reserva") y la cancela por su enlace personal.

test.describe('público', () => {
    for (const route of ['/login', '/privacidad', '/reservar']) {
        test(`el modo práctica se ve en ${route}`, async ({ page }) => {
            await page.goto(route, { waitUntil: 'networkidle' });
            await expect(page.getByTestId('practice-banner')).toContainText('MODO PRÁCTICA');
            await expect(page.getByTestId('practice-banner')).toBeVisible();
        });
    }

    test('el aviso de privacidad se lee completo', async ({ page }) => {
        await page.goto('/privacidad', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeVisible();
        await expect(page.getByRole('heading', { name: /1\. Quién es el responsable/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: /2\. Qué datos personales tratamos/ })).toBeVisible();
        await expect(page.getByText(/Versión \d+\.\d+ · Última actualización/)).toBeVisible();
        // Es una página pública: no debe pedir iniciar sesión.
        await expect(page).toHaveURL(/\/privacidad$/);
    });

    test('reserva completa: servicio, barbero, día y hora, datos, confirmación y cancelación por el enlace', async ({ page }) => {
        await page.goto('/reservar', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: '¿Qué te hacemos?' })).toBeVisible();
        await expect(page.getByText('Paso 1 de 4')).toBeVisible();

        // Tocar una opción la elige y avanza (sin botón "Continuar"). Se toca la etiqueta como lo haría un dedo.
        await page.locator('label', { hasText: /^Corte adulto/ }).click();
        await expect(page.getByRole('heading', { name: '¿Con quién?' })).toBeVisible();
        await page.locator('label', { hasText: /^Cualquier barbero/ }).click();
        await expect(page.getByRole('heading', { name: '¿Cuándo?' })).toBeVisible();

        // El último día con horas de la tira y su última hora: lejos de las citas de la agenda real.
        const days = page.locator('label[data-day]:has(input[name="day"]:not([disabled]))');
        await expect(days.first()).toBeVisible({ timeout: 30_000 });
        await days.last().click();
        const slots = page.locator('label:has(input[name="slot"])');
        await expect(slots.first()).toBeVisible({ timeout: 30_000 });
        await slots.last().click();

        await expect(page.getByRole('heading', { name: '¿A nombre de quién?' })).toBeVisible();
        await expect(page.getByText('Paso 4 de 4')).toBeVisible();
        // Sin aceptar el aviso y sin datos no deja reservar y lo dice junto al campo.
        await page.getByRole('button', { name: 'Confirmar cita' }).click();
        await expect(page.locator('#bk-name-err')).toBeVisible();
        await page.locator('#bk-name').fill('Prueba Reserva');
        await page.locator('#bk-phone').fill('5550001111');
        await page.getByRole('button', { name: 'Confirmar cita' }).click();
        await expect(page.locator('#bk-accept-err')).toBeVisible();
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Confirmar cita' }).click();

        await expect(page.getByRole('heading', { name: 'Listo, te esperamos' })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText('Tu cita quedó a nombre de Prueba Reserva.')).toBeVisible();
        await expect(page.getByRole('link', { name: /Enviarme esto por WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
        await expect(page.getByTestId('practice-banner')).toBeVisible();

        // El enlace personal lleva a la reserva, donde se cancela.
        await page.getByRole('link', { name: 'Ver o cancelar mi cita' }).click();
        await expect(page).toHaveURL(/\/reservar\/[^/]+$/);
        await expect(page.getByRole('region', { name: 'Mi reserva' })).toContainText('Corte adulto');
        await page.getByRole('button', { name: 'Cancelar mi cita' }).click();
        await page.getByRole('group', { name: '¿Seguro que quieres cancelar?' }).getByRole('button').first().click();
        await expect(page.getByText(/cancelad/i).first()).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole('button', { name: 'Cancelar mi cita' })).toHaveCount(0);
    });
});
