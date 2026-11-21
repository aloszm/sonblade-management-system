import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USERS, login } from './helpers';

// La caja es una sola por sucursal y la base de desarrollo la comparte el negocio.
// Antes de la suite se anota si estaba cerrada; al final, si las pruebas la dejaron abierta,
// se cierra contando exactamente lo esperado (sin diferencia). Así nadie encuentra una caja
// abierta que no abrió, y el aviso de "abre la caja" en Cobro se comporta como en la vida real.
const STATE_DIR = join(__dirname, '..', 'test-results');
const STATE_FILE = join(STATE_DIR, 'cash-guard.json');

async function withReception<T>(config: FullConfig, fn: (request: import('@playwright/test').APIRequestContext) => Promise<T>): Promise<T> {
    const baseURL = config.projects[0]?.use.baseURL ?? process.env.E2E_BASE_URL ?? 'http://localhost:3100';
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ baseURL });
        await login(page, USERS.reception);
        return await fn(page.request);
    } finally {
        await browser.close();
    }
}

export async function recordCashState(config: FullConfig): Promise<void> {
    const session = await withReception(config, async (request) => (await request.get('/api/cash/session')).json());
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ wasOpen: !!session, sessionId: session?.id ?? null }));
}

export async function restoreCashState(config: FullConfig): Promise<void> {
    let state: { wasOpen: boolean; sessionId: string | null };
    try { state = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return; }
    rmSync(STATE_FILE, { force: true });
    await withReception(config, async (request) => {
        const session = await (await request.get('/api/cash/session')).json() as { id: string; expected_cash: number } | null;
        // Se cierra solo una caja que abrieron las pruebas: si ya estaba abierta (la misma sesión), se deja.
        if (!session || (state.wasOpen && session.id === state.sessionId)) return;
        const closed = await request.post('/api/cash/session/close', {
            // Se cuenta lo esperado; si entró algo justo antes, la base pediría motivo: va uno (si cuadra, la base lo ignora).
            data: { session_id: session.id, physical_count: session.expected_cash, difference_reason: 'Cierre automático de la caja de pruebas' },
        });
        if (!closed.ok()) console.error('[cash-guard] no se pudo cerrar la caja de pruebas:', await closed.text());
    });
}

/** ¿Había una caja abierta antes de la suite? (las pruebas que cierran la caja se omiten en ese caso). */
export function cashWasOpenBeforeSuite(): boolean {
    try { return Boolean(JSON.parse(readFileSync(STATE_FILE, 'utf8')).wasOpen); } catch { return true; }
}
