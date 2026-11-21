// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildDayCash, buildDaySummary, dayCashFromFlows, type DaySummaryPayload } from './day-summary';
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
        [{ id: 's', status: 'closed', opening_cash: 500, counted_cash: 1000, difference_amount: 0, opened_by: 'u1', opened_at: '2026-11-20T15:00:00Z', closed_at: '2026-11-21T01:00:00Z', closed_by: 'u2', reserve_amount: 400, float_left: 500, withdrawn_amount: 100, withdrawal_delivered_to: 'Alonso' }],
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

    it('«Caja»: el camino del efectivo con los mismos renglones de la pantalla, como número', async () => {
        const p = payload();
        const f = p.cash.sessions[0];
        const { rows } = await load(await buildDaySummaryXlsx(p));
        const r = rows('Caja');
        expect(r.find((x) => String(x[0]).startsWith('Caja 1 ·'))![0]).toContain('Abrió Emi · Cerró Dago');
        expect(r.find((x) => x[0] === 'Concepto')).toEqual(['Concepto', 'Movimientos', 'Importe']);
        // fondo 500 + cobros 400 + propinas 30 + otras entradas 120 − gastos 50 = 1,000
        expect(find(r, 'Fondo con que se abrió')[2]).toBe(500);
        expect(find(r, '(+) Cobros en efectivo').slice(1)).toEqual([1, 400]);
        expect(find(r, '(+) Propinas cobradas en efectivo').slice(1)).toEqual([1, 30]);
        expect(find(r, '(+) Otras entradas (con motivo)').slice(1)).toEqual([1, 120]);
        // «Gastos pagados de la caja» aparece y sus salidas van en negativo
        expect(find(r, '(−) Gastos pagados de la caja').slice(1)).toEqual([1, -50]);
        expect(find(r, '(−) Pagos al equipo').slice(1)).toEqual([0, 0]);
        expect(find(r, '(=) Efectivo que debe haber')[2]).toBe(f.expectedCents / 100);
        expect(f.expectedCents / 100).toBe(1000);
        expect(find(r, 'Efectivo contado al cerrar')[2]).toBe(1000);
        expect(find(r, 'Diferencia (cuadra)')[2]).toBe(0);
        // ¿A dónde se fue lo contado? fondo + apartado + retiro = contado
        expect(find(r, 'Se deja de fondo para mañana')[2]).toBe(500);
        expect(find(r, 'Se aparta al sobre «Apartado»')[2]).toBe(400);
        expect(find(r, 'Se retira (entregado a: Alonso)')[2]).toBe(100);
        expect(find(r, 'Total (debe ser igual a lo contado)')[2]).toBe(1000);
        expect(r.some((x) => String(x[0]).startsWith('Tarjeta $0 y transferencia $0 no están en la caja.'))).toBe(true);
        // detalle de movimientos
        const agua = r.find((x) => x[3] === 'Agua')!;
        expect([agua[0], agua[1], agua[5]]).toEqual(['Caja 1', 'Gastos pagados de la caja', -50]);
        expect(r.find((x) => x[3] === 'Cambio')?.[1]).toBe('Otras entradas (con motivo)');
    });

    it('«Caja»: con varias cajas pone el total del día arriba y cada caja con su camino', async () => {
        const p = payload();
        const other = { ...p.cash.sessions[0], id: 's2', openedAt: '2026-11-20T23:00:00Z', lines: p.cash.sessions[0].lines };
        const two = dayCashFromFlows([p.cash.sessions[0], other], { envelopeCents: 25000, bankCents: 5000, count: 2 });
        const { rows } = await load(await buildDaySummaryXlsx({ ...p, cash: two }));
        const r = rows('Caja');
        expect(String(r.find((x) => String(x[0]).startsWith('Total del día'))![0])).toContain('2 cajas');
        expect(r.filter((x) => String(x[0]).startsWith('Caja ') && String(x[0]).includes('Abrió'))).toHaveLength(2);
        expect(r.find((x) => String(x[0]).startsWith('Gastos pagados del sobre o del banco'))!.slice(1, 3)).toEqual([2, 300]);
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
    const busy = (): DaySummaryPayload => {
        const base = payload();
        const people = ['deya', 'dani', 'emi', 'dago', 'sonia', 'lucia', 'alonso'];
        const summary = buildDaySummary({
            date: '2026-11-20',
            sales: people.map((id, i) => ({ id: `s${i}`, folio: `V-${i}`, status: 'paid', total_amount: 200, paid_at: `2026-11-20T${16 + i}:00:00Z` })),
            items: people.map((id, i) => ({ sale_id: `s${i}`, item_type: 'service' as const, item_name_snapshot: 'Corte', service_id: 'c', quantity: 1, line_total: 200, employee_id: id, commission_employee_id: null })),
            payments: people.map((_, i) => ({ sale_id: `s${i}`, method: i % 2 ? 'card' : 'cash', amount: 200, status: 'confirmed' })),
            tips: [], employees: people.map((id) => ({ id, display_name: id })), cutServiceIds: ['c'],
        });
        const row = { id: 's', status: 'closed' as const, opening_cash: 500, counted_cash: 6100, difference_amount: 0, expected_cash: 6100, opened_by: 'u1', opened_at: '2026-11-20T15:00:00Z', closed_at: '2026-11-21T01:00:00Z', closed_by: 'u2', float_left: 500, reserve_amount: 600, withdrawn_amount: 5000, withdrawal_delivered_to: 'Alonso (entrega del cierre)' };
        const mvs = [
            { cash_session_id: 's', amount: 7050, method: 'cash', movement_type: 'sale_payment', direction: 'in' as const, sale_id: 'a' },
            { cash_session_id: 's', amount: 160, method: 'cash', movement_type: 'deposit', direction: 'in' as const, sale_id: 'a' },
            { cash_session_id: 's', amount: 200, method: 'cash', movement_type: 'deposit', direction: 'in' as const, description: 'Cambio' },
            { cash_session_id: 's', amount: 20, method: 'cash', movement_type: 'deposit', direction: 'in' as const, description: 'Cancelación de adelanto · Deya: error' },
            { cash_session_id: 's', amount: 350, method: 'cash', movement_type: 'expense', direction: 'out' as const, expense_id: 'g', description: 'Agua' },
            { cash_session_id: 's', amount: 1000, method: 'cash', movement_type: 'withdrawal', direction: 'out' as const, commission_settlement_id: 'p', description: 'Pago de comisiones · P2647-01' },
            { cash_session_id: 's', amount: 200, method: 'cash', movement_type: 'withdrawal', direction: 'out' as const, description: 'Adelanto · Deya: x' },
            { cash_session_id: 's', amount: 100, method: 'cash', movement_type: 'refund', direction: 'out' as const, sale_id: 'x', description: 'Reembolso de venta' },
            { cash_session_id: 's', amount: 40, method: 'cash', movement_type: 'refund', direction: 'out' as const, sale_id: 'x', description: 'Devolución de propina' },
            { cash_session_id: 's', amount: 100, method: 'cash', movement_type: 'withdrawal', direction: 'out' as const, description: 'Al banco' },
        ];
        return { ...base, summary, cash: buildDayCash([row], mvs, new Map([['u1', 'Emi'], ['u2', 'Dago']]), { otherExpenses: { envelopeCents: 120000, bankCents: 30000, count: 4 } }) };
    };
    it('una caja con todos los renglones, 7 personas y gastos del sobre sigue cabiendo en UNA página', async () => {
        const p = busy();
        expect(p.cash.sessions[0].lines.filter((l) => l.count > 0).length).toBeGreaterThanOrEqual(9);
        const text = Buffer.from(await buildDaySummaryPdf(p)).toString('latin1');
        expect(text).toMatch(/\/Count 1\b/);
    });
    it('con 2 y 3 cajas resume y cabe en una página; con 5 también', async () => {
        const p = busy();
        for (const count of [2, 3, 5]) {
            const flows = Array.from({ length: count }, (_, i) => ({ ...p.cash.sessions[0], id: `s${i}`, openedAt: `2026-11-20T${15 + i}:00:00Z` }));
            const text = Buffer.from(await buildDaySummaryPdf({ ...p, cash: dayCashFromFlows(flows, null) })).toString('latin1');
            expect(text).toMatch(/\/Count 1\b/);
        }
    });
    it('un día sin ventas ni caja también se genera', async () => {
        const empty: DaySummaryPayload = { ...payload(), summary: buildDaySummary({ date: '2026-11-20', sales: [], items: [], payments: [], tips: [], employees: [], cutServiceIds: [] }), cash: buildDayCash([], [], new Map()) };
        expect((await buildDaySummaryPdf(empty)).byteLength).toBeGreaterThan(1000);
    });
});
