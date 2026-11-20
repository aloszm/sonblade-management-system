import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { USERS, barberIdByName, businessToday, farWednesday, login, randomInt, shiftDay, stamp } from './helpers';

// WhatsApp de un clic: recepción (Dago) abre WhatsApp con el mensaje listo desde el detalle de la cita y desde la
// lista «Recordatorios de mañana». Todo en tamaño de celular (390 px). NO se navega de verdad a wa.me: la apertura
// de la pestaña se intercepta y solo se anota la dirección. Las citas de prueba se cancelan al final.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const suffix = stamp();
const CLIENT = `Prueba WhatsApp ${suffix}`;
const CLIENT_NO_PHONE = `Prueba WhatsApp Sin Teléfono ${suffix}`;
const CLIENT_TOMORROW = `Prueba WhatsApp Mañana ${suffix}`;
const PHONE = '5559876543';

const created: string[] = [];

async function service(request: APIRequestContext, name: string): Promise<string> {
    const list = await (await request.get('/api/services')).json() as { id: string; name: string }[];
    const found = list.find((s) => s.name === name);
    expect(found, `debe existir el servicio ${name}`).toBeTruthy();
    return found!.id;
}

async function createAppointment(request: APIRequestContext, body: Record<string, unknown>): Promise<{ id: string }> {
    const res = await request.post('/api/appointments', { data: body });
    expect(res.status(), await res.text()).toBe(201);
    const apt = await res.json() as { id: string };
    created.push(apt.id);
    return apt;
}

/** Sustituye window.open: la pestaña es falsa y solo anota las direcciones que se le asignan (no se abre wa.me de verdad). */
async function interceptWindowOpen(page: Page) {
    await page.addInitScript(() => {
        const w = window as unknown as { __waOpened: unknown[][]; __waUrls: string[] };
        w.__waOpened = [];
        w.__waUrls = [];
        window.open = ((...args: unknown[]) => {
            w.__waOpened.push(args);
            return { closed: false, opener: {}, document: { write() { /* sin efecto */ } }, close() { this.closed = true; }, location: { set href(v: string) { w.__waUrls.push(v); } } };
        }) as unknown as typeof window.open;
    });
}

const waUrls = (page: Page) => page.evaluate(() => (window as unknown as { __waUrls: string[] }).__waUrls);
const waOpened = (page: Page) => page.evaluate(() => (window as unknown as { __waOpened: unknown[][] }).__waOpened);

