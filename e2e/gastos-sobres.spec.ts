import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { USERS, fillPinDialog, login, stamp } from './helpers';

// Sobres y Gastos de punta a punta con la interfaz. Los datos de prueba no se borran: el gasto que se crea
// al final queda CANCELADO con su motivo, y el ajuste del sobre queda en su libro de movimientos.
// Se ejecuta con la cuenta principal (alonso). Requiere E2E_PIN (ver helpers.ts).

const suffix = stamp();
const bankExpense = `Prueba Gasto Banco ${suffix}`;
const envelopeExpense = `Prueba Gasto Sobre ${suffix}`;

type Envelope = { id: string; name: string; balance: number };
async function envelope(request: APIRequestContext): Promise<Envelope> {
    const res = await request.get('/api/envelopes');
    expect(res.ok(), await res.text()).toBeTruthy();
    const list = (await res.json()).envelopes as (Envelope & { is_default: boolean })[];
    const found = list.find((e) => e.is_default) ?? list[0];
    expect(found, 'debe existir el sobre principal').toBeTruthy();
    return found;
}

const confirm = (page: Page) => page.getByTestId('pin-confirm').getByRole('button', { name: /con PIN/ });

test.describe.serial('sobres y gastos: ajuste, alta del sobre y del banco, cancelación', () => {
    test('Sobres muestra el saldo y el libro; ajustar por conteo enseña la diferencia y pide PIN', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await envelope(page.request);
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Sobres', level: 1 })).toBeVisible();
        await expect(page.getByTestId('envelope-balance')).toBeVisible();

        // Se cuentan $300 más de lo que dice el sistema.
        const counted = before.balance + 300;
        await page.getByRole('button', { name: 'Ajustar por conteo' }).click();
        await page.getByLabel(/Lo que contaste/).fill(String(counted));
        await expect(page.getByTestId('adjust-diff')).toContainText('diferencia +$300.00');
        await page.getByRole('button', { name: 'Continuar' }).click();
        await expect(page.getByTestId('adjust-summary')).toContainText('El sistema dice');
        await fillPinDialog(page, USERS.owner, `Prueba de conteo ${suffix}`);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });

        expect((await envelope(page.request)).balance).toBe(counted);
        await expect(page.getByTestId('ledger-row').first()).toContainText('Ajuste por conteo');
    });

    test('un gasto mayor al saldo del sobre avisa que no alcanza; uno que sí alcanza baja el saldo', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await envelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });

        await page.getByRole('button', { name: 'Registrar gasto' }).click();
        const form = page.getByRole('dialog', { name: 'Registrar gasto' });
        await form.getByLabel('Monto ($)').fill(String(before.balance + 5000));
        await expect(form.getByTestId('envelope-short')).toContainText('No alcanza');
        await expect(form.getByRole('button', { name: 'Continuar' })).toBeDisabled();

        await form.getByLabel('Monto ($)').fill('20');
        await form.getByLabel('Categoría').selectOption({ index: 1 });
        await form.getByLabel('Concepto').fill(envelopeExpense);
        await form.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });

        await expect(page.getByTestId('expense-row').filter({ hasText: envelopeExpense })).toContainText('Sobre');
        expect((await envelope(page.request)).balance).toBe(before.balance - 20);
    });

    test('un gasto del banco con tarjeta no toca el sobre', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await envelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });

        await page.getByRole('button', { name: 'Registrar gasto' }).click();
        const form = page.getByRole('dialog', { name: 'Registrar gasto' });
        await form.getByLabel('Monto ($)').fill('35');
        await form.getByLabel('Categoría').selectOption({ index: 1 });
        await form.getByLabel('Concepto').fill(bankExpense);
        await form.getByLabel(/Banco/).check();
        await form.getByLabel('Medio de pago').selectOption('card');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });

        await expect(page.getByTestId('expense-row').filter({ hasText: bankExpense })).toContainText('Banco · Tarjeta');
        expect((await envelope(page.request)).balance).toBe(before.balance);
    });

    test('cancelar el gasto del sobre pide motivo y PIN, devuelve el dinero y lo deja tachado', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await envelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });

        await page.getByRole('button', { name: `Cancelar gasto ${envelopeExpense}` }).click();
        await expect(page.getByTestId('cancel-explanation')).toContainText('vuelve al sobre');
        await page.getByTestId('pin-confirm').getByLabel(/Motivo/).fill('Prueba de navegador: se cancela');
        await fillPinDialog(page, USERS.owner);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });

        const row = page.getByTestId('expense-row').filter({ hasText: envelopeExpense });
        await expect(row).toContainText('Cancelado');
        await expect(row).toContainText('Prueba de navegador: se cancela');
        expect((await envelope(page.request)).balance).toBe(before.balance + 20);

        // El libro del sobre lo muestra como devolución.
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('ledger-row').first()).toContainText('Devolución por gasto cancelado');
    });

    test('el gasto del banco también se cancela y no mueve efectivo', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await envelope(page.request);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: `Cancelar gasto ${bankExpense}` }).click();
        await expect(page.getByTestId('cancel-explanation')).toContainText('no se mueve efectivo');
        await page.getByTestId('pin-confirm').getByLabel(/Motivo/).fill('Prueba de navegador: se cancela');
        await fillPinDialog(page, USERS.owner);
        await confirm(page).click();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 20_000 });
        await expect(page.getByTestId('expense-row').filter({ hasText: bankExpense })).toContainText('Cancelado');
        expect((await envelope(page.request)).balance).toBe(before.balance);
    });
});

test.describe('permisos de Sobres y Gastos', () => {
    test('recepción no entra a Sobres ni a Gastos (la API también lo rechaza)', async ({ page }) => {
        await login(page, USERS.reception);
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/pos/);
        await page.goto('/gastos', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/pos/);
        expect((await page.request.get('/api/envelopes')).status()).toBe(403);
        expect((await page.request.get('/api/expenses')).status()).toBe(403);
    });

    test('el barbero tampoco', async ({ page }) => {
        await login(page, USERS.barber);
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page).not.toHaveURL(/\/sobres/);
        expect((await page.request.get('/api/envelopes')).status()).toBe(403);
    });

    test('gerencia ve Sobres en el menú de Negocio', async ({ page }) => {
        await login(page, USERS.manager);
        await page.goto('/sobres', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Sobres', level: 1 })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Sobres' }).first()).toBeVisible();
    });
});
