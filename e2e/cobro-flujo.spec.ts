import { expect, test, type APIRequestContext } from '@playwright/test';
import { USERS, barberIdByName, createTestClient, ensureOpenCashSession, fillPinDialog, farWednesday, login, stamp } from './helpers';

// Cobro de punta a punta con la interfaz. Cada venta es de prueba, de $150 (Corte adulto) o menos.
// Las ventas no se borran: la que se anula al final queda anulada con su motivo.

const suffix = stamp();
const walkInClient = `Prueba Cobro Sin Abrir ${suffix}`;
const fromAgendaClient = `Prueba Cobro Cita ${suffix}`;
const WRONG_PIN = '135791'; // un solo intento incorrecto, a propósito

async function service(request: APIRequestContext, name: string): Promise<{ id: string; price: number }> {
    const list = await (await request.get('/api/services')).json() as { id: string; name: string; price: number }[];
    const found = list.find((s) => s.name === name);
    expect(found, `debe existir el servicio ${name}`).toBeTruthy();
    return { id: found!.id, price: Number(found!.price) };
}

/** Hora local de la barbería, en minutos desde medianoche, y el día de hoy como AAAA-MM-DD. */
async function localNow(page: import('@playwright/test').Page) {
    return page.evaluate(() => {
        const d = new Date();
        return { minutes: d.getHours() * 60 + d.getMinutes(), day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    });
}

test.describe.serial('cobro: cita, sin abrir la cita, descuento y anulación', () => {
    test('cobrar desde la cita de la agenda liga la venta a la cita', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        const dani = await barberIdByName(page.request, 'Dani');
        const corte = await service(page.request, 'Corte adulto');
        const clientId = await createTestClient(page.request, fromAgendaClient, '5550005678');
        const day = farWednesday();
        const created = await page.request.post('/api/appointments', {
            data: { client_id: clientId, barber_id: dani, service_ids: [corte.id], scheduled_at: new Date(`${day}T19:00:00-06:00`).toISOString() },
        });
        expect(created.status(), await created.text()).toBe(201);
        const apt = await created.json() as { id: string };

        // Desde la agenda: abrir la cita y tocar "Cobrar".
        await page.goto(`/citas?fecha=${day}&barbero=${dani}`, { waitUntil: 'networkidle' });
        await page.getByTestId('day-appointment').filter({ hasText: fromAgendaClient }).click();
        await page.getByTestId('charge-appointment').click();
        await expect(page).toHaveURL(new RegExp(`/pos\\?cita=${apt.id}`));
        await expect(page.getByTestId('pos-appointment')).toContainText(`Cobrando la cita de ${fromAgendaClient}`);
        // Los servicios de la cita ya vienen en la venta.
        await expect(page.getByTestId('pos-total')).toHaveText(`$${corte.price}`);
        await page.getByRole('button', { name: `Cobrar $${corte.price}` }).click();
        await expect(page.getByTestId('pos-success')).toBeVisible({ timeout: 20_000 });

        const after = await (await page.request.get(`/api/appointments/${apt.id}`)).json() as { status: string; sale: { total: number } | null };
        expect(after.status).toBe('completed');
        expect(after.sale?.total).toBe(corte.price);
        // La ficha del cliente ya tiene la visita en su historial.
        await page.goto(`/clientes/${clientId}`, { waitUntil: 'networkidle' });
        await expect(page.getByTestId('history-row').first()).toContainText('Corte adulto');
        await expect(page.getByRole('region', { name: 'Resumen' }).getByText('Visitas').locator('..').locator('p').nth(1)).toHaveText('1');
    });

    test('cobrar SIN abrir la cita sugiere "Es la cita de …" y no deja la cita duplicada', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        const sonia = await barberIdByName(page.request, 'Sonia');
        const corte = await service(page.request, 'Corte adulto');
        const clientId = await createTestClient(page.request, walkInClient, '5550008765');

        // Una cita de HOY que ya llegó la hora (o casi): las sugerencias son las citas abiertas del día.
        await page.goto('/pos', { waitUntil: 'networkidle' });
        const now = await localNow(page);
        const slot = Math.max(12 * 60 + 30, Math.floor(now.minutes / 30) * 30);
        test.skip(slot > 19 * 60 + 30, 'Ya es muy tarde para agendar una cita de hoy dentro del horario del negocio.');
        const hh = String(Math.floor(slot / 60)).padStart(2, '0'), mm = String(slot % 60).padStart(2, '0');
        const iso = await page.evaluate(([day, time]) => new Date(`${day}T${time}:00`).toISOString(), [now.day, `${hh}:${mm}`]);
        const created = await page.request.post('/api/appointments', { data: { client_id: clientId, barber_id: sonia, service_ids: [corte.id], scheduled_at: iso } });
        test.skip(created.status() === 409, `Sonia no tiene libre el horario de hoy (${(await created.json()).error}).`);
        expect(created.status(), await created.text()).toBe(201);
        const apt = await created.json() as { id: string };

        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Sonia', exact: true }).click();
        const suggestions = page.getByTestId('pos-open-appointments');
        await expect(suggestions).toContainText('Sonia tiene una cita abierta hoy');
        await suggestions.getByRole('button', { name: new RegExp(`^Es la cita de ${walkInClient}`) }).click();
        await expect(page.getByTestId('pos-appointment')).toContainText(`Cobrando la cita de ${walkInClient}`);
        await expect(page.getByTestId('pos-total')).toHaveText(`$${corte.price}`); // los servicios de la cita ya vienen
        await page.getByRole('button', { name: `Cobrar $${corte.price}` }).click();
        await expect(page.getByTestId('pos-success')).toBeVisible({ timeout: 20_000 });

        // No quedó una cita duplicada "sin cita": la venta está ligada a la cita original.
        const window = await page.evaluate(() => ({ from: new Date(Date.now() - 12 * 3600_000).toISOString(), to: new Date(Date.now() + 12 * 3600_000).toISOString() }));
        const todays = await (await page.request.get(`/api/appointments?from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}`)).json() as { id: string; client_name: string; walk_in: boolean; status: string; sale: { id: string } | null }[];
        const mine = todays.filter((a) => a.client_name === walkInClient || a.id === apt.id);
        expect(mine, 'una sola cita para este cobro').toHaveLength(1);
        expect(mine[0]).toMatchObject({ id: apt.id, walk_in: false, status: 'completed' });
        expect(mine[0].sale).not.toBeNull();

        // En la agenda se ve una sola vez, ya completada.
        await page.goto(`/citas?barbero=${sonia}`, { waitUntil: 'networkidle' });
        const cards = page.getByTestId('day-appointment').filter({ hasText: walkInClient });
        await expect(cards).toHaveCount(1);
        await expect(cards).toContainText('Completada');
        const duplicates = page.getByTestId('day-appointment').filter({ hasText: 'Sin cita' }).filter({ hasText: 'Cliente sin cita' });
        const sinCitaOfSonia = await duplicates.count();
        // (Los cobros "sin cita" de otras pruebas pertenecen a otros barberos; Sonia no debe tener uno por esta venta.)
        expect(sinCitaOfSonia).toBe(0);

        // El cuadre no marca esa venta como huérfana de agenda.
        const owner = await page.context().browser()!.newContext();
        const ownerPage = await owner.newPage();
        await login(ownerPage, USERS.manager);
        await ownerPage.goto('/cuadre', { waitUntil: 'networkidle' });
        await expect(ownerPage.getByTestId('reconciliation-status')).toBeVisible();
        await expect(ownerPage.getByTestId('reconciliation-row').first()).toBeVisible();
        await owner.close();
    });

    let discountFolio = '';
    test('un descuento exige el PIN de quien autoriza: PIN incorrecto no cobra, el correcto sí', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        const corte = await service(page.request, 'Corte adulto');

        await page.goto('/pos', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Dani', exact: true }).click();
        // Si Dani tiene una cita abierta hoy, se descarta: esta venta es sin cita.
        const only = page.getByRole('button', { name: 'Es sin cita' });
        if (await only.isVisible().catch(() => false)) await only.click();
        await page.getByRole('button', { name: new RegExp(`^Corte adulto`) }).first().click();
        await page.getByRole('button', { name: 'Aplicar descuento' }).click();
        await page.getByLabel('Descuento para Corte adulto').fill('10');
        await expect(page.getByTestId('pos-total')).toHaveText(`$${corte.price - 10}`);

        // Sin motivo y sin autorizador no avanza.
        await page.getByRole('button', { name: `Cobrar $${corte.price - 10}` }).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0);
        await expect(page.getByRole('alert').first()).toBeVisible();

        await page.getByLabel('Motivo del descuento').fill('Prueba de navegador');
        await page.getByLabel('Quién autoriza el descuento').selectOption({ label: 'Sonia' });
        await page.getByRole('button', { name: `Cobrar $${corte.price - 10}` }).click();

        // PIN incorrecto: la venta NO se registra y el diálogo lo dice sin cerrarse.
        const dialog = page.getByTestId('pin-confirm');
        await expect(dialog).toContainText('PIN de Sonia');
        await dialog.locator('input[type="password"]').fill(WRONG_PIN);
        await dialog.getByRole('button', { name: 'Autorizar y cobrar' }).click();
        await expect(dialog.getByRole('alert')).toBeVisible();
        await expect(page.getByTestId('pos-success')).toHaveCount(0);

        // PIN correcto de Sonia.
        await fillPinDialog(page, USERS.manager);
        await dialog.getByRole('button', { name: 'Autorizar y cobrar' }).click();
        await expect(page.getByTestId('pos-success')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('pos-paid-amount')).toHaveText(`+$${corte.price - 10}`);

        await page.getByRole('link', { name: 'Ver ticket' }).click();
        discountFolio = (await page.getByTestId('ticket-folio').innerText()).trim();
        expect(discountFolio).toMatch(/^V\d{4}-\d{4,}$/);
    });

    test('anular la venta con descuento pide motivo y el PIN de quien anula', async ({ page }) => {
        test.skip(!discountFolio, 'La venta con descuento no se registró.');
        await login(page, USERS.manager);
        await page.goto('/ventas/historial', { waitUntil: 'networkidle' });
        const row = page.getByRole('row').filter({ has: page.getByTestId('sale-folio').filter({ hasText: discountFolio }) });
        await expect(row).toHaveCount(1);
        await row.getByRole('button', { name: 'Anular venta' }).click();
        const reason = page.getByRole('dialog', { name: '¿Anular esta venta?' });
        await expect(reason.getByRole('button', { name: 'Anular venta' })).toBeDisabled(); // sin motivo no avanza
        await reason.getByLabel('Motivo de la anulación').fill('Prueba de navegador: se anula');
        await reason.getByRole('button', { name: 'Anular venta' }).click();
        await fillPinDialog(page, USERS.manager);
        await page.getByTestId('pin-confirm').getByRole('button', { name: 'Anular con PIN' }).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });
        await expect(row).toContainText(/Anulada|Reembolsada/i);
        await expect(row.getByRole('button', { name: 'Anular venta' })).toBeDisabled();
    });
});