test.describe.serial('WhatsApp de un clic', () => {
    let day = '';
    let danId = '';
    let aptId = '';
    let noPhoneId = '';

    test.beforeAll(async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL });
        const page = await context.newPage();
        await login(page, USERS.reception);
        danId = await barberIdByName(page.request, 'Dani');
        const corte = await service(page.request, 'Corte adulto');
        day = farWednesday();
        aptId = (await createAppointment(page.request, { customer_name: CLIENT, customer_phone: PHONE, barber_id: danId, service_ids: [corte], scheduled_at: new Date(`${day}T19:00:00-06:00`).toISOString() })).id;
        noPhoneId = (await createAppointment(page.request, { customer_name: CLIENT_NO_PHONE, barber_id: danId, service_ids: [corte], scheduled_at: new Date(`${day}T18:30:00-06:00`).toISOString() })).id;
        await context.close();
    });

    test.afterAll(async ({ browser, baseURL }) => {
        const context = await browser.newContext({ baseURL });
        const page = await context.newPage();
        await login(page, USERS.reception);
        for (const id of created) {
            const res = await page.request.patch(`/api/appointments/${id}`, { data: { status: 'cancelled', reason: 'Cancelo la cita de prueba de WhatsApp' } });
            if (!res.ok() && res.status() !== 409) console.error('[whatsapp] no se pudo cancelar', id, await res.text());
        }
        await context.close();
    });

    test('Enviar confirmación abre WhatsApp con el mensaje (nombre y hora) y anota "Enviado por Dago"', async ({ page }) => {
        await interceptWindowOpen(page);
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&cita=${aptId}`, { waitUntil: 'networkidle' });
        const detail = page.getByTestId('appointment').filter({ hasText: CLIENT });
        await expect(detail).toBeVisible();
        const actions = detail.getByTestId('wa-actions');
        await expect(actions).toContainText('Se abre tu WhatsApp con el mensaje listo; el sistema anota que lo abriste, no puede saber si se envió.');
        // Objetivos táctiles de al menos 44 px.
        for (const name of ['Enviar confirmación', 'Enviar recordatorio']) {
            const box = await actions.getByRole('button', { name }).boundingBox();
            expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        await expect(actions.getByTestId('wa-sent-confirmacion')).toHaveCount(0);

        await actions.getByRole('button', { name: 'Enviar confirmación' }).tap();
        await expect(actions.getByTestId('wa-sent-confirmacion')).toContainText(/^Enviado por Dago, hoy /, { timeout: 20_000 });
        // La pestaña se abrió en el toque y luego se le asignó la dirección.
        expect(await waOpened(page)).toEqual([['', '_blank']]);
        const urls = await waUrls(page);
        expect(urls).toHaveLength(1);
        expect(urls[0].startsWith(`https://wa.me/52${PHONE}?text=`)).toBe(true);
        const text = decodeURIComponent(urls[0].split('?text=')[1]);
        expect(text).toContain(CLIENT);
        expect(text).toContain('Te confirmamos tu cita');
        expect(text).toContain('7:00 p. m.');
        await expect(actions.getByTestId('wa-fallback')).toHaveCount(0);
        await expect(actions.getByTestId('wa-sent-recordatorio')).toHaveCount(0);

        // Se puede volver a enviar y el recordatorio lleva su propio texto.
        await actions.getByRole('button', { name: 'Enviar recordatorio' }).tap();
        await expect(actions.getByTestId('wa-sent-recordatorio')).toContainText(/^Enviado por Dago, hoy /, { timeout: 20_000 });
        const again = await waUrls(page);
        expect(again).toHaveLength(2);
        expect(decodeURIComponent(again[1].split('?text=')[1])).toContain('Te recordamos tu cita');

        // El estado quedó guardado en el servidor.
        const saved = await (await page.request.get(`/api/appointments/${aptId}`)).json() as { notifications: { confirmation: { by_name: string } | null; reminder: { by_name: string } | null } };
        expect(saved.notifications.confirmation?.by_name).toBe('Dago');
        expect(saved.notifications.reminder?.by_name).toBe('Dago');
    });

    test('sin teléfono: mensaje claro y no se abre nada', async ({ page }) => {
        await interceptWindowOpen(page);
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&cita=${noPhoneId}`, { waitUntil: 'networkidle' });
        const detail = page.getByTestId('appointment').filter({ hasText: CLIENT_NO_PHONE });
        await detail.getByRole('button', { name: 'Enviar confirmación' }).tap();
        await expect(detail.getByTestId('wa-error')).toContainText('Este cliente no tiene teléfono registrado.');
        expect(await waUrls(page)).toHaveLength(0);
        await expect(detail.getByTestId('wa-sent-confirmacion')).toHaveCount(0);
    });

    test('si el navegador bloquea la pestaña queda el enlace visible "Abrir WhatsApp"', async ({ page }) => {
        await page.addInitScript(() => { window.open = (() => null) as unknown as typeof window.open; });
        await login(page, USERS.reception);
        await page.goto(`/citas?fecha=${day}&cita=${aptId}`, { waitUntil: 'networkidle' });
        const detail = page.getByTestId('appointment').filter({ hasText: CLIENT });
        await detail.getByRole('button', { name: 'Enviar recordatorio' }).tap();
        const link = detail.getByRole('link', { name: 'Abrir WhatsApp' });
        await expect(link).toBeVisible({ timeout: 20_000 });
        await expect(link).toHaveAttribute('href', new RegExp(`^https://wa\\.me/52${PHONE}\\?text=`));
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
    });

    test('el barbero no ve botones de envío', async ({ page }) => {
        await login(page, USERS.barber);
        // El barbero abre la cita desde su agenda (el enlace ?cita= es para mostrador): toda la barbería, Dani, la tarjeta.
        await page.goto(`/citas?fecha=${day}`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Toda la barbería' }).tap();
        await page.getByRole('group', { name: 'Barbero del día' }).getByRole('button', { name: /^Dani/ }).tap();
        await page.getByTestId('day-appointment').filter({ hasText: CLIENT }).first().tap();
        await expect(page.getByTestId('appointment').filter({ hasText: CLIENT })).toBeVisible();
        await expect(page.getByRole('button', { name: /Enviar (confirmación|recordatorio)/ })).toHaveCount(0);
        await expect(page.getByTestId('tomorrow-open')).toHaveCount(0);
        // La lista de mañana tampoco se le da por la API.
        expect((await page.request.get('/api/appointments?recordatorios=manana')).status()).toBe(403);
    });

    test('lista "Recordatorios de mañana": contador de pendientes, enviar con un toque y la fila baja marcada', async ({ page }) => {
        await interceptWindowOpen(page);
        await login(page, USERS.reception);
        const corte = await service(page.request, 'Corte adulto');
        const tomorrow = shiftDay(businessToday(), 1);
        // Una cita de mañana (el negocio abre todos los días); si el horario está ocupado se prueba otro.
        let placed = false;
        for (let attempt = 0; attempt < 12 && !placed; attempt += 1) {
            const minutes = 13 * 60 + randomInt(0, 12) * 30;
            const hh = String(Math.floor(minutes / 60)).padStart(2, '0'), mm = String(minutes % 60).padStart(2, '0');
            const res = await page.request.post('/api/appointments', {
                data: { customer_name: CLIENT_TOMORROW, customer_phone: '5550004321', barber_id: danId, service_ids: [corte], scheduled_at: new Date(`${tomorrow}T${hh}:${mm}:00-06:00`).toISOString() },
            });
            if (res.status() === 409) continue;
            expect(res.status(), await res.text()).toBe(201);
            created.push((await res.json() as { id: string }).id);
            placed = true;
        }
        expect(placed, 'se pudo agendar una cita de mañana').toBe(true);

        await page.goto('/citas', { waitUntil: 'networkidle' });
        const open = page.getByTestId('tomorrow-open');
        await expect(open).toContainText('Recordatorios de mañana');
        await expect(page.getByTestId('tomorrow-count')).not.toHaveText(/^0/);
        const before = Number((await page.getByTestId('tomorrow-count').innerText()).match(/\d+/)![0]);
        expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await open.tap();

        const modal = page.getByTestId('tomorrow-modal');
        await expect(modal.getByRole('heading', { name: 'Citas de mañana' })).toBeVisible();
        const row = modal.getByTestId('tomorrow-row').filter({ hasText: CLIENT_TOMORROW });
        await expect(row).toContainText('Corte adulto');
        await expect(row).toContainText('Dani');
        const send = row.getByRole('button', { name: `Enviar recordatorio a ${CLIENT_TOMORROW}` });
        expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await send.tap();
        await expect(row.getByTestId('tomorrow-sent')).toContainText(/^\s*Enviado por Dago, hoy /, { timeout: 20_000 });
        const urls = await waUrls(page);
        expect(urls).toHaveLength(1);
        expect(urls[0].startsWith('https://wa.me/525550004321?text=')).toBe(true);
        const text = decodeURIComponent(urls[0].split('?text=')[1]);
        expect(text).toContain(CLIENT_TOMORROW);
        expect(text).toContain('Te recordamos tu cita');
        // Las enviadas bajan al final de la lista.
        const rows = await modal.getByTestId('tomorrow-row').allInnerTexts();
        const sentRows = rows.filter((t) => t.includes('Enviado por'));
        expect(rows.slice(rows.length - sentRows.length).every((t) => t.includes('Enviado por'))).toBe(true);

        await modal.getByRole('button', { name: 'Cerrar' }).last().tap();
        await expect(page.getByTestId('tomorrow-count')).toHaveText(new RegExp(`^${before - 1}`));
    });
});
