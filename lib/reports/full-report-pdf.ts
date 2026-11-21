// PDF del reporte completo: papel blanco, texto negro, detalles dorados. Las gráficas se dibujan
// con primitivas de jsPDF (barras y líneas), sin capturas de pantalla.
import {
    isNumericColumn, percentChange, percentText, tableTexts, money, plainNumber,
    AUDIENCE_LABELS, AUDIENCE_NOTES, type ReportBars, type ReportHero, type ReportKpis, type ReportModel, type ReportSection,
    type ReportStack, type ReportTable, type StackColor, type Tone,
} from './full-report';

type Doc = import('jspdf').jsPDF;
type RGB = [number, number, number];

const BRONZE: RGB = [122, 91, 50];
const BRONZE_SOFT: RGB = [243, 235, 221];
const INK: RGB = [20, 20, 22];
const MUTED: RGB = [95, 95, 102];
const RULE: RGB = [222, 220, 214];
const GOOD: RGB = [21, 128, 61];
const BAD: RGB = [185, 28, 28];
const BAD_SOFT: RGB = [253, 236, 236];
const PANEL: RGB = [249, 248, 245];
const TONE: Record<Tone, RGB> = { good: GOOD, bad: BAD, neutral: INK };
const STACK: Record<StackColor, RGB> = { commission: BRONZE, payroll: [74, 55, 30], cost: [196, 164, 116], expense: [128, 128, 136], profit: GOOD };

const PAGE_W = 297;
const PAGE_H = 210;
const M = 12; // margen
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 16; // el pie de página ocupa el resto

/** Las fuentes estándar de PDF solo traen Latin-1: se cambia lo que no existe en ellas. */
export function pdfSafe(input: unknown): string {
    const text = input === null || input === undefined ? '' : String(input);
    return text
        .replace(/[−‒]/g, '-').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=')
        .replace(/[   ]/g, ' ').replace(/[\r\n]+/g, ' ')
        .replace(/[^ -~¡-ÿ–—‘’“”•…€]/g, '');
}

type AutoTable = (doc: Doc, options: Record<string, unknown>) => void;
const finalY = (doc: Doc) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

function ensureSpace(doc: Doc, y: number, needed: number): number {
    if (y + needed <= BOTTOM) return y;
    doc.addPage();
    return M + 4;
}

function niceMax(value: number): number {
    if (value <= 0) return 1;
    const pow = 10 ** Math.floor(Math.log10(value));
    const n = value / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function drawBars(doc: Doc, block: ReportBars, x: number, y: number, w: number, h: number) {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK);
    doc.text(pdfSafe(block.title), x, y);
    const left = x + 20;
    const top = y + 5;
    const plotW = w - 22;
    const plotH = h - 18;
    const base = top + plotH;
    const max = niceMax(Math.max(0, ...block.items.map((i) => i.value)));
    const fmt = (v: number) => (block.format === 'money' ? `$${Math.round(v).toLocaleString('es-MX')}` : plainNumber(v));

    doc.setLineWidth(0.15).setDrawColor(...RULE).setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
    for (let i = 0; i <= 4; i++) {
        const gy = base - (plotH * i) / 4;
        doc.line(left, gy, left + plotW, gy);
        doc.text(pdfSafe(fmt((max * i) / 4)), left - 2, gy + 1.2, { align: 'right' });
    }
    if (block.items.every((i) => i.value === 0)) {
        doc.setFontSize(8).text('Sin movimiento en el periodo.', left + plotW / 2, top + plotH / 2, { align: 'center' });
        return;
    }
    const n = block.items.length;
    const slot = plotW / n;
    const barW = Math.min(slot * 0.62, 16);
    const fill = block.color === 'accent' ? BRONZE : INK;
    const every = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(plotW / 16))));
    block.items.forEach((item, i) => {
        const bh = (item.value / max) * plotH;
        const bx = left + slot * i + (slot - barW) / 2;
        if (bh > 0) {
            doc.setFillColor(...fill).rect(bx, base - bh, barW, bh, 'F');
            if (n <= 12) doc.setFontSize(6.5).setTextColor(...INK).text(pdfSafe(fmt(item.value)), bx + barW / 2, base - bh - 1, { align: 'center' });
        }
        if (i % every === 0) doc.setFontSize(6.5).setTextColor(...MUTED).text(pdfSafe(item.label).slice(0, 14), bx + barW / 2, base + 4, { align: 'center' });
    });
    doc.setDrawColor(...INK).setLineWidth(0.3).line(left, base, left + plotW, base);
}

