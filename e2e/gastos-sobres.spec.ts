import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
    USERS, businessToday, defaultEnvelope, ensureOpenCashSession, expectedCash, fillPinDialog, login, pinFor, shiftDay, stamp, submitPinDialog, tinyPng,
} from './helpers';

// Sobres y Gastos de punta a punta con la interfaz, como la cuenta principal (alonso) y como gerencia (sonia).
// Los datos de prueba no se borran: todo gasto que se crea acaba CANCELADO con su motivo (el dinero vuelve al sobre) y
// los ajustes por conteo devuelven el sobre al saldo con el que empezó la corrida. Montos pequeños, conceptos "Prueba …".
// Requiere los PIN de las cuentas (ver helpers.ts).

const suffix = stamp();
let originalBalance = 0;

const BUCKET_NOTE = 'Prueba de navegador: se cancela';

type Row = { id: string; description: string; status: string; amount: number; paid_from: string; incurred_at: string };
async function expensesOf(request: APIRequestContext, from?: string, to?: string): Promise<{ expenses: Row[]; totals: { posted: number; cancelled: number } }> {
    const q = new URLSearchParams({ limit: '500', status: 'all' });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const res = await request.get(`/api/expenses?${q}`);
    expect(res.ok(), await res.text()).toBeTruthy();
    return res.json();
}

/** Elige un día en el calendario propio de la app (el botón del campo abre el calendario; cada día lleva data-day). */
async function pickDay(page: Page, triggerId: string, day: string) {
    await page.locator(`#${triggerId}`).click();
    const cell = page.locator(`[data-day="${day}"]`);
    for (let i = 0; i < 3 && (await cell.count()) === 0; i++) await page.getByRole('button', { name: 'Mes anterior' }).click();
    await cell.click();
}

/** Abre "Registrar gasto", llena lo básico y devuelve el formulario. */
async function openExpenseForm(page: Page, o: { amount: string; description: string; category?: string; bank?: boolean; method?: string }) {
    await page.getByRole('button', { name: 'Registrar gasto' }).click();
    const form = page.getByRole('dialog', { name: 'Registrar gasto' });
    // El formulario no deja continuar mientras consulta el saldo del sobre: se espera a que llegue.
    await expect(form.getByTestId('envelope-available')).toContainText('Saldo disponible');
    await form.getByLabel('Monto ($)').fill(o.amount);
    await form.getByLabel('Categoría').selectOption(o.category ? { label: o.category } : { index: 1 });
    await form.getByLabel('Concepto').fill(o.description);
    if (o.bank) {
        await form.getByLabel(/Banco/).check();
        if (o.method) await form.getByLabel('Medio de pago').selectOption(o.method);
    }
    return form;
}

async function registerExpense(page: Page, user: string, o: Parameters<typeof openExpenseForm>[1]) {
    const form = await openExpenseForm(page, o);
    await form.getByRole('button', { name: 'Continuar' }).click();
    await fillPinDialog(page, user);
    await submitPinDialog(page);
}

async function cancelExpense(page: Page, user: string, description: string) {
    await page.getByRole('button', { name: `Cancelar gasto ${description}` }).click();
    await page.getByTestId('pin-confirm').getByLabel(/Motivo/).fill(BUCKET_NOTE);
    await fillPinDialog(page, user);
    await submitPinDialog(page);
}

async function adjustBalance(page: Page, user: string, counted: number, comment: string) {
    await page.getByRole('button', { name: 'Ajustar por conteo' }).click();
    await page.getByLabel(/Lo que contaste/).fill(String(counted));
    await page.getByRole('button', { name: 'Continuar' }).click();
    await fillPinDialog(page, user, comment);
    await submitPinDialog(page);
}

