import { expect, test } from '@playwright/test';
import { USERS, ensureOpenCashSession, flat, login } from './helpers';

test.describe('cobro', () => {
    test('recepción cobra un corte con propina y entrega el ticket', async ({ page }) => {
        const alerts: string[] = [];
        page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.accept(); });
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);

        const corte = (await (await page.request.get('/api/services')).json()).find((s: { name: string }) => s.name === 'Corte de cabello');
        expect(corte, 'la base de demostración debe tener "Corte de cabello"').toBeTruthy();
        const price = Number(corte.price);
        const tip = 20;

        await page.goto('/pos', { waitUntil: 'networkidle' });
        await page.fill('input[placeholder="Buscar barbero..."]', 'Deya');
        await page.locator('main').getByText('Deya').first().click();
        await page.fill('input[placeholder="Buscar servicio..."]', 'Corte de cabello');
        await page.locator('main').getByText('Corte de cabello').first().click();
        await page.locator('#pos-tip').fill(String(tip));
        await expect(page.getByTestId('pos-total')).toHaveText(`$${price + tip}`);

        await page.getByRole('button', { name: 'Confirmar Venta' }).click();
        const link = page.getByRole('link', { name: 'Ver ticket de la última venta' });
        await expect(link).toBeVisible({ timeout: 20_000 });
        expect(alerts, 'la venta no debe mostrar avisos de error').toEqual([]);

        await link.click();
        const ticket = page.getByTestId('ticket');
        await expect(ticket).toBeVisible();
        await expect(page.getByTestId('ticket-folio')).toHaveText(/^V-\d{8}-[0-9A-F]{6}$/);
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

    test('un descuento exige motivo y la base rechaza a quien no puede autorizarlo', async ({ page }) => {
        await login(page, USERS.reception);
        await ensureOpenCashSession(page.request);
        const corte = (await (await page.request.get('/api/services')).json()).find((s: { name: string }) => s.name === 'Corte de cabello');
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

        // Un usuario que no existe en el negocio no puede figurar como quien autoriza.
        const stranger = await page.request.post('/api/sales', { data: sale({ discount_reason: 'Prueba', discount_authorized_by: crypto.randomUUID() }) });
        expect(stranger.status()).toBe(403);
    });
});
