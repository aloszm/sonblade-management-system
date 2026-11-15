import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const USERS = {
    owner: process.env.E2E_OWNER_EMAIL ?? 'demo.dueno@gallo420.test',
    reception: process.env.E2E_RECEPTION_EMAIL ?? 'demo.dago@gallo420.test',
    barber: process.env.E2E_BARBER_EMAIL ?? 'demo.deya@gallo420.test',
};

function password(): string {
    const value = process.env.E2E_PASSWORD;
    if (!value) throw new Error('Define E2E_PASSWORD con la contraseña de las cuentas de demostración.');
    return value;
}

export async function login(page: Page, email: string): Promise<void> {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200); // el formulario debe terminar de hidratarse antes de escribir
    await page.fill('#email', email);
    await page.fill('#password', password());
    await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
        page.click('button[type="submit"]'),
    ]);
}

/** Las ventas necesitan una caja abierta; si no hay, se abre con un fondo de prueba. */
export async function ensureOpenCashSession(request: APIRequestContext): Promise<void> {
    const current = await request.get('/api/cash/session');
    expect(current.ok()).toBeTruthy();
    if (await current.json()) return;
    const opened = await request.post('/api/cash/session', { data: { opening_cash: 500 } });
    expect(opened.ok(), await opened.text()).toBeTruthy();
}

/** Texto en una sola línea, para comparar sin depender de saltos ni espacios. */
export const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
