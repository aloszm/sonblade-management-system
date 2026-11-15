import { describe, expect, it } from 'vitest';
import {
    auditDetail, buildReportModel, chartSeries, executiveParagraph, formatCell, formatDateTime, money, percentChange,
    reportFileName, reportPresetRange, tableTexts, validateRange, type ReportTable,
} from './full-report';
import { sampleReport } from './full-report.fixture';

describe('periodos del reporte', () => {
    it('hoy es un solo día', () => {
        expect(reportPresetRange('today', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' });
    });

    it('la semana del negocio empieza el domingo y llega hasta hoy', () => {
        // 2026-11-15 es domingo; 2026-11-18 es miércoles
        expect(reportPresetRange('week', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' });
        expect(reportPresetRange('week', '2026-11-18')).toEqual({ from: '2026-11-15', to: '2026-11-18' });
        expect(reportPresetRange('week', '2026-11-21')).toEqual({ from: '2026-11-15', to: '2026-11-21' });
    });

    it('mes y mes anterior', () => {
        expect(reportPresetRange('month', '2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-15' });
        expect(reportPresetRange('last_month', '2026-11-15')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
        expect(reportPresetRange('last_month', '2026-03-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
        expect(reportPresetRange('last_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
        expect(reportPresetRange('last_month', '2028-03-01')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    });

    it('valida el rango como la base: orden y máximo de 400 días', () => {
        expect(validateRange('2026-11-01', '2026-11-15')).toBeNull();
        expect(validateRange('2026-11-15', '2026-11-01')).toMatch(/anterior/);
        expect(validateRange('', '2026-11-01')).toMatch(/fechas/);
        expect(validateRange('2025-01-01', '2026-02-05')).toBeNull(); // 400 días exactos
        expect(validateRange('2025-01-01', '2026-02-06')).toMatch(/400/);
    });
});

describe('formatos', () => {
    it('importes con dos decimales y signo', () => {
        expect(money(1234.5)).toBe('$1,234.50');
        expect(money(-20)).toBe('-$20.00');
        expect(money(null)).toBe('$0.00');
    });

    it('fecha y hora en la zona del negocio, no en UTC', () => {
        // 02:30 UTC del 16 es 20:30 del 15 en Ciudad de México (UTC-6)
        expect(formatDateTime('2026-11-16T02:30:05Z', 'America/Mexico_City')).toBe('15/11/2026 20:30');
        expect(formatDateTime('2026-11-16T02:30:05Z', 'America/Mexico_City', true)).toBe('15/11/2026 20:30:05');
        expect(formatDateTime(null, 'America/Mexico_City')).toBe('');
    });

    it('las filas de total pueden llevar palabras en columnas de importe y de fecha', () => {
        expect(formatCell({ header: 'x', type: 'datetime_s' }, 'Total', 'America/Mexico_City')).toBe('Total');
        expect(formatCell({ header: 'x', type: 'money' }, 'Total', 'America/Mexico_City')).toBe('Total');
        expect(formatCell({ header: 'x', type: 'money' }, 12, 'America/Mexico_City')).toBe('$12.00');
    });

    it('variación contra el periodo anterior', () => {
        expect(percentChange(3000, 2000)).toBe(50);
        expect(percentChange(1, 0)).toBeNull();
    });
});

describe('gráficas', () => {
    it('muestra un renglón por día y agrupa por semana cuando el periodo es largo', () => {
        const short = Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, revenue: 10, cuts: 1, tickets: 1 }));
        expect(chartSeries(short, 'revenue')).toHaveLength(30);
        const long = Array.from({ length: 90 }, (_, i) => {
            const d = new Date(Date.UTC(2026, 8, 1 + i));
            return { day: d.toISOString().slice(0, 10), revenue: 10, cuts: 1, tickets: 1 };
        });
        const weeks = chartSeries(long, 'revenue');
        expect(weeks.length).toBeLessThan(20);
        expect(weeks.reduce((s, w) => s + w.value, 0)).toBe(900);
    });
});

describe('texto del reporte', () => {
    it('el resumen en palabras trae las cifras, la comparación y la advertencia de utilidad', () => {
        const text = executiveParagraph(sampleReport());
        expect(text).toContain('$3,000.00');
        expect(text).toContain('10 ventas');
        expect(text).toContain('subieron 50%');
        expect(text).toContain('utilidad');
        expect(text).toContain('todavía no descuenta el costo de los productos');
        expect(text).toContain('1 descuento por $50.00');
        expect(text).toContain('1 venta por $150.00');
    });

    it('un periodo sin ventas lo dice sin inventar cifras', () => {
        const report = sampleReport();
        report.summary.kpis = { ...report.summary.kpis, tickets: 0, revenue: 0, cuts: 0, products: 0, net: 0, commissions: 0, expenses: 0, tips: 0, discounts_count: 0, reversals_count: 0 };
        report.summary.previous = { ...report.summary.kpis };
        const text = executiveParagraph(report);
        expect(text).toContain('no se registraron ventas');
        expect(text).toContain('no hubo descuentos ni ventas anuladas');
    });

    it('describe en español lo que cambió en la bitácora', () => {
        const [reversal, edit] = sampleReport().audit;
        expect(auditDetail(reversal)).toBe('Se devolvieron $150.00.');
        expect(auditDetail(edit)).toBe('precio: 200 -> 220');
    });

    it('la bitácora no muestra NaN cuando una entrada antigua no trae todos los datos', () => {
        const base = { at: '2026-11-14T10:00:00Z', entity: 'cash_session', entity_id: 's', actor: 'Dago', role: 'receptionist', reason: null };
        const old = auditDetail({ ...base, action: 'cash_closed', details: { after: { expected_cash: 1500, counted_cash: 1480, difference: -20 } } });
        expect(old).toBe('Esperado $1,500.00, contado $1,480.00, diferencia -$20.00.');
        expect(old).not.toContain('NaN');
        expect(auditDetail({ ...base, action: 'cash_opened', details: { after: { opening_cash: 500, opening_expected: 500 } } })).toBe('Fondo inicial $500.00, esperado $500.00.');
        expect(auditDetail({ ...base, action: 'commission_settlement_paid', details: { after: { paid_amount: 32, payments: [{ amount: 20, method: 'cash' }, { amount: 12, method: 'transfer' }], period_start: '2026-11-01', period_end: '2026-11-07' } } }))
            .toBe('Pagado $32.00, (Efectivo $20.00, Transferencia $12.00), semana del 01/11/2026 al 07/11/2026.');
        expect(auditDetail({ ...base, action: 'inventory_adjusted', details: { after: { quantity_delta: 12, quantity_after: 20, notes: 'Ajuste manual' } } })).toBe('Ajuste de 12, quedaron 20, Ajuste manual.');
    });
});

describe('modelo del reporte', () => {
    const tables = (model: ReturnType<typeof buildReportModel>, id: string) =>
        model.sections.find((s) => s.id === id)!.blocks.filter((b): b is ReportTable => b.kind === 'table');

    it('tiene las diez secciones, cada una con su explicación', () => {
        const model = buildReportModel(sampleReport());
        expect(model.sections.map((s) => s.id)).toEqual(['portada', 'resumen', 'ventas', 'caja', 'gastos', 'comisiones', 'inventario', 'agenda', 'bitacora', 'anexo']);
        expect(model.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        for (const s of model.sections) expect(s.explain.length).toBeGreaterThan(20);
        expect(new Set(model.sections.map((s) => s.sheet)).size).toBe(10);
    });

    it('la portada lleva el folio y el código cuando ya se emitió', () => {
        const draft = buildReportModel(sampleReport());
        expect(JSON.stringify(draft.sections[0])).toContain('Se asigna al descargar');
        const issued = buildReportModel(sampleReport(), { folio: 'REP-000007', sha256: 'ab'.repeat(32) });
        expect(JSON.stringify(issued.sections[0])).toContain('REP-000007');
        expect(JSON.stringify(issued.sections[0])).toContain('ab'.repeat(32));
        expect(reportFileName(issued)).toBe('reporte-REP-000007-interno-2026-11-09_2026-11-15');
    });

    it('la caja muestra el conteo de billetes y monedas y el reparto del efectivo', () => {
        const caja = tables(buildReportModel(sampleReport()), 'caja');
        const cierre = tableTexts(caja[1], 'America/Mexico_City');
        expect(cierre.head).toContain('Fondo dejado');
        expect(cierre.body[0]).toContain('Renta y gastos');
        const conteo = tableTexts(caja[2], 'America/Mexico_City');
        expect(conteo.body).toEqual([
            [expect.stringContaining('T1'), '$500.00', '2', '$1,000.00'],
            [expect.stringContaining('T1'), '$50.00', '2', '$100.00'],
        ]);
    });

    it('con audiencia interno incluye al cliente y con contador no hay rastro de ningún cliente', () => {
        const everything = (a: 'interno' | 'contador') => JSON.stringify(buildReportModel(sampleReport(a), { folio: 'REP-1', sha256: 'a'.repeat(64) }));
        expect(everything('interno')).toContain('Juan Pérez');
        expect(everything('interno')).toContain('5551234567');
        const external = everything('contador');
        for (const secret of ['Juan Pérez', 'María López', '5551234567', '5557654321']) expect(external).not.toContain(secret);
        const annex = tables(buildReportModel(sampleReport('contador')), 'anexo')[0];
        expect(annex.columns.map((c) => c.header)).not.toContain('Cliente');
        const agenda = tables(buildReportModel(sampleReport('contador')), 'agenda');
        expect(agenda.flatMap((t) => t.columns.map((c) => c.header))).not.toContain('Cliente');
        expect(agenda.flatMap((t) => t.columns.map((c) => c.header))).not.toContain('Teléfono');
    });

    it('cada fila trae tantas celdas como columnas', () => {
        for (const audience of ['interno', 'contador'] as const) {
            for (const section of buildReportModel(sampleReport(audience)).sections) {
                for (const block of section.blocks) {
                    if (block.kind !== 'table') continue;
                    for (const row of block.rows) expect(row).toHaveLength(block.columns.length);
                    if (block.total) expect(block.total).toHaveLength(block.columns.length);
                }
            }
        }
    });
});
