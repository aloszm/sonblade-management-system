// PDF real del resumen de caja del día: una página carta con logo, fecha y las mismas secciones de la pantalla.
// Papel blanco, texto negro, detalles dorados (como el reporte completo). Sin clientes, teléfonos ni costos.
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
const finalY = (doc: import('jspdf').jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/**
 * `logo`: imagen PNG en data URL (opcional; en el navegador se lee de /logo-light.png). Sin ella, se rotula con el nombre.
 */
export async function buildDaySummaryPdf(payload: DaySummaryPayload, options: { logo?: string | null } = {}): Promise<Uint8Array> {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).autoTable as unknown as AutoTable;
    const { summary, cash } = payload;
    const t = summary.totals;
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

    const base = { theme: 'grid', margin: { left: M, right: M }, styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, textColor: INK, lineColor: [222, 220, 214], lineWidth: 0.1 },
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
        y = finalY(doc) + 7;

        section('Por forma de pago');
        autoTable(doc, { ...base, startY: y, head: [['Forma de pago', 'Cobros', 'Ventas', 'Propinas', 'Total']],
            body: summary.methods.map((m) => [pdfSafe(m.label), String(m.payments), money2(m.salesCents), money2(m.tipsCents), money2(m.totalCents)]),
            columnStyles: { 1: right, 2: right, 3: right, 4: right } });
        y = finalY(doc) + 7;

        section('Quién atendió');
        autoTable(doc, { ...base, startY: y, head: [['Persona', 'Servicios', 'Productos', 'Propinas', 'Total']],
            body: summary.people.map((p) => [pdfSafe(p.name), `${p.serviceCount} · ${money2(p.servicesCents)}`, money2(p.productsCents), money2(p.tipsCents), money2(p.totalCents)]),
            columnStyles: { 1: right, 2: right, 3: right, 4: right } });
        y = finalY(doc) + 7;
    }

    section('Caja del día');
    if (cash.sessions.length === 0) {
        doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...INK).text('No hubo caja abierta este día.', M, y + 5);
    } else {
        const time = (iso: string | null) => (iso ? formatTime(iso, payload.timezone) : '');
        // Con muchas cajas el mismo día (pruebas o cambios de turno) el PDF las resume en un renglón para caber en una página;
        // el detalle está en el Excel y en la pantalla.
        const rows = cash.sessions.length > 3
            ? [[`${cash.sessions.length} cajas (detalle en Excel)`, '-', '-', '-', '-', '-', money2(cash.differenceCents), money2(cash.reserveCents)]]
            : cash.sessions.map((s, i) => [
                pdfSafe(`${i + 1} · ${time(s.openedAt)}${s.closedAt ? `-${time(s.closedAt)}` : ' (abierta)'}\n${s.openedBy}${s.closedBy ? ` / ${s.closedBy}` : ''}`),
                money2(s.initialCents), money2(s.manualInCents), money2(s.manualOutCents), money2(s.expectedCents),
                s.countedCents === null ? '-' : money2(s.countedCents), s.differenceCents === null ? '-' : money2(s.differenceCents),
                s.reserveCents === null ? '-' : money2(s.reserveCents),
            ]);
        autoTable(doc, { ...base, startY: y, head: [['Caja', 'Fondo', 'Entradas', 'Salidas', 'Esperado', 'Contado', 'Dif.', 'Apartado']], body: rows,
            columnStyles: { 1: right, 2: right, 3: right, 4: right, 5: right, 6: right, 7: right } });
        y = finalY(doc) + 4;
        if (cash.anyOpen) doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(185, 28, 28).text('Caja abierta: el resumen puede cambiar.', M, y + 2);
    }

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED);
        doc.text(pdfSafe(`${payload.businessName} · Resumen de caja ${payload.date} · Las propinas son del equipo, no ingreso de la barbería.`), M, 272);
        doc.text(`${i}/${pages}`, W - M, 272, { align: 'right' });
    }
    return new Uint8Array(doc.output('arraybuffer'));
}
