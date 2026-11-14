export type CsvCell = string | number | boolean | null | undefined;

/** Escapa una celda: comillas dobles duplicadas y entre comillas si lleva coma, comillas o salto de línea. */
export function csvCell(value: CsvCell): string {
    const text = value === null || value === undefined ? '' : String(value);
    // Evita que Excel interprete una celda de texto como fórmula (=, +, -, @).
    const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Texto CSV con BOM UTF-8 para que Excel muestre bien los acentos. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
    const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
    return `﻿${lines.join('\r\n')}\r\n`;
}

/** Descarga un CSV desde el navegador. */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
    const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}
