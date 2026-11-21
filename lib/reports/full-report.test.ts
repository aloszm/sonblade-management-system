import { describe, expect, it } from 'vitest';
import {
    auditDetail, buildReportModel, chartSeries, executiveParagraph, formatCell, formatDateTime, money, percentChange,
    reportFileName, reportPresetRange, tableTexts, validateRange, type ReportBlock, type ReportHero, type ReportKpis, type ReportModel,
    type ReportStack, type ReportTable,
} from './full-report';
import { sampleFinancial, sampleReport } from './full-report.fixture';
import type { FullReport } from './full-report-types';

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
    it('un reporte emitido antes del resultado financiero conserva su texto (con la advertencia de costo)', () => {
        const old = sampleReport();
        delete old.financial;
        const text = executiveParagraph(old);
        expect(text).toContain('$3,000.00');
        expect(text).toContain('10 ventas');
        expect(text).toContain('subieron 50%');
        expect(text).toContain('utilidad');
        expect(text).toContain('todavía no descuenta el costo de los productos');
        expect(text).toContain('1 descuento por $50.00');
        expect(text).toContain('1 venta por $150.00');
    });

    it('con resultado financiero el resumen da la utilidad neta, el margen y aparta las propinas', () => {
        const text = executiveParagraph(sampleReport());
        expect(text).toContain('$3,000.00');
        expect(text).toContain('$1,300.00 en comisiones, $180.00 en el costo de los productos vendidos y $200.00 en gastos');
        expect(text).toContain('La utilidad neta fue de $1,320.00');
        expect(text).toContain('de cada $100 que entraron le quedaron $44.00');
        expect(text).toContain('son de los barberos');
        expect(text).not.toContain('todavía no descuenta');
        expect(text).not.toContain('Ojo');
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
        // Desde el 21 nov 2026 el cierre con diferencia lleva su motivo.
        expect(auditDetail({ ...base, action: 'cash_closed', details: { after: { expected_cash: 500, counted_cash: 470, difference: -30, difference_reason: 'Cambio mal dado', float_left: 470, reserve_amount: 0, withdrawn_amount: 0 } } }))
            .toBe('Esperado $500.00, contado $470.00, diferencia -$30.00, motivo de la diferencia: Cambio mal dado, fondo dejado $470.00, apartado $0.00, retiro $0.00.');
        expect(auditDetail({ ...base, action: 'cash_opened', details: { after: { opening_cash: 500, opening_expected: 500 } } })).toBe('Fondo inicial $500.00, esperado $500.00.');
        expect(auditDetail({ ...base, action: 'commission_settlement_paid', details: { after: { paid_amount: 32, payments: [{ amount: 20, method: 'cash' }, { amount: 12, method: 'transfer' }], period_start: '2026-11-01', period_end: '2026-11-07' } } }))
            .toBe('Pagado $32.00, (Efectivo $20.00, Transferencia $12.00), semana del 01/11/2026 al 07/11/2026.');
        expect(auditDetail({ ...base, action: 'inventory_adjusted', details: { after: { quantity_delta: 12, quantity_after: 20, notes: 'Ajuste manual' } } })).toBe('Ajuste de 12, quedaron 20, Ajuste manual.');
    });
});

