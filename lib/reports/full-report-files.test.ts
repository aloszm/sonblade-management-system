// @vitest-environment node
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildReportModel } from './full-report';
import { sampleFinancial, sampleReport, sampleReportWithWages } from './full-report.fixture';
import { buildReportPdf, pdfSafe } from './full-report-pdf';
import { buildReportXlsx, excelValue, spreadsheetSafe } from './full-report-xlsx';

const CODE = '75fea062d75600fc8a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef';
const issued = (audience: 'interno' | 'contador') => buildReportModel(sampleReport(audience), { folio: 'REP-000007', sha256: CODE });
const asText = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

describe('PDF del reporte', () => {
    it('es un PDF con el folio y los primeros 16 caracteres del código en cada página', async () => {
        const bytes = await buildReportPdf(issued('interno'));
        expect(asText(bytes).startsWith('%PDF-')).toBe(true);
        const text = asText(bytes);
        const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
        expect(pages).toBeGreaterThanOrEqual(8);
        const footers = text.match(/Folio REP-000007 · Código 75fea062d75600fc/g) ?? [];
        expect(footers.length).toBe(pages);
        expect(text).toContain('Página 1 de');
    });

    it('con audiencia contador no contiene ningún nombre ni teléfono de cliente', async () => {
        const external = asText(await buildReportPdf(issued('contador')));
        for (const secret of ['Juan', 'Rez', 'María', '5551234567', '5557654321']) expect(external).not.toContain(secret);
        const internal = asText(await buildReportPdf(issued('interno')));
        expect(internal).toContain('5551234567');
    });

    it('cambia los caracteres que las fuentes del PDF no traen', () => {
        expect(pdfSafe('Utilidad − costos → ≥ 5 ✓')).toBe('Utilidad - costos -> >= 5 ');
        expect(pdfSafe('Corte · Año ñ é ¿?')).toBe('Corte · Año ñ é ¿?');
    });
});

describe('PDF: resultado financiero', () => {
    it('trae el estado de resultados, la barra de cada $100, propinas y balance, también para el contador', async () => {
        for (const audience of ['interno', 'contador'] as const) {
            const text = asText(await buildReportPdf(issued(audience)));
            for (const piece of ['3. Resultado del periodo', 'Estado de resultados', 'Utilidad neta', 'De cada $100 que entraron', '4. Propinas',
                'Son del barbero; no forman parte de la utilidad.', '5. Lo que deja cada persona', '6. Balance de efectivo', 'Cómo cuadra con la utilidad']) {
                expect(text).toContain(pdfSafe(piece));
            }
        }
    });

    it('se genera sin ingresos y con un producto sin costo, con el aviso', async () => {
        const report = sampleReport();
        const fin = sampleFinancial();
        fin.current.product_cost = { total: 0, source: 'catalog', units_without_cost: 3, missing: [{ product_id: null, name: 'Pomada Roja', units: 3 }] };
        fin.current.revenue = { services: 0, products: 0, total: 0, discounts: 0 };
        fin.current.profit = -1500;
        fin.current.margin_pct = null;
        report.financial = fin;
        const text = asText(await buildReportPdf(buildReportModel(report)));
        expect(text).toContain('Pomada Roja: 3');
        expect(text).toContain('Sin ingresos en el periodo');
        expect(text).not.toMatch(/NaN|Infinity/);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await buildReportXlsx(buildReportModel(report))) as unknown as ArrayBuffer);
        expect(workbook.getWorksheet('Resultado')).toBeTruthy();
    });
});

