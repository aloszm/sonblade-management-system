// PDF real del resumen de caja del día: una página carta con logo, fecha y las mismas secciones de la pantalla.
// Papel blanco, texto negro, detalles dorados (como el reporte completo). Sin clientes, teléfonos ni costos.
import { visibleLines } from '@/lib/cash/cash-flow';
import type { DaySummaryPayload } from '@/lib/cash/day-summary';
import { longDayLabel, money } from '@/lib/cash/day-summary-text';
import { pdfSafe } from '@/lib/reports/full-report-pdf';
import { formatTime } from '@/lib/utils/dates';

type RGB = [number, number, number];
const BRONZE: RGB = [122, 91, 50];
const BRONZE_SOFT: RGB = [243, 235, 221];
const INK: RGB = [20, 20, 22];
const MUTED: RGB = [95, 95, 102];
type AutoTable = (doc: import('jspdf').jsPDF, options: Record<string, unknown>) => void;
type Density = { font: number; pad: number; gap: number };
const DENSITIES: Density[] = [{ font: 9, pad: 1.8, gap: 7 }, { font: 8.5, pad: 1.2, gap: 5 }, { font: 8, pad: 0.8, gap: 4 }, { font: 7.5, pad: 0.5, gap: 3 }];
const finalY = (doc: import('jspdf').jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/**
 * `logo`: imagen PNG en data URL (opcional; en el navegador se lee de /logo-light.png). Sin ella, se rotula con el nombre.
 */
export async function buildDaySummaryPdf(payload: DaySummaryPayload, options: { logo?: string | null } = {}): Promise<Uint8Array> {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).autoTable as unknown as AutoTable;
    const { summary, cash } = payload;
    const t = summary.totals;
    // Se dibuja con letra normal; si el día trae tanto que no cabe en una hoja, se aprieta un poco y se vuelve a dibujar.
    const draw = (dens: Density): import('jspdf').jsPDF => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    doc.setProperties({ title: pdfSafe(`Resumen de caja ${payload.date}`), subject: pdfSafe(payload.businessName), author: 'BarberOS', creator: 'BarberOS' });
    const W = 215.9;
    const M = 16;
    const CW = W - M * 2;
    let y = M;

    let logoW = 0;
    if (options.logo) {
        try {
            const props = doc.getImageProperties(options.logo);
            const h = 16;
            logoW = Math.min(30, h * (props.width / props.height));
            doc.addImage(options.logo, 'PNG', M, y - 2, logoW, logoW / (props.width / props.height));
        } catch { logoW = 0; }
    }
    const left = logoW ? M + logoW + 4 : M;
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BRONZE).text(pdfSafe(payload.businessName), left, y + 3);
    doc.setFontSize(18).setTextColor(...INK).text('Resumen de caja', left, y + 10);
    doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(...MUTED).text(pdfSafe(longDayLabel(payload.date)), left, y + 16);
    y += 24;
    doc.setDrawColor(...BRONZE).setLineWidth(0.5).line(M, y, M + CW, y);
    y += 8;

    // Total
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED).text('Total cobrado', M, y);
    doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...INK).text(pdfSafe(money(t.grandTotalCents)), M, y + 10);
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED);
    doc.text(pdfSafe(`${summary.sales.paidCount} ${summary.sales.paidCount === 1 ? 'venta cobrada' : 'ventas cobradas'}`
        + (summary.sales.voidedCount ? ` · ${summary.sales.voidedCount} anulada${summary.sales.voidedCount === 1 ? '' : 's'} (${money(summary.sales.voidedCents)}), no cuentan` : '')), M, y + 15);
    y += 26;

    const base = { theme: 'grid', margin: { left: M, right: M }, styles: { font: 'helvetica', fontSize: dens.font, cellPadding: dens.pad, textColor: INK, lineColor: [222, 220, 214], lineWidth: 0.1 },
        headStyles: { fillColor: BRONZE_SOFT, textColor: INK, fontStyle: 'bold' },
        // Todas las tablas llevan texto en la primera columna y cifras en las demás: los encabezados de cifras van a la derecha.
        didParseCell: (d: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right'; } };
    const right = { halign: 'right' as const };
    const section = (title: string) => {
        doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...BRONZE).text(pdfSafe(title), M, y);
        y += 2;
    };
    const money2 = (c: number) => pdfSafe(money(c));

    if (summary.sales.paidCount === 0) {
        doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(...INK).text('No hubo cobros este día.', M, y + 4);
        y += 12;
    } else {
        section('Por tipo');
        autoTable(doc, { ...base, startY: y, head: [['Concepto', 'Cantidad', 'Importe']], body: [
            ['Servicios', String(t.serviceCount) + (t.cutCount ? ` (${t.cutCount} cortes)` : ''), money2(t.servicesCents)],
            ['Productos', `${t.productUnits} pzas`, money2(t.productsCents)],
            [{ content: 'Ingreso de la barbería (servicios + productos)', styles: { fontStyle: 'bold' } }, '', { content: money2(t.businessIncomeCents), styles: { fontStyle: 'bold' } }],
            ['Propinas (del equipo)', '', money2(t.tipsCents)],
        ], columnStyles: { 1: right, 2: right } });
        y = finalY(doc) + dens.gap;

        section('Por forma de pago');
        autoTable(doc, { ...base, startY: y, head: [['Forma de pago', 'Cobros', 'Ventas', 'Propinas', 'Total']],
            body: summary.methods.map((m) => [pdfSafe(m.label), String(m.payments), money2(m.salesCents), money2(m.tipsCents), money2(m.totalCents)]),
            columnStyles: { 1: right, 2: right, 3: right, 4: right } });
        y = finalY(doc) + dens.gap;

        section('Quién atendió');
        autoTable(doc, { ...base, startY: y, head: [['Persona', 'Servicios', 'Productos', 'Propinas', 'Total']],
            body: summary.people.map((p) => [pdfSafe(p.name), `${p.serviceCount} · ${money2(p.servicesCents)}`, money2(p.productsCents), money2(p.tipsCents), money2(p.totalCents)]),
            columnStyles: { 1: right, 2: right, 3: right, 4: right } });
        y = finalY(doc) + dens.gap;
    }

    section('Caja del día · el camino del efectivo');
    if (cash.sessions.length === 0) {
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK).text('No hubo caja abierta este día.', M, y + 5);
    } else if (cash.sessions.length === 1) {
        // Una caja: el camino completo, en dos columnas para que quepa en la página (la lista de movimientos va en el Excel).
        const f = cash.sessions[0];
        const sign = (l: { side: 'in' | 'out'; cents: number }) => (l.cents === 0 ? money(0) : l.side === 'in' ? `+${money(l.cents)}` : `-${money(l.cents)}`);
        const bold = (c: string) => ({ content: c, styles: { fontStyle: 'bold' } });
        const left: unknown[][] = [
            ['Fondo con que se abrió', money2(f.openingCents)],
            ...visibleLines(f, 'in').concat(visibleLines(f, 'out')).map((l) => [`${l.side === 'in' ? '+' : '-'} ${pdfSafe(l.label)}${l.count ? ` (${l.count})` : ''}`, pdfSafe(sign(l))]),
            [bold(f.open ? '= Efectivo que debe haber ahora' : '= Efectivo que debe haber'), bold(money2(f.expectedCents))],
        ];
        if (!f.open && f.countedCents !== null) left.push(['Efectivo contado al cerrar', money2(f.countedCents)]);
        if (!f.open && f.differenceCents !== null) left.push([f.differenceCents === 0 ? 'Diferencia (cuadra)' : f.differenceCents > 0 ? 'Diferencia (sobrante)' : 'Diferencia (faltante)', money2(f.differenceCents)]);
        const compact = { styles: { ...base.styles, fontSize: dens.font - 0.5, cellPadding: Math.max(0.6, dens.pad - 0.6) } };
        const leftW = 104;
        const rightW = CW - leftW - 6;
        const top = y;
        autoTable(doc, { ...base, ...compact, startY: top, margin: { left: M, right: W - M - leftW }, tableWidth: leftW,
            head: [['Cuánto efectivo ' + (f.open ? 'hay' : 'debe haber') + ' y por qué', 'Importe']], body: left, columnStyles: { 1: { halign: 'right' } } });
        const leftEnd = finalY(doc);
        const split = f.split;
        let rightEnd = top;
        if (split) {
            autoTable(doc, { ...base, ...compact, startY: top, margin: { left: M + leftW + 6, right: M }, tableWidth: rightW,
                head: [[split.proposed ? 'Al cerrar se propone' : '¿A dónde se fue lo contado?', 'Importe']],
                body: [
                    ['Se deja de fondo para mañana', money2(split.floatCents)],
                    [pdfSafe(`Se aparta al sobre «${split.reserveLabel}»`), money2(split.reserveCents)],
                    [pdfSafe(`Se retira${split.deliveredTo ? ` (a: ${split.deliveredTo})` : ''}`), money2(split.withdrawnCents)],
                    [bold(split.proposed ? 'Total propuesto' : 'Total (= contado)'), bold(money2(split.floatCents + split.reserveCents + split.withdrawnCents))],
                ], columnStyles: { 1: { halign: 'right' } } });
            rightEnd = finalY(doc);
        } else if (!f.open) {
            doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED).text(doc.splitTextToSize('Caja cerrada sin repartir lo contado (antes del cierre guiado): no hay fondo, apartado ni retiro guardados.', rightW), M + leftW + 6, top + 4);
            rightEnd = top + 12;
        }
        // Lo que NO toca la caja, bajo la columna derecha.
        const notes = [`Tarjeta ${money(f.cardCents)} y transferencia ${money(f.transferCents)} no están en la caja.`];
        if (cash.otherExpenses) notes.push(`Gastos del sobre o del banco: ${money(cash.otherExpenses.envelopeCents + cash.otherExpenses.bankCents)} (no salen de la caja).`);
        else notes.push('Los gastos del sobre o del banco no salen de la caja.');
        if (f.open) notes.push('Caja abierta: el resumen puede cambiar.');
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
        const noteLines = doc.splitTextToSize(pdfSafe(notes.join(' ')), rightW);
        doc.text(noteLines, M + leftW + 6, rightEnd + 5);
        y = Math.max(leftEnd, rightEnd + 5 + noteLines.length * 3.4) + 3;
        if (!f.check.ok) {
            doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(185, 28, 28).text(doc.splitTextToSize(pdfSafe(`ATENCION: las cuentas de esta caja no cuadran. ${f.check.issues.join(' ')}`), CW), M, y + 2);
        }
    } else {
        const time = (iso: string | null) => (iso ? formatTime(iso, payload.timezone) : '');
        // Con varias cajas el mismo día el PDF las resume (el camino completo de cada una está en el Excel y en la pantalla).
        const t = cash.total;
        const rows = cash.sessions.length > 3
            ? [[`${cash.sessions.length} cajas (detalle en Excel)`, '-', '-', '-', '-', '-', money2(t.differenceCents), money2(t.reserveCents), money2(t.withdrawnCents)]]
            : cash.sessions.map((s, i) => [
                pdfSafe(`${i + 1} · ${time(s.openedAt)}${s.closedAt ? `-${time(s.closedAt)}` : ' (abierta)'}\n${s.openedBy}${s.closedBy ? ` / ${s.closedBy}` : ''}`),
                money2(s.openingCents), money2(s.inCents), money2(s.outCents), money2(s.expectedCents),
                s.countedCents === null ? '-' : money2(s.countedCents), s.differenceCents === null ? '-' : money2(s.differenceCents),
                s.split && !s.split.proposed ? money2(s.split.reserveCents) : '-', s.split && !s.split.proposed ? money2(s.split.withdrawnCents) : '-',
            ]);
        autoTable(doc, { ...base, startY: y, styles: { ...base.styles, fontSize: dens.font - 0.5 }, head: [['Caja', 'Fondo', 'Entradas', 'Salidas', 'Debe haber', 'Contado', 'Dif.', 'Apartado', 'Retiro']], body: rows,
            columnStyles: { 1: right, 2: right, 3: right, 4: right, 5: right, 6: right, 7: right, 8: right } });
        y = finalY(doc) + 4;
        doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED);
        const extra = [`Gastos pagados de la caja: ${money(t.expensesCents)}.`, 'Cada caja arrastra su propio fondo.'];
        if (cash.otherExpenses) extra.push(`Gastos del sobre o del banco: ${money(cash.otherExpenses.envelopeCents + cash.otherExpenses.bankCents)} (no salen de la caja).`);
        doc.text(doc.splitTextToSize(pdfSafe(extra.join(' ')), CW), M, y + 1);
        y += 8;
        if (cash.anyOpen) doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(185, 28, 28).text('Hay una caja abierta: el resumen puede cambiar.', M, y + 2);
        if (t.issues > 0) doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(185, 28, 28).text('ATENCION: hay cajas cuyas cuentas no cuadran (ver la pantalla).', M, y + 7);
    }

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
        doc.text(pdfSafe(`${payload.businessName} · Resumen de caja ${payload.date} · Las propinas son del equipo, no ingreso de la barbería.`), M, 272);
        doc.text(`${i}/${pages}`, W - M, 272, { align: 'right' });
    }
    return doc;
    };

    let doc = draw(DENSITIES[0]);
    for (const dens of DENSITIES.slice(1)) {
        if (doc.getNumberOfPages() === 1) break;
        doc = draw(dens);
    }
    return new Uint8Array(doc.output('arraybuffer'));
}
