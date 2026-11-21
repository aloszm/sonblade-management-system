// Excel del resumen de caja del día. Se arma en el navegador (o en la prueba) a partir de los datos que ya entregó la
// API autorizada (recepción: solo hoy y ayer), así que no hay otra ruta que revisar. Sin clientes, teléfonos ni costos.
import type { DaySummaryPayload } from '@/lib/cash/day-summary';
import { longDayLabel } from '@/lib/cash/day-summary-text';
import { spreadsheetSafe } from '@/lib/reports/full-report-xlsx';
import { formatTime } from '@/lib/utils/dates';

export const MONEY_FORMAT = '"$"#,##0.00;[Red]-"$"#,##0.00';
const HEAD_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3EBDD' } };
const HEAD_BORDER = { bottom: { style: 'medium' as const, color: { argb: 'FF7A5B32' } } };
const pesos = (cents: number) => cents / 100;

type Sheet = import('exceljs').Worksheet;
type Col = { header: string; kind: 'text' | 'money' | 'number' };

function header(sheet: Sheet, title: string, payload: DaySummaryPayload) {
    sheet.getCell(1, 1).value = spreadsheetSafe(`${payload.businessName} · Resumen de caja`);
    sheet.getCell(1, 1).font = { bold: true, size: 15 };
    sheet.getCell(2, 1).value = longDayLabel(payload.date);
    sheet.getCell(2, 1).font = { bold: true, color: { argb: 'FF5F5F66' } };
    sheet.getCell(3, 1).value = title;
    sheet.getCell(3, 1).font = { italic: true, color: { argb: 'FF5F5F66' } };
}

/** Escribe una tabla desde `startRow`; devuelve el siguiente renglón libre. `totalRow` va en negritas con línea arriba. */
function table(sheet: Sheet, startRow: number, cols: Col[], rows: (string | number | null)[][], widths: number[], totalRow?: (string | number | null)[]): number {
    let row = startRow;
    cols.forEach((c, i) => {
        const cell = sheet.getCell(row, i + 1);
        cell.value = c.header; cell.font = { bold: true }; cell.fill = HEAD_FILL; cell.border = HEAD_BORDER;
        cell.alignment = { vertical: 'middle', horizontal: c.kind === 'text' ? 'left' : 'right', wrapText: true };
        widths[i] = Math.max(widths[i] ?? 0, c.header.length + 2);
    });
    row++;
    const write = (cells: (string | number | null)[], bold: boolean) => {
        cells.forEach((v, i) => {
            const cell = sheet.getCell(row, i + 1);
            cell.value = typeof v === 'string' ? spreadsheetSafe(v) : v;
            if (typeof v === 'number') cell.numFmt = cols[i].kind === 'money' ? MONEY_FORMAT : '#,##0';
            if (bold) { cell.font = { bold: true }; cell.border = { top: { style: 'thin', color: { argb: 'FF9A9A9A' } } }; }
            const len = typeof v === 'number' ? (cols[i].kind === 'money' ? 14 : 8) : Math.min(60, String(v ?? '').length + 2);
            widths[i] = Math.max(widths[i] ?? 0, len);
        });
        row++;
    };
    rows.forEach((r) => write(r, false));
    if (totalRow) write(totalRow, true);
    return row + 1;
}

const applyWidths = (sheet: Sheet, widths: number[]) => widths.forEach((w, i) => { sheet.getColumn(i + 1).width = Math.min(60, Math.max(10, w)); });

