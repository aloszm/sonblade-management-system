// Excel del reporte completo: una hoja por sección, con importes y fechas como valores reales
// (para sumar, filtrar y ordenar). Las fechas y horas están en la zona horaria del negocio.
import {
    formatCell, percentChange, zonedParts,
    type Cell, type Column, type ReportKpis, type ReportModel, type ReportTable,
} from './full-report';

/**
 * Evita que Excel interprete una celda de texto como fórmula (=, +, -, @, tabulador o retorno),
 * igual que lib/utils/csv.ts: se antepone una comilla simple.
 */
export function spreadsheetSafe(value: string): string {
    return /^[=+\-@\t\r]/.test(value) && Number.isNaN(Number(value)) ? `'${value}` : value;
}

const MONEY_FORMAT = '"$"#,##0.00;[Red]-"$"#,##0.00';
const NUMBER_FORMATS: Record<string, string | undefined> = {
    money: MONEY_FORMAT,
    datetime: 'dd/mm/yyyy hh:mm',
    datetime_s: 'dd/mm/yyyy hh:mm:ss',
    date: 'dd/mm/yyyy',
};

/** Valor de la celda de Excel: la hora de pared del negocio escrita como fecha, sin desplazar zonas. */
export function excelValue(column: Column, cell: Cell, timeZone: string): string | number | Date | null {
    if (cell === null || cell === undefined || cell === '') return null;
    if (typeof cell === 'string') {
        const isDateLike = column.type === 'date' || column.type === 'datetime' || column.type === 'datetime_s';
        const numericLike = column.type === 'money' || column.type === 'number';
        if (isDateLike && /^\d{4}-\d{2}-\d{2}/.test(cell)) {
            if (column.type === 'date') {
                const [y, m, d] = cell.slice(0, 10).split('-').map(Number);
                return new Date(Date.UTC(y, m - 1, d));
            }
            const p = zonedParts(cell, timeZone);
            return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)));
        }
        if (numericLike && !Number.isNaN(Number(cell))) return Number(cell);
        return spreadsheetSafe(cell);
    }
    return cell;
}

type Sheet = import('exceljs').Worksheet;

function addTable(sheet: Sheet, table: ReportTable, tz: string, startRow: number, widths: number[]): { next: number; headerRow: number; lastRow: number } {
    let row = startRow;
    if (table.title) {
        sheet.getCell(row, 1).value = spreadsheetSafe(table.title);
        sheet.getCell(row, 1).font = { bold: true, size: 11 };
        row++;
    }
    const headerRow = row;
    table.columns.forEach((c, i) => {
        const cell = sheet.getCell(row, i + 1);
        cell.value = c.header;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EBDD' } };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF7A5B32' } } };
        cell.alignment = { vertical: 'middle', horizontal: c.type === 'money' || c.type === 'number' ? 'right' : 'left', wrapText: true };
        widths[i] = Math.max(widths[i] ?? 0, c.header.length + 2);
    });
    row++;
    if (table.rows.length === 0) {
        sheet.getCell(row, 1).value = table.empty;
        sheet.getCell(row, 1).font = { italic: true, color: { argb: 'FF5F5F66' } };
        return { next: row + 2, headerRow, lastRow: headerRow };
    }
    const writeRow = (cells: Cell[], bold: boolean) => {
        cells.forEach((value, i) => {
            const column = table.columns[i];
            const cell = sheet.getCell(row, i + 1);
            cell.value = excelValue(column, value, tz);
            const fmt = NUMBER_FORMATS[column.type];
            if (fmt && typeof cell.value !== 'string') cell.numFmt = fmt;
            if (bold) cell.font = { bold: true };
            if (bold) cell.border = { top: { style: 'thin', color: { argb: 'FF9A9A9A' } } };
            const text = formatCell(column, value, tz);
            widths[i] = Math.max(widths[i] ?? 0, Math.min(60, text.length + 2));
        });
        row++;
    };
    table.rows.forEach((r) => writeRow(r, false));
    const lastDataRow = row - 1;
    if (table.total) writeRow(table.total, true);
    return { next: row + 2, headerRow, lastRow: lastDataRow };
}

