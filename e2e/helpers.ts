import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Usuarios de las cuentas de demostración (se entra con usuario + PIN, sin correo). */
export const USERS = {
    owner: process.env.E2E_OWNER_USER ?? 'alonso',
    reception: process.env.E2E_RECEPTION_USER ?? 'dago',
    barber: process.env.E2E_BARBER_USER ?? 'deya',
    manager: process.env.E2E_MANAGER_USER ?? 'sonia',
};

/**
 * PIN de la cuenta: E2E_PIN_<USUARIO> (p. ej. E2E_PIN_DEYA) o, si todas comparten uno, E2E_PIN.
 * Las cuentas deben tener ya un PIN propio (no el temporal), o la app pedirá cambiarlo primero.
 */
export function pinFor(username: string): string {
    const value = process.env[`E2E_PIN_${username.toUpperCase()}`] ?? process.env.E2E_PIN;
    if (!value) throw new Error(`Define E2E_PIN (o E2E_PIN_${username.toUpperCase()}) con el PIN de las cuentas de demostración.`);
    return value;
}

export async function login(page: Page, username: string): Promise<void> {
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200); // el formulario debe terminar de hidratarse antes de escribir
    await page.fill('#username', username);
    await page.fill('#pin', pinFor(username));
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
    const opened = await request.post('/api/cash/session', { data: { opening_cash: 500, opening_reason: 'Apertura de prueba automática' } });
    expect(opened.ok(), await opened.text()).toBeTruthy();
}

/** Texto en una sola línea, para comparar sin depender de saltos ni espacios. */
export const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Sufijo corto y único para nombres de prueba ("Prueba Agenda K3F9A"): los datos de prueba nunca se borran. */
export const stamp = () => `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`.toUpperCase();

/** Entero entre min y max (incluidos). */
export const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Un miércoles lejano (abre de 12:30 p.m. a 8 p.m. todos los miércoles) como "AAAA-MM-DD", calculado con el
 * reloj de la barbería. Cada corrida elige otro para no chocar con citas de corridas anteriores.
 */
export function farWednesday(): string {
    const d = new Date();
    d.setDate(d.getDate() + 90 + randomInt(0, 40) * 7);
    d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Crea un cliente ficticio ("Prueba …") por la API y devuelve su id. */
export async function createTestClient(request: APIRequestContext, name: string, phone: string | null = null): Promise<string> {
    const res = await request.post('/api/clients', { data: { name, phone } });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()).id as string;
}

/** Id de un barbero por su nombre (Deya, Dani, Sonia…). */
export async function barberIdByName(request: APIRequestContext, name: string): Promise<string> {
    const barbers = await (await request.get('/api/barbers')).json() as { id: string; name: string }[];
    const found = barbers.find((b) => b.name === name);
    expect(found, `debe existir el barbero ${name}`).toBeTruthy();
    return found!.id;
}

/** Escribe un PIN en el campo de la confirmación con PIN (los PIN solo viajan por process.env). */
export async function fillPinDialog(page: Page, username: string, comment?: string): Promise<void> {
    const dialog = page.getByTestId('pin-confirm');
    await expect(dialog).toBeVisible();
    // El campo se llama «Comentario» en la mayoría de las confirmaciones y «Motivo» al cancelar un movimiento.
    if (comment !== undefined) await dialog.getByLabel(/Comentario|Motivo/).fill(comment);
    await dialog.locator('input[type="password"]').fill(pinFor(username));
}

/** Pulsa el botón de confirmar de la ventana de PIN y espera a que se cierre (el servidor ya respondió). */
export async function submitPinDialog(page: Page): Promise<void> {
    await page.getByTestId('pin-confirm').getByRole('button', { name: /con PIN/ }).click();
    await expect(page.getByTestId('pin-confirm')).toHaveCount(0, { timeout: 25_000 });
}

/** PIN de la cuenta para mandarlo en el cuerpo de las llamadas a la API (nunca se imprime). */
export const pinBody = (username: string) => pinFor(username);

/** Hoy como "AAAA-MM-DD" en el reloj de la barbería. */
export function businessToday(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

/** Suma (o resta) días a un "AAAA-MM-DD". */
export function shiftDay(day: string, delta: number): string {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

/** Saldo del sobre principal. */
export async function defaultEnvelope(request: APIRequestContext): Promise<{ id: string; name: string; balance: number }> {
    const res = await request.get('/api/envelopes');
    expect(res.ok(), await res.text()).toBeTruthy();
    const list = (await res.json()).envelopes as { id: string; name: string; balance: number; is_default: boolean }[];
    const found = list.find((e) => e.is_default) ?? list[0];
    expect(found, 'debe existir el sobre principal').toBeTruthy();
    return found;
}

/** Efectivo que la caja abierta espera tener (null si no hay caja abierta). */
export async function expectedCash(request: APIRequestContext): Promise<number | null> {
    const res = await request.get('/api/cash/session');
    expect(res.ok()).toBeTruthy();
    const session = await res.json() as { expected_cash: number } | null;
    return session ? Number(session.expected_cash) : null;
}

/** Un PNG válido de 1x1 píxel, generado aquí mismo (para probar la subida de comprobantes). */
export function tinyPng(): Buffer {
    return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
}
