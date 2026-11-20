import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { USERS, barberIdByName, fillPinDialog, login, stamp } from './helpers';

// Pago semanal con adelantos, descuentos y metas de bono, de punta a punta con la interfaz.
// Nada se borra: el descuento y el adelanto que se crean al final quedan CANCELADOS con su motivo (el dinero del
// adelanto vuelve al sobre), así que el saldo del sobre y el recibo de la semana quedan como estaban.
// Se ejecuta con la cuenta principal (alonso) y el barbero (deya). Requiere E2E_PIN (ver helpers.ts).
// Nota: esta prueba se dejó lista pero NO se ha podido ejecutar (no hay credenciales de prueba en el entorno donde se escribió).

const suffix = stamp();
const deductionReason = `Prueba descuento ${suffix}`;
const advanceReason = `Prueba adelanto ${suffix}`;

type Envelope = { id: string; balance: number; is_default: boolean };
async function envelopeBalance(request: APIRequestContext): Promise<number> {
    const res = await request.get('/api/envelopes');
    expect(res.ok(), await res.text()).toBeTruthy();
    const list = (await res.json()).envelopes as Envelope[];
    return (list.find((e) => e.is_default) ?? list[0]).balance;
}

const confirm = (page: Page) => page.getByTestId('pin-confirm').getByRole('button', { name: /con PIN/ });

async function openForm(page: Page, type: RegExp) {
    await page.getByRole('button', { name: /^Registrar$/ }).click();
    const form = page.getByTestId('ledger-form');
    await expect(form).toBeVisible();
    await form.getByLabel(type).check();
    await form.getByLabel('Persona').selectOption({ label: 'Deya' });
    return form;
}

