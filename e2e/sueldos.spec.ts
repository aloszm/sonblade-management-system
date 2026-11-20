import { expect, test, type Browser, type Page } from '@playwright/test';
import { USERS, businessToday, fillPinDialog, login, pinBody, stamp, submitPinDialog } from './helpers';

// Sueldo por día de recepción, de punta a punta con la interfaz (solo contra DESARROLLO).
//  a. Equipo: la cuenta principal ve el sueldo de Dago y puede cambiarlo; la gerente lo ve en solo lectura; Dago no.
//  b. Pago semanal de la semana en curso: Dago muestra su sueldo con los días; la gerente registra una falta con PIN
//     (el monto baja lo que vale ese día) y la anula con PIN (vuelve). La semana termina SIN excepciones activas.
//  c. Mi semana de Dago: su sueldo devengado, solo lo suyo.
//  d. La utilidad de Finanzas coincide con la del Panel, con "Sueldos" como concepto propio y la cascada suma.
//  e. Guardar un sueldo con PIN, sobre "Barbero Prueba E2E" (nunca sobre Dago ni Emi): queda en $0 al terminar.
// NO paga ninguna liquidación (sellaría la semana) y NO cambia el sueldo de Dago ni de Emi.

const suffix = stamp();
const money = (text: string) => Number(text.replace(/[^0-9.-]/g, ''));

type WeekPerson = {
    employee_id: string; name: string; settled: boolean; can_edit: boolean; amount: number; accrued_amount: number;
    wage: { days: { date: string; status: string; amount: number }[] } | null;
    exceptions: { id: string; reason: string; kind: string; voided_at: string | null; can_void: boolean }[];
};
type WeekResponse = { period_start: string; today: string; people: WeekPerson[] };

async function currentWeek(page: Page): Promise<WeekResponse> {
    const res = await page.request.get('/api/wages/week');
    expect(res.ok(), await res.text()).toBeTruthy();
    return res.json();
}

/** Anula con la API cualquier falta de prueba que haya quedado activa (red de seguridad: la semana debe quedar limpia). */
async function safetyNet(browser: Browser, baseURL: string | undefined) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
        await login(page, USERS.manager);
        const week = await currentWeek(page);
        for (const person of week.people) {
            for (const x of person.exceptions.filter((e) => !e.voided_at && e.can_void && e.reason.includes(suffix))) {
                await page.request.post(`/api/wages/exceptions/${x.id}/void`, { data: { reason: 'Limpieza de la prueba', pin: pinBody(USERS.manager) } });
            }
        }
    } finally {
        await context.close();
    }
}

test.afterAll(async ({ browser, baseURL }) => { await safetyNet(browser, baseURL); });