describe('modelo del reporte', () => {
    const tables = (model: ReturnType<typeof buildReportModel>, id: string) =>
        model.sections.find((s) => s.id === id)!.blocks.filter((b): b is ReportTable => b.kind === 'table');

    it('tiene catorce secciones, el resultado financiero justo después del resumen, cada una con su explicación', () => {
        const model = buildReportModel(sampleReport());
        expect(model.sections.map((s) => s.id)).toEqual(['portada', 'resumen', 'resultado', 'propinas', 'personas', 'balance', 'ventas', 'caja', 'gastos', 'comisiones', 'inventario', 'agenda', 'bitacora', 'anexo']);
        expect(model.sections.map((s) => s.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
        for (const s of model.sections) expect(s.explain.length).toBeGreaterThan(20);
        expect(new Set(model.sections.map((s) => s.sheet)).size).toBe(14);
        for (const s of model.sections) expect(s.sheet.length).toBeLessThanOrEqual(31);
    });

    it('un reporte emitido antes del resultado financiero se sigue armando con sus diez secciones', () => {
        const old = sampleReport();
        delete old.financial;
        const model = buildReportModel(old);
        expect(model.sections.map((s) => s.id)).toEqual(['portada', 'resumen', 'ventas', 'caja', 'gastos', 'comisiones', 'inventario', 'agenda', 'bitacora', 'anexo']);
        const kpis = model.sections[1].blocks.find((b): b is ReportKpis => b.kind === 'kpis')!;
        expect(kpis.items.find((k) => k.label === 'Utilidad')!.value).toBe(1500);
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

    it('la versión para el contador no trae login_name, correos sintéticos ni teléfonos de clientes o del personal', () => {
        const withLogins = (a: 'interno' | 'contador') => {
            const report = sampleReport(a);
            report.audit.push(
                { at: '2026-11-12T19:30:00+00:00', action: 'business_memberships.update', entity: 'business_memberships', entity_id: 'u', actor: 'Sistema', role: null, reason: null,
                    details: { changes: { login_name: { from: null, to: 'alonso' }, must_change_pin: { from: false, to: true } } } },
                { at: '2026-11-12T19:31:00+00:00', action: 'employees.update', entity: 'employees', entity_id: 'e', actor: 'Alonso', role: 'owner', reason: null,
                    details: { changes: { display_name: { from: 'Dago', to: 'Dago R' }, phone: { from: '5511112222', to: '5533334444' }, email: { from: null, to: 'dago@gallo-420.barberos.invalid' } } } },
                { at: '2026-11-12T19:32:00+00:00', action: 'cash_closed', entity: 'cash_session', entity_id: 'c', actor: 'Dago', role: 'receptionist', reason: null,
                    details: { after: { counted_cash: 500, login_name: 'dago', email: 'dago@gallo-420.barberos.invalid' } } },
            );
            return JSON.stringify(buildReportModel(report, { folio: 'REP-1', sha256: 'a'.repeat(64) }));
        };
        const external = withLogins('contador');
        expect(external).not.toMatch(/login_name/);
        expect(external).not.toContain('@gallo-420.barberos.invalid');
        for (const secret of ['5551234567', '5557654321', '5511112222', '5533334444', 'Juan Pérez', 'María López']) expect(external).not.toContain(secret);
        // El nombre visible del personal sí sale (el contador ve comisiones y pagos).
        expect(external).toContain('Dago R');
        expect(external).toContain('Alonso');
        // La versión interna no cambia.
        const internal = withLogins('interno');
        expect(internal).toContain('login_name');
        expect(internal).toContain('5551234567');
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

describe('resultado financiero', () => {
    const TZ = 'America/Mexico_City';
    const section = (model: ReportModel, id: string) => model.sections.find((s) => s.id === id)!;
    const blocks = <K extends ReportBlock['kind']>(model: ReportModel, id: string, kind: K) =>
        section(model, id).blocks.filter((b): b is Extract<ReportBlock, { kind: K }> => b.kind === kind);
    const table = (model: ReportModel, id: string, title: string) => blocks(model, id, 'table').find((t) => t.title === title)!;
    const row = (t: ReportTable, label: string) => t.rows.find((r) => r[0] === label)!;

    it('el estado de resultados va en cascada: ingresos − comisiones − costo − gastos = utilidad neta', () => {
        const model = buildReportModel(sampleReport());
        const t = table(model, 'resultado', 'Estado de resultados');
        expect(t.columns.map((c) => c.header)).toEqual(['Concepto', 'Este periodo', 'Periodo anterior', 'Diferencia', 'Cambio', 'De cada $100']);
        expect(row(t, 'Total de ingresos').slice(1)).toEqual([3000, 2000, 1000, 50, 100]);
        expect(row(t, 'Menos comisiones por servicios')[1]).toBe(-1180);
        expect(row(t, 'Menos costo de los productos vendidos')[1]).toBe(-180);
        expect(row(t, 'Queda antes de gastos')[1]).toBe(1520);
        expect(row(t, 'Menos gastos: Limpieza').slice(1, 3)).toEqual([-50, 0]);
        // Un gasto que antes no existía no se divide entre cero.
        expect(row(t, 'Menos gastos: Limpieza')[4]).toBe('Sin datos para comparar');
        // Más gasto = cambio positivo, aunque el importe vaya en negativo.
        expect(row(t, 'Menos gastos: General')[4]).toBe(50);
        expect(row(t, 'Utilidad neta').slice(1)).toEqual([1320, 910, 410, 45.1, 44]);
        expect(t.styles![t.rows.length - 1]).toBe('result');
        // Los renglones de detalle suman exactamente la utilidad.
        const detail = t.rows.filter((_, i) => t.styles![i] === 'minor').reduce((a, r) => a + Number(r[1]), 0);
        expect(Math.round(detail * 100) / 100).toBe(1320);
        // Las propinas no son parte del resultado.
        expect(JSON.stringify(t.rows)).not.toMatch(/ropina/);
        expect(tableTexts(t, TZ).body.at(-1)).toEqual(['Utilidad neta', '$1,320.00', '$910.00', '$410.00', '+45.1%', '$44.00']);
    });

    it('cifras grandes: utilidad, margen y comparación contra el periodo anterior', () => {
        const [hero] = blocks(buildReportModel(sampleReport()), 'resultado', 'hero') as ReportHero[];
        expect(hero.items.map((i) => [i.label, i.value, i.tone])).toEqual([['Utilidad neta', 1320, 'good'], ['Margen', 44, 'good'], ['Contra el periodo anterior', 410, 'good']]);
        expect(hero.items[1].caption).toBe('De cada $100 que entraron, $44.00 fueron ganancia.');
        expect(hero.items[2].caption).toContain('+45.1%');
    });

    it('de cada $100: comisiones, costo, gastos y utilidad suman 100', () => {
        const [stack] = blocks(buildReportModel(sampleReport()), 'resultado', 'stack') as ReportStack[];
        expect(stack.segments.map((s) => [s.label, s.value])).toEqual([['Comisiones', 43.33], ['Costo de producto', 6], ['Gastos', 6.67], ['Utilidad', 44]]);
        expect(stack.segments.reduce((a, s) => a + s.value, 0)).toBeCloseTo(100, 1);
        expect(stack.empty).toBeNull();
    });

    it('sin ingresos: no divide entre cero, el margen queda vacío y lo explica', () => {
        const report = sampleReport();
        const fin = sampleFinancial();
        const zero = { total: 0, services: 0, products: 0 };
        fin.current = {
            ...fin.current, revenue: { ...zero, discounts: 0 }, commissions: zero, product_cost: { ...fin.current.product_cost, total: 0 },
            tips: { total: 0, count: 0, by_method: { cash: 0, card: 0, transfer: 0, other: 0 } },
            profit: -200, margin_pct: null, by_person: [], counts: { sales: 0, voided_excluded: 0, service_units: 0, product_units: 0 },
        };
        fin.previous = { ...fin.current, expenses: { total: 0, by_category: [], by_method: { cash: 0, card: 0, transfer: 0, other: 0 } }, profit: 0, by_person: null };
        report.financial = fin;
        report.sales.payments = { cash: 0, card: 0, transfer: 0, other: 0 };
        const model = buildReportModel(report);
        const json = JSON.stringify(model);
        expect(json).not.toMatch(/NaN|Infinity/);
        const [hero] = blocks(model, 'resultado', 'hero') as ReportHero[];
        expect(hero.items[0]).toMatchObject({ label: 'Pérdida del periodo', value: -200, tone: 'bad' });
        expect(hero.items[1]).toMatchObject({ label: 'Margen', value: null });
        expect(hero.items[1].caption).toContain('Sin ingresos');
        const [stack] = blocks(model, 'resultado', 'stack') as ReportStack[];
        expect(stack.empty).toContain('Sin ingresos');
        const t = table(model, 'resultado', 'Estado de resultados');
        expect(row(t, 'Pérdida neta')).toEqual(['Pérdida neta', -200, 0, -200, 'Sin datos para comparar', null]);
        expect(tableTexts(t, TZ).body.flat().join('|')).not.toMatch(/NaN|Infinity/);
        expect(blocks(model, 'personas', 'table')[0].rows).toEqual([]);
        expect(executiveParagraph(report)).toContain('La pérdida fue de $200.00');
    });

    it('un producto sin costo no se toma como cero en silencio: se avisa con nombre y unidades', () => {
        const report = sampleReport();
        report.financial!.current.product_cost = { total: 120, source: 'catalog', units_without_cost: 2, missing: [{ product_id: 'p9', name: 'Polvo de textura', units: 2 }] };
        const model = buildReportModel(report);
        const warning = blocks(model, 'resultado', 'text').find((b) => b.tone === 'warning');
        expect(warning?.text).toContain('2 unidades vendidas no tienen costo registrado');
        expect(warning?.text).toContain('Polvo de textura: 2');
        expect(warning?.text).toContain('la utilidad real es menor');
        expect(executiveParagraph(report)).toContain('Ojo: 2 productos vendidos no tienen costo registrado');
        expect(blocks(buildReportModel(sampleReport()), 'resultado', 'text').some((b) => b.tone === 'warning')).toBe(false);
    });

    it('propinas: total, por persona y por forma de pago, con la frase de que son del barbero', () => {
        const model = buildReportModel(sampleReport());
        const [hero] = blocks(model, 'propinas', 'hero') as ReportHero[];
        expect(hero.items[0].value).toBe(120);
        expect(hero.items[0].caption).toContain('Son del barbero; no forman parte de la utilidad.');
        expect(tableTexts(table(model, 'propinas', 'Por persona'), TZ).body).toEqual([['Deya', '$80.00', '2', '66.7%'], ['Sonia', '$40.00', '1', '33.3%']]);
        expect(tableTexts(table(model, 'propinas', 'Por forma de pago'), TZ).body).toEqual([['Efectivo', '$80.00', '66.7%'], ['Tarjeta', '$40.00', '33.3%']]);
        expect(section(model, 'propinas').explain).toContain('son del barbero');
    });

    it('por persona: lo que vende, gana y deja; la suma de lo que dejan menos gastos es la utilidad', () => {
        const model = buildReportModel(sampleReport());
        const t = table(model, 'personas', 'Por persona');
        expect(t.rows[0]).toEqual(['Deya', 1600, 400, 2000, 900, 80, 120, 980]);
        expect(t.total).toEqual(['Total', 2400, 600, 3000, 1300, 120, 180, 1520]);
        const sentence = blocks(model, 'personas', 'text').find((b) => b.tone === 'body')!;
        expect(sentence.text).toBe('Entre todos dejaron $1,520.00; menos $200.00 de gastos, queda la utilidad neta de $1,320.00.');
    });

    it('balance de efectivo: lo que entró, salió y quedó por forma de pago, y cómo cuadra con la utilidad', () => {
        const model = buildReportModel(sampleReport());
        const [hero] = blocks(model, 'balance', 'hero') as ReportHero[];
        // Entró 3,000 de ventas + 120 de propinas; salió 200 de gastos + 275 de pagos al equipo.
        expect(hero.items.map((i) => i.value)).toEqual([3120, 475, 2645]);
        const flow = table(model, 'balance', 'Entradas y salidas por forma de pago');
        expect(row(flow, 'Efectivo')).toEqual(['Efectivo', 2000, 80, -200, -200, 1680]);
        expect(row(flow, 'Transferencia')).toEqual(['Transferencia', 200, 0, 0, -75, 125]);
        expect(flow.total).toEqual(['Total', 3000, 120, -200, -275, 2645]);
        const recon = table(model, 'balance', 'Cómo cuadra con la utilidad');
        const lines = recon.rows.slice(0, -1).reduce((a, r) => a + Number(r[1]), 0);
        expect(lines).toBe(2645);
        expect(recon.rows.at(-1)).toEqual(['Igual a lo que quedó en el periodo', 2645]);
        const moved = table(model, 'balance', 'Efectivo que cambió de lugar (no es gasto)');
        expect(moved.rows.map((r) => r[1])).toEqual([100, 200, 400, 50, -20]);
        expect(section(model, 'balance').explain).toContain('no incluye bienes, deudas');
    });

    it('el resumen usa las mismas cifras que el resultado', () => {
        const kpis = buildReportModel(sampleReport()).sections[1].blocks.find((b): b is ReportKpis => b.kind === 'kpis')!;
        const pick = (label: string) => kpis.items.find((k) => k.label === label)!;
        expect([pick('Utilidad neta').value, pick('Utilidad neta').previous]).toEqual([1320, 910]);
        expect(pick('Costo de producto').value).toBe(180);
        expect(pick('Gastos').value).toBe(200);
        expect(pick('Propinas').note).toContain('no son ingreso');
    });

    it('la versión para contador trae el resultado financiero completo, con el desglose por persona, y sin clientes', () => {
        const external: FullReport = sampleReport('contador');
        const model = buildReportModel(external);
        expect(model.sections.map((s) => s.id)).toEqual(expect.arrayContaining(['resultado', 'propinas', 'personas', 'balance']));
        expect(table(model, 'personas', 'Por persona').rows.map((r) => r[0])).toEqual(['Deya', 'Sonia']);
        const json = JSON.stringify(model);
        for (const secret of ['Juan Pérez', 'María López', '5551234567', '5557654321']) expect(json).not.toContain(secret);
    });
});
