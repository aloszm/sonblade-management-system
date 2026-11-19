import { expect, test } from '@playwright/test';
import { USERS, ensureOpenCashSession, flat, login } from './helpers';

test.describe('cobro', () => {
    test('recepción cobra un corte con propina y entrega el ticket', async ({ page }) => {
        const alerts: string[] = [];
        page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.accept(); });
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);

        const corte = (await (await page.request.get('/api/services')).json()).find((s: { name: string }) => s.name === 'Corte de cabello (prueba)');
        expect(corte, 'la base de demostración debe tener "Corte de cabello (prueba)"').toBeTruthy();
        const price = Number(corte.price);
        const tip = 20;

        await page.goto('/pos', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Deya', exact: true }).click();
        await page.getByRole('button', { name: 'Corte de cabello (prueba)' }).click();
        await page.getByRole('button', { name: `$${tip}`, exact: true }).click();
        await expect(page.getByTestId('pos-total')).toHaveText(`$${price + tip}`);

        await page.getByRole('button', { name: `Cobrar $${price + tip}` }).click();

        // Confirmación viva: solo aparece cuando la base ya registró el cobro.
        await expect(page.getByTestId('pos-success')).toBeVisible({ timeout: 20_000 });
        await expect(page.getByTestId('pos-success')).toContainText('Cobro realizado');
        await expect(page.getByTestId('pos-paid-amount')).toHaveText(`+$${price + tip}`);
        await expect(page.getByTestId('pos-success')).toContainText(`Propina de $${tip} para Deya`);
        expect(alerts, 'la venta no debe mostrar avisos de error').toEqual([]);
        const link = page.getByRole('link', { name: 'Ver ticket' });

        await link.click();
        const ticket = page.getByTestId('ticket');
        await expect(ticket).toBeVisible();
        await expect(page.getByTestId('ticket-folio')).toHaveText(/^V\d{4}-\d{4,}$/);
        const text = flat(await ticket.innerText());
        expect(text).toContain('Corte de cabello');
        expect(text).toContain('Te atendió Deya');
        expect(flat(await page.getByTestId('ticket-total').innerText())).toBe(`$${price.toFixed(2)}`);
        expect(flat(await page.getByTestId('ticket-tip').innerText())).toBe(`$${tip.toFixed(2)}`);
        expect(flat(await page.getByTestId('ticket-grand-total').innerText())).toBe(`$${(price + tip).toFixed(2)}`);
        expect(text).toContain('no es un comprobante fiscal');

        // La venta quedó registrada con su propina y no cuenta la propina como venta.
        const sale = (await (await page.request.get('/api/sales')).json())[0];
        expect(sale.total).toBe(price);
        expect(sale.tip).toBe(tip);
        expect(sale.barber.name).toBe('Deya');
    });

    test('un corte se puede pagar con dos métodos', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        const corte = (await (await page.request.get('/api/services')).json()).find((s: { name: string }) => s.name === 'Corte de cabello (prueba)');
        const price = Number(corte.price);

        await page.goto('/pos', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Dani', exact: true }).click();
        await page.getByRole('button', { name: 'Corte de cabello (prueba)' }).click();
        await page.getByRole('button', { name: 'Dividir en dos' }).click();
        await page.locator('#pos-split-first').fill('50');
        await page.getByRole('group', { name: 'Forma de pago del resto' }).getByRole('button', { name: 'Tarjeta' }).click();
        await expect(page.getByTestId('pos-split-rest')).toHaveText(`$${price - 50}`);
        await page.getByRole('button', { name: `Cobrar $${price}` }).click();
        await expect(page.getByTestId('pos-success')).toBeVisible({ timeout: 20_000 });

        const sale = (await (await page.request.get('/api/sales')).json())[0];
        expect(sale.cash_amount).toBe(50);
        expect(sale.card_amount).toBe(price - 50);
        expect(sale.payment_method).toBe('mixed');
    });

    test('un descuento exige motivo y la base rechaza a quien no puede autorizarlo', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        const corte = (await (await page.request.get('/api/services')).json()).find((s: { name: string }) => s.name === 'Corte de cabello (prueba)');
        const deya = (await (await page.request.get('/api/barbers')).json()).find((b: { name: string }) => b.name === 'Deya');
        const { authorizers } = await (await page.request.get('/api/discount-authorizers')).json();
        expect(authorizers.length).toBeGreaterThan(0);
        const sale = (extra: object) => ({
            idempotency_key: crypto.randomUUID(),
            items: [{ item_type: 'service', catalog_id: corte.id, quantity: 1, employee_id: deya.id, discount_amount: 10 }],
            payments: [{ method: 'cash', amount: Number(corte.price) - 10 }],
            ...extra,
        });

        const noReason = await page.request.post('/api/sales', { data: sale({}) });
        expect(noReason.status()).toBe(400);

        // El descuento se confirma con el PIN de quien autoriza: sin PIN no se registra.
        const noPin = await page.request.post('/api/sales', { data: sale({ discount_reason: 'Prueba', discount_authorized_by: crypto.randomUUID() }) });
        expect(noPin.status()).toBe(428);

        // Un usuario que no existe en el negocio no puede figurar como quien autoriza (ni se intenta su PIN).
        const stranger = await page.request.post('/api/sales', { data: sale({ discount_reason: 'Prueba', discount_authorized_by: crypto.randomUUID(), discount_pin: '135790' }) });
        expect(stranger.status()).toBe(400);
    });
});
