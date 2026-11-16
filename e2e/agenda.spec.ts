import { expect, test } from '@playwright/test';
import { USERS, login } from './helpers';

const pad = (n: number) => String(n).padStart(2, '0');

test.describe('agenda', () => {
    test('las citas de un día se abren en una ventana flotante que se cierra al tocar afuera', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/citas', { waitUntil: 'networkidle' });

        // La agenda abre en la vista por día, con una columna por barbero.
        await expect(page.getByTestId('day-view')).toBeVisible();
        await expect(page.getByTestId('day-view')).toContainText('Deya');

        // Un día del mes que viene, a una hora rara, para no chocar con otras pruebas.
        await page.getByRole('button', { name: 'Mes', exact: true }).click();
        await page.getByRole('button', { name: 'Mes siguiente' }).click();
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1 + (now.getMinutes() % 27));
        const key = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
        // Las citas van en bloques de 30 minutos: la hora cae en :00 o :30.
        const time = `${pad(13 + (now.getSeconds() % 3))}:${pad((now.getMinutes() % 2) * 30)}`;
        const day = page.getByTestId(`day-${key}`);

        // Abre la ventana y se cierra tocando afuera.
        await day.click();
        await expect(page.getByTestId('day-modal')).toBeVisible();
        await page.getByTestId('modal-backdrop').click({ position: { x: 10, y: 10 } });
        await expect(page.getByTestId('day-modal')).toHaveCount(0);

        // Y también con Esc.
        await day.click();
        await expect(page.getByTestId('day-modal')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('day-modal')).toHaveCount(0);

        // Agendar desde la ventana del día.
        await day.click();
        await page.getByRole('button', { name: 'Agendar en este día' }).click();
        // La fecha y la hora son selectores propios (botón + diálogo), no controles nativos.
        await expect(page.locator('#apt-date')).toHaveText(new RegExp(`\\b${Number(key.slice(8))} [a-z]{3} ${key.slice(0, 4)}$`));
        await page.locator('#apt-time').click();
        await page.locator(`[role="option"][data-value="${time}"]`).click();
        await page.locator('#apt-name').fill('Visitante agenda E2E');
        await page.getByRole('button', { name: 'Guardar cita' }).click();

        const modal = page.getByTestId('day-modal');
        await expect(modal).toBeVisible();
        await expect(modal.getByTestId('appointment').filter({ hasText: 'Visitante agenda E2E' }).first()).toBeVisible();

        // Cancelarla deja el horario libre y la cita registrada como cancelada.
        const item = modal.getByTestId('appointment').filter({ hasText: 'Visitante agenda E2E' }).filter({ hasText: 'Agendada' }).first();
        await item.getByRole('button', { name: 'Cancelar' }).click();
        await page.locator('#cancel-reason').fill('Prueba automática');
        await page.getByRole('button', { name: 'Cancelar cita' }).click();
        await expect(page.getByTestId('day-modal').getByText('Cancelada: Prueba automática').first()).toBeVisible();

        // Solo se ofrecen confirmar, llegó y cancelar.
        const other = page.getByTestId('day-modal').getByTestId('appointment').filter({ hasText: 'Agendada' }).first();
        if (await other.count()) {
            await expect(other.getByRole('button', { name: 'Iniciar servicio' })).toHaveCount(0);
            await expect(other.getByRole('button', { name: 'No llegó' })).toHaveCount(0);
        }
    });
});