test.describe.serial('sueldo por día', () => {
    test('a. Equipo: Alonso ve y puede cambiar el sueldo de Dago; Sonia lo ve en solo lectura; Dago no puede cambiarlo', async ({ page, browser, baseURL }) => {
        await login(page, USERS.owner);
        await page.goto('/equipo', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('member-wage').filter({ hasText: '$320 por día · lunes a viernes' })).toBeVisible();
        await page.getByRole('button', { name: 'Sueldo por día de Dago' }).click();
        const section = page.getByTestId('wage-section');
        await expect(section.getByTestId('wage-current')).toContainText('$320 por día · lunes a viernes');
        await expect(section.getByRole('button', { name: /Cambiar sueldo/ })).toBeVisible();
        // El formulario trae los botones de días; se abre y se cierra sin guardar (el sueldo de Dago no se toca).
        await section.getByRole('button', { name: /Cambiar sueldo/ }).click();
        const form = section.getByTestId('wage-form');
        await expect(form.getByRole('group', { name: 'Días de trabajo' }).getByRole('button')).toHaveText(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
        await expect(form.getByRole('button', { name: 'lunes' })).toHaveAttribute('aria-pressed', 'true');
        await expect(form.getByRole('button', { name: 'sábado' })).toHaveAttribute('aria-pressed', 'false');
        await form.getByRole('button', { name: 'Cancelar' }).click();
        await expect(section.getByTestId('wage-form')).toHaveCount(0);

        // Sonia (gerencia): lo ve, pero en solo lectura.
        const manager = await browser.newContext({ baseURL });
        const mp = await manager.newPage();
        try {
            await login(mp, USERS.manager);
            await mp.goto('/equipo', { waitUntil: 'networkidle' });
            await expect(mp.getByTestId('member-wage').filter({ hasText: '$320 por día · lunes a viernes' })).toBeVisible();
            await mp.getByRole('button', { name: 'Sueldo por día de Dago' }).click();
            const ms = mp.getByTestId('wage-section');
            await expect(ms.getByTestId('wage-current')).toContainText('$320 por día · lunes a viernes');
            await expect(ms.getByTestId('wage-readonly')).toBeVisible();
            await expect(ms.getByRole('button', { name: /Cambiar sueldo|Asignar sueldo/ })).toHaveCount(0);
            // La API también lo impide, no solo la pantalla.
            const put = await mp.request.put('/api/wages', { data: { employee_id: 'x', daily_amount: 1, work_days: [1], reason: 'No debe pasar', pin: '000000' } });
            expect(put.status()).toBe(403);
        } finally { await manager.close(); }

        // Dago no entra a Equipo ni puede cambiar el sueldo; solo lee el suyo.
        const front = await browser.newContext({ baseURL });
        const fp = await front.newPage();
        try {
            await login(fp, USERS.reception);
            await fp.goto('/equipo');
            await expect(fp).toHaveURL(/\/pos$/);
            const own = await (await fp.request.get('/api/wages')).json() as { can_edit: boolean; current: { employee_name: string }[] };
            expect(own.can_edit).toBe(false);
            expect(own.current.map((c) => c.employee_name)).toEqual(['Dago']);
            const put = await fp.request.put('/api/wages', { data: { employee_id: 'x', daily_amount: 1, work_days: [1], reason: 'No debe pasar', pin: '000000' } });
            expect(put.status()).toBe(403);
        } finally { await front.close(); }
    });

    test('b. Pago semanal: sueldo de Dago con sus días; Sonia registra una falta con PIN, baja $320 y la anula', async ({ page }) => {
        await login(page, USERS.manager);
        const before = await currentWeek(page);
        const dago = before.people.find((p) => p.name === 'Dago');
        expect(dago, 'Dago debe tener sueldo por día').toBeTruthy();
        expect(dago!.settled, 'la semana en curso de Dago no debe estar pagada').toBe(false);
        // Un día fijo ya transcurrido de esta semana (o, si hoy es domingo, el primero).
        const worked = dago!.wage!.days.filter((d) => d.status === 'worked');
        const chosen = worked.find((d) => d.date <= before.today) ?? worked[0];
        expect(chosen, 'Dago debe tener un día fijo trabajado esta semana').toBeTruthy();
        const dayValue = chosen.amount;
        expect(dayValue).toBe(320);

        await page.goto('/liquidaciones', { waitUntil: 'networkidle' });
        await expect(page.getByTestId('week-label')).toContainText('Semana del');
        await page.getByRole('button', { name: 'Ver la semana en curso' }).click();
        const card = page.getByRole('article', { name: 'Sueldo de Dago' });
        await expect(card).toBeVisible({ timeout: 30_000 });
        const amountBefore = money(await card.getByTestId('wage-amount').innerText());
        expect(amountBefore).toBe(dago!.amount);
        await expect(card.getByTestId('wage-summary-line')).toContainText('Sueldo:');
        for (const d of worked) await expect(card.getByTestId(`day-${d.date}`)).toHaveAttribute('data-status', 'worked');

        // El desglose de la fila de Dago trae el renglón "Sueldo: N días × $320 = $X" con el detalle por día.
        const row = page.locator('tr', { has: page.getByRole('button', { name: 'Ver desglose de Dago' }) });
        await expect(row.getByTestId('row-wage')).toContainText('$');
        await row.getByRole('button', { name: 'Ver desglose de Dago' }).click();
        const breakdown = page.getByTestId('pay-breakdown').filter({ has: page.getByTestId('line-wage') });
        const wageLine = breakdown.getByTestId('line-wage');
        await expect(wageLine).toContainText(/Sueldo: \d+ días? × \$320/);
        await wageLine.getByRole('button', { name: /Sueldo/ }).click();
        await expect(wageLine).toContainText('Trabajado');

        // Registrar la falta con motivo y PIN.
        const reason = `Prueba falta ${suffix}`;
        await card.getByRole('button', { name: 'Registrar falta' }).click();
        await page.getByTestId('exception-day').selectOption(chosen.date);
        await fillPinDialog(page, USERS.manager, reason);
        await submitPinDialog(page);
        await expect(card.getByTestId('wage-amount')).toContainText(`$${(amountBefore - dayValue).toLocaleString('en-US')}.00`);
        await expect(card.getByTestId(`day-${chosen.date}`)).toHaveAttribute('data-status', 'absent');
        await expect(card.getByTestId('wage-exception').filter({ hasText: reason })).toContainText('Faltó');
        // Lo que devuelve la base coincide con lo que se ve, y la fila de la tabla se actualiza con la vista previa.
        const during = (await currentWeek(page)).people.find((p) => p.name === 'Dago')!;
        expect(during.amount).toBe(amountBefore - dayValue);
        await expect(breakdown.getByTestId('line-wage')).toContainText(`$${(amountBefore - dayValue).toLocaleString('en-US')}.00`, { timeout: 20_000 });

        // Anularla (motivo + PIN): el monto vuelve.
        await card.getByTestId('wage-exception').filter({ hasText: reason }).getByRole('button', { name: /Anular falta/ }).click();
        await fillPinDialog(page, USERS.manager, `Anulo la prueba ${suffix}`);
        await submitPinDialog(page);
        await expect(card.getByTestId('wage-amount')).toContainText(`$${amountBefore.toLocaleString('en-US')}.00`);
        await expect(card.getByTestId(`day-${chosen.date}`)).toHaveAttribute('data-status', 'worked');
        await expect(card.getByTestId('wage-exception').filter({ hasText: reason })).toContainText('Anulado');
        await expect(card.getByTestId('wage-exception').filter({ hasText: reason }).getByRole('button')).toHaveCount(0);

        // La semana queda SIN excepciones activas.
        const after = (await currentWeek(page)).people.find((p) => p.name === 'Dago')!;
        expect(after.amount).toBe(amountBefore);
        expect(after.exceptions.filter((x) => !x.voided_at)).toEqual(before.people.find((p) => p.name === 'Dago')!.exceptions.filter((x) => !x.voided_at));
    });

    test('c. Mi semana de Dago: sueldo devengado día por día y nada de otras personas', async ({ page }) => {
        await login(page, USERS.reception);
        const week = await currentWeek(page);
        // La API solo le entrega lo suyo.
        expect(week.people.map((p) => p.name)).toEqual(['Dago']);
        const mine = week.people[0];

        await page.goto('/barbero', { waitUntil: 'networkidle' });
        await expect(page).toHaveURL(/\/barbero$/);
        await expect(page.getByTestId('front-desk-week')).toBeVisible();
        const wage = page.getByTestId('my-wage');
        await expect(wage).toBeVisible();
        const accrued = money(await page.getByTestId('my-wage-accrued').innerText());
        expect(accrued).toBe(mine.accrued_amount);
        expect(accrued).toBeGreaterThan(0);
        for (const d of mine.wage!.days) await expect(page.getByTestId(`my-day-${d.date}`)).toHaveAttribute('data-status', d.status);
        await expect(page.getByTestId('my-owed')).toContainText('Comisión de productos');
        // Nada de lo que solo aplica a barberos ni de otras personas.
        await expect(page.getByTestId('period')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: /Mis servicios|Mis clientes/ })).toHaveCount(0);
        const text = await page.locator('body').innerText();
        for (const other of ['Deya', 'Dani', 'Sonia', 'Emi', 'Alonso']) expect(text, `no debe nombrar a ${other}`).not.toContain(other);
        // Y la API le niega las cifras de otra persona.
        const barbers = await (await page.request.get('/api/barbers')).json() as { id: string; name: string }[];
        const other = barbers.find((b) => b.name === 'Deya')!;
        expect((await page.request.get(`/api/barbers/${other.id}/stats?view=my-week`)).status()).toBe(403);
        // Sigue sin entrar a la ficha de otros barberos.
        await page.goto(`/barberos/${other.id}`);
        await expect(page).toHaveURL(/\/pos$/);
    });

    test('d. La utilidad de Finanzas coincide con la del Panel, con "Sueldos" visible y la cascada suma', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/', { waitUntil: 'networkidle' });
        const kpis = page.getByRole('region', { name: 'Indicadores principales' });
        await Promise.all([
            page.waitForResponse((r) => /\/api\/admin\/profit\?from=\d{4}-\d{2}-01/.test(r.url())),
            page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Mes', exact: true }).click(),
        ]);
        await expect(page.getByTestId('profit-note')).toContainText(/− sueldos \(\$/);
        await expect(kpis).toContainText('Utilidad');
        const panelProfit = money(await page.getByTestId('kpi-net').innerText());
        const panelWages = page.getByRole('region', { name: 'Más indicadores' }).locator('div', { hasText: /^Sueldos/ }).first();
        await expect(panelWages).toBeVisible();

        await page.goto('/administracion', { waitUntil: 'networkidle' });
        await page.getByRole('group', { name: 'Periodo' }).getByRole('button', { name: 'Este mes' }).click();
        const profit = page.getByTestId('profit-total');
        await expect(profit).toBeVisible();
        const financeProfit = money(await profit.innerText());
        expect(Math.abs(panelProfit - financeProfit), `Panel ${panelProfit} contra Finanzas ${financeProfit}`).toBeLessThan(1);

        // "Sueldos" es un paso propio de la cascada y los pasos suman exactamente a la utilidad.
        await expect(page.getByTestId('kpi-sueldos')).toBeVisible();
        const step = async (key: string) => money(await page.getByTestId(`step-${key}`).locator('p').nth(1).innerText());
        await expect(page.getByTestId('step-wage')).toContainText('Sueldos');
        const rev = await step('rev');
        const com = await step('com');
        const wage = await step('wage');
        const cost = await step('cost');
        const exp = await step('exp');
        const bonus = (await page.getByTestId('step-bonus').count()) ? await step('bonus') : 0;
        const net = await step('net');
        expect(Math.round((rev - com - wage - bonus - cost - exp) * 100) / 100).toBe(net);
        expect(net).toBe(financeProfit);
        const kpiWages = money(await page.getByTestId('kpi-sueldos').locator('p').nth(1).innerText());
        expect(kpiWages).toBe(wage);
    });

    test('e. Guardar un sueldo con PIN (sobre "Barbero Prueba E2E", nunca Dago ni Emi) y dejarlo en $0', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/equipo', { waitUntil: 'networkidle' });
        const name = 'Barbero Prueba E2E';
        await page.getByRole('button', { name: `Sueldo por día de ${name}` }).click();
        const section = page.getByTestId('wage-section');
        const min = (await (await page.request.get('/api/wages')).json() as { min_effective_from: string }).min_effective_from;

        // Hoy queda sin sueldo (de corridas anteriores queda en $0): se asigna $1 solo los domingos.
        await expect(section.getByText('Sin sueldo fijo: gana por comisión y propinas')).toBeVisible();
        await section.getByRole('button', { name: /Asignar sueldo/ }).click();
        let form = section.getByTestId('wage-form');
        await form.getByLabel('Sueldo por día ($)').fill('1');
        await form.getByRole('button', { name: 'domingo' }).click();
        await form.getByRole('button', { name: 'Continuar' }).click();
        await expect(page.getByTestId('wage-summary')).toContainText(`${name}: $1 por día · domingo`);
        await fillPinDialog(page, USERS.owner, `Prueba de guardado ${suffix}`);
        await submitPinDialog(page);
        await expect(section.getByTestId('wage-current')).toContainText('$1 por día · domingo');
        await expect(section.getByTestId('wage-history')).toContainText(`Prueba de guardado ${suffix}`);

        // Se deja en $0 desde la misma fecha: sin sueldo, sin costo.
        await section.getByRole('button', { name: /Cambiar sueldo/ }).click();
        form = section.getByTestId('wage-form');
        await form.getByLabel('Sueldo por día ($)').fill('0');
        await form.getByRole('button', { name: 'domingo' }).click();
        await form.getByRole('button', { name: 'Continuar' }).click();
        await fillPinDialog(page, USERS.owner, `Dejo la prueba en cero ${suffix}`);
        await submitPinDialog(page);
        await expect(section.getByText('Sin sueldo fijo: gana por comisión y propinas')).toBeVisible();
        await expect(section.getByTestId('wage-history')).toContainText(`Dejo la prueba en cero ${suffix}`);

        // Dago y Emi quedan como estaban.
        const all = await (await page.request.get('/api/wages')).json() as { current: { employee_name: string; current: { daily_amount: number; work_days_label: string } | null }[] };
        const by = Object.fromEntries(all.current.map((c) => [c.employee_name, c.current]));
        expect(by.Dago).toMatchObject({ daily_amount: 320, work_days_label: 'lunes a viernes' });
        expect(by.Emi).toMatchObject({ daily_amount: 320, work_days_label: 'sábado y domingo' });
        expect(min <= businessToday()).toBe(true);
    });
});
