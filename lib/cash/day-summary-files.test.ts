// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildDayCash, buildDaySummary, type DaySummaryPayload } from './day-summary';
import { buildDaySummaryPdf } from './day-summary-pdf';
import { buildDaySummaryXlsx } from './day-summary-xlsx';

const payload = (): DaySummaryPayload => {
    const summary = buildDaySummary({
        date: '2026-11-20',
        sales: [
            { id: 'a', folio: 'V2611-0001', status: 'paid', total_amount: 350, paid_at: '2026-11-20T20:05:00Z' },
            { id: 'b', folio: 'V2611-0002', status: 'paid', total_amount: 200, paid_at: '2026-11-20T21:10:00Z' },
            { id: 'x', folio: 'V2611-0003', status: 'refunded', total_amount: 150, paid_at: '2026-11-20T22:00:00Z' },
        ],
        items: [
            { sale_id: 'a', item_type: 'service', item_name_snapshot: 'Corte adulto', service_id: 'c', quantity: 1, line_total: 200, employee_id: 'deya', commission_employee_id: null },
            { sale_id: 'a', item_type: 'product', item_name_snapshot: '=Cera', service_id: null, quantity: 1, line_total: 150, employee_id: 'deya', commission_employee_id: 'emi' },
            { sale_id: 'b', item_type: 'service', item_name_snapshot: 'Barba', service_id: 'b', quantity: 1, line_total: 200, employee_id: 'dani', commission_employee_id: null },
        ],
        payments: [{ sale_id: 'a', method: 'cash', amount: 350, status: 'confirmed' }, { sale_id: 'b', method: 'cash', amount: 50, status: 'confirmed' }, { sale_id: 'b', method: 'card', amount: 150, status: 'confirmed' }],
        tips: [{ sale_id: 'a', employee_id: 'deya', amount: 30, method: 'cash', status: 'generated' }, { sale_id: 'b', employee_id: 'dani', amount: 20, method: 'card', status: 'generated' }],
        employees: [{ id: 'deya', display_name: 'Deya Pérez' }, { id: 'dani', display_name: 'Dani López' }, { id: 'emi', display_name: 'Emi Ruiz' }],
        cutServiceIds: ['c'],
    });
    const cash = buildDayCash(
        [{ id: 's', status: 'closed', opening_cash: 500, counted_cash: 1000, difference_amount: 0, opened_by: 'u1', opened_at: '2026-11-20T15:00:00Z', closed_at: '2026-11-21T01:00:00Z', closed_by: 'u2', reserve_amount: 400, float_left: 500, withdrawn_amount: 0 }],
        [
            { cash_session_id: 's', amount: 400, method: 'cash', movement_type: 'sale_payment', direction: 'in' },
            { cash_session_id: 's', amount: 30, method: 'cash', movement_type: 'deposit', direction: 'in', sale_id: 'a' },
            { cash_session_id: 's', amount: 50, method: 'cash', movement_type: 'expense', direction: 'out', description: 'Agua' },
            { cash_session_id: 's', amount: 120, method: 'cash', movement_type: 'deposit', direction: 'in', description: 'Cambio' },
        ],
        new Map([['u1', 'Emi'], ['u2', 'Dago']]),
    );
    return { date: '2026-11-20', timezone: 'America/Mexico_City', businessName: 'Gallo 4:20', today: '2026-11-21', minDay: null, summary, cash };
};

type Cell = string | number | null | undefined;
async function load(bytes: Uint8Array) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const rows = (name: string): Cell[][] => {
        const ws = wb.getWorksheet(name)!;
        const out: Cell[][] = [];
        ws.eachRow({ includeEmpty: false }, (row) => { out.push((row.values as Cell[]).slice(1)); });
        return out;
    };
    return { wb, rows };
}
const find = (rows: Cell[][], first: string) => rows.find((r) => r[0] === first)!;