function addKpis(sheet: Sheet, block: ReportKpis, startRow: number, widths: number[]): number {
    let row = startRow;
    ['Concepto', 'Este periodo', 'Periodo anterior', 'Cambio'].forEach((h, i) => {
        const cell = sheet.getCell(row, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EBDD' } };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF7A5B32' } } };
        cell.alignment = { horizontal: i === 0 ? 'left' : 'right' };
        widths[i] = Math.max(widths[i] ?? 0, h.length + 2);
    });
    row++;
    for (const item of block.items) {
        sheet.getCell(row, 1).value = item.label;
        sheet.getCell(row, 2).value = item.value;
        sheet.getCell(row, 3).value = item.previous;
        const d = percentChange(item.value, item.previous);
        sheet.getCell(row, 4).value = d === null ? 'Sin datos para comparar' : d / 100;
        if (d !== null) sheet.getCell(row, 4).numFmt = '+0.0%;-0.0%;0.0%';
        if (item.format === 'money') { sheet.getCell(row, 2).numFmt = MONEY_FORMAT; sheet.getCell(row, 3).numFmt = MONEY_FORMAT; }
        widths[0] = Math.max(widths[0] ?? 0, item.label.length + 2);
        widths[1] = Math.max(widths[1] ?? 0, 16);
        widths[2] = Math.max(widths[2] ?? 0, 18);
        widths[3] = Math.max(widths[3] ?? 0, 14);
        row++;
    }
    return row + 1;
}

/** Genera el libro de Excel del reporte y lo entrega como bytes. */
export async function buildReportXlsx(model: ReportModel): Promise<Uint8Array> {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = model.generatedBy;
    workbook.lastModifiedBy = model.generatedBy;
    workbook.created = new Date(model.generatedAt);
    workbook.modified = new Date(model.generatedAt);
    workbook.title = `${model.title}${model.folio ? ` · ${model.folio}` : ''}`;
    workbook.subject = `${model.businessName} · ${model.audience}`;
    workbook.keywords = `${model.folio ?? ''} ${model.code?.slice(0, 16) ?? ''}`.trim();
    workbook.company = model.businessName;

    for (const section of model.sections) {
        const sheet = workbook.addWorksheet(section.sheet, { views: [{ showGridLines: false }] });
        const widths: number[] = [];
        sheet.getCell(1, 1).value = `${section.number}. ${section.title}`;
        sheet.getCell(1, 1).font = { bold: true, size: 15 };
        sheet.getCell(2, 1).value = section.explain;
        sheet.getCell(2, 1).font = { italic: true, color: { argb: 'FF5F5F66' } };
        sheet.getCell(3, 1).value = `${model.businessName} · ${model.period.label} · ${model.folio ? `Folio ${model.folio}` : 'Borrador sin folio'}`;
        sheet.getCell(3, 1).font = { color: { argb: 'FF5F5F66' } };
        let row = 5;
        const tableBlocks = section.blocks.filter((b) => b.kind === 'table');
        let frozen: { headerRow: number; lastRow: number; columns: number } | null = null;
        for (const block of section.blocks) {
            if (block.kind === 'text') {
                const cell = sheet.getCell(row, 1);
                cell.value = spreadsheetSafe(block.text);
                cell.alignment = { wrapText: true, vertical: 'top' };
                cell.font = block.tone === 'note' ? { italic: true, color: { argb: 'FF5F5F66' } } : {};
                sheet.mergeCells(row, 1, row, 8);
                sheet.getRow(row).height = Math.max(18, Math.ceil(block.text.length / 120) * 16);
                row += 2;
            } else if (block.kind === 'kpis') {
                row = addKpis(sheet, block, row, widths);
            } else if (block.kind === 'table') {
                const result = addTable(sheet, block, model.timezone, row, widths);
                if (tableBlocks.length === 1 && block.rows.length > 0) frozen = { headerRow: result.headerRow, lastRow: result.lastRow, columns: block.columns.length };
                row = result.next;
            }
        }
        // Las gráficas del PDF y de la pantalla salen de las mismas tablas, por eso no se repiten aquí.
        widths.forEach((w, i) => { sheet.getColumn(i + 1).width = Math.max(10, Math.min(60, w)); });
        if (frozen) {
            sheet.views = [{ showGridLines: false, state: 'frozen', ySplit: frozen.headerRow }];
            sheet.autoFilter = { from: { row: frozen.headerRow, column: 1 }, to: { row: frozen.lastRow, column: frozen.columns } };
        }
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new Uint8Array(buffer as ArrayBuffer);
}