function renderTable(doc: Doc, autoTable: AutoTable, table: ReportTable, tz: string, y: number): number {
    // Una tabla corta no se parte entre dos hojas: si no cabe completa, empieza en la siguiente.
    const rowsHigh = table.rows.length + (table.total ? 1 : 0);
    if (rowsHigh <= 12) y = ensureSpace(doc, y, (table.title ? 6 : 0) + 8 + rowsHigh * 6.6);
    if (table.title) {
        y = ensureSpace(doc, y, 20);
        doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text(pdfSafe(table.title), M, y);
        y += 3;
    }
    if (table.rows.length === 0) {
        doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...MUTED).text(pdfSafe(table.empty), M, y + 4);
        return y + 11;
    }
    const { head, body, total } = tableTexts(table, tz);
    const numeric = table.columns.map(isNumericColumn);
    const styles = table.styles;
    const columnStyles: Record<number, { halign: 'right' | 'left' }> = {};
    numeric.forEach((isNum, i) => { if (isNum) columnStyles[i] = { halign: 'right' }; });
    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, top: M + 2, bottom: 16 },
        head: [head.map(pdfSafe)],
        body: body.map((row) => row.map(pdfSafe)),
        foot: total ? [total.map(pdfSafe)] : undefined,
        showFoot: 'lastPage',
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.6, textColor: INK, lineColor: RULE, lineWidth: 0, overflow: 'linebreak' },
        headStyles: { fillColor: BRONZE_SOFT, textColor: INK, fontStyle: 'bold', lineColor: BRONZE, lineWidth: { bottom: 0.4 } },
        footStyles: { fillColor: [244, 244, 241], textColor: INK, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [251, 251, 249] },
        columnStyles,
        didParseCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { styles: { halign: string; fontStyle: string; fillColor: RGB | false; fontSize: number; cellPadding: number | Record<string, number> } } }) => {
            if (numeric[data.column.index] && data.section !== 'body') data.cell.styles.halign = 'right';
            const style = data.section === 'body' ? styles?.[data.row.index] : undefined;
            if (style === 'subtotal' || style === 'result') data.cell.styles.fontStyle = 'bold';
            if (style === 'subtotal') data.cell.styles.fillColor = [244, 244, 241];
            if (style === 'result') { data.cell.styles.fillColor = BRONZE_SOFT; data.cell.styles.fontSize = 9; }
            if (style === 'minor' && data.column.index === 0) data.cell.styles.cellPadding = { top: 1.6, bottom: 1.6, right: 1.6, left: 5 };
        },
        rowPageBreak: 'avoid',
    });
    return finalY(doc) + 7;
}

function renderKpis(doc: Doc, autoTable: AutoTable, block: ReportKpis, y: number): number {
    const fmt = (v: number, f: 'money' | 'number') => (f === 'money' ? money(v) : plainNumber(v));
    const rows = block.items.map((item) => {
        const d = percentChange(item.value, item.previous);
        const change = d === null ? 'Sin datos para comparar' : d === 0 ? 'Igual' : `${d > 0 ? '+' : '-'}${Math.abs(d).toLocaleString('es-MX')}%`;
        return [item.label, fmt(item.value, item.format), fmt(item.previous, item.format), change];
    });
    autoTable(doc, {
        startY: y,
        margin: { left: M, right: M, top: M + 2, bottom: 16 },
        head: [['Concepto', 'Este periodo', 'Periodo anterior', 'Cambio']],
        body: rows.map((r) => r.map(pdfSafe)),
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: INK },
        headStyles: { fillColor: BRONZE_SOFT, fontStyle: 'bold', lineColor: BRONZE, lineWidth: { bottom: 0.4 } },
        alternateRowStyles: { fillColor: [251, 251, 249] },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
        didParseCell: (data: { section: string; column: { index: number }; row: { index: number }; cell: { styles: { halign: string; textColor: RGB } } }) => {
            if (data.section === 'head' && data.column.index > 0) data.cell.styles.halign = 'right';
            if (data.section === 'body' && data.column.index === 3) {
                const item = block.items[data.row.index];
                const d = percentChange(item.value, item.previous);
                if (d) data.cell.styles.textColor = (item.invert ? d < 0 : d > 0) ? GOOD : BAD;
            }
        },
    });
    return finalY(doc) + 6;
}

