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
        await expect(page).toHaveURL(/\/barbero$/);
        await expect(page.getByTestId('week-earned')).toBeVisible();

        // Podio: todos ven los cortes de todos, pero nunca dinero.
        await expect(page.getByTestId('podium')).toBeVisible();
        const podium = await (await page.request.get('/api/podium')).json();
        for (const row of podium.rows) expect(Object.keys(row).sort()).toEqual(['cuts', 'employee_id', 'is_me', 'name']);
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

    test('la gerente opera la sucursal, pero solo el dueño cambia comisiones; la caja la cambia con PIN', async ({ page }) => {
        await login(page, USERS.manager);
        const me = (await (await page.request.get('/api/auth/me')).json()).user;
        expect(me.title).toBe('Gerente');
        expect(me.isOwner).toBe(false);

        expect((await page.request.get('/api/admin/summary?period=week')).status()).toBe(200);
        expect((await page.request.get('/api/settlements')).status()).toBe(200);
        expect((await page.request.get('/api/cash/history')).status()).toBe(200);

        const cash = await (await page.request.get('/api/cash/settings')).json();
        // La gerente puede cambiar los ajustes de caja, pero solo con su PIN y un comentario.
        expect(cash.can_edit).toBe(true);
        expect((await page.request.post('/api/cash/settings', { data: { float_target: 1, reserve_amount: 1, reserve_label: 'No' } })).status()).toBe(400);
        const profile = await (await page.request.get('/api/settings?key=shop_profile')).json();
        expect((await page.request.post('/api/settings', { data: { key: 'shop_profile', value: { ...profile, productCommissionPct: 90 } } })).status()).toBe(403);

        await page.goto('/configuracion');
        await expect(page).not.toHaveURL(/\/configuracion/);
        await expect(page.getByRole('navigation').getByRole('link', { name: /Configuración/ })).toHaveCount(0);
    });

    test('sin sesión todo redirige al acceso y la marca es pública', async ({ page }) => {
        await page.goto('/caja');
        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(/gallo 4:20/i);
        expect((await page.request.get('/api/sales')).status()).toBe(401);
        for (const asset of ['/manifest.json', '/icons/icon-192.png', '/logo.png']) {
            expect((await page.request.get(asset)).status(), asset).toBe(200);
        }
    });
});