test.describe.serial('pago semanal: desglose, descuento, adelanto del sobre y cancelación', () => {
    test('Pago semanal muestra el desglose de cada persona y la sección Movimientos del equipo', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Pago semanal', level: 1 })).toBeVisible();
        await page.getByRole('button', { name: 'Ver desglose de Deya' }).click();
        const breakdown = page.getByTestId('pay-breakdown').first();
        await expect(breakdown.getByTestId('line-commission')).toBeVisible();
        await expect(breakdown.getByTestId('breakdown-net')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Movimientos del equipo' })).toBeVisible();
    });

    test('registrar un descuento: pide motivo y PIN, queda pendiente y se puede cancelar', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        const form = await openForm(page, /^Descuento/);
        // Un descuento no entrega dinero: no pregunta de dónde sale.
        await expect(form.getByText('Sale de')).toHaveCount(0);
        await form.getByLabel('Monto ($)').fill('10');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(form.getByText(/Escribe el motivo/)).toBeVisible();
        await form.getByLabel('Motivo (obligatorio)').fill(deductionReason);
        await expect(page.getByTestId('ledger-effect')).toContainText('Se descontará en su próximo recibo');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });

        const entry = page.getByTestId('ledger-entry').filter({ hasText: deductionReason });
        await expect(entry).toContainText('Pendiente');
        await expect(page.getByTestId('ledger-pending')).toContainText(deductionReason);

        // Cancelar: motivo + PIN; queda tachado, no se borra.
        await entry.getByRole('button', { name: /^Cancelar/ }).click();
        await fillPinDialog(page, USERS.owner, `Cancelo la prueba ${suffix}`);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });
        await expect(page.getByTestId('ledger-entry').filter({ hasText: deductionReason })).toContainText('Cancelado');
    });

    test('un adelanto del sobre baja el saldo; cancelarlo lo devuelve; si no alcanza avisa antes del PIN', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await envelopeBalance(page.request);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });

        const form = await openForm(page, /^Adelanto/);
        await form.getByLabel('Motivo (obligatorio)').fill(advanceReason);
        await form.getByLabel('Monto ($)').fill(String(before + 5000));
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(form.getByText(/No alcanza/)).toBeVisible();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0);

        await form.getByLabel('Monto ($)').fill('10');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });
        expect(await envelopeBalance(page.request)).toBe(before - 10);

        const entry = page.getByTestId('ledger-entry').filter({ hasText: advanceReason });
        await entry.getByRole('button', { name: /^Cancelar/ }).click();
        await expect(page.getByTestId('cancel-explanation')).toContainText('vuelve al sobre');
        await fillPinDialog(page, USERS.owner, `Cancelo el adelanto ${suffix}`);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });
        expect(await envelopeBalance(page.request)).toBe(before);
    });

    test('el barbero ve lo que se le descontará, sin botones de registrar ni cancelar, y solo lo suyo', async ({ page, browser, baseURL }) => {
        // La cuenta principal deja un descuento pendiente para Deya por la API (mismo flujo que la pantalla, con PIN).
        await login(page, USERS.owner);
        const deya = await barberIdByName(page.request, 'Deya');
        const created = await page.request.post('/api/employee-ledger', {
            data: { employee_id: deya, entry_type: 'deduction', amount: 10, reason: `Prueba barbero ${suffix}`, paid_from: null, idempotency_key: crypto.randomUUID(), pin: process.env.E2E_PIN_ALONSO ?? process.env.E2E_PIN },
        });
        expect(created.status(), await created.text()).toBe(201);
        const entryId = (await created.json()).entry_id as string | undefined;

        const context = await browser.newContext({ baseURL });
        const barberPage = await context.newPage();
        try {
            await login(barberPage, USERS.barber);
            await barberPage.goto('/barbero', { waitUntil: 'networkidle' });
            await expect(barberPage.getByTestId('my-pending')).toContainText('Lo que se descontará en tu próximo recibo');
            await expect(barberPage.getByTestId('my-ledger')).toContainText(`Prueba barbero ${suffix}`);
            await expect(barberPage.getByRole('button', { name: /Registrar|Cancelar/ })).toHaveCount(0);
            // La API solo le devuelve lo suyo, aunque pida a otra persona.
            const mine = await (await barberPage.request.get('/api/employee-ledger')).json() as { can_edit: boolean; entries: { employee_id: string }[] };
            expect(mine.can_edit).toBe(false);
            expect(mine.entries.every((e) => e.employee_id === deya)).toBe(true);
            // Escribir está prohibido para su puesto.
            const denied = await barberPage.request.post('/api/employee-ledger', { data: { employee_id: deya, entry_type: 'deduction', amount: 1, reason: 'No debería', idempotency_key: crypto.randomUUID(), pin: '000000' } });
            expect([401, 403]).toContain(denied.status());
        } finally {
            await context.close();
            // Se limpia: el descuento queda cancelado con su motivo.
            if (entryId) await page.request.post(`/api/employee-ledger/${entryId}/cancel`, { data: { reason: `Limpieza de la prueba ${suffix}`, pin: process.env.E2E_PIN_ALONSO ?? process.env.E2E_PIN } });
        }
    });

    test('las metas de bono son solo de la cuenta principal; sin metas activas el barbero no ve nada de bonos', async ({ page, browser, baseURL }) => {
        await login(page, USERS.owner);
        await page.goto('/equipo', { waitUntil: 'networkidle' });
        const goals = await (await page.request.get('/api/bonus-goals')).json() as { enabled: boolean };
        await expect(page.getByTestId('bonus-goals')).toContainText('Mientras no haya metas activas no se calculan bonos');

        // La gerencia no es la cuenta principal: la API le niega las metas.
        const context = await browser.newContext({ baseURL });
        const managerPage = await context.newPage();
        try {
            await login(managerPage, USERS.manager);
            const res = await managerPage.request.get('/api/bonus-goals');
            expect([401, 403]).toContain(res.status());
            await managerPage.goto('/equipo', { waitUntil: 'networkidle' });
            await expect(managerPage.getByTestId('bonus-goals')).toHaveCount(0);
        } finally {
            await context.close();
        }

        if (!goals.enabled) {
            const barberContext = await browser.newContext({ baseURL });
            const barberPage = await barberContext.newPage();
            try {
                await login(barberPage, USERS.barber);
                await barberPage.goto('/barbero', { waitUntil: 'networkidle' });
                await expect(barberPage.getByTestId('my-goals')).toHaveCount(0);
            } finally {
                await barberContext.close();
            }
        }
    });
});
