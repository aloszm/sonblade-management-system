import { expect, test, type Page } from '@playwright/test';
import { USERS, barberIdByName, createTestClient, farWednesday, login, stamp } from './helpers';

// Agenda de punta a punta con la interfaz: cita con dos servicios, día y semana, reprogramar, empalme y cancelación.
// Usa un miércoles lejano (abre de 12:30 a 20:00) y a Deya; cada corrida elige otro día para no chocar con las anteriores.

const suffix = stamp();
const clientName = `Prueba Agenda ${suffix}`;
const day = farWednesday();

async function pickTime(page: Page, selector: string, time: string) {
    await page.locator(selector).click();
    await page.locator(`[role="option"][data-value="${time}"]`).click();
}

async function chooseServices(page: Page, names: string[]) {
    for (const name of names) {
        await page.getByTestId('service-groups').locator('label').filter({ has: page.getByText(name, { exact: true }) }).click();
    }
}

async function chooseClient(page: Page, name: string) {
    await page.getByRole('combobox', { name: 'Cliente' }).fill(name.slice(0, 14));
    await page.getByRole('option', { name: new RegExp(name) }).click();
    await expect(page.getByTestId('client-selected')).toContainText(name);
}

test.describe.serial('agenda: flujo completo', () => {
    let deyaId = '';

    test('la agenda abre en el día y el barbero que pide la dirección', async ({ page }) => {
        await login(page, USERS.reception);
        deyaId = await barberIdByName(page.request, 'Deya');
        await createTestClient(page.request, clientName, '5550004321');

        await page.goto(`/citas?fecha=${day}&barbero=${deyaId}`, { waitUntil: 'networkidle' });
        await expect(page.getByTestId('calendar-label')).toContainText(/miércoles/i);
        await expect(page.getByRole('group', { name: 'Barbero' }).getByRole('button', { name: 'Deya' })).toHaveAttribute('aria-pressed', 'true');
        await expect(page).toHaveURL(new RegExp(`fecha=${day}`));
        await expect(page).toHaveURL(new RegExp(`barbero=${deyaId}`));
        await expect(page.getByTestId('day-hours')).toContainText('12:30 p.m.');
    });

    test('crea una cita con dos servicios: la duración se suma y se ve en día y semana', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&barbero=${deyaId}`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Nueva cita' }).click();
        const form = page.getByTestId('appointment-form');
        await expect(form).toBeVisible();
        // El día y el barbero ya vienen de la dirección.
        await expect(page.locator('#apt-barber')).toHaveValue(deyaId);
        await pickTime(page, '#apt-time', '13:00');
        await chooseServices(page, ['Corte adulto', 'Barba']);
        await expect(page.getByTestId('services-duration')).toHaveText('1 h');
        await expect(page.getByTestId('services-price')).toHaveText('$250');
        await chooseClient(page, clientName);
        await form.getByRole('button', { name: 'Guardar cita' }).click();
        await expect(form).toHaveCount(0);

        // En el día: ocupa de 1:00 a 2:00 p.m. y nombra los dos servicios.
        const card = page.getByTestId('day-appointment').filter({ hasText: clientName });
        await expect(card).toHaveCount(1);
        await expect(card).toContainText('1–2 p.m.');
        await expect(card).toHaveAttribute('title', /Corte adulto.*Barba|Barba.*Corte adulto/);

        // En la semana también aparece.
        await page.getByRole('group', { name: 'Vista' }).getByRole('button', { name: 'Semana' }).click();
        await expect(page.getByTestId('week-appointment').filter({ hasText: clientName })).toHaveCount(1);
    });

    test('el detalle muestra servicios, estimado y la ficha del cliente', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&barbero=${deyaId}`, { waitUntil: 'networkidle' });
        await page.getByTestId('day-appointment').filter({ hasText: clientName }).click();
        const detail = page.getByTestId('appointment');
        await expect(detail).toContainText('1 h');
        await expect(detail.getByTestId('appointment-services')).toContainText('Corte adulto');
        await expect(detail.getByTestId('appointment-services')).toContainText('Barba');
        await expect(detail.getByTestId('appointment-services')).toContainText('Estimado: $250');
        await expect(detail.getByTestId('client-link')).toBeVisible();
    });

    test('reprogramar mueve la cita a otra hora', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&barbero=${deyaId}`, { waitUntil: 'networkidle' });
        await page.getByTestId('day-appointment').filter({ hasText: clientName }).click();
        await page.getByTestId('reschedule-appointment').click();
        const form = page.getByRole('dialog', { name: 'Reprogramar cita' });
        await expect(form).toBeVisible();
        await pickTime(page, '#apt-time', '15:00');
        await form.getByRole('button', { name: 'Guardar cambios' }).click();
        await expect(form).toHaveCount(0);
        await page.goto(`/citas?fecha=${day}&barbero=${deyaId}`, { waitUntil: 'networkidle' });
        const card = page.getByTestId('day-appointment').filter({ hasText: clientName });
        await expect(card).toContainText('3–4 p.m.');
    });

    test('un empalme se rechaza con un mensaje claro y no guarda nada', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&barbero=${deyaId}`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Nueva cita' }).click();
        const form = page.getByTestId('appointment-form');
        await pickTime(page, '#apt-time', '15:30'); // la cita de 3:00 a 4:00 sigue ocupando ese horario
        await chooseServices(page, ['Corte adulto']);
        await chooseClient(page, clientName);
        await form.getByRole('button', { name: 'Guardar cita' }).click();
        const error = form.getByTestId('form-error');
        await expect(error).toBeVisible();
        await expect(error).toContainText(/ocupad|empalm|ya tiene una cita|no está disponible/i);
        await expect(error).not.toContainText(/error|undefined|\[object/i);
        await form.getByRole('button', { name: 'Cancelar' }).click();
        await expect(page.getByTestId('day-appointment').filter({ hasText: clientName })).toHaveCount(1);
    });

    test('cancelar pide el motivo y deja la cita registrada como cancelada', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&barbero=${deyaId}`, { waitUntil: 'networkidle' });
        await page.getByTestId('day-appointment').filter({ hasText: clientName }).click();
        await page.getByTestId('appointment').getByRole('button', { name: 'Cancelar' }).click();
        // Sin motivo no deja cancelar.
        await page.getByRole('button', { name: 'Cancelar cita' }).click();
        await expect(page.getByText('Escribe el motivo de la cancelación.')).toBeVisible();
        await page.locator('#cancel-reason').fill('Prueba de navegador');
        await page.getByRole('button', { name: 'Cancelar cita' }).click();
        await expect(page.getByTestId('appointment').getByText('Cancelada: Prueba de navegador')).toBeVisible();
    });

    test('el barbero ve la agenda en solo lectura y no puede agendar', async ({ page }) => {
        await login(page, USERS.barber);
        await page.goto('/citas?nueva=1', { waitUntil: 'networkidle' });
        await expect(page.getByRole('button', { name: 'Nueva cita' })).toHaveCount(0);
        await expect(page.getByTestId('appointment-form')).toHaveCount(0);
        await expect(page.getByText('Solo lectura.')).toBeVisible();
        await expect(page.getByRole('button', { name: /^Agendar con / })).toHaveCount(0);
        const res = await page.request.post('/api/appointments', { data: { customer_name: 'Prueba Barbero', scheduled_at: new Date().toISOString() } });
        expect(res.status()).toBe(403);
    });
});
