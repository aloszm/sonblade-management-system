import { devices, expect, test, type Browser, type Page } from '@playwright/test';
import {
    USERS, barberIdByName, defaultEnvelope, ensureOpenCashSession, expectedCash, fillPinDialog, login, pinFor, stamp, submitPinDialog,
} from './helpers';

// Pago semanal con adelantos, préstamos, descuentos y metas de bono, de punta a punta con la interfaz.
// NO se confirma el pago de ninguna liquidación: la vista previa se lee, pero nadie cobra.
// Nada se borra: todo movimiento que se crea acaba CANCELADO con su motivo (el dinero de adelantos y préstamos vuelve
// al sobre o a la caja) y la meta de prueba se APAGA al final. Requiere los PIN de las cuentas (ver helpers.ts).

const suffix = stamp();
const sobreAdvance = `Prueba adelanto sobre ${suffix}`;
const cajaAdvance = `Prueba adelanto caja ${suffix}`;
const deduction = `Prueba descuento ${suffix}`;
const loanReason = `Prueba préstamo ${suffix}`;
const GOAL_NAME = `Prueba meta ${suffix}`;

const confirmCancelReason = (s: string) => `Cancelo la prueba ${s}`;

async function openLedgerForm(page: Page, type: RegExp, person = 'Deya') {
    await page.getByRole('button', { name: /^Registrar$/ }).click();
    const form = page.getByTestId('ledger-form');
    await expect(form).toBeVisible();
    await form.getByLabel(type).check();
    await form.getByLabel('Persona').selectOption({ label: person });
    // Se espera a que llegue el saldo del sobre: el formulario no deja continuar mientras lo consulta.
    if (/Adelanto|Pr/.test(type.source)) await expect(page.getByTestId('ledger-envelope-balance')).toContainText('Saldo disponible');
    return form;
}

async function register(page: Page, user: string, o: { type: RegExp; amount: string; reason: string; from?: RegExp; weekly?: string }) {
    const form = await openLedgerForm(page, o.type);
    await form.getByLabel('Monto ($)').fill(o.amount);
    if (o.weekly) await form.getByLabel('Abono por semana ($)').fill(o.weekly);
    await form.getByLabel('Motivo (obligatorio)').fill(o.reason);
    if (o.from) await form.getByLabel(o.from).check();
    await form.getByRole('button', { name: 'Continuar' }).click();
    await fillPinDialog(page, user);
    await submitPinDialog(page);
}

async function cancelEntry(page: Page, user: string, reason: string, note = confirmCancelReason(suffix)) {
    const entry = page.getByTestId('ledger-entry').filter({ hasText: reason });
    await entry.getByRole('button', { name: /^Cancelar/ }).click();
    await fillPinDialog(page, user, note);
    await submitPinDialog(page);
    await expect(page.getByTestId('ledger-entry').filter({ hasText: reason })).toContainText('Cancelado');
}

/** Desglose abierto de una persona en la vista previa. */
async function openBreakdown(page: Page, name: string) {
    const toggle = page.getByRole('button', { name: `Ver desglose de ${name}` });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    return page.getByTestId('pay-breakdown').filter({ has: page.getByTestId('breakdown-net') }).first();
}

const cents = (text: string) => Number(text.replace(/[^0-9.-]/g, ''));

/** Cancela con la API cualquier movimiento pendiente de prueba y apaga las metas de prueba (red de seguridad). */
async function safetyNet(browser: Browser, baseURL: string | undefined) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
        await login(page, USERS.owner);
        const pin = pinFor(USERS.owner);
        const led = await (await page.request.get('/api/employee-ledger?limit=1000')).json() as { entries: { id: string; entry_type: string; is_pending: boolean; is_cancelled: boolean; reason: string }[] };
        for (const e of led.entries.filter((x) => x.is_pending && !x.is_cancelled && x.entry_type !== 'reversal' && x.reason.includes(suffix))) {
            await page.request.post(`/api/employee-ledger/${e.id}/cancel`, { data: { reason: 'Limpieza de la prueba', pin } });
        }
        const goals = await (await page.request.get('/api/bonus-goals')).json() as { goals: { id: string; name: string; is_active: boolean }[] };
        for (const g of goals.goals.filter((x) => x.name.startsWith('Prueba meta') && x.is_active)) {
            await page.request.patch('/api/bonus-goals', { data: { id: g.id, is_active: false } });
        }
    } finally {
        await context.close();
    }
}