function heroValue(item: ReportHero['items'][number]): string {
    if (item.value === null) return '—';
    if (item.format === 'money') return money(item.value);
    if (item.format === 'percent') return percentText(item.value);
    return plainNumber(item.value);
}

/** Cifras grandes en recuadros, una por idea, con su frase debajo. */
function drawHero(doc: Doc, block: ReportHero, y: number): number {
    const gap = 6;
    const n = block.items.length;
    const w = (CONTENT_W - gap * (n - 1)) / n;
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    const captions = block.items.map((item) => doc.splitTextToSize(pdfSafe(item.caption), w - 9) as string[]);
    const h = 23 + Math.max(...captions.map((l) => l.length)) * 3.6;
    y = ensureSpace(doc, y, h + 4);
    block.items.forEach((item, i) => {
        const x = M + i * (w + gap);
        doc.setFillColor(...PANEL).roundedRect(x, y, w, h, 2, 2, 'F');
        doc.setFillColor(...(item.tone === 'neutral' ? BRONZE : TONE[item.tone])).rect(x, y + 2, 1.4, h - 4, 'F');
        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...MUTED).text(pdfSafe(item.label), x + 5, y + 6.5);
        doc.setFont('helvetica', 'bold').setFontSize(21).setTextColor(...TONE[item.tone]).text(pdfSafe(heroValue(item)), x + 5, y + 16.5);
        doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED).text(captions[i], x + 5, y + 22);
    });
    return y + h + 7;
}

/** Barra apilada de "de cada $100", con su leyenda y una frase. */
function drawStack(doc: Doc, block: ReportStack, y: number): number {
    y = ensureSpace(doc, y, 34);
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text(pdfSafe(block.title), M, y);
    if (block.empty) {
        doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...MUTED).text(pdfSafe(block.empty), M, y + 6);
        return y + 13;
    }
    const top = y + 4;
    const barH = 10;
    const total = block.segments.reduce((a, s) => a + s.value, 0);
    const scale = CONTENT_W / Math.max(100, total);
    let x = M;
    for (const seg of block.segments) {
        const w = seg.value * scale;
        if (w <= 0) continue;
        doc.setFillColor(...STACK[seg.color]).rect(x, top, w, barH, 'F');
        const label = pdfSafe(`${seg.label} ${money(seg.value)}`);
        doc.setFont('helvetica', 'bold').setFontSize(8);
        if (doc.getTextWidth(label) + 4 < w) doc.setTextColor(255, 255, 255).text(label, x + w / 2, top + barH / 2 + 1.4, { align: 'center' });
        x += w;
    }
    if (total > 100) {
        const at = M + 100 * scale;
        doc.setDrawColor(...BAD).setLineWidth(0.5).line(at, top - 1.5, at, top + barH + 1.5);
        doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...BAD).text('$100', at, top - 2.2, { align: 'center' });
    }
    // Leyenda: siempre trae la cifra, aunque el segmento sea muy angosto para escribirla dentro.
    let lx = M;
    const ly = top + barH + 6;
    doc.setFont('helvetica', 'normal').setFontSize(8.5);
    for (const seg of block.segments) {
        const text = pdfSafe(`${seg.label}: ${money(seg.value)}`);
        doc.setFillColor(...STACK[seg.color]).rect(lx, ly - 2.6, 3, 3, 'F');
        doc.setTextColor(...INK).text(text, lx + 4.5, ly);
        lx += 4.5 + doc.getTextWidth(text) + 9;
    }
    let end = ly + 3;
    if (block.caption) {
        doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...MUTED);
        const lines = doc.splitTextToSize(pdfSafe(block.caption), CONTENT_W) as string[];
        doc.text(lines, M, ly + 6);
        end = ly + 6 + lines.length * 4;
    }
    return end + 5;
}

