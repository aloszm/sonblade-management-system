import { expect, test, type Page } from '@playwright/test';
import { USERS, businessToday, login, pinFor, stamp } from './helpers';

// Los gastos entran a la utilidad de Finanzas y a la del Panel por igual, y un gasto cancelado no cuenta.
// Se crea un gasto de $25 del banco (no mueve el sobre ni la caja) y se cancela al final.

const suffix = stamp();

type Profit = { expenses: { total: number }; profit: number };
async function profitOf(page: Page, from: string, to: string): Promise<Profit> {
    const res = await page.request.get(`/api/admin/profit?from=${from}&to=${to}`);
    expect(res.ok(), await res.text()).toBeTruthy();
    return res.json();
}

function firstAmount(text: string): number {
    const match = text.match(/([−-])?\s*\$\s*([\d,]+(?:\.\d+)?)/);
    if (!match) throw new Error(`No hay importe en: ${text}`);
    return (match[1] ? -1 : 1) * Number(match[2].replace(/,/g, ''));
}

/** Utilidad del mes que muestran el Panel (pesos enteros) y Finanzas (centavos). */
async function readBoth(page: Page): Promise<{ panel: number; finance: number }> {
    await page.goto('/', { waitUntil: 'networkidle' });
    await Promise.all([
        page.waitForResponse((r) => /\/api\/admin\/profit\?from=\d{4}-\d{2}-01/.test(r.url())),
        page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Mes', exact: true }).click(),
    ]);
    await expect(page.getByTestId('profit-note')).toContainText(/costo de producto \(\$/);
    const panel = firstAmount(await page.getByTestId('kpi-net').innerText());
    await page.goto('/administracion', { waitUntil: 'networkidle' });
    await page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Este mes' }).click();
    const profit = page.getByTestId('profit-total');
    await expect(profit).toBeVisible();
    return { panel, finance: firstAmount(await profit.innerText()) };
}

test('la utilidad de Finanzas y la del Panel coinciden tras registrar un gasto, y un gasto cancelado no cuenta', async ({ page }) => {
    test.setTimeout(240_000);
    await login(page, USERS.owner);
    const today = businessToday();
    const from = `${today.slice(0, 7)}-01`;
    const base = await profitOf(page, from, today);

    const cats = (await (await page.request.get('/api/expense-categories')).json()).categories as { id: string }[];
    const description = `Prueba gasto finanzas ${suffix}`;
    const created = await page.request.post('/api/expenses', {
        data: { paid_from: 'bank', method: 'transfer', amount: 25, category_id: cats[0].id, description, idempotency_key: crypto.randomUUID(), pin: pinFor(USERS.owner) },
    });
    expect(created.status(), await created.text()).toBe(201);
    const expenseId = (await created.json()).expense_id as string;
    expect(expenseId).toBeTruthy();

    try {
        // Con el gasto vigente: los gastos del periodo suben $25, la utilidad baja $25 y las dos pantallas coinciden.
        const withExpense = await profitOf(page, from, today);
        expect(withExpense.expenses.total).toBeCloseTo(base.expenses.total + 25, 2);
        expect(withExpense.profit).toBeCloseTo(base.profit - 25, 2);
        const live = await readBoth(page);
        expect(live.finance, 'Finanzas = utilidad del servidor').toBeCloseTo(withExpense.profit, 2);
        expect(Math.abs(live.panel - live.finance), `Panel ${live.panel} contra Finanzas ${live.finance}`).toBeLessThan(1);
    } finally {
        const cancelled = await page.request.post(`/api/expenses/${expenseId}/cancel`, { data: { reason: 'Prueba de navegador: se cancela', pin: pinFor(USERS.owner) } });
        expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
    }

    // Cancelado: vuelve a lo de antes en el servidor y en las dos pantallas.
    const after = await profitOf(page, from, today);
    expect(after.expenses.total).toBeCloseTo(base.expenses.total, 2);
    expect(after.profit).toBeCloseTo(base.profit, 2);
    const quiet = await readBoth(page);
    expect(quiet.finance).toBeCloseTo(base.profit, 2);
    expect(Math.abs(quiet.panel - quiet.finance), `Panel ${quiet.panel} contra Finanzas ${quiet.finance}`).toBeLessThan(1);
});