test.afterAll(async ({ browser, baseURL }) => { await safetyNet(browser, baseURL); });

test.describe.serial('pago semanal: desglose, adelantos, descuento y préstamo', () => {
    let envelopeStart = 0;
    let netBefore = 0;

    test('la vista previa muestra el desglose de cada persona y "Movimientos del equipo"; sin metas no se habla de bonos', async ({ page, request }) => {
        void request;
        await login(page, USERS.owner);
        envelopeStart = (await defaultEnvelope(page.request)).balance;
        const goals = await (await page.request.get('/api/bonus-goals')).json() as { enabled: boolean };
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Pago semanal', level: 1 })).toBeVisible();
        await expect(page.getByTestId('week-label')).toContainText('Semana del');
        const breakdown = await openBreakdown(page, 'Deya');
        await expect(breakdown.getByTestId('line-commission')).toBeVisible();
        netBefore = cents(await breakdown.getByTestId('breakdown-net').innerText());
        await expect(page.getByRole('heading', { name: 'Movimientos del equipo' })).toBeVisible();
        await expect(page.getByTestId('ledger-pending')).toBeVisible();
        await expect(page.getByTestId('ledger-loans')).toBeVisible();
        if (!goals.enabled) {
            // Sin metas activas la palabra "bono" no aparece en ninguna parte de la pantalla.
            await expect(page.locator('body')).not.toContainText(/bono/i);
        } else {
            test.info().annotations.push({ type: 'aviso', description: 'Ya había metas de bono activas: no se verifica la ausencia de bonos.' });
        }
    });

    test('adelanto de $30 desde el sobre: avisa antes del PIN si no alcanza, baja el sobre y queda pendiente', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        const form = await openLedgerForm(page, /^Adelanto/);
        await expect(page.getByTestId('ledger-envelope-balance')).toContainText('Saldo disponible');
        await form.getByLabel('Motivo (obligatorio)').fill(sobreAdvance);
        await form.getByLabel('Monto ($)').fill(String(envelopeStart + 5000));
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(form.getByText(/No alcanza/).first()).toBeVisible();
        await expect(page.getByTestId('pin-confirm')).toHaveCount(0);

        await form.getByLabel('Monto ($)').fill('30');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(page.getByTestId('ledger-summary')).toContainText('sale de sobre');
        await fillPinDialog(page, USERS.owner);
        await submitPinDialog(page);

        expect((await defaultEnvelope(page.request)).balance).toBe(envelopeStart - 30);
        const entry = page.getByTestId('ledger-entry').filter({ hasText: sobreAdvance });
        await expect(entry).toContainText('Pendiente');
        await expect(entry).toContainText('Sobre');
        await expect(page.getByTestId('ledger-pending')).toContainText(sobreAdvance);
    });

    test('adelanto de $20 desde la caja (con caja abierta): baja el efectivo esperado', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        // Sin caja abierta el servidor lo rechaza con un mensaje claro y no registra nada.
        const noCash = await expectedCash(page.request);
        if (noCash === null) {
            const form = await openLedgerForm(page, /^Adelanto/);
            await form.getByLabel('Monto ($)').fill('20');
            await form.getByLabel('Motivo (obligatorio)').fill(cajaAdvance);
            await form.getByLabel(/Caja del día/).check();
            await form.getByRole('button', { name: 'Continuar' }).click();
            await fillPinDialog(page, USERS.owner);
            await page.getByTestId('pin-confirm').getByRole('button', { name: /con PIN/ }).click();
            await expect(page.getByTestId('pin-confirm').getByRole('alert')).toContainText(/caja/i);
            await page.getByTestId('pin-confirm').getByRole('button', { name: 'Cancelar' }).click();
            await expect(page.getByTestId('ledger-entry').filter({ hasText: cajaAdvance })).toHaveCount(0);
            await page.getByTestId('ledger-form').getByRole('button', { name: 'Cancelar' }).click();
        }
        await ensureOpenCashSession(page.request);
        const before = await expectedCash(page.request);
        expect(before).not.toBeNull();
        await register(page, USERS.owner, { type: /^Adelanto/, amount: '20', reason: cajaAdvance, from: /Caja del día/ });
        expect(await expectedCash(page.request)).toBe(before! - 20);
        await expect(page.getByTestId('ledger-entry').filter({ hasText: cajaAdvance })).toContainText('Caja del día');
        expect((await defaultEnvelope(page.request)).balance, 'un adelanto de la caja no toca el sobre').toBe(envelopeStart - 30);
    });

    test('descuento de $10: no pregunta de dónde sale, pide motivo, queda pendiente', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        const form = await openLedgerForm(page, /^Descuento/);
        await expect(form.getByText('Sale de')).toHaveCount(0);
        await form.getByLabel('Monto ($)').fill('10');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(form.getByText(/Escribe el motivo/)).toBeVisible();
        await form.getByLabel('Motivo (obligatorio)').fill(deduction);
        await expect(page.getByTestId('ledger-effect')).toContainText('Se descontará en su próximo recibo');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner);
        await submitPinDialog(page);
        await expect(page.getByTestId('ledger-entry').filter({ hasText: deduction })).toContainText('Pendiente');
        expect((await defaultEnvelope(page.request)).balance).toBe(envelopeStart - 30);
    });

    test('lo registrado sale como "pendiente por descontar" y la vista previa de Deya lo resta', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        const pending = page.getByTestId('ledger-pending');
        await expect(pending).toContainText(sobreAdvance);
        await expect(pending).toContainText(cajaAdvance);
        await expect(pending).toContainText(deduction);
        await expect(page.getByTestId('ledger-pending-summary')).toContainText('Adelantos $50.00');
        await expect(page.getByTestId('ledger-pending-summary')).toContainText('Descuentos $10.00');

        const breakdown = await openBreakdown(page, 'Deya');
        await expect(breakdown.getByTestId('line-advance')).toContainText('50.00');
        await expect(breakdown.getByTestId('line-deduction')).toContainText('10.00');
        const netAfter = cents(await breakdown.getByTestId('breakdown-net').innerText());
        // El neto baja lo descontado; si lo descontado supera lo ganado, se paga $0 y el resto pasa a la semana siguiente.
        expect(netAfter).toBe(Math.max(0, netBefore - 60));
        if (netBefore < 60) {
            await expect(breakdown.getByTestId('breakdown-negative')).toContainText('Se paga $0');
        }
        // La fila de la tabla muestra el neto y cuánto ya se descontó (antes solo se veía en el desglose).
        const row = page.getByRole('row').filter({ hasText: 'Deya' }).first();
        await expect(row.getByTestId('row-discounted')).toContainText('$60.00');
        await expect(row).toContainText(`$${netAfter.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    });

    test('cancelar el adelanto de la caja con motivo y PIN devuelve el dinero a la caja', async ({ page }) => {
        await login(page, USERS.owner);
        const before = await expectedCash(page.request);
        expect(before).not.toBeNull();
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        const entry = page.getByTestId('ledger-entry').filter({ hasText: cajaAdvance });
        await entry.getByRole('button', { name: /^Cancelar/ }).click();
        await expect(page.getByTestId('cancel-explanation')).toContainText('caja');
        await fillPinDialog(page, USERS.owner, `Cancelo el adelanto de la caja ${suffix}`);
        await submitPinDialog(page);
        await expect(entry).toContainText('Cancelado');
        expect(await expectedCash(page.request)).toBe(before! + 20);
        await expect(page.getByTestId('ledger-pending')).not.toContainText(cajaAdvance);
        await expect(page.getByTestId('ledger-pending-summary')).toContainText('Adelantos $30.00');
    });

    test('préstamo de $60 con abono semanal de $20: baja el sobre y se ve con su saldo', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        // El abono semanal no puede ser mayor que el préstamo.
        const form = await openLedgerForm(page, /^Préstamo/);
        await form.getByLabel('Monto ($)').fill('60');
        await form.getByLabel('Abono por semana ($)').fill('90');
        await form.getByLabel('Motivo (obligatorio)').fill(loanReason);
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(form.getByText(/no puede ser mayor que el préstamo/)).toBeVisible();
        await form.getByLabel('Abono por semana ($)').fill('20');
        await expect(page.getByTestId('ledger-effect')).toContainText('$20.00 cada semana');
        await form.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner);
        await submitPinDialog(page);

        expect((await defaultEnvelope(page.request)).balance).toBe(envelopeStart - 30 - 60);
        const loans = page.getByTestId('ledger-loans');
        await expect(loans).toContainText('Deya');
        await expect(loans).toContainText('Debe $60.00');
        await expect(loans).toContainText('abono semanal $20.00');
        await expect(loans).toContainText(loanReason);
    });

    test('limpieza: se cancelan el adelanto del sobre, el descuento y el préstamo; el sobre vuelve a su saldo', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        await cancelEntry(page, USERS.owner, sobreAdvance);
        await cancelEntry(page, USERS.owner, deduction);
        await cancelEntry(page, USERS.owner, loanReason);
        expect((await defaultEnvelope(page.request)).balance).toBe(envelopeStart);
        await expect(page.getByTestId('ledger-loans')).not.toContainText(loanReason);
        await expect(page.getByTestId('ledger-pending')).not.toContainText(suffix);
    });
});

test.describe.serial('metas de bono', () => {
    test('sonia (gerencia) no puede ver, crear ni editar metas; ni por API', async ({ page }) => {
        await login(page, USERS.manager);
        expect([401, 403]).toContain((await page.request.get('/api/bonus-goals')).status());
        const created = await page.request.post('/api/bonus-goals', { data: { name: 'Prueba no debe existir', metric: 'services_count', threshold: 1, bonus_amount: 10, applies_to: 'all_barbers', valid_from: '2026-11-20' } });
        expect([401, 403]).toContain(created.status());
        expect([401, 403]).toContain((await page.request.patch('/api/bonus-goals', { data: { id: crypto.randomUUID(), is_active: false } })).status());
        await page.goto('/equipo', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('bonus-goals')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Nueva meta' })).toHaveCount(0);
    });

    test('alonso crea una meta de prueba (1 servicio → $10, solo Deya), Deya ve su avance y la meta se apaga', async ({ page, browser, baseURL }) => {
        await login(page, USERS.owner);
        const before = await (await page.request.get('/api/bonus-goals')).json() as { enabled: boolean };
        await page.goto('/equipo', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('bonus-goals')).toBeVisible();
        await page.getByRole('button', { name: 'Nueva meta' }).click();
        const modal = page.getByRole('dialog', { name: 'Nueva meta de bono' });
        await modal.getByLabel('Nombre de la meta').fill(GOAL_NAME);
        await modal.getByLabel(/^Meta \(servicios\)/).fill('1');
        await modal.getByLabel('Bono ($)').fill('10');
        await modal.getByLabel('A quién aplica').selectOption('employee');
        await modal.getByLabel('Persona').selectOption({ label: 'Deya' });
        await modal.getByRole('button', { name: 'Crear meta' }).click();
        await expect(modal).toHaveCount(0, { timeout: 20_000 });
        const card = page.getByTestId('goal-card').filter({ hasText: GOAL_NAME });
        await expect(card).toContainText('1 servicios');
        await expect(card).toContainText('$10.00');
        await expect(page.getByTestId('goals-state')).toBeVisible();
        void before;

        const context = await browser.newContext({ baseURL });
        const barber = await context.newPage();
        try {
            await login(barber, USERS.barber);
            await barber.goto('/barbero', { waitUntil: 'networkidle' });
            const goals = barber.getByTestId('my-goals');
            await expect(goals).toContainText('Tu avance hacia el bono');
            await expect(goals.getByTestId('goal-progress').filter({ hasText: GOAL_NAME })).toBeVisible();
            await expect(goals.getByRole('progressbar', { name: `Avance hacia ${GOAL_NAME}` })).toBeVisible();
            await expect(goals).toContainText('bono de $10.00');
        } finally {
            await context.close();
        }

        // Se apaga la meta de prueba: no debe quedar activa.
        await page.getByRole('button', { name: `Apagar ${GOAL_NAME}` }).click();
        await expect(page.getByRole('button', { name: `Activar ${GOAL_NAME}` })).toBeVisible();
        const after = await (await page.request.get('/api/bonus-goals')).json() as { goals: { name: string; is_active: boolean }[]; enabled: boolean };
        expect(after.goals.filter((g) => g.name === GOAL_NAME).every((g) => !g.is_active)).toBe(true);
        expect(after.enabled).toBe(before.enabled);
    });

    test('con la meta apagada, Mi semana de Deya y Pago semanal vuelven a no hablar de bonos', async ({ page, browser, baseURL }) => {
        await login(page, USERS.owner);
        const goals = await (await page.request.get('/api/bonus-goals')).json() as { enabled: boolean };
        test.skip(goals.enabled, 'Hay otras metas activas del equipo: no se puede verificar la ausencia de bonos.');
        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        await openBreakdown(page, 'Deya');
        await expect(page.locator('body')).not.toContainText(/bono/i);
        const context = await browser.newContext({ baseURL });
        const barber = await context.newPage();
        try {
            await login(barber, USERS.barber);
            await barber.goto('/barbero', { waitUntil: 'networkidle' });
            await expect(barber.getByTestId('my-goals')).toHaveCount(0);
            await expect(barber.locator('body')).not.toContainText(/bono/i);
        } finally {
            await context.close();
        }
    });
});

test.describe.serial('Mi semana (barbera, iPhone 13)', () => {
    test('Deya ve lo que se le descontará con sus asientos, no ve los de otras personas y no tiene botones de registro', async ({ page, browser, baseURL }) => {
        await login(page, USERS.owner);
        const deya = await barberIdByName(page.request, 'Deya');
        const sonia = await barberIdByName(page.request, 'Sonia');
        const mine = `Prueba descuento de Deya ${suffix}`;
        const others = `Prueba descuento de Sonia ${suffix}`;
        const post = async (employee: string, reason: string) => {
            const res = await page.request.post('/api/employee-ledger', {
                data: { employee_id: employee, entry_type: 'deduction', amount: 5, reason, paid_from: null, idempotency_key: crypto.randomUUID(), pin: pinFor(USERS.owner) },
            });
            expect(res.status(), await res.text()).toBe(201);
        };
        await post(deya, mine);
        await post(sonia, others);

        const { defaultBrowserType: _ignored, ...phone } = devices['iPhone 13'];
        void _ignored;
        const context = await browser.newContext({ ...phone, baseURL, timezoneId: 'America/Mexico_City', locale: 'es-MX' });
        const barber = await context.newPage();
        try {
            await login(barber, USERS.barber);
            await barber.goto('/barbero', { waitUntil: 'networkidle' });
            const pending = barber.getByTestId('my-pending');
            await expect(pending).toContainText('Lo que se descontará en tu próximo recibo');
            await expect(pending).toContainText('Descuentos');
            await expect(pending).toContainText('− $5.00');
            await expect(barber.getByTestId('my-ledger')).toContainText(mine);
            await expect(barber.locator('body')).not.toContainText(others);
            await expect(barber.getByRole('button', { name: /Registrar|Cancelar/ })).toHaveCount(0);
            // Sin desbordar el ancho del teléfono.
            const overflow = await barber.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(1);

            // La API solo le devuelve lo suyo aunque pida a otra persona.
            const asked = await (await barber.request.get(`/api/employee-ledger?employee_id=${sonia}`)).json() as { can_edit: boolean; entries: { employee_id: string; reason: string }[] };
            expect(asked.can_edit).toBe(false);
            expect(asked.entries.length).toBeGreaterThan(0);
            expect(asked.entries.every((e) => e.employee_id === deya)).toBe(true);
            expect(asked.entries.some((e) => e.reason === others)).toBe(false);
        } finally {
            await context.close();
            await safetyNet(browser, baseURL);
        }
    });
});
