import { expect, test, type Page } from '@playwright/test';
import { USERS, login, stamp } from './helpers';

// Clientes de punta a punta: alta (con y sin teléfono), lista, ficha, notas, desactivar/reactivar y lo que ve un barbero.
// Todo con clientes ficticios "Prueba Navegador …" (los clientes no se borran: se desactivan al final).

const suffix = stamp();
const noPhone = `Prueba Navegador Sin Tel ${suffix}`;
const withPhone = `Prueba Navegador Con Tel ${suffix}`;
const PHONE = '5550001234'; // ficticio, 10 dígitos
const PHONE_SHOWN = '55 5000 1234'; // cómo se ve en pantalla (formatPhone)

async function search(page: Page, text: string, status: 'Activos' | 'Inactivos' | 'Todos' = 'Activos') {
    await page.getByRole('button', { name: status, exact: true }).click();
    await page.getByRole('searchbox', { name: 'Buscar clientes' }).fill(text);
}

test.describe.serial('clientes', () => {
    test('recepción da de alta un cliente sin teléfono y otro con teléfono', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/clientes', { waitUntil: 'networkidle' });

        // Sin teléfono (es opcional).
        await page.getByRole('button', { name: 'Registrar cliente' }).click();
        const dialog = page.getByRole('dialog', { name: 'Registrar nuevo cliente' });
        await dialog.getByLabel('Nombre completo *').fill(noPhone);
        await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
        await expect(dialog).toHaveCount(0);

        // Con teléfono; uno inválido se rechaza con un mensaje junto al campo.
        await page.getByRole('button', { name: 'Registrar cliente' }).click();
        await dialog.getByLabel('Nombre completo *').fill(withPhone);
        await dialog.getByLabel('Teléfono (WhatsApp, opcional)').fill('123');
        await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
        await expect(dialog.getByText('El teléfono debe tener entre 10 y 15 dígitos.')).toBeVisible();
        await dialog.getByLabel('Teléfono (WhatsApp, opcional)').fill(PHONE);
        await dialog.getByRole('button', { name: 'Guardar cliente' }).click();
        await expect(dialog).toHaveCount(0);

        // La lista los muestra con 0 visitas y "Nunca"; el que no tiene teléfono lo marca con un guion.
        await search(page, `Prueba Navegador`);
        const rowNoPhone = page.getByTestId('client-row').filter({ hasText: noPhone });
        const rowPhone = page.getByTestId('client-row').filter({ hasText: withPhone });
        await expect(rowNoPhone).toHaveCount(1);
        await expect(rowPhone).toHaveCount(1);
        await expect(rowPhone).toContainText(PHONE_SHOWN);
        await expect(rowPhone).toContainText('Nunca');
        await expect(rowNoPhone.locator('td[data-label="Teléfono"]')).toHaveText('—');
        await expect(rowNoPhone.locator('td[data-label="Visitas"]')).toHaveText('0');
    });

    test('la lista muestra visitas y última visita reales', async ({ page }) => {
        await login(page, USERS.reception);
        const clients = await (await page.request.get('/api/clients?estado=todos')).json() as { name: string; visits: number; last_visit_at: string | null }[];
        const visited = clients.find((c) => c.visits > 0 && c.last_visit_at);
        test.skip(!visited, 'Ningún cliente tiene visitas todavía.');
        await page.goto('/clientes', { waitUntil: 'networkidle' });
        await search(page, visited!.name, 'Todos');
        const row = page.getByTestId('client-row').filter({ hasText: visited!.name }).first();
        await expect(row.locator('td[data-label="Visitas"]')).toHaveText(String(visited!.visits));
        await expect(row.locator('td[data-label="Última visita"]')).not.toHaveText('Nunca');
        // El resumen de arriba cuenta lo que muestra la lista.
        await expect(page.getByText('Con visitas').locator('..').locator('p').nth(1)).not.toHaveText('0');
    });

    test('la ficha muestra contacto y resumen, guarda notas y edita el contacto', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/clientes', { waitUntil: 'networkidle' });
        await search(page, withPhone);
        await page.getByRole('link', { name: new RegExp(withPhone) }).click();
        await expect(page.getByRole('heading', { level: 1, name: withPhone })).toBeVisible();
        await expect(page.getByText(PHONE_SHOWN)).toBeVisible();
        await expect(page.getByRole('region', { name: 'Resumen' })).toContainText('Nunca');
        await expect(page.getByText('Todavía no hay historial')).toBeVisible();

        // Notas: el botón se habilita al escribir y el texto sobrevive a recargar.
        const save = page.getByRole('button', { name: 'Guardar notas' });
        await expect(save).toBeDisabled();
        await page.getByLabel('Notas', { exact: true }).fill('Prueba: prefiere la máquina del 2');
        await page.getByLabel('Preferencias').fill('Prueba: degradado bajo');
        await expect(save).toBeEnabled();
        await save.click();
        await expect(page.getByText('Notas guardadas.')).toBeVisible();
        await expect(save).toBeDisabled();
        await page.reload({ waitUntil: 'networkidle' });
        await expect(page.getByLabel('Notas', { exact: true })).toHaveValue('Prueba: prefiere la máquina del 2');
        await expect(page.getByLabel('Preferencias')).toHaveValue('Prueba: degradado bajo');

        // Editar contacto.
        await page.getByRole('button', { name: 'Editar contacto' }).click();
        const dialog = page.getByRole('dialog', { name: 'Editar contacto' });
        await dialog.getByLabel('Correo electrónico (opcional)').fill(`prueba.${suffix.toLowerCase()}@example.com`);
        await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByText(`prueba.${suffix.toLowerCase()}@example.com`)).toBeVisible();
    });

    test('un cliente sin teléfono se puede editar sin inventarle uno', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/clientes', { waitUntil: 'networkidle' });
        await search(page, noPhone);
        await page.getByRole('link', { name: new RegExp(noPhone) }).click();
        await page.getByRole('button', { name: 'Editar contacto' }).click();
        const dialog = page.getByRole('dialog', { name: 'Editar contacto' });
        // El alta dice que el teléfono es opcional; la edición no debe exigirlo.
        await dialog.getByLabel(/^Nombre completo/).fill(`${noPhone} B`);
        await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 1, name: `${noPhone} B` })).toBeVisible();
    });

    test('desactivar pide confirmación, saca al cliente de activos y se puede reactivar', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/clientes', { waitUntil: 'networkidle' });
        await search(page, withPhone);
        await page.getByRole('link', { name: new RegExp(withPhone) }).click();
        await page.getByRole('button', { name: 'Desactivar' }).click();
        const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: '¿Desactivar a este cliente?' }));
        await expect(confirm.getByText('No se borra nada')).toBeVisible();
        await confirm.getByRole('button', { name: 'Desactivar' }).click();
        await expect(page.getByText('Inactivo').first()).toBeVisible();
        // Ya no se le puede agendar.
        await expect(page.getByRole('link', { name: 'Agendar cita' })).toHaveCount(0);

        await page.goto('/clientes', { waitUntil: 'networkidle' });
        await search(page, withPhone, 'Activos');
        await expect(page.getByTestId('client-row').filter({ hasText: withPhone })).toHaveCount(0);
        await search(page, withPhone, 'Inactivos');
        await expect(page.getByTestId('client-row').filter({ hasText: withPhone })).toHaveCount(1);

        await page.getByRole('link', { name: new RegExp(withPhone) }).click();
        await page.getByRole('button', { name: 'Reactivar' }).click();
        await page.getByRole('dialog', { name: '¿Reactivar a este cliente?' }).getByRole('button', { name: 'Reactivar' }).click();
        await expect(page.getByRole('link', { name: 'Agendar cita' })).toBeVisible();
    });

    test('el barbero no ve importes ni botones de edición, y solo ve a sus clientes', async ({ page, browser }) => {
        // Un cliente que Deya no ha atendido (el creado arriba) no debe aparecerle.
        await login(page, USERS.barber);
        const mine = await (await page.request.get('/api/clients?estado=todos')).json() as { id: string; name: string; total_spent?: number | null; visits: number }[];
        expect(mine.find((c) => c.name.startsWith('Prueba Navegador'))).toBeUndefined();
        for (const c of mine) expect(c.total_spent ?? null, 'el barbero no recibe importes').toBeNull();

        await page.goto('/clientes', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Registrar cliente' })).toHaveCount(1); // el barbero sí registra a quien llega

        // Un cliente ajeno: la ficha no se abre (la base no se lo entrega).
        const owner = await browser.newContext();
        const ownerPage = await owner.newPage();
        await login(ownerPage, USERS.reception);
        const all = await (await ownerPage.request.get('/api/clients?estado=todos&q=Prueba Navegador')).json() as { id: string }[];
        await owner.close();
        expect(all.length).toBeGreaterThan(0);
        const foreign = await page.request.get(`/api/clients/${all[0].id}`);
        expect([403, 404]).toContain(foreign.status());
        await page.goto(`/clientes/${all[0].id}`, { waitUntil: 'networkidle' });
        await expect(page.getByRole('button', { name: 'Editar contacto' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Desactivar|Reactivar/ })).toHaveCount(0);

        // Una ficha propia: sin "Gasto total", sin editar, notas de solo lectura.
        if (mine.length > 0) {
            await page.goto(`/clientes/${mine[0].id}`, { waitUntil: 'networkidle' });
            await expect(page.getByText('Gasto total')).toHaveCount(0);
            await expect(page.getByRole('button', { name: 'Editar contacto' })).toHaveCount(0);
            await expect(page.getByRole('button', { name: 'Guardar notas' })).toHaveCount(0);
            await expect(page.getByRole('button', { name: /Desactivar|Reactivar/ })).toHaveCount(0);
        }
    });

    test('limpieza: los clientes de prueba quedan inactivos', async ({ page }) => {
        await login(page, USERS.reception);
        const clients = await (await page.request.get(`/api/clients?estado=activos&q=${encodeURIComponent(`Prueba Navegador`)}`)).json() as { id: string; name: string }[];
        for (const c of clients.filter((x) => x.name.includes(suffix))) {
            const res = await page.request.patch(`/api/clients/${c.id}`, { data: { is_active: false } });
            expect(res.ok(), await res.text()).toBeTruthy();
        }
    });
});