function sectionHeader(doc: Doc, section: ReportSection, y: number): number {
    doc.setFillColor(...BRONZE).rect(M, y - 5.2, 1.6, 7.5, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...INK).text(pdfSafe(`${section.number}. ${section.title}`), M + 4, y);
    doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...MUTED);
    const lines = doc.splitTextToSize(pdfSafe(section.explain), CONTENT_W - 4) as string[];
    doc.text(lines, M + 4, y + 5.5);
    const end = y + 5.5 + lines.length * 4;
    doc.setDrawColor(...RULE).setLineWidth(0.2).line(M, end, PAGE_W - M, end);
    return end + 6;
}

function renderSection(doc: Doc, autoTable: AutoTable, section: ReportSection, tz: string) {
    doc.addPage();
    let y = sectionHeader(doc, section, M + 8);
    const blocks = section.blocks;
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.kind === 'text' && block.tone === 'warning') {
            doc.setFont('helvetica', 'bold').setFontSize(9.5);
            const lines = doc.splitTextToSize(pdfSafe(block.text), CONTENT_W - 8) as string[];
            const h = lines.length * 4.4 + 5;
            y = ensureSpace(doc, y, h + 4);
            doc.setFillColor(...BAD_SOFT).roundedRect(M, y, CONTENT_W, h, 1.5, 1.5, 'F');
            doc.setFillColor(...BAD).rect(M, y, 1.4, h, 'F');
            doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...BAD).text(lines, M + 4, y + 5);
            y += h + 5;
        } else if (block.kind === 'hero') {
            y = drawHero(doc, block, y);
        } else if (block.kind === 'stack') {
            y = drawStack(doc, block, y);
        } else if (block.kind === 'text') {
            const note = block.tone === 'note';
            doc.setFont('helvetica', note ? 'italic' : 'normal').setFontSize(note ? 8.5 : 10.5).setTextColor(...(note ? MUTED : INK));
            const lines = doc.splitTextToSize(pdfSafe(block.text), CONTENT_W) as string[];
            y = ensureSpace(doc, y, lines.length * 4.6 + 4);
            doc.setFont('helvetica', note ? 'italic' : 'normal').setFontSize(note ? 8.5 : 10.5).setTextColor(...(note ? MUTED : INK));
            doc.text(lines, M, y);
            y += lines.length * (note ? 3.9 : 4.9) + 4;
        } else if (block.kind === 'kpis') {
            y = renderKpis(doc, autoTable, block, y);
        } else if (block.kind === 'bars') {
            // Dos gráficas seguidas van lado a lado.
            const next = blocks[i + 1];
            const pair = next && next.kind === 'bars' ? next : null;
            const h = block.compact || pair?.compact ? 46 : 56;
            y = ensureSpace(doc, y, h + 4);
            const w = (CONTENT_W - 8) / 2;
            drawBars(doc, block, M, y, w, h);
            if (pair) { drawBars(doc, pair, M + w + 8, y, w, h); i++; }
            y += h + 4;
        } else {
            y = renderTable(doc, autoTable, block, tz, y);
        }
    }
}

