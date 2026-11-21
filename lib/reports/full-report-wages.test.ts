import { describe, expect, it } from 'vitest';
import {
    buildReportModel, executiveParagraph, tableTexts, type ReportBlock, type ReportHero, type ReportKpis, type ReportModel, type ReportStack, type ReportTable,
} from './full-report';
import { sampleReport, sampleReportWithWages } from './full-report.fixture';

// Auditoría del 21 nov 2026: la utilidad ya restaba sueldos y bonos, pero el reporte no los mostraba y las cuentas
// impresas no sumaban ("Queda antes de gastos $10,448 − Gastos $692 = Utilidad $7,516"). Cada prueba rehace la suma.
describe('reporte: sueldos, bonos y movimientos del equipo', () => {
    const TZ = 'America/Mexico_City';
    const section = (model: ReportModel, id: string) => model.sections.find((s) => s.id === id)!;
    const blocks = <K extends ReportBlock['kind']>(model: ReportModel, id: string, kind: K) =>
        section(model, id).blocks.filter((b): b is Extract<ReportBlock, { kind: K }> => b.kind === kind);
    const table = (model: ReportModel, id: string, title: string) => blocks(model, id, 'table').find((t) => t.title === title)!;
    const row = (t: ReportTable, label: string) => t.rows.find((r) => r[0] === label)!;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const model = () => buildReportModel(sampleReportWithWages());

    it('estado de resultados: muestra sueldos y bonos, y cada subtotal sale de sumar los renglones que se ven', () => {
        const t = table(model(), 'resultado', 'Estado de resultados');
        expect(row(t, 'Menos sueldos del personal').slice(1, 3)).toEqual([-400, 0]);
        expect(row(t, 'Menos bonos por metas').slice(1, 3)).toEqual([-100, 0]);
        // Antes del periodo no había sueldos: no se divide entre cero.
        expect(row(t, 'Menos sueldos del personal')[4]).toBe('Sin datos para comparar');
        // 3,000 − 1,180 − 120 − 400 − 100 − 180 = 1,020; menos 200 de gastos = 820.
        expect(row(t, 'Queda antes de gastos')[1]).toBe(1020);
        expect(row(t, 'Utilidad neta').slice(1, 3)).toEqual([820, 910]);
        const upTo = (label: string) => t.rows.slice(0, t.rows.findIndex((r) => r[0] === label)).filter((_, i) => t.styles![i] === 'minor').reduce((a, r) => a + Number(r[1]), 0);
        expect(r2(upTo('Queda antes de gastos'))).toBe(1020);
        expect(r2(upTo('Utilidad neta'))).toBe(820);
        // La misma cuenta con el texto que se imprime en pantalla, PDF y Excel.
        const printed = tableTexts(t, TZ).body;
        const amount = (label: string) => Number(printed.find((r) => r[0] === label)![1].replace(/[$,]/g, ''));
        const gastos = printed.filter((r) => r[0].startsWith('Menos gastos')).reduce((a, r) => a + Number(r[1].replace(/[$,]/g, '')), 0);
        expect(r2(amount('Queda antes de gastos') + gastos)).toBe(amount('Utilidad neta'));
        // "De cada $100" de los renglones de detalle también da lo de la utilidad (salvo centavos de redondeo).
        const per100 = t.rows.filter((_, i) => t.styles![i] === 'minor').reduce((a, r) => a + Number(r[5]), 0);
        expect(Math.abs(per100 - Number(row(t, 'Utilidad neta')[5]))).toBeLessThanOrEqual(0.02);
    });

    it('de cada $100: con sueldos y bonos los segmentos suman 100 y el texto los nombra', () => {
        const [stack] = blocks(model(), 'resultado', 'stack') as ReportStack[];
        expect(stack.segments.map((s) => [s.label, s.value, s.color])).toEqual([
            ['Comisiones', 43.33, 'commission'], ['Sueldos y bonos', 16.67, 'payroll'], ['Costo de producto', 6, 'cost'], ['Gastos', 6.67, 'expense'], ['Utilidad', 27.33, 'profit'],
        ]);
        expect(r2(stack.segments.reduce((a, s) => a + s.value, 0))).toBe(100);
        expect(stack.caption).toBe('De cada $100 cobrados, $72.67 se fueron en comisiones, sueldos, bonos, mercancía y gastos, y $27.33 le quedaron al negocio.');
        // Solo sueldos: el segmento se llama "Sueldos".
        const onlyWages = sampleReportWithWages();
        onlyWages.financial!.current.bonuses = { total: 0, count: 0 };
        onlyWages.financial!.current.profit = 920;
        expect((blocks(buildReportModel(onlyWages), 'resultado', 'stack') as ReportStack[])[0].segments[1]).toMatchObject({ label: 'Sueldos', value: 13.33 });
    });

    it('resumen ejecutivo: el texto y la fórmula nombran sueldos y bonos, y las cifras del párrafo dan la utilidad', () => {
        const report = sampleReportWithWages();
        const text = executiveParagraph(report);
        const sentence = 'De eso se fueron $1,300.00 en comisiones, $400.00 en sueldos del personal, $100.00 en bonos por metas, $180.00 en el costo de los productos vendidos y $200.00 en gastos.';
        expect(text).toContain(sentence);
        expect(text).toContain('La utilidad neta fue de $820.00');
        const spent = [...sentence.matchAll(/\$([\d,]+\.\d\d)/g)].reduce((a, m) => a + Number(m[1].replace(/,/g, '')), 0);
        expect(r2(3000 - spent)).toBe(820);
        const kpis = buildReportModel(report).sections[1].blocks.find((b): b is ReportKpis => b.kind === 'kpis')!;
        const pick = (label: string) => kpis.items.find((k) => k.label === label)!;
        expect(pick('Utilidad neta').note).toBe('Ingresos − comisiones − sueldos − bonos − costo de producto − gastos.');
        expect([pick('Sueldos').value, pick('Sueldos').previous, pick('Sueldos').invert]).toEqual([400, 0, true]);
        expect(pick('Sueldos').note).toContain('5 días trabajados');
        expect(pick('Bonos').value).toBe(100);
        // Con los KPIs que se ven se llega a la utilidad.
        expect(r2(pick('Ingresos').value - pick('Comisiones').value - pick('Sueldos').value - pick('Bonos').value - pick('Costo de producto').value - pick('Gastos').value)).toBe(pick('Utilidad neta').value);
        expect(section(buildReportModel(report), 'resultado').explain).toBe('Cuánto entró, cuánto se fue en comisiones, sueldos, bonos, mercancía y gastos, y cuánto le quedó al negocio.');
    });

    it('sin sueldos ni bonos el reporte queda igual que antes (no aparecen renglones en cero)', () => {
        const m = buildReportModel(sampleReport());
        const json = JSON.stringify([section(m, 'resumen'), section(m, 'resultado'), section(m, 'personas'), section(m, 'balance'), section(m, 'comisiones')]);
        expect(json).not.toMatch(/[Ss]ueldo|[Bb]ono/);
        expect(blocks(m, 'comisiones', 'table').map((t) => t.title)).toEqual(['Por persona', 'Recibos de pago emitidos en el periodo', 'Ajustes de comisión']);
        expect(section(m, 'comisiones').explain).toBe('Lo que ganó cada persona en comisiones y propinas, los recibos de pago emitidos y los ajustes.');
        const kpis = m.sections[1].blocks.find((b): b is ReportKpis => b.kind === 'kpis')!;
        expect(kpis.items.find((k) => k.label === 'Utilidad neta')!.note).toBe('Ingresos − comisiones − costo de producto − gastos.');
        // Si el periodo anterior sí tuvo sueldos, el renglón aparece (en cero este periodo) para poder comparar.
        const previousOnly = sampleReport();
        previousOnly.financial!.previous = { ...previousOnly.financial!.previous, wages: { total: 300, days: 3 }, profit: 610 };
        expect(row(table(buildReportModel(previousOnly), 'resultado', 'Estado de resultados'), 'Menos sueldos del personal').slice(1, 3)).toEqual([0, -300]);
    });

    it('lo que deja cada persona: el sueldo y el bono van en su columna y cada renglón se puede rehacer a mano', () => {
        const report = sampleReportWithWages();
        const m = buildReportModel(report);
        const t = table(m, 'personas', 'Por persona');
        expect(t.columns.map((c) => c.header)).toEqual(['Persona', 'Servicios', 'Productos', 'Total vendido', 'Comisión ganada', 'Propinas', 'Costo de producto', 'Sueldo', 'Bonos', 'Deja al negocio']);
        // Quien solo cobra sueldo (no vendió) también sale: su costo es parte de la utilidad.
        expect(row(t, 'Dago')).toEqual(['Dago', 0, 0, 0, 0, 0, 0, 400, 0, -400]);
        expect(row(t, 'Deya')).toEqual(['Deya', 1600, 400, 2000, 900, 80, 120, 0, 100, 880]);
        for (const r of t.rows) {
            const person = report.financial!.current.by_person!.find((b) => b.name === r[0])!;
            // vendido − comisiones de esas ventas − costo de producto − sueldo − bonos = deja al negocio
            expect(r2(Number(r[3]) - person.sales_commissions - Number(r[6]) - Number(r[7]) - Number(r[8]))).toBe(r[9]);
        }
        expect(t.total).toEqual(['Total', 2400, 600, 3000, 1300, 120, 180, 400, 100, 1020]);
        const body = blocks(m, 'personas', 'text').find((b) => b.tone === 'body')!;
        expect(body.text).toBe('Entre todos dejaron $1,020.00; menos $200.00 de gastos, queda la utilidad neta de $820.00.');
        const note = blocks(m, 'personas', 'text').find((b) => b.tone === 'note')!;
        expect(note.text).toContain('− su sueldo por día − sus bonos');
        expect(note.text).toContain('no quiere decir que deba dinero');
        const earned = blocks(m, 'personas', 'bars')[1];
        expect(earned.title).toBe('Lo que ganó cada persona (comisión + propinas + sueldo + bonos)');
        expect(earned.items).toEqual([{ label: 'Deya', value: 1080 }, { label: 'Sonia', value: 440 }, { label: 'Dago', value: 400 }]);
    });

    it('balance de efectivo: «cómo cuadra con la utilidad» suma, con sueldos y bonos como partidas', () => {
        const m = model();
        const [hero] = blocks(m, 'balance', 'hero') as ReportHero[];
        // Entró 3,000 + 120; salió 200 de gastos + 525 de recibos; quedó 2,395.
        expect(hero.items.map((i) => i.value)).toEqual([3120, 725, 2395]);
        expect(hero.items[2].caption).toContain('Incluye comisiones, sueldos, bonos y propinas que todavía no se pagan.');
        const recon = table(m, 'balance', 'Cómo cuadra con la utilidad');
        expect(recon.rows.map((r) => r[1])).toEqual([820, 1300, 400, 100, 120, -525, 180, 2395]);
        expect(recon.rows[2][0]).toContain('Más sueldos del periodo');
        expect(recon.rows[3][0]).toContain('Más bonos del periodo');
        expect(r2(recon.rows.slice(0, -1).reduce((a, r) => a + Number(r[1]), 0))).toBe(recon.rows.at(-1)![1]);
        expect(recon.styles).toHaveLength(recon.rows.length);
        expect(recon.styles!.at(-1)).toBe('result');
        expect(JSON.stringify(recon.rows)).not.toMatch(/ninguna partida|no aparecen en ninguna forma de pago/);
        // Adelantos y préstamos entregados no están restados en este balance: se avisa con su monto.
        const warning = blocks(m, 'balance', 'text').find((b) => b.tone === 'body')!;
        expect(warning.text).toContain('$30.00 en adelantos al equipo');
        expect(warning.text).toContain('no está restado en "Salió" ni en "Quedó"');
        expect(blocks(buildReportModel(sampleReport()), 'balance', 'text').some((b) => b.tone === 'body')).toBe(false);
    });

    it('balance: si algo no cuadra se dice en un renglón, nunca se imprime «igual» con una suma que no da', () => {
        // Las propinas por forma de pago no suman el total de propinas (dato incompleto): 20 sin explicar.
        const broken = sampleReportWithWages();
        broken.financial!.current.tips = { total: 140, count: 4, by_method: { cash: 80, card: 40, transfer: 0, other: 0 } };
        // Y un gasto del resultado que no viene en ninguna forma de pago.
        broken.financial!.current.expenses = { ...broken.financial!.current.expenses, by_method: { cash: 150, card: 0, transfer: 0, other: 0 } };
        const recon = table(buildReportModel(broken), 'balance', 'Cómo cuadra con la utilidad');
        expect(row(recon, 'Más gastos del resultado que no aparecen en ninguna forma de pago del balance')[1]).toBe(50);
        expect(row(recon, 'Diferencia que ninguna partida de arriba explica (revisar)')[1]).toBe(-20);
        expect(r2(recon.rows.slice(0, -1).reduce((a, r) => a + Number(r[1]), 0))).toBe(recon.rows.at(-1)![1]);
        expect(recon.styles).toHaveLength(recon.rows.length);
    });

    it('caja: cada cierre dice a quién se entregó el retiro y hay un total por persona', () => {
        for (const audience of ['interno', 'contador'] as const) {
            const m = buildReportModel(sampleReportWithWages(audience));
            const cierre = table(m, 'caja', 'Cierre y reparto del efectivo');
            const col = cierre.columns.findIndex((c) => c.header === 'Retiro entregado a');
            expect(cierre.columns[col - 1].header).toBe('Retiro');
            // T1: anotado en la bitácora del cierre; T2: hubo retiro y nadie quedó anotado; T3: sin retiro.
            expect(cierre.rows.map((r) => [r[col - 1], r[col]])).toEqual([[200, 'Sonia'], [300, 'Sin registrar'], [0, null]]);
            const who = table(m, 'caja', 'Retiros al cerrar la caja, por quién los recibió');
            expect(who.rows).toEqual([['Sonia', 1, 200], ['Sin registrar', 1, 300]]);
            expect(who.total).toEqual(['Total', 2, 500]);
            // El total por persona es el mismo "Efectivo retirado al cerrar la caja" del balance.
            expect(row(table(m, 'balance', 'Efectivo que cambió de lugar (no es gasto)'), 'Efectivo retirado al cerrar la caja')[1]).toBe(500);
            expect(blocks(m, 'caja', 'text').at(-1)!.text).toContain('no una confirmación de quien recibe');
        }
        // Un reporte sin la bitácora del cierre no inventa a nadie: el retiro queda "Sin registrar".
        const old = table(buildReportModel(sampleReport()), 'caja', 'Retiros al cerrar la caja, por quién los recibió');
        expect(old.rows).toEqual([['Sin registrar', 1, 200]]);
        const none = sampleReport();
        none.cash.sessions = [];
        expect(table(buildReportModel(none), 'caja', 'Retiros al cerrar la caja, por quién los recibió').rows).toEqual([]);
    });

    it('recibos: «cómo se armó cada recibo» suma el total pagado renglón por renglón, también con neto negativo', () => {
        const m = model();
        const t = table(m, 'comisiones', 'Cómo se armó cada recibo');
        expect(t.columns.map((c) => c.header)).toEqual(['Recibo', 'Persona', 'Sueldo', 'Comisiones', 'Ajustes', 'Propinas', 'Bonos', 'Adelantos', 'Abonos a préstamos', 'Descuentos', 'Saldo entre semanas', 'Total pagado']);
        expect(t.rows).toEqual([
            ['LIQ-000001', 'Deya', 0, 300, -20, 25, 0, -30, 0, 0, 0, 275],
            ['LIQ-000002', 'Dago', 400, 0, 0, 0, 0, 0, -100, -50, 0, 250],
            // Ganó 100 y debía 150: se le paga $0 y los 50 pasan a la semana siguiente.
            ['LIQ-000003', 'Sonia', 0, 100, 0, 0, 0, -150, 0, 0, 50, 0],
        ]);
        for (const r of t.rows) expect(r2(r.slice(2, 11).reduce((a: number, v) => a + Number(v), 0))).toBe(r[11]);
        expect(t.total).toEqual(['Total', '', 400, 400, -20, 25, 0, -180, -100, -50, 50, 525]);
        // El total pagado es el mismo de la tabla de recibos y de "Pagos al equipo" del balance.
        expect(table(m, 'comisiones', 'Recibos de pago emitidos en el periodo').total![4]).toBe(525);
        expect(table(m, 'balance', 'Entradas y salidas por forma de pago').total![4]).toBe(-525);
    });

    it('movimientos del equipo: los asientos del periodo y su suma por tipo, tal como los entrega la base', () => {
        const m = model();
        expect(tableTexts(table(m, 'comisiones', 'Movimientos del equipo registrados en el periodo'), TZ).body).toEqual([
            ['10/11/2026 12:00', 'Deya', 'Adelanto', '$30.00', 'Adelanto para pasaje', 'Caja del día', 'LIQ-000001', 'Vigente', 'Dueño Gallo 420'],
            ['12/11/2026 12:00', 'Dago', 'Descuento', '$50.00', 'Se llevó un peine', '', 'Pendiente de recibo', 'Vigente', 'Sonia'],
        ]);
        expect(table(m, 'comisiones', 'Movimientos del equipo: suma por tipo').rows).toEqual([
            ['Adelantos entregados', 30], ['Abonos a préstamos', 100], ['Descuentos', 50], ['Bonos por metas (en recibos del periodo)', 100], ['Sueldos pagados en recibos del periodo', 400],
        ]);
        const note = blocks(m, 'comisiones', 'text').at(-1)!;
        expect(note.text).toContain('el sueldo que cuenta como costo del periodo (por día trabajado) es el de "Resultado del periodo"');
        expect(section(m, 'comisiones').explain).toContain('movimientos del equipo');
        // Un asiento cancelado se marca y no promete recibo.
        const cancelled = sampleReportWithWages();
        cancelled.payouts.staff_ledger![1] = { ...cancelled.payouts.staff_ledger![1], cancelled: true };
        expect(table(buildReportModel(cancelled), 'comisiones', 'Movimientos del equipo registrados en el periodo').rows[1].slice(6, 8)).toEqual([null, 'Cancelado']);
    });

    it('la versión para el contador trae lo mismo de sueldos, recibos y retiros, sin datos de clientes', () => {
        const external = buildReportModel(sampleReportWithWages('contador'));
        const internal = model();
        for (const [id, title] of [['resultado', 'Estado de resultados'], ['personas', 'Por persona'], ['balance', 'Cómo cuadra con la utilidad'], ['comisiones', 'Cómo se armó cada recibo'], ['comisiones', 'Movimientos del equipo registrados en el periodo']] as const) {
            expect(table(external, id, title).rows).toEqual(table(internal, id, title).rows);
        }
        const json = JSON.stringify(external);
        for (const secret of ['Juan Pérez', 'María López', '5551234567', '5557654321']) expect(json).not.toContain(secret);
    });

    it('cada fila trae tantas celdas como columnas, también con sueldos y movimientos', () => {
        for (const audience of ['interno', 'contador'] as const) {
            for (const s of buildReportModel(sampleReportWithWages(audience)).sections) {
                for (const block of s.blocks) {
                    if (block.kind !== 'table') continue;
                    for (const r of block.rows) expect(r).toHaveLength(block.columns.length);
                    if (block.total) expect(block.total).toHaveLength(block.columns.length);
                    if (block.styles) expect(block.styles).toHaveLength(block.rows.length);
                }
            }
        }
    });
});

describe('bitácora del reporte: sin nombres técnicos', () => {
    it('una acción que el reporte no rotula usa la frase en español de la pantalla Bitácora', async () => {
        const { auditActionLabel } = await import('./full-report');
        const { actionLabel } = await import('@/lib/audit/labels');
        for (const action of ['envelope_reserve_in', 'recurring_expense_created', 'appointment_notification_opened', 'user_branch_access.insert']) {
            expect(auditActionLabel(action)).toBe(actionLabel(action));
            expect(auditActionLabel(action)).not.toMatch(/_|envelope|recurring|appointment|access/i);
        }
        expect(auditActionLabel('cash_withdrawal_recipient_changed')).toBe('Cambio de quién recibe el retiro de la caja');
    });
});