test.describe.serial('Sobres', () => {
    test('el saldo y el libro muestran el apartado del cierre de caja (cuenta principal)', async ({ page }) => {
        await login(page, USERS.owner);
        originalBalance = (await defaultEnvelope(page.request)).balance;
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Sobres', level: 1 })).toBeVisible();
        await expect(page.getByTestId('envelope-balance')).toContainText(originalBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
        await expect(page.getByTestId('ledger-row').filter({ hasText: 'Apartado del cierre de caja' }).first()).toBeVisible();
        await expect(page.getByTestId('envelope-total-in')).toBeVisible();
        await expect(page.getByTestId('envelope-total-out')).toBeVisible();
    });

    for (const [who, user] of [['cuenta principal', USERS.owner], ['gerencia', USERS.manager]] as const) {
        test(`ajuste por conteo (${who}): muestra sistema / contado / diferencia, pide PIN y deja el saldo en lo contado; se restaura`, async ({ page }) => {
            await login(page, user);
            const before = (await defaultEnvelope(page.request)).balance;
            await page.goto('/sobres', { waitUntil: 'networkidle' });

            const counted = before + 25;
            await page.getByRole('button', { name: 'Ajustar por conteo' }).click();
            await page.getByLabel(/Lo que contaste/).fill(String(counted));
            await expect(page.getByTestId('adjust-diff')).toContainText('diferencia +$25.00');
            await expect(page.getByTestId('adjust-diff')).toContainText('El sistema dice');
            await expect(page.getByTestId('adjust-diff')).toContainText('contaste');
            await page.getByRole('button', { name: 'Continuar' }).click();
            await expect(page.getByTestId('adjust-summary')).toContainText('El sistema dice');
            // Sin PIN no se ajusta: el botón no hace nada y el saldo no cambia.
            await page.getByTestId('pin-confirm').getByLabel(/Comentario/).fill(`Prueba de conteo ${suffix}`);
            await page.getByTestId('pin-confirm').getByRole('button', { name: /con PIN/ }).click();
            await expect(page.getByTestId('pin-confirm').getByRole('alert')).toContainText(/PIN/);
            expect((await defaultEnvelope(page.request)).balance).toBe(before);
            await fillPinDialog(page, user, `Prueba de conteo ${suffix}`);
            await submitPinDialog(page);

            expect((await defaultEnvelope(page.request)).balance).toBe(counted);
            await expect(page.getByTestId('envelope-balance')).toContainText(`$${counted.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
            await expect(page.getByTestId('ledger-row').first()).toContainText('Ajuste por conteo');

            // Se devuelve al valor original para no dejar el sobre descuadrado.
            await adjustBalance(page, user, before, `Prueba ${suffix}: se restaura el conteo`);
            expect((await defaultEnvelope(page.request)).balance).toBe(before);
        });
    }

    test('depósito al banco por $10 baja el saldo; uno mayor al saldo se bloquea', async ({ page }) => {
        await login(page, USERS.owner);
        const before = (await defaultEnvelope(page.request)).balance;
        await page.goto('/sobres', { waitUntil: 'networkidle' });

        await page.getByRole('button', { name: 'Depositar al banco' }).click();
        await page.getByLabel(/Monto a depositar/).fill(String(before + 1));
        await expect(page.getByText(/No alcanza: el sobre tiene/).first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();

        await page.getByLabel(/Monto a depositar/).fill('10');
        await page.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner, `Prueba depósito ${suffix}`);
        await submitPinDialog(page);
        expect((await defaultEnvelope(page.request)).balance).toBe(before - 10);
        await expect(page.getByTestId('ledger-row').first()).toContainText('Depósito al banco');

        // Lo que la pantalla bloquea, la API también (saltándose la interfaz).
        const env = await defaultEnvelope(page.request);
        const tooMuch = await page.request.post(`/api/envelopes/${env.id}/deposit`, {
            data: { amount: before + 1000, comment: 'Prueba: no debe pasar', pin: pinFor(USERS.owner), idempotency_key: crypto.randomUUID() },
        });
        expect(tooMuch.status(), await tooMuch.text()).toBeGreaterThanOrEqual(400);
        expect((await defaultEnvelope(page.request)).balance).toBe(before - 10);

        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await adjustBalance(page, USERS.owner, before, `Prueba ${suffix}: se restaura tras el depósito`);
        expect((await defaultEnvelope(page.request)).balance).toBe(before);
    });

    test('cerrar una caja de prueba con apartado añade UNA entrada al libro del sobre', async ({ page }) => {
        await login(page, USERS.reception);
        const current = await (await page.request.get('/api/cash/session')).json();
        test.skip(Boolean(current), 'hay una caja abierta del equipo: no se cierra para no alterar su turno');
        const owner = await page.context().browser()!.newContext({ baseURL: test.info().project.use.baseURL });
        const ownerPage = await owner.newPage();
        try {
            await login(ownerPage, USERS.owner);
            const env = await defaultEnvelope(ownerPage.request);
            const movements = async () => ((await (await ownerPage.request.get(`/api/envelopes/${env.id}/movements`)).json()).movements as { source: string; amount: number; id: string }[]);
            const before = (await movements()).filter((m) => m.source === 'cash_close').length;

            const opened = await page.request.post('/api/cash/session', { data: { opening_cash: 800, opening_reason: 'Apertura de prueba: cierre con apartado' } });
            expect(opened.ok(), await opened.text()).toBeTruthy();
            const session = await opened.json() as { id: string; expected_cash: number };
            const closed = await page.request.post('/api/cash/session/close', {
                data: { session_id: session.id, physical_count: session.expected_cash, float_left: 500, reserve_amount: 50, short_float_reason: 'Prueba de navegador' },
            });
            expect(closed.ok(), await closed.text()).toBeTruthy();

            const after = await movements();
            expect(after.filter((m) => m.source === 'cash_close').length, 'exactamente una entrada nueva').toBe(before + 1);
            expect(after[0].source).toBe('cash_close');
            expect(after[0].amount).toBe(50);
            expect((await defaultEnvelope(ownerPage.request)).balance).toBe(env.balance + 50);

            // La pantalla lo muestra, y volver a pedir los datos no lo duplica.
            await ownerPage.goto('/sobres', { waitUntil: 'networkidle' });
            await expect(ownerPage.getByTestId('ledger-row').first()).toContainText('Apartado del cierre de caja');
            expect((await movements()).filter((m) => m.source === 'cash_close').length).toBe(before + 1);

            // El apartado de prueba se quita con un ajuste, para que el sobre quede como estaba.
            await adjustBalance(ownerPage, USERS.owner, env.balance, `Prueba ${suffix}: se quita el apartado de la caja de prueba`);
            expect((await defaultEnvelope(ownerPage.request)).balance).toBe(env.balance);
        } finally {
            await owner.close();
        }
    });

    test('recepción y barbera no entran a Sobres ni lo ven en el menú', async ({ page, browser, baseURL }) => {
        for (const user of [USERS.reception, USERS.barber]) {
            const context = await browser.newContext({ baseURL });
            const p = await context.newPage();
            try {
                await login(p, user);
                await p.goto('/sobres', { waitUntil: 'networkidle' });
                await expect(p, `${user} no debe quedarse en /sobres`).not.toHaveURL(/\/sobres/);
                await p.goto('/gastos', { waitUntil: 'networkidle' });
                await expect(p, `${user} no debe quedarse en /gastos`).not.toHaveURL(/\/gastos/);
                await expect(p.locator('nav a[href="/sobres"], aside a[href="/sobres"]')).toHaveCount(0);
                await expect(p.getByRole('link', { name: 'Sobres', exact: true })).toHaveCount(0);
                expect((await p.request.get('/api/envelopes')).status()).toBe(403);
            } finally {
                await context.close();
            }
        }
        void page;
    });

    test('gerencia ve Sobres en el menú de Negocio', async ({ page }) => {
        await login(page, USERS.manager);
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Sobres', level: 1 })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Sobres' }).first()).toBeVisible();
    });
});

test.describe.serial('Gastos', () => {
    const bankDesc = `Prueba Gasto Banco ${suffix}`;
    const envelopeDesc = `Prueba Gasto Luz ${suffix}`;
    const oldDesc = `Prueba Gasto Antiguo ${suffix}`;
    const receiptDesc = `Prueba Gasto Comprobante ${suffix}`;
    const wrongPinDesc = `Prueba Gasto PIN ${suffix}`;
    const managerDesc = `Prueba Gasto Gerencia ${suffix}`;
    const today = businessToday();
    const fiveDaysAgo = shiftDay(today, -5);

    test('alta desde el banco por transferencia SIN caja abierta no mueve el sobre ni pide caja', async ({ page }) => {
        await login(page, USERS.owner);
        const cash = await expectedCash(page.request);
        test.info().annotations.push({ type: 'caja', description: cash === null ? 'sin caja abierta' : 'había una caja abierta del equipo' });
        const before = await defaultEnvelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await registerExpense(page, USERS.owner, { amount: '15', description: bankDesc, bank: true, method: 'transfer' });
        const row = page.getByTestId('expense-row').filter({ hasText: bankDesc });
        await expect(row).toContainText('Banco · Transferencia');
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance);
        expect(await expectedCash(page.request)).toBe(cash);
    });

    test('un gasto del sobre ($20, Luz) baja el saldo del sobre y NO cambia el efectivo de la caja', async ({ page }) => {
        await login(page, USERS.owner);
        await ensureOpenCashSession(page.request);
        const cashBefore = await expectedCash(page.request);
        expect(cashBefore).not.toBeNull();
        const before = await defaultEnvelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });

        await page.getByRole('button', { name: 'Registrar gasto' }).click();
        const form = page.getByRole('dialog', { name: 'Registrar gasto' });
        // Mayor al saldo: avisa y no deja continuar.
        await form.getByLabel('Monto ($)').fill(String(before.balance + 5000));
        await expect(form.getByTestId('envelope-short')).toContainText('No alcanza');
        await expect(form.getByRole('button', { name: 'Continuar' })).toBeDisabled();
        await form.getByLabel('Monto ($)').fill('20');
        await form.getByLabel('Categoría').selectOption({ label: 'Luz' });
        await form.getByLabel('Concepto').fill(envelopeDesc);
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(page.getByTestId('expense-summary')).toContainText('pagado desde Sobre');
        await fillPinDialog(page, USERS.owner);
        await submitPinDialog(page);

        const row = page.getByTestId('expense-row').filter({ hasText: envelopeDesc });
        await expect(row).toContainText('Sobre');
        await expect(row).toContainText('Luz');
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance - 20);
        expect(await expectedCash(page.request), 'el efectivo de la caja no cambia con un gasto del sobre').toBe(cashBefore);
    });

    test('un gasto mayor al saldo del sobre se bloquea también en el servidor', async ({ page }) => {
        await login(page, USERS.owner);
        const env = await defaultEnvelope(page.request);
        const cats = (await (await page.request.get('/api/expense-categories')).json()).categories as { id: string }[];
        const res = await page.request.post('/api/expenses', {
            data: {
                paid_from: 'envelope', amount: env.balance + 1000, category_id: cats[0].id, description: `Prueba excede sobre ${suffix}`,
                idempotency_key: crypto.randomUUID(), pin: pinFor(USERS.owner), envelope_id: env.id,
            },
        });
        expect([400, 409, 422], await res.text()).toContain(res.status());
        expect((await res.json()).error).toBeTruthy();
        expect((await defaultEnvelope(page.request)).balance).toBe(env.balance);
    });

    test('un gasto con fecha de hace 5 días aparece en el periodo correcto (y no en otro)', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        const form = await openExpenseForm(page, { amount: '12', description: oldDesc, bank: true, method: 'card' });
        await pickDay(page, 'exp-date', fiveDaysAgo);
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(page.getByTestId('expense-summary')).toContainText(`fecha ${fiveDaysAgo}`);
        await fillPinDialog(page, USERS.owner);
        await submitPinDialog(page);

        // Un rango que incluye ese día lo trae; un rango de solo hoy, no.
        const inRange = await expensesOf(page.request, fiveDaysAgo, fiveDaysAgo);
        expect(inRange.expenses.some((e) => e.description === oldDesc)).toBe(true);
        const onlyToday = await expensesOf(page.request, today, today);
        expect(onlyToday.expenses.some((e) => e.description === oldDesc)).toBe(false);
        // En pantalla: si ese día cae en este mes, está en la lista de "Este mes".
        if (fiveDaysAgo.slice(0, 7) === today.slice(0, 7)) {
            const row = page.getByTestId('expense-row').filter({ hasText: oldDesc });
            await expect(row).toBeVisible();
            await expect(row).toContainText(/Banco · Tarjeta/);
        }
    });

    test('la fecha futura se rechaza con un mensaje claro (el calendario no la deja elegir y el servidor tampoco)', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Registrar gasto' }).click();
        await page.locator('#exp-date').click();
        const tomorrow = page.locator(`[data-day="${shiftDay(today, 1)}"]`);
        if (await tomorrow.count()) await expect(tomorrow).toBeDisabled();
        await page.keyboard.press('Escape');

        const env = await defaultEnvelope(page.request);
        const cats = (await (await page.request.get('/api/expense-categories')).json()).categories as { id: string }[];
        const res = await page.request.post('/api/expenses', {
            data: {
                paid_from: 'bank', method: 'transfer', amount: 5, category_id: cats[0].id, description: `Prueba fecha futura ${suffix}`,
                incurred_on: shiftDay(today, 1), idempotency_key: crypto.randomUUID(), pin: pinFor(USERS.owner),
            },
        });
        expect(res.status()).toBeGreaterThanOrEqual(400);
        expect(res.status()).toBeLessThan(500);
        expect(String((await res.json()).error)).toMatch(/futur|fecha/i);
        expect((await defaultEnvelope(page.request)).balance).toBe(env.balance);
        expect((await expensesOf(page.request)).expenses.some((e) => e.description.includes('Prueba fecha futura'))).toBe(false);
    });

    test('comprobante: se sube un PNG a Storage, el gasto lo muestra y "Ver" abre la imagen', async ({ page }) => {
        const failures: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') failures.push(`consola: ${m.text().slice(0, 300)}`); });
        page.on('requestfailed', (r) => failures.push(`FALLÓ ${r.method()} ${r.url().slice(0, 140)} · ${r.failure()?.errorText}`));
        page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/_next/')) failures.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
        await login(page, USERS.owner);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        const form = await openExpenseForm(page, { amount: '11', description: receiptDesc, bank: true, method: 'transfer' });
        await form.locator('#exp-receipt').setInputFiles({ name: 'comprobante-prueba.png', mimeType: 'image/png', buffer: tinyPng() });
        await expect(form.getByTestId('receipt-preview')).toContainText('comprobante-prueba.png');
        await form.getByRole('button', { name: 'Continuar' }).click();
        // O llega al PIN (subida correcta) o aparece el error de la subida: en ese caso se informa con la red exacta.
        const pin = page.getByTestId('pin-confirm');
        const uploadError = form.locator('#exp-receipt-error');
        await expect(pin.or(uploadError)).toBeVisible({ timeout: 30_000 });
        expect(await uploadError.count(), `la subida a Storage falló. Red: ${failures.join(' | ')}`).toBe(0);
        await fillPinDialog(page, USERS.owner);
        await submitPinDialog(page);

        const row = page.getByTestId('expense-row').filter({ hasText: receiptDesc });
        await expect(row.getByRole('button', { name: 'Ver comprobante' })).toBeVisible();
        const popupPromise = page.waitForEvent('popup', { timeout: 20_000 });
        await row.getByRole('button', { name: 'Ver comprobante' }).click();
        const popup = await popupPromise;
        await popup.waitForLoadState('load').catch(() => undefined);
        await expect.poll(() => popup.url(), { timeout: 20_000 }).toMatch(/^https:\/\/.+\/storage\/v1\/object\/sign\//);
        const signed = await page.request.get(popup.url());
        expect(signed.status(), `el enlace firmado debe abrir. Red: ${failures.join(' | ')}`).toBe(200);
        expect(signed.headers()['content-type']).toMatch(/image\/png/);
        expect((await signed.body()).length).toBe(tinyPng().length);
        await popup.close();
    });

    test('un PIN incorrecto da un mensaje claro y no registra nada', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await defaultEnvelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        const form = await openExpenseForm(page, { amount: '10', description: wrongPinDesc });
        await form.getByRole('button', { name: 'Continuar' }).click();
        const dialog = page.getByTestId('pin-confirm');
        await dialog.locator('input[type="password"]').fill(pinFor(USERS.owner) === '000000' ? '111111' : '000000'); // un solo intento
        await dialog.getByRole('button', { name: /con PIN/ }).click();
        await expect(dialog.getByRole('alert')).toContainText('El PIN no es correcto');
        await expect(dialog.locator('input[type="password"]')).toHaveValue('');
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance);
        expect((await expensesOf(page.request)).expenses.some((e) => e.description === wrongPinDesc)).toBe(false);
        await dialog.getByRole('button', { name: 'Cancelar' }).click();
    });

    test('cancelar con motivo y PIN devuelve el dinero al sobre y deja el gasto tachado con su motivo', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await defaultEnvelope(page.request);
        const cashBefore = await expectedCash(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: `Cancelar gasto ${envelopeDesc}` }).click();
        await expect(page.getByTestId('cancel-explanation')).toContainText('vuelve al sobre');
        await page.getByTestId('pin-confirm').getByLabel(/Motivo/).fill(BUCKET_NOTE);
        await fillPinDialog(page, USERS.owner);
        await submitPinDialog(page);

        const row = page.getByTestId('expense-row').filter({ hasText: envelopeDesc });
        await expect(row).toContainText('Cancelado');
        await expect(row).toContainText(`Motivo: ${BUCKET_NOTE}`);
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance + 20);
        expect(await expectedCash(page.request), 'cancelar un gasto del sobre tampoco toca la caja').toBe(cashBefore);
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('ledger-row').first()).toContainText('Devolución por gasto cancelado');
    });

    test('los gastos del banco (reciente, antiguo y con comprobante) se cancelan sin mover efectivo', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await defaultEnvelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        for (const desc of [bankDesc, oldDesc, receiptDesc]) {
            await page.getByRole('button', { name: `Cancelar gasto ${desc}` }).click();
            await expect(page.getByTestId('cancel-explanation')).toContainText('no se mueve efectivo');
            await page.getByTestId('pin-confirm').getByLabel(/Motivo/).fill(BUCKET_NOTE);
            await fillPinDialog(page, USERS.owner);
            await submitPinDialog(page);
            await expect(page.getByTestId('expense-row').filter({ hasText: desc })).toContainText('Cancelado');
        }
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance);
    });

    test('gerencia también registra un gasto del sobre y lo cancela (el saldo vuelve)', async ({ page }) => {
        await login(page, USERS.manager);
        const before = await defaultEnvelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await registerExpense(page, USERS.manager, { amount: '10', description: managerDesc, category: 'Luz' });
        await expect(page.getByTestId('expense-row').filter({ hasText: managerDesc })).toContainText('Sobre');
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance - 10);
        await cancelExpense(page, USERS.manager, managerDesc);
        await expect(page.getByTestId('expense-row').filter({ hasText: managerDesc })).toContainText('Cancelado');
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance);
    });
});

test.describe.serial('Gastos fijos y categorías', () => {
    const templateName = `Prueba renta ${suffix}`;

    test('gasto fijo: se crea la plantilla, queda pendiente del mes, se registra con un clic y deja de estar pendiente', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await defaultEnvelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Administrar gastos fijos' }).click();
        await page.getByRole('button', { name: 'Nuevo gasto fijo' }).click();
        const modal = page.getByRole('dialog', { name: 'Nuevo gasto fijo' });
        await modal.getByLabel('Nombre').fill(templateName);
        await modal.getByLabel('Categoría').selectOption({ index: 1 });
        await modal.getByLabel(/Monto sugerido/).fill('12');
        await modal.getByLabel('Día del mes').fill('1');
        await modal.getByRole('button', { name: 'Guardar' }).click();
        await expect(modal).toHaveCount(0, { timeout: 20_000 });

        const pending = page.getByTestId('pending-row').filter({ hasText: templateName });
        await expect(pending).toBeVisible();
        await expect(pending).toContainText('$12.00');
        // Registrar con un clic: el formulario llega con monto, categoría y concepto puestos.
        await pending.getByRole('button', { name: `Registrar ${templateName}` }).click();
        const form = page.getByRole('dialog', { name: new RegExp(`Registrar «${templateName}»`) });
        await expect(form.getByLabel('Monto ($)')).toHaveValue('12');
        await expect(form.getByLabel('Concepto')).toHaveValue(templateName);
        await expect(form.getByTestId('envelope-available')).toContainText('Saldo disponible');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner);
        await submitPinDialog(page);

        await expect(page.getByTestId('pending-row').filter({ hasText: templateName })).toHaveCount(0);
        const row = page.getByTestId('expense-row').filter({ hasText: templateName });
        await expect(row).toContainText('Sobre');
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance - 12);

        // Limpieza: se cancela el gasto y se desactiva la plantilla.
        await cancelExpense(page, USERS.owner, templateName);
        expect((await defaultEnvelope(page.request)).balance).toBe(before.balance);
        const manager = page.getByTestId('template-manager');
        await manager.locator('li').filter({ hasText: templateName }).getByRole('button', { name: 'Desactivar' }).click();
        await expect(manager.locator('li').filter({ hasText: templateName })).toContainText('desactivado');
        await expect(page.getByTestId('pending-row').filter({ hasText: templateName })).toHaveCount(0);
    });

    test('categorías: solo la cuenta principal las administra; gerencia no las ve ni puede por API', async ({ page, browser, baseURL }) => {
        const name = `Prueba categoría ${suffix}`;
        await login(page, USERS.owner);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Categorías de gastos' })).toBeVisible();
        await page.getByRole('button', { name: 'Nueva categoría' }).click();
        await page.getByRole('dialog', { name: 'Nueva categoría' }).getByLabel('Nombre').fill(name);
        await page.getByRole('dialog', { name: 'Nueva categoría' }).getByRole('button', { name: 'Guardar' }).click();
        const item = page.getByTestId('categories-list').locator('li').filter({ hasText: name });
        await expect(item).toBeVisible();
        await item.getByRole('button', { name: 'Desactivar' }).click();
        await expect(item).toContainText('desactivada');

        const context = await browser.newContext({ baseURL });
        const manager = await context.newPage();
        try {
            await login(manager, USERS.manager);
            await manager.goto('/gastos', { waitUntil: 'networkidle' });
            await expect(manager.getByRole('heading', { name: 'Registrar gasto' }).or(manager.getByRole('button', { name: 'Registrar gasto' }))).toBeVisible();
            await expect(manager.getByRole('heading', { name: 'Categorías de gastos' })).toHaveCount(0);
            const denied = await manager.request.post('/api/expense-categories', { data: { name: `Prueba no debe existir ${suffix}` } });
            expect([401, 403]).toContain(denied.status());
        } finally {
            await context.close();
        }
    });
});

test.describe('permisos de Sobres y Gastos por API', () => {
    for (const user of [USERS.reception, USERS.barber]) {
        test(`${user}: leer o escribir gastos, sobres y movimientos del equipo responde 403`, async ({ page }) => {
            await login(page, user);
            const body = { amount: 1, description: 'Prueba que no debe pasar', idempotency_key: crypto.randomUUID(), pin: '000000' };
            expect((await page.request.get('/api/envelopes')).status()).toBe(403);
            expect((await page.request.get('/api/expenses')).status()).toBe(403);
            expect((await page.request.post('/api/expenses', { data: { ...body, paid_from: 'bank', method: 'transfer', category_id: crypto.randomUUID() } })).status()).toBe(403);
            expect((await page.request.post(`/api/envelopes/${crypto.randomUUID()}/adjust`, { data: { counted_balance: 1, comment: 'No debe pasar', pin: '000000', idempotency_key: crypto.randomUUID() } })).status()).toBe(403);
            expect((await page.request.post(`/api/envelopes/${crypto.randomUUID()}/deposit`, { data: { amount: 1, comment: 'No debe pasar', pin: '000000', idempotency_key: crypto.randomUUID() } })).status()).toBe(403);
            expect((await page.request.post('/api/employee-ledger', { data: { employee_id: crypto.randomUUID(), entry_type: 'deduction', amount: 1, reason: 'No debe pasar', paid_from: null, idempotency_key: crypto.randomUUID(), pin: '000000' } })).status()).toBe(403);
        });
    }
});

test.describe('consulta', () => {
    test('la cuenta de consulta ve Gastos y Sobres sin botones de acción', async ({ page }) => {
        const username = process.env.E2E_USER_CONSULTA ?? 'lucia';
        test.skip(!process.env[`E2E_PIN_${username.toUpperCase()}`], `No hay PIN de prueba para la cuenta de consulta (${username}): no se verificó.`);
        await login(page, username);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Gastos', level: 1 })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Registrar gasto' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Cancelar gasto/ })).toHaveCount(0);
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page.getByRole('button', { name: 'Ajustar por conteo' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Depositar al banco' })).toHaveCount(0);
    });
});