export async function buildDaySummaryXlsx(payload: DaySummaryPayload): Promise<Uint8Array> {
    const ExcelJS = (await import('exceljs')).default;
    const { summary, cash } = payload;
    const t = summary.totals;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BarberOS';
    workbook.company = payload.businessName;
    workbook.title = `Resumen de caja ${payload.date}`;
    workbook.created = new Date();

    // ── Resumen
    {
        const sheet = workbook.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
        const widths: number[] = [];
        header(sheet, 'Todo lo cobrado ese día, por tipo y por forma de pago. Las propinas son del equipo, no ingreso de la barbería.', payload);
        let row = 5;
        row = table(sheet, row, [{ header: 'Concepto', kind: 'text' }, { header: 'Cantidad', kind: 'number' }, { header: 'Importe', kind: 'money' }], [
            ['Servicios', t.serviceCount, pesos(t.servicesCents)],
            ['   de los cuales cortes', t.cutCount, null],
            ['Productos (piezas)', t.productUnits, pesos(t.productsCents)],
            ['Ingreso de la barbería (servicios + productos)', null, pesos(t.businessIncomeCents)],
            ['Propinas (del equipo)', null, pesos(t.tipsCents)],
        ], widths, ['Total cobrado', summary.sales.paidCount, pesos(t.grandTotalCents)]);
        sheet.getCell(row - 1, 1).value = `Cantidad del total = ventas cobradas.`;
        sheet.getCell(row - 1, 1).font = { italic: true, color: { argb: 'FF5F5F66' } };
        row += 1;
        row = table(sheet, row, [
            { header: 'Forma de pago', kind: 'text' }, { header: 'Cobros', kind: 'number' }, { header: 'Ventas', kind: 'money' },
            { header: 'Propinas', kind: 'money' }, { header: 'Total', kind: 'money' },
        ], summary.methods.map((m) => [m.label, m.payments, pesos(m.salesCents), pesos(m.tipsCents), pesos(m.totalCents)]), widths,
        ['Total', summary.methods.reduce((s, m) => s + m.payments, 0), pesos(summary.methods.reduce((s, m) => s + m.salesCents, 0)),
            pesos(summary.methods.reduce((s, m) => s + m.tipsCents, 0)), pesos(summary.methods.reduce((s, m) => s + m.totalCents, 0))]);
        sheet.getCell(row, 1).value = `Ventas anuladas (no cuentan arriba): ${summary.sales.voidedCount}`;
        sheet.getCell(row, 3).value = pesos(summary.sales.voidedCents);
        sheet.getCell(row, 3).numFmt = MONEY_FORMAT;
        applyWidths(sheet, widths);
        sheet.getColumn(1).width = 46;
    }

    // ── Por persona
    {
        const sheet = workbook.addWorksheet('Por persona', { views: [{ showGridLines: false }] });
        const widths: number[] = [];
        header(sheet, 'Servicios a quien los hizo; productos a quien los vendió; propinas a quien las recibió.', payload);
        const sum = (pick: (p: (typeof summary.people)[number]) => number) => summary.people.reduce((s, p) => s + pick(p), 0);
        table(sheet, 5, [
            { header: 'Persona', kind: 'text' }, { header: 'Servicios', kind: 'number' }, { header: 'De los cuales cortes', kind: 'number' },
            { header: '$ Servicios', kind: 'money' }, { header: 'Piezas', kind: 'number' }, { header: '$ Productos', kind: 'money' },
            { header: '$ Propinas', kind: 'money' }, { header: 'Total', kind: 'money' },
        ], summary.people.map((p) => [p.name, p.serviceCount, p.cutCount, pesos(p.servicesCents), p.productUnits, pesos(p.productsCents), pesos(p.tipsCents), pesos(p.totalCents)]), widths,
        ['Total', sum((p) => p.serviceCount), sum((p) => p.cutCount), pesos(sum((p) => p.servicesCents)), sum((p) => p.productUnits),
            pesos(sum((p) => p.productsCents)), pesos(sum((p) => p.tipsCents)), pesos(sum((p) => p.totalCents))]);
        applyWidths(sheet, widths);
    }

    // ── Caja
    {
        const sheet = workbook.addWorksheet('Caja', { views: [{ showGridLines: false }] });
        const widths: number[] = [];
        header(sheet, cash.sessions.length === 0 ? 'No hubo caja abierta este día.' : cash.anyOpen ? 'La caja sigue abierta: el resumen puede cambiar.' : 'Cajas abiertas ese día.', payload);
        const time = (iso: string | null) => (iso ? formatTime(iso, payload.timezone) : '');
        let row = 5;
        if (cash.sessions.length > 0) {
            row = table(sheet, row, [
                { header: 'Caja', kind: 'text' }, { header: 'Abrió', kind: 'text' }, { header: 'Cerró', kind: 'text' }, { header: 'Fondo inicial', kind: 'money' },
                { header: 'Cobros en efectivo (neto)', kind: 'money' }, { header: 'Entradas', kind: 'money' }, { header: 'Salidas', kind: 'money' },
                { header: 'Esperado', kind: 'money' }, { header: 'Contado', kind: 'money' }, { header: 'Diferencia', kind: 'money' }, { header: 'Apartado', kind: 'money' },
            ], cash.sessions.map((s, i) => [
                `Caja ${i + 1} · ${time(s.openedAt)}${s.closedAt ? ` a ${time(s.closedAt)}` : ' (abierta)'}`,
                s.openedBy, s.closedBy ?? '', pesos(s.initialCents), pesos(s.cashFromSalesCents), pesos(s.manualInCents), pesos(s.manualOutCents),
                pesos(s.expectedCents), s.countedCents === null ? null : pesos(s.countedCents), s.differenceCents === null ? null : pesos(s.differenceCents),
                s.reserveCents === null ? null : pesos(s.reserveCents),
            ]), widths);
            const moves = cash.sessions.flatMap((s, i) => [
                ...s.manualIn.map((m) => [`Caja ${i + 1}`, m.tag, m.description, pesos(m.cents), null]),
                ...s.manualOut.map((m) => [`Caja ${i + 1}`, m.tag, m.description, null, pesos(m.cents)]),
            ]);
            sheet.getCell(row, 1).value = 'Entradas y salidas de efectivo (sin cobros ni propinas)';
            sheet.getCell(row, 1).font = { bold: true };
            row++;
            if (moves.length === 0) { sheet.getCell(row, 1).value = 'Sin entradas ni salidas.'; sheet.getCell(row, 1).font = { italic: true }; }
            else table(sheet, row, [{ header: 'Caja', kind: 'text' }, { header: 'Tipo', kind: 'text' }, { header: 'Motivo', kind: 'text' }, { header: 'Entrada', kind: 'money' }, { header: 'Salida', kind: 'money' }], moves, widths);
        }
        applyWidths(sheet, widths);
        sheet.getColumn(1).width = 34;
    }

    // ── Ventas del día
    {
        const sheet = workbook.addWorksheet('Ventas del día', { views: [{ showGridLines: false }] });
        const widths: number[] = [];
        header(sheet, 'Ventas cobradas. Sin datos de clientes.', payload);
        const rows = summary.saleLines.map((s) => [s.folio, s.paidAt ? formatTime(s.paidAt, payload.timezone) : '', s.servedBy, s.concept, pesos(s.amountCents), pesos(s.tipCents), s.methodLabel]);
        table(sheet, 5, [
            { header: 'Folio', kind: 'text' }, { header: 'Hora', kind: 'text' }, { header: 'Atendió', kind: 'text' }, { header: 'Concepto', kind: 'text' },
            { header: 'Importe', kind: 'money' }, { header: 'Propina', kind: 'money' }, { header: 'Forma de pago', kind: 'text' },
        ], rows, widths, summary.saleLines.length === 0 ? undefined
            : ['Total', null, null, null, pesos(summary.saleLines.reduce((s, l) => s + l.amountCents, 0)), pesos(summary.saleLines.reduce((s, l) => s + l.tipCents, 0)), null]);
        applyWidths(sheet, widths);
        sheet.getColumn(4).width = 46;
        sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: 5 }];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buffer as ArrayBuffer);
}
