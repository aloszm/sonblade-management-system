import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { expect, test, type Page } from '@playwright/test';
import { USERS, login } from './helpers';

// Cada descarga emite un folio nuevo (la base no deja borrarlos): la prueba descarga lo mínimo.
const SHEETS = ['Portada', 'Resumen', 'Resultado', 'Propinas', 'Por persona', 'Balance', 'Ventas', 'Caja', 'Gastos', 'Comisiones', 'Inventario', 'Agenda', 'Bitácora', 'Anexo'];

async function download(page: Page, testId: 'download-pdf' | 'download-xlsx') {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
    const path = await file.path();
    expect(path).toBeTruthy();
    return { name: file.suggestedFilename(), bytes: readFileSync(path!) };
}

async function openReport(page: Page, audience: 'interno' | 'contador') {
    await page.goto('/reportes', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Este mes' }).click();
    await page.getByTestId(`audience-${audience}`).click();
    await expect(page.getByTestId('report-preview')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('preview-period')).toContainText(audience === 'interno' ? 'Interno' : 'Contador');
    await expect(page.getByTestId('download-pdf')).toBeEnabled();
}

/** Nombres de clientes que aparecen en el reporte interno (anexo y agenda). */
async function clientNames(page: Page, from: string, to: string): Promise<string[]> {
    const res = await page.request.get(`/api/reports/full?from=${from}&to=${to}&audience=interno`);
    expect(res.ok()).toBeTruthy();
    const report = await res.json();
    const names = new Set<string>();
    for (const l of report.annex) if (l.client) names.add(l.client);
    for (const a of [...report.agenda.cancelled, ...report.agenda.no_show]) if (a.client) names.add(a.client);
    // Datos viejos de la base de desarrollo: algún "cliente" se llama igual que una cuenta del equipo ("alonso"), y el
    // equipo sí aparece (con su usuario) en la bitácora del reporte. Solo se vigilan nombres que no son del equipo.
    const team = new Set<string>(Object.values(USERS).map((u) => u.toLowerCase()));
    return Array.from(names).filter((n) => !team.has(n.trim().toLowerCase()));
}

test.describe.serial('reporte completo', () => {
    let folio = '';
    let code = '';
    let names: string[] = [];
    const month = { from: '', to: '' };

    test('el dueño ve la vista previa con las diez secciones y las gráficas separadas', async ({ page }) => {
        await login(page, USERS.owner);
        await openReport(page, 'interno');
        for (const id of ['portada', 'resumen', 'ventas', 'caja', 'gastos', 'comisiones', 'inventario', 'agenda', 'bitacora', 'anexo']) {
            await expect(page.getByTestId(`section-${id}`)).toBeVisible();
        }
        await expect(page.getByRole('heading', { name: 'Ingresos por día' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Servicios por día' })).toBeVisible();
        await expect(page.getByTestId('section-resumen')).toContainText(/La (utilidad neta|pérdida) fue de \$/);
        const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
        month.from = `${today.slice(0, 8)}01`;
        month.to = today;
        names = await clientNames(page, month.from, month.to);
        expect(names.length, 'el reporte interno debe traer al menos un nombre de cliente para que la prueba tenga sentido').toBeGreaterThan(0);
    });

    test('descarga el PDF interno con folio y código en el pie de cada página', async ({ page }) => {
        await login(page, USERS.owner);
        await openReport(page, 'interno');
        const { name, bytes } = await download(page, 'download-pdf');
        expect(bytes.length).toBeGreaterThan(5_000);
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        folio = (await page.getByTestId('issued-folio').textContent())!.trim();
        code = (await page.getByTestId('issued-code').textContent())!.trim();
        expect(folio).toMatch(/^REP-\d{6}$/);
        expect(code).toMatch(/^[0-9a-f]{64}$/);
        expect(name).toContain(folio);
        const text = bytes.toString('latin1');
        const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
        expect(pages).toBeGreaterThanOrEqual(8);
        expect((text.match(new RegExp(`Folio ${folio} · Código ${code.slice(0, 16)}`, 'g')) ?? []).length).toBe(pages);
        expect(text.includes(names[0])).toBe(true); // el interno sí trae nombres de clientes
    });

    test('descarga el Excel interno con una hoja por sección', async ({ page }) => {
        await login(page, USERS.owner);
        await openReport(page, 'interno');
        const { name, bytes } = await download(page, 'download-xlsx');
        expect(bytes.length).toBeGreaterThan(5_000);
        expect(name.endsWith('.xlsx')).toBe(true);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
        expect(workbook.worksheets.map((s) => s.name)).toEqual(SHEETS);
        const issuedFolio = (await page.getByTestId('issued-folio').textContent())!.trim();
        expect(issuedFolio).not.toBe(folio); // cada archivo emite su propio folio
        const portada: string[] = [];
        workbook.getWorksheet('Portada')!.eachRow((row) => row.eachCell((cell) => portada.push(String(cell.value))));
        expect(portada).toContain(issuedFolio);
        expect(portada.some((v) => /^[0-9a-f]{64}$/.test(v))).toBe(true);
    });

    test('la versión para el contador no trae ningún nombre ni teléfono de cliente', async ({ page }) => {
        await login(page, USERS.owner);
        await openReport(page, 'contador');
        // La vista previa y la respuesta de la base ya vienen sin clientes.
        const preview = await (await page.request.get(`/api/reports/full?from=${month.from}&to=${month.to}&audience=contador`)).text();
        for (const n of names) expect(preview).not.toContain(n);
        await expect(page.getByTestId('report-preview')).not.toContainText(names[0]);

        const pdf = await download(page, 'download-pdf');
        const pdfText = pdf.bytes.toString('latin1');
        for (const n of names) expect(pdfText).not.toContain(n);
        expect(pdfText).toContain('Contador / externo');

        const xlsx = await download(page, 'download-xlsx');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(xlsx.bytes as unknown as ArrayBuffer);
        const cells: string[] = [];
        workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value)))));
        const all = cells.join('\n');
        for (const n of names) expect(all).not.toContain(n);
        expect(workbook.worksheets.map((s) => s.name)).toEqual(SHEETS);
    });

    test('la página de verificación valida el folio y el código, y rechaza uno equivocado', async ({ page }) => {
        await login(page, USERS.owner);
        await page.goto('/reportes/verificar', { waitUntil: 'networkidle' });
        await page.locator('#verify-folio').fill(folio);
        await page.locator('#verify-code').fill(code.slice(0, 16));
        await page.getByTestId('verify-submit').click();
        const valid = page.getByTestId('verify-valid');
        await expect(valid).toBeVisible();
        await expect(valid).toContainText(folio);
        await expect(valid).toContainText('Interno');
        await expect(valid).toContainText('Generado por');
        await expect(valid).toContainText('Alonso'); // la pantalla muestra quién lo generó (antes decía "Dueño")

        await page.locator('#verify-code').fill('0'.repeat(16));
        await page.getByTestId('verify-submit').click();
        await expect(page.getByTestId('verify-invalid')).toBeVisible();
        await expect(page.getByTestId('verify-valid')).toHaveCount(0);

        // El código completo también vale; un folio que no existe no coincide.
        expect((await (await page.request.post('/api/reports/verify', { data: { folio, code } })).json()).valid).toBe(true);
        expect((await (await page.request.post('/api/reports/verify', { data: { folio: 'REP-999999', code } })).json()).valid).toBe(false);
        expect((await page.request.post('/api/reports/verify', { data: { folio: '' } })).status()).toBe(400);
    });

    test('la gerente puede emitir reportes; recepción y barbero reciben 403', async ({ page, browser }) => {
        await login(page, USERS.manager);
        expect((await page.request.get(`/api/reports/full?from=${month.from}&to=${month.to}&audience=contador`)).status()).toBe(200);

        for (const email of [USERS.reception, USERS.barber]) {
            const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100' });
            const other = await context.newPage();
            await login(other, email);
            const qs = `from=${month.from}&to=${month.to}&audience=interno`;
            expect((await other.request.get(`/api/reports/full?${qs}`)).status()).toBe(403);
            expect((await other.request.post('/api/reports/export', { data: { from: month.from, to: month.to, audience: 'interno' } })).status()).toBe(403);
            expect((await other.request.post('/api/reports/verify', { data: { folio, code } })).status()).toBe(403);
            await other.goto('/reportes');
            await expect(other).not.toHaveURL(/\/reportes/);
            await context.close();
        }
    });

    test('rechaza periodos y audiencias que no son válidos', async ({ page }) => {
        await login(page, USERS.owner);
        expect((await page.request.get('/api/reports/full?from=2026-11-15&to=2026-11-01&audience=interno')).status()).toBe(400);
        expect((await page.request.get('/api/reports/full?from=2025-01-01&to=2026-11-01&audience=interno')).status()).toBe(400);
        expect((await page.request.get('/api/reports/full?from=2026-11-01&to=2026-11-02&audience=otro')).status()).toBe(400);
        expect((await page.request.post('/api/reports/export', { data: { from: 'x', to: 'y', audience: 'interno' } })).status()).toBe(400);
    });
});