describe('Excel del resumen de caja', () => {
    it('trae las cuatro hojas, con encabezado de negocio y fecha', async () => {
        const { wb, rows } = await load(await buildDaySummaryXlsx(payload()));
        expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Por persona', 'Caja', 'Ventas del día']);
        for (const w of wb.worksheets) {
            const top = rows(w.name);
            expect(top[0][0]).toBe('Gallo 4:20 · Resumen de caja');
            expect(top[1][0]).toBe('viernes 20 de noviembre de 2026');
        }
    });

    it('«Resumen»: los totales son los de la función pura, como número', async () => {
        const p = payload();
        const t = p.summary.totals;
        const { rows, wb } = await load(await buildDaySummaryXlsx(p));
        const r = rows('Resumen');
        expect(find(r, 'Servicios')).toEqual(['Servicios', t.serviceCount, t.servicesCents / 100]);
        expect(find(r, 'Productos (piezas)')).toEqual(['Productos (piezas)', t.productUnits, t.productsCents / 100]);
        expect(find(r, 'Propinas (del equipo)')[2]).toBe(t.tipsCents / 100);
        expect(find(r, 'Total cobrado')).toEqual(['Total cobrado', 2, t.grandTotalCents / 100]);
        expect(t.grandTotalCents / 100).toBe(600);
        const efectivo = find(r, 'Efectivo');
        const tarjeta = find(r, 'Tarjeta');
        expect(efectivo.slice(1)).toEqual([2, 400, 30, 430]);
        expect(tarjeta.slice(1)).toEqual([1, 150, 20, 170]);
        expect(find(r, 'Total').slice(1)).toEqual([3, 550, 50, 600]);
        const voided = r.find((x) => String(x[0]).startsWith('Ventas anuladas'))!;
        expect([voided[0], voided[2]]).toEqual(['Ventas anuladas (no cuentan arriba): 1', 150]);
        // Formato de moneda en los importes.
        const ws = wb.getWorksheet('Resumen')!;
        const cell = ws.getCell('C6');
        expect(typeof cell.value).toBe('number');
        expect(String(cell.numFmt)).toContain('"$"#,##0.00');
    });

    it('«Por persona» cuadra con el total del día', async () => {
        const p = payload();
        const { rows } = await load(await buildDaySummaryXlsx(p));
        const r = rows('Por persona');
        expect(r[3]).toEqual(['Persona', 'Servicios', 'De los cuales cortes', '$ Servicios', 'Piezas', '$ Productos', '$ Propinas', 'Total']);
        expect(find(r, 'Deya Pérez')).toEqual(['Deya Pérez', 1, 1, 200, 0, 0, 30, 230]);
        expect(find(r, 'Dani López')).toEqual(['Dani López', 1, 0, 200, 0, 0, 20, 220]);
        expect(find(r, 'Emi Ruiz')).toEqual(['Emi Ruiz', 0, 0, 0, 1, 150, 0, 150]);
        expect(find(r, 'Total')[7]).toBe(p.summary.totals.grandTotalCents / 100);
    });

    it('«Caja»: sesión con esperado/contado/diferencia/apartado y sus movimientos manuales', async () => {
        const { rows } = await load(await buildDaySummaryXlsx(payload()));
        const r = rows('Caja');
        const head = r.find((x) => x[0] === 'Caja')!;
        expect(head).toEqual(['Caja', 'Abrió', 'Cerró', 'Fondo inicial', 'Cobros en efectivo (neto)', 'Entradas', 'Salidas', 'Esperado', 'Contado', 'Diferencia', 'Apartado']);
        const s = r.find((x) => String(x[0]).startsWith('Caja 1'))!;
        // fondo 500 + cobros 430 + entradas 120 − salidas 50 = 1,000
        expect(s.slice(1)).toEqual(['Emi', 'Dago', 500, 430, 120, 50, 1000, 1000, 0, 400]);
        const agua = r.find((x) => x[2] === 'Agua')!;
        expect([agua[0], agua[1], agua[4]]).toEqual(['Caja 1', 'Gasto', 50]);
        expect(r.find((x) => x[2] === 'Cambio')?.[1]).toBe('Entrada');
    });

    it('«Ventas del día»: sin clientes ni costos; un renglón por venta cobrada, con total', async () => {
        const p = payload();
        const { rows } = await load(await buildDaySummaryXlsx(p));
        const r = rows('Ventas del día');
        expect(r[3]).toEqual(['Folio', 'Hora', 'Atendió', 'Concepto', 'Importe', 'Propina', 'Forma de pago']);
        expect(r.filter((x) => String(x[0]).startsWith('V2611'))).toHaveLength(2); // la anulada no aparece
        const a = find(r, 'V2611-0001');
        expect(a[2]).toBe('Deya y Emi');
        expect(a[3]).toBe('Corte adulto, =Cera');
        expect(a.slice(4)).toEqual([350, 30, 'Efectivo']);
        expect(find(r, 'V2611-0002')[6]).toBe('Efectivo 50 + Tarjeta 150');
        expect(find(r, 'Total').slice(4, 6)).toEqual([550, 50]);
        expect(JSON.stringify(r.slice(3))).not.toMatch(/cliente|tel[eé]fono|costo|utilidad|comisi/i);
    });
});

describe('PDF del resumen de caja', () => {
    it('genera un PDF de una página carta con peso > 0', async () => {
        const bytes = await buildDaySummaryPdf(payload());
        expect(bytes.byteLength).toBeGreaterThan(1000);
        const text = Buffer.from(bytes).toString('latin1');
        expect(text.startsWith('%PDF-')).toBe(true);
        expect(text).toMatch(/\/Count 1\b/);
        expect(text).toMatch(/MediaBox \[0 0 612\.? 792\.?\]/);
    });
    it('un día sin ventas ni caja también se genera', async () => {
        const empty: DaySummaryPayload = { ...payload(), summary: buildDaySummary({ date: '2026-11-20', sales: [], items: [], payments: [], tips: [], employees: [], cutServiceIds: [] }), cash: buildDayCash([], [], new Map()) };
        expect((await buildDaySummaryPdf(empty)).byteLength).toBeGreaterThan(1000);
    });
});