function renderCover(doc: Doc, autoTable: AutoTable, model: ReportModel) {
    const section = model.sections[0];
    doc.setFillColor(...BRONZE).rect(0, 0, PAGE_W, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...INK).text(pdfSafe(model.businessName), M, 28);
    doc.setFont('helvetica', 'normal').setFontSize(13).setTextColor(...MUTED).text('Reporte del negocio', M, 36);
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...INK).text(pdfSafe(`${model.period.label}`), M, 47);
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED)
        .text(pdfSafe(`${model.branchName} · Audiencia: ${AUDIENCE_LABELS[model.audience]}. ${AUDIENCE_NOTES[model.audience]}`), M, 54);

    // Folio y código en grande: es lo que se anota al archivar el reporte.
    doc.setDrawColor(...BRONZE).setLineWidth(0.6).roundedRect(M, 61, CONTENT_W, 22, 2, 2);
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED).text('Folio', M + 5, 68);
    doc.text('Código de verificación', M + 70, 68);
    doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(...INK).text(pdfSafe(model.folio ?? 'Sin folio'), M + 5, 77);
    doc.setFont('courier', 'bold').setFontSize(10.5).text(pdfSafe(model.code ?? 'Se asigna al emitir el reporte'), M + 70, 76);

    const table = section.blocks.find((b): b is ReportTable => b.kind === 'table');
    let y = 91;
    if (table) y = renderTable(doc, autoTable, { ...table, rows: table.rows.filter((r) => r[0] !== 'Folio' && r[0] !== 'Código de verificación') }, model.timezone, y);
    for (const block of section.blocks) {
        if (block.kind !== 'text') continue;
        doc.setFont('helvetica', 'italic').setFontSize(8.5).setTextColor(...MUTED);
        const lines = doc.splitTextToSize(pdfSafe(block.text), CONTENT_W) as string[];
        y = ensureSpace(doc, y, lines.length * 4 + 3);
        doc.text(lines, M, y);
        y += lines.length * 3.9 + 3;
    }

    // Con más de diez secciones el índice va en tres columnas para que quepa en la portada.
    const cols = model.sections.length > 10 ? 3 : 2;
    const perCol = Math.ceil(model.sections.length / cols);
    y = ensureSpace(doc, y + 2, 8 + perCol * 5);
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text('Contenido', M, y);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...INK);
    model.sections.forEach((s, i) => {
        const col = Math.floor(i / perCol);
        const row = i % perCol;
        doc.text(pdfSafe(`${s.number}. ${s.title}`), M + col * (CONTENT_W / cols), y + 6 + row * 5);
    });
}

function drawFooters(doc: Doc, model: ReportModel) {
    const total = doc.getNumberOfPages();
    const tag = model.folio && model.code ? `Folio ${model.folio} · Código ${model.code.slice(0, 16)}` : 'Borrador sin folio';
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setDrawColor(...RULE).setLineWidth(0.2).line(M, PAGE_H - 11, PAGE_W - M, PAGE_H - 11);
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
        doc.text(pdfSafe(tag), M, PAGE_H - 6.5);
        doc.text(pdfSafe(`${model.businessName} · ${model.period.label} · ${AUDIENCE_LABELS[model.audience]}`), PAGE_W / 2, PAGE_H - 6.5, { align: 'center' });
        doc.text(`Página ${i} de ${total}`, PAGE_W - M, PAGE_H - 6.5, { align: 'right' });
    }
}

/** Genera el PDF del reporte y lo entrega como bytes. */
export async function buildReportPdf(model: ReportModel): Promise<Uint8Array> {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).autoTable as unknown as AutoTable;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setProperties({
        title: pdfSafe(`${model.title}${model.folio ? ` · ${model.folio}` : ''}`),
        subject: pdfSafe(`${model.businessName} · ${AUDIENCE_LABELS[model.audience]}`),
        author: pdfSafe(model.generatedBy),
        keywords: pdfSafe(`${model.folio ?? ''} ${model.code?.slice(0, 16) ?? ''}`.trim()),
        creator: 'BarberOS',
    });
    renderCover(doc, autoTable, model);
    for (const section of model.sections.slice(1)) renderSection(doc, autoTable, section, model.timezone);
    drawFooters(doc, model);
    return new Uint8Array(doc.output('arraybuffer'));
}