describe('Excel del reporte', () => {
    it('el resultado guarda importes y porcentajes como números', async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await buildReportXlsx(issued('interno'))) as unknown as ArrayBuffer);
        const sheet = workbook.getWorksheet('Resultado')!;
        let profitRow: ExcelJS.Row | null = null;
        sheet.eachRow((row) => { if (row.getCell(1).value === 'Utilidad neta' && typeof row.getCell(2).value === 'number') profitRow = row; });
        const r = profitRow as unknown as ExcelJS.Row;
        expect([r.getCell(2).value, r.getCell(3).value, r.getCell(4).value]).toEqual([1320, 910, 410]);
        expect(r.getCell(5).value).toBeCloseTo(0.451, 3);
        expect(r.getCell(5).numFmt).toContain('%');
        expect(r.getCell(6).value).toBe(44);
        expect(r.getCell(1).font?.bold).toBe(true);
        const tips = workbook.getWorksheet('Propinas')!;
        const all: unknown[] = [];
        tips.eachRow((row) => row.eachCell((cell) => all.push(cell.value)));
        expect(all).toContain('Propinas del periodo');
        expect(all).toContain(120);
    });

    it('trae una hoja por sección, con los nombres esperados', async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await buildReportXlsx(issued('interno'))) as unknown as ArrayBuffer);
        expect(workbook.worksheets.map((s) => s.name)).toEqual(['Portada', 'Resumen', 'Resultado', 'Propinas', 'Por persona', 'Balance', 'Ventas', 'Caja', 'Gastos', 'Comisiones', 'Inventario', 'Agenda', 'Bitácora', 'Anexo']);
        expect(workbook.title).toContain('REP-000007');
    });

    it('guarda importes como números y las horas en la zona del negocio', async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await buildReportXlsx(issued('interno'))) as unknown as ArrayBuffer);
        const annex = workbook.getWorksheet('Anexo')!;
        const rows: unknown[][] = [];
        annex.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
        const first = rows.find((r) => r[1] === '5DD4C7BF')!;
        // 20:06:09 UTC del 10 de noviembre = 14:06:09 en Ciudad de México
        expect((first[0] as Date).toISOString()).toBe('2026-11-10T14:06:09.000Z');
        expect(first[7]).toBe(200);
        expect(first[10]).toBe('Juan Pérez');
    });

    it('el Excel contador no lleva clientes y la portada trae el código completo', async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await buildReportXlsx(issued('contador'))) as unknown as ArrayBuffer);
        const everything: string[] = [];
        workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => everything.push(String(cell.value)))));
        const joined = everything.join('|');
        for (const secret of ['Juan', 'María', '5551234567']) expect(joined).not.toContain(secret);
        expect(joined).toContain(CODE);
    });

    it('neutraliza fórmulas en el texto', async () => {
        expect(spreadsheetSafe('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`);
        expect(spreadsheetSafe('+52 55')).toBe("'+52 55");
        expect(spreadsheetSafe('-5')).toBe('-5');
        expect(spreadsheetSafe('Corte')).toBe('Corte');
        expect(excelValue({ header: 'x', type: 'text' }, '@cmd', 'UTC')).toBe("'@cmd");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await buildReportXlsx(issued('interno'))) as unknown as ArrayBuffer);
        const sales = workbook.getWorksheet('Ventas')!;
        let found = false;
        sales.eachRow((row) => row.eachCell((cell) => { if (String(cell.value).includes('HYPERLINK')) { found = true; expect(String(cell.value).startsWith("'=")).toBe(true); } }));
        expect(found).toBe(true);
    });
});

