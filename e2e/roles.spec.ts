import { expect, test } from '@playwright/test';
import { USERS, login } from './helpers';

test.describe('acceso por puesto', () => {
    test('recepción entra al cobro y no puede abrir pantallas de administración', async ({ page }) => {
        await login(page, USERS.reception);
        await expect(page).toHaveURL(/\/pos$/);

        await page.goto('/equipo');
        await expect(page).toHaveURL(/\/pos$/);

        expect((await page.request.get('/api/admin/summary?period=week')).status()).toBe(403);
        expect((await page.request.get('/api/settlements')).status()).toBe(403);
        expect((await page.request.get('/api/settlements/history')).status()).toBe(200); // sus propios recibos
    });

    test('un barbero ve lo suyo y nada de los demás', async ({ page }) => {
        await login(page, USERS.barber);
        await expect(page).toHaveURL(/\/barberos\//);
        const me = await (await page.request.get('/api/auth/me')).json();
        expect(me.user.role).toBe('barber');

        const others = (await (await page.request.get('/api/barbers')).json()).filter((b: { id: string }) => b.id !== me.user.id);
        expect(others.length).toBeGreaterThan(0);
        expect((await page.request.get(`/api/barbers/${me.user.id}/stats?view=dashboard`)).status()).toBe(200);
        expect((await page.request.get(`/api/barbers/${others[0].id}/stats?view=dashboard`)).status()).toBe(403);

        // No cobra, no agenda, no autoriza descuentos.
        await page.goto('/pos');
        await expect(page).not.toHaveURL(/\/pos$/);
        expect((await page.request.get('/api/discount-authorizers')).status()).toBe(403);
        expect((await page.request.post('/api/appointments', { data: { customer_name: 'Prueba', scheduled_at: new Date().toISOString() } })).status()).toBe(403);
    });

    test('sin sesión todo redirige al acceso y la marca es pública', async ({ page }) => {
        await page.goto('/caja');
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(/sonblade/i);
        expect((await page.request.get('/api/sales')).status()).toBe(401);
        for (const asset of ['/manifest.json', '/icons/icon-192.png', '/logo.png']) {
            expect((await page.request.get(asset)).status(), asset).toBe(200);
        }
    });
});
