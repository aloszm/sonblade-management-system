// Excel del resumen de caja del día. Se arma en el navegador (o en la prueba) a partir de los datos que ya entregó la
// API autorizada (recepción: solo hoy y ayer), así que no hay otra ruta que revisar. Sin clientes, teléfonos ni costos.
import { openingGapText, visibleLines } from '@/lib/cash/cash-flow';
import type { DaySummaryPayload } from '@/lib/cash/day-summary';
import { longDayLabel, money } from '@/lib/cash/day-summary-text';
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

    // ── Caja: el camino del efectivo de cada caja, con los mismos renglones de la pantalla
    {
        const sheet = workbook.addWorksheet('Caja', { views: [{ showGridLines: false }] });
        const widths: number[] = [];
        header(sheet, cash.sessions.length === 0 ? 'No hubo caja abierta este día.' : cash.anyOpen ? 'La caja sigue abierta: el resumen puede cambiar.' : 'El camino del efectivo: fondo + entradas − salidas = efectivo que debe haber; y a dónde se fue lo contado.', payload);
        const time = (iso: string | null) => (iso ? formatTime(iso, payload.timezone) : '');
        let row = 5;
        const bold = (r: number, c: number) => { sheet.getCell(r, c).font = { bold: true }; };
        const put = (r: number, label: string, count: number | null, value: number | null, opts: { bold?: boolean; italic?: boolean } = {}) => {
            sheet.getCell(r, 1).value = spreadsheetSafe(label);
            if (count !== null) { sheet.getCell(r, 2).value = count; sheet.getCell(r, 2).numFmt = '#,##0'; }
            if (value !== null) { sheet.getCell(r, 3).value = value; sheet.getCell(r, 3).numFmt = MONEY_FORMAT; }
            if (opts.bold) [1, 2, 3].forEach((c) => { bold(r, c); sheet.getCell(r, c).border = { top: { style: 'thin', color: { argb: 'FF9A9A9A' } } }; });
            if (opts.italic) sheet.getCell(r, 1).font = { italic: true, color: { argb: 'FF5F5F66' } };
            widths[0] = Math.max(widths[0] ?? 0, Math.min(60, label.length + 2));
        };
        const heading = (r: number, text: string) => { sheet.getCell(r, 1).value = spreadsheetSafe(text); bold(r, 1); sheet.getCell(r, 1).font = { bold: true, size: 12, color: { argb: 'FF7A5B32' } }; };
        const flowRows = (f: (typeof cash.sessions)[number]) => visibleLines(f, 'in').concat(visibleLines(f, 'out'));
        const signed = (l: { side: 'in' | 'out'; cents: number }) => (l.side === 'in' || l.cents === 0 ? pesos(l.cents) : -pesos(l.cents));

        if (cash.sessions.length > 1) {
            const tl = cash.total.lines.filter((l) => l.always || l.count > 0 || l.cents !== 0);
            heading(row++, `Total del día · ${cash.sessions.length} cajas (sin fondo ni esperado: cada caja arrastra el suyo)`);
            const totalRows: (string | number | null)[][] = tl.map((l) => [`${l.side === 'in' ? '(+)' : '(−)'} ${l.label}`, l.count, signed(l)]);
            totalRows.push(['Diferencia de las cajas cerradas', null, pesos(cash.total.differenceCents)],
                ['Apartado al sobre', null, pesos(cash.total.reserveCents)], ['Retirado', null, pesos(cash.total.withdrawnCents)]);
            row = table(sheet, row, [{ header: 'Concepto', kind: 'text' }, { header: 'Movimientos', kind: 'number' }, { header: 'Importe', kind: 'money' }], totalRows, widths);
        }

        cash.sessions.forEach((f, i) => {
            heading(row++, `Caja ${i + 1} · ${time(f.openedAt)}${f.closedAt ? ` a ${time(f.closedAt)}` : ' (abierta)'} · Abrió ${f.openedBy}${f.closedBy ? ` · Cerró ${f.closedBy}` : ''}`);
            row = table(sheet, row, [{ header: 'Concepto', kind: 'text' }, { header: 'Movimientos', kind: 'number' }, { header: 'Importe', kind: 'money' }], [
                ['Fondo con que se abrió', null, pesos(f.openingCents)],
                ...flowRows(f).map((l) => [`${l.side === 'in' ? '(+)' : '(−)'} ${l.label}`, l.count, signed(l)]),
            ], widths) - 1;
            // El renglón de «efectivo que debe haber» queda pegado a la tabla, con línea arriba.
            put(row, f.open ? '(=) Efectivo que debe haber ahora' : '(=) Efectivo que debe haber', null, pesos(f.expectedCents), { bold: true });
            row++;
            if (openingGapText(f)) put(row++, `Apertura: ${openingGapText(f)}`, null, null, { italic: true });
            if (!f.open && f.countedCents !== null) put(row++, 'Efectivo contado al cerrar', null, pesos(f.countedCents));
            if (!f.open && f.differenceCents !== null) put(row++, f.differenceCents === 0 ? 'Diferencia (cuadra)' : f.differenceCents > 0 ? 'Diferencia (sobrante)' : 'Diferencia (faltante)', null, pesos(f.differenceCents));
            if (!f.open && f.differenceCents) put(row++, f.differenceReason ? `Motivo de la diferencia: ${f.differenceReason}` : 'Motivo de la diferencia: sin motivo registrado', null, null, { italic: !f.differenceReason });
            row++;
            if (f.split) {
                heading(row++, f.split.proposed ? 'Al cerrar se propone (propuesta)' : '¿A dónde se fue lo contado?');
                put(row++, 'Se deja de fondo para mañana', null, pesos(f.split.floatCents));
                put(row++, `Se aparta al sobre «${f.split.reserveLabel}»`, null, pesos(f.split.reserveCents));
                put(row++, `Se retira${f.split.deliveredTo ? ` (entregado a: ${f.split.deliveredTo})` : ''}`, null, pesos(f.split.withdrawnCents));
                put(row++, f.split.proposed ? 'Total propuesto' : 'Total (debe ser igual a lo contado)', null, pesos(f.split.floatCents + f.split.reserveCents + f.split.withdrawnCents), { bold: true });
                if (f.split.floatNote) put(row++, `Se dejó menos del fondo recomendado: ${f.split.floatNote}`, null, null, { italic: true });
            } else if (!f.open) put(row++, 'Sin reparto guardado (caja cerrada antes del cierre guiado).', null, null, { italic: true });
            put(row++, `Tarjeta ${money(f.cardCents)} y transferencia ${money(f.transferCents)} no están en la caja.`, null, null, { italic: true });
            if (!f.check.ok) {
                f.check.issues.forEach((t) => { sheet.getCell(row, 1).value = spreadsheetSafe(`ATENCIÓN: ${t}`); sheet.getCell(row, 1).font = { bold: true, color: { argb: 'FFB91C1C' } }; row++; });
            }
            row++;
        });
        if (cash.sessions.length > 0) {
            if (cash.otherExpenses) {
                put(row++, 'Gastos pagados del sobre o del banco (no salen de la caja)', cash.otherExpenses.count, pesos(cash.otherExpenses.envelopeCents + cash.otherExpenses.bankCents));
                row++;
            }
            // Detalle: cada movimiento de efectivo, con hora, motivo y quién lo registró. Entradas positivas, salidas negativas.
            heading(row++, 'Detalle de los movimientos de efectivo');
            const moves = cash.sessions.flatMap((f, i) => flowRows(f).flatMap((l) => l.items.map((it) => [
                `Caja ${i + 1}`, l.label, it.at ? time(it.at) : '', it.description, it.by ?? '', l.side === 'in' ? pesos(it.cents) : -pesos(it.cents),
            ])));
            if (moves.length === 0) { sheet.getCell(row, 1).value = 'Sin movimientos de efectivo.'; sheet.getCell(row, 1).font = { italic: true }; }
            else table(sheet, row, [
                { header: 'Caja', kind: 'text' }, { header: 'Renglón', kind: 'text' }, { header: 'Hora', kind: 'text' },
                { header: 'Motivo', kind: 'text' }, { header: 'Registró', kind: 'text' }, { header: 'Monto', kind: 'money' },
            ], moves, widths);
        }
        applyWidths(sheet, widths);
        sheet.getColumn(1).width = 50;
        sheet.getColumn(2).width = 30;
        sheet.getColumn(4).width = 36;
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