// Auditoría del 21 nov 2026: los archivos que recibe el contador deben traer los sueldos y sumar igual que la pantalla.
describe('PDF y Excel con sueldos, bonos y movimientos del equipo', () => {
    const withWages = (audience: 'interno' | 'contador') => buildReportModel(sampleReportWithWages(audience), { folio: 'REP-000008', sha256: CODE });
    const round = (n: number) => Math.round(n * 100) / 100;
    /** Renglones [concepto, importe] de una hoja, en orden. */
    const pairs = (sheet: ExcelJS.Worksheet) => {
        const out: [string, number][] = [];
        sheet.eachRow((row) => { const a = row.getCell(1).value, b = row.getCell(2).value; if (typeof a === 'string' && typeof b === 'number') out.push([a, b]); });
        return out;
    };

    it('el PDF trae los renglones de sueldos y bonos, a quién se entregó el retiro y el desglose de los recibos', async () => {
        for (const audience of ['interno', 'contador'] as const) {
            const text = asText(await buildReportPdf(withWages(audience)));
            for (const piece of ['Menos sueldos del personal', 'Menos bonos por metas', 'Sueldos y bonos', 'Más sueldos del periodo', 'Retiro entregado a', 'Sin registrar',
                'Retiros al cerrar la caja, por quién los recibió', 'Cómo se armó cada recibo', 'Movimientos del equipo registrados en el periodo']) {
                expect(text).toContain(pdfSafe(piece));
            }
            expect(text).not.toMatch(/NaN|Infinity|undefined/);
        }
    });

    it('el Excel del resultado suma: ingresos − comisiones − sueldos − bonos − costo − gastos = utilidad', async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await buildReportXlsx(withWages('contador'))) as unknown as ArrayBuffer);
        const rows = pairs(workbook.getWorksheet('Resultado')!);
        const value = (label: string) => rows.find((r) => r[0] === label)![1];
        expect(value('Menos sueldos del personal')).toBe(-400);
        expect(value('Menos bonos por metas')).toBe(-100);
        const detail = rows.filter((r) => /^(Ingresos por|Menos )/.test(r[0])).reduce((a, r) => a + r[1], 0);
        expect(round(detail)).toBe(value('Utilidad neta'));
        expect(value('Utilidad neta')).toBe(820);
        const expenses = rows.filter((r) => r[0].startsWith('Menos gastos')).reduce((a, r) => a + r[1], 0);
        expect(round(value('Queda antes de gastos') + expenses)).toBe(820);
        // Balance: las partidas de "cómo cuadra con la utilidad" suman lo que quedó.
        const balance = pairs(workbook.getWorksheet('Balance')!);
        const from = balance.findIndex((r) => r[0].startsWith('Utilidad neta')), to = balance.findIndex((r) => r[0] === 'Igual a lo que quedó en el periodo');
        expect(round(balance.slice(from, to).reduce((a, r) => a + r[1], 0))).toBe(balance[to][1]);
        expect(balance.slice(from, to).map((r) => r[0]).join('|')).toContain('Más sueldos del periodo');
    });

    it('el Excel de caja y de comisiones lleva el destinatario del retiro y los recibos como números que suman', async () => {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(await buildReportXlsx(withWages('interno'))) as unknown as ArrayBuffer);
        const cells = (name: string) => { const all: unknown[][] = []; workbook.getWorksheet(name)!.eachRow((row) => all.push((row.values as unknown[]).slice(1))); return all; };
        const caja = cells('Caja');
        const header = caja.find((r) => r.includes('Retiro entregado a'))!;
        const col = header.indexOf('Retiro entregado a');
        const closes = caja.slice(caja.indexOf(header) + 1, caja.indexOf(header) + 4);
        expect(closes.map((r) => [r[col - 1], r[col] ?? null])).toEqual([[200, 'Sonia'], [300, 'Sin registrar'], [0, null]]);
        expect(caja.some((r) => r[0] === 'Sonia' && r[1] === 1 && r[2] === 200)).toBe(true);
        const comisiones = cells('Comisiones');
        const receipt = comisiones.find((r) => r[0] === 'LIQ-000003' && r.length >= 12)!;
        expect(receipt.slice(2)).toEqual([0, 100, 0, 0, 0, -150, 0, 0, 50, 0]);
        for (const id of ['LIQ-000001', 'LIQ-000002', 'LIQ-000003']) {
            const r = comisiones.find((x) => x[0] === id && x.length >= 12)!;
            expect(round((r.slice(2, 11) as number[]).reduce((a, v) => a + v, 0))).toBe(r[11]);
        }
    });
});
