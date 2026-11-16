import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { USERS, ensureOpenCashSession, login } from './helpers';


async function barberId(request: APIRequestContext, name: string): Promise<string> {
    const barbers = await (await request.get('/api/barbers')).json() as { id: string; name: string }[];
    const found = barbers.find((b) => b.name === name);
    expect(found, `debe existir el barbero ${name}`).toBeTruthy();
    return found!.id;
}

async function corte(request: APIRequestContext): Promise<{ id: string; price: number }> {
    const services = await (await request.get('/api/services')).json() as { id: string; name: string; price: number }[];
    const found = services.find((s) => s.name === 'Corte de cabello (prueba)');
    expect(found).toBeTruthy();
    return { id: found!.id, price: Number(found!.price) };
}

test.describe('agenda entrelazada', () => {
    test('una ausencia bloquea el horario del barbero y queda registrada', async ({ page }) => {
        await login(page, USERS.reception);
        const barber = 'Dani';
        const id = await barberId(page.request, barber);
        // Las horas se calculan con el reloj del navegador (hora de la barbería), no con el del servidor de pruebas.
        await page.goto('/citas', { waitUntil: 'networkidle' });
        const { from, to, inside } = await page.evaluate(() => {
            const d = new Date();
            return {
                from: new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(),
                to: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString(),
                inside: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 15, 30).toISOString(),
            };
        });

        // Si una corrida anterior se interrumpió, se cancela su ausencia para empezar limpio.
        const previous = await (await page.request.get(`/api/time-off?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).json() as { id: string; barber_id: string; reason: string; cancelled: unknown }[];
        for (const off of previous.filter((t) => t.barber_id === id && !t.cancelled && t.reason.startsWith('Prueba E2E'))) {
            await page.request.patch(`/api/time-off/${off.id}`, { data: { reason: 'Limpieza de prueba' } });
        }
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Ausencia', exact: true }).click();
        await page.locator('#off-barber').selectOption(id);
        await page.locator('#off-from-time').click();
        await page.locator('[role="option"][data-value="15:00"]').click();
        await page.locator('#off-to-time').click();
        await page.locator('[role="option"][data-value="16:30"]').click();
        await page.locator('#off-reason').fill('Prueba E2E ausencia');
        await page.locator('#off-via').selectOption('llamada');
        await page.getByRole('button', { name: 'Bloquear horario' }).click();
        // Si había citas en ese horario, se listan para reagendarlas.
        const conflicts = page.getByTestId('time-off-conflicts');
        if (await conflicts.isVisible().catch(() => false)) await page.getByRole('button', { name: 'Entendido' }).click();

        await expect(page.getByTestId('time-off-block').first()).toBeVisible();
        const list = page.getByTestId('time-off-list');
        await expect(list).toContainText('Dani · Prueba E2E ausencia');
        await expect(list).toContainText('por Llamada');
        await expect(list).toContainText('Registró');

        // La base no deja agendar dentro de la ausencia, y dice por qué.
        const blocked = await page.request.post('/api/appointments', {
            data: { barber_id: id, customer_name: 'Cliente bloqueado E2E', scheduled_at: inside, duration_minutes: 30 },
        });
        if (blocked.status() === 201) {
            // No debería pasar; si pasa, se cancela para no dejar basura antes de fallar.
            await page.request.patch(`/api/appointments/${(await blocked.json()).id}`, { data: { status: 'cancelled', reason: 'Limpieza de prueba' } });
        }
        expect(blocked.status()).toBe(409);
        expect((await blocked.json()).error).toBe('Dani no estará disponible en ese horario (Prueba E2E ausencia).');

        // Se cancela con motivo: no se borra.
        await list.getByRole('button', { name: 'Cancelar ausencia' }).first().click();
        await page.locator('#off-cancel-reason').fill('Sí va a venir');
        await page.getByRole('button', { name: 'Cancelar ausencia' }).last().click();
        await expect(list).toContainText('Cancelada por');
        await expect(list).toContainText('Sí va a venir');
    });

    test('cobrar una cita la liga al ticket; cobrar sin cita la registra en la agenda', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        const deya = await barberId(page.request, 'Deya');
        const service = await corte(page.request);

        // Una cita en un día lejano y hora al azar para no chocar con otras corridas.
        // Se calcula con el reloj del navegador (hora de la barbería) y dentro del horario de cualquier día (1 a 6 p.m.).
        await page.goto('/pos', { waitUntil: 'networkidle' });
        const when = new Date(await page.evaluate(() => {
            const d = new Date();
            d.setDate(d.getDate() + 60 + Math.floor(Math.random() * 300));
            d.setHours(13 + Math.floor(Math.random() * 5), [0, 30][Math.floor(Math.random() * 2)], 0, 0);
            return d.toISOString();
        }));
        const created = await page.request.post('/api/appointments', {
            data: { barber_id: deya, customer_name: 'Cliente cobro E2E', scheduled_at: when.toISOString(), duration_minutes: 30 },
        });
        expect(created.status(), await created.text()).toBe(201);
        const apt = await created.json() as { id: string };
        expect((await page.request.patch(`/api/appointments/${apt.id}`, { data: { status: 'checked_in' } })).ok()).toBeTruthy();

        await page.goto(`/pos?cita=${apt.id}`, { waitUntil: 'networkidle' });
        await expect(page.getByTestId('pos-appointment')).toContainText('Cobrando la cita de Cliente cobro E2E');
        await page.getByRole('button', { name: 'Corte de cabello (prueba)' }).click();
        await page.getByRole('button', { name: `Cobrar $${service.price}` }).click();
        await expect(page.getByTestId('pos-success')).toBeVisible({ timeout: 20_000 });

        // La cita quedó completada y con su venta.
        const after = await (await page.request.get(`/api/appointments/${apt.id}`)).json() as { status: string; sale: { id: string; total: number } | null };
        expect(after.status).toBe('completed');
        expect(after.sale?.total).toBe(service.price);
        // No se puede cobrar dos veces.
        const again = await page.request.post('/api/sales', {
            data: { idempotency_key: randomUUID(), appointment_id: apt.id, items: [{ item_type: 'service', catalog_id: service.id, quantity: 1, employee_id: deya }], payments: [{ method: 'cash', amount: service.price }] },
        });
        expect(again.status()).toBe(409);

        // Un cobro sin cita aparece en la agenda de Deya como "sin cita", ligado a su venta.
        const walkIn = await page.request.post('/api/sales', {
            data: { idempotency_key: randomUUID(), items: [{ item_type: 'service', catalog_id: service.id, quantity: 1, employee_id: deya }], payments: [{ method: 'cash', amount: service.price }] },
        });
        expect(walkIn.status(), await walkIn.text()).toBe(201);
        const saleId = (await walkIn.json()).sale_id as string;
        // Ventana alrededor de ahora: no depende de la zona horaria de quien corre la prueba.
        const start = new Date(Date.now() - 12 * 3600_000);
        const end = new Date(Date.now() + 12 * 3600_000);
        const todays = await (await page.request.get(`/api/appointments?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`)).json() as { walk_in: boolean; status: string; barber_id: string; sale: { id: string } | null }[];
        const record = todays.find((a) => a.sale?.id === saleId);
        expect(record, 'el cobro sin cita debe quedar en la agenda').toBeTruthy();
        expect(record).toMatchObject({ walk_in: true, status: 'completed', barber_id: deya });

        await page.goto('/citas', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('day-view')).toContainText('Sin cita');
    });

    test('la agenda respeta el horario del negocio', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/citas', { waitUntil: 'networkidle' });
        const deya = await barberId(page.request, 'Deya');
        const schedule = await (await page.request.get('/api/schedule')).json() as { hours: Record<string, { open: string; close: string } | null> | null };
        test.skip(!schedule.hours?.['2'], 'El negocio no tiene horario de martes configurado.');
        const tuesdayOpen = schedule.hours!['2']!.open;
        // Próximo martes a las 7:00 a.m. (antes de abrir) en el reloj de la barbería.
        const early = await page.evaluate(() => {
            const d = new Date();
            d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7 || 7));
            d.setHours(7, 0, 0, 0);
            return d.toISOString();
        });
        const res = await page.request.post('/api/appointments', {
            data: { barber_id: deya, customer_name: 'Fuera de horario E2E', scheduled_at: early, duration_minutes: 30 },
        });
        if (res.status() === 201) await page.request.patch(`/api/appointments/${(await res.json()).id}`, { data: { status: 'cancelled', reason: 'Limpieza de prueba' } });
        expect(res.status()).toBe(409);
        expect((await res.json()).error).toMatch(/^Fuera del horario (del negocio|de Deya) \(martes de /);
        expect(tuesdayOpen).toMatch(/^\d{2}:\d{2}$/);

        // La vista por día dice el horario del día.
        await expect(page.getByTestId('day-hours')).toContainText(/Abierto de|El negocio cierra/);
    });

    test('el cuadre es solo para dueño y gerencia', async ({ page, browser }) => {
        await login(page, USERS.owner);
        await page.goto('/cuadre', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('reconciliation-status')).toBeVisible();
        await expect(page.getByTestId('reconciliation-row').first()).toBeVisible();

        const context = await browser.newContext();
        const reception = await context.newPage();
        await login(reception, USERS.reception);
        expect((await reception.request.get('/api/reconciliation?from=2026-11-01&to=2026-11-15')).status()).toBe(403);
        await context.close();
    });
});
