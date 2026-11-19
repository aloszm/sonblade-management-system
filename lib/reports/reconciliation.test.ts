import { describe, expect, it } from 'vitest';
import {
    ISSUE_GUIDE, ISSUE_KINDS, ISSUE_LABELS, countByKind, groupIssues, issueCounts, issueEmployees, issueGuide, issueKey,
    moneySummary, primaryAction, rowBalanced, rowState, secondaryAction, totals, type ReconciliationIssue, type ReconciliationRow,
} from './reconciliation';

const row = (over: Partial<ReconciliationRow> = {}): ReconciliationRow => ({
    day: '2026-11-15', employee_id: 'e1', name: 'Deya', agenda_services: 3, agenda_walk_in: 1, charged_services: 3,
    charged_units: 3, charged_amount: 600, commission: 300, commission_in_receipt: 0, issues: 0, ...over,
});

const APPT = '637543d8-f37c-482d-82ee-8447f1ada549';
const ITEM = '0d5fdca8-0000-4000-8000-000000000001';
const DEYA = '265d3ef7-22ce-41d3-82e4-5de43f3a8dd3';

const issue = (over: Partial<ReconciliationIssue> = {}): ReconciliationIssue => {
    const base: ReconciliationIssue = {
        day: '2026-11-15', employee_id: DEYA, name: 'Deya', kind: 'cobro_sin_agenda', at: '2026-11-15T11:44:16Z',
        appointment_id: null, sale_id: 's1', sale_item_id: ITEM, message: 'Se cobró Corte de cabello y no aparece en la agenda.',
        key: '', pre_agenda: false, status: 'pendiente', review: null, ...over,
    };
    return { ...base, key: over.key ?? issueKey(base.kind, base.day, base.appointment_id, base.sale_item_id, base.employee_id) };
};

describe('cuadre', () => {
    it('cuadra cuando agenda y cobros cuentan lo mismo y no hay pendientes', () => {
        expect(rowBalanced(row())).toBe(true);
        expect(rowBalanced(row({ charged_services: 2 }))).toBe(false);
        expect(rowBalanced(row({ issues: 1 }))).toBe(false);
        // Una diferencia revisada ya no cuenta como pendiente.
        expect(rowBalanced(row({ issues: 1, issues_pending: 0 }))).toBe(true);
    });

    it('distingue renglón que cuadra, revisado y con pendientes', () => {
        expect(rowState(row())).toBe('cuadra');
        expect(rowState(row({ agenda_services: 0, charged_services: 5, issues: 5, issues_pending: 0 }))).toBe('revisado');
        expect(rowState(row({ agenda_services: 0, charged_services: 5, issues: 5, issues_pending: 2 }))).toBe('pendiente');
    });

    it('suma los renglones (la base manda números como texto a veces)', () => {
        const t = totals([row(), row({ charged_amount: '150.50' as unknown as number, commission_in_receipt: 75 })]);
        expect(t).toEqual({ agenda: 6, charged: 6, amount: 750.5, commission: 600, inReceipt: 75 });
    });

    it('calcula la comisión que falta pagar', () => {
        expect(moneySummary([row({ commission: 4852, commission_in_receipt: 0 })]).commissionPending).toBe(4852);
        expect(moneySummary([row({ commission: 100.1, commission_in_receipt: 40.05 })]).commissionPending).toBe(60.05);
        expect(moneySummary([]).commissionPending).toBe(0);
    });
});

describe('clave de la diferencia', () => {
    it('es la misma que arma la base, con guion donde falta un dato', () => {
        expect(issueKey('llego_sin_cobro', '2026-11-15', APPT, null, DEYA))
            .toBe(`llego_sin_cobro:2026-11-15:${APPT}:-:${DEYA}`);
        expect(issueKey('cobro_sin_agenda', '2026-11-15', null, ITEM, null)).toBe(`cobro_sin_agenda:2026-11-15:-:${ITEM}:-`);
    });

    it('es estable y cambia si cambia el tipo, el día o el barbero (una diferencia nueva no hereda la revisión)', () => {
        const a = issueKey('sin_cerrar', '2026-11-15', APPT, null, DEYA);
        expect(issueKey('sin_cerrar', '2026-11-15', APPT, null, DEYA)).toBe(a);
        expect(issueKey('completada_sin_cobro', '2026-11-15', APPT, null, DEYA)).not.toBe(a);
        expect(issueKey('sin_cerrar', '2026-11-16', APPT, null, DEYA)).not.toBe(a);
        expect(issueKey('sin_cerrar', '2026-11-15', APPT, null, 'otro')).not.toBe(a);
    });
});

describe('contadores y agrupación', () => {
    const issues = [
        issue({ pre_agenda: true }),
        issue({ pre_agenda: true, sale_item_id: 'i2', employee_id: 'e2', name: 'Dani' }),
        issue({ kind: 'llego_sin_cobro', appointment_id: APPT, sale_id: null, sale_item_id: null }),
        issue({ kind: 'cobro_sin_agenda', sale_item_id: 'i3' }),
        issue({ kind: 'completada_sin_cobro', appointment_id: 'a2', sale_id: null, sale_item_id: null, status: 'revisada',
            review: { decision: 'aceptada', reason: 'Cita de prueba', at: '2026-11-15T20:00:00Z', by: 'Sonia' } }),
    ];

    it('separa las ventas anteriores a la agenda de las demás pendientes', () => {
        const g = groupIssues(issues, { tab: 'pendiente', kind: 'all', employee: 'all' });
        expect(g.preAgenda).toHaveLength(2);
        expect(g.others.map((i) => i.kind)).toEqual(['llego_sin_cobro', 'cobro_sin_agenda']);
    });

    it('filtra por tipo, por barbero y por pestaña', () => {
        expect(groupIssues(issues, { tab: 'pendiente', kind: 'llego_sin_cobro', employee: 'all' }).others).toHaveLength(1);
        const dani = groupIssues(issues, { tab: 'pendiente', kind: 'all', employee: 'e2' });
        expect(dani.preAgenda).toHaveLength(1);
        expect(dani.others).toHaveLength(0);
        const reviewed = groupIssues(issues, { tab: 'revisada', kind: 'all', employee: 'all' });
        expect(reviewed.preAgenda).toHaveLength(0);
        const accepted = groupIssues(issues.map((i) => ({ ...i, status: 'revisada' as const })), { tab: 'revisada', kind: 'all', employee: 'all' });
        expect(accepted.preAgenda).toHaveLength(2);
        expect(reviewed.others.map((i) => i.review?.by)).toEqual(['Sonia']);
    });

    it('cuenta por tipo en cada pestaña', () => {
        expect(countByKind(issues, 'pendiente')).toEqual({ llego_sin_cobro: 1, sin_cerrar: 0, completada_sin_cobro: 0, otro_barbero: 0, cobro_sin_agenda: 3 });
        expect(countByKind(issues, 'revisada').completada_sin_cobro).toBe(1);
        expect(countByKind(issues, 'pendiente', 'e2').cobro_sin_agenda).toBe(1);
    });

    it('usa los contadores de la base y, si faltan, los calcula', () => {
        expect(issueCounts({ issues })).toEqual({ pending: 4, reviewed: 1, total: 5 });
        expect(issueCounts({
            issues, summary: { total: 24, pending: 23, reviewed: 1, pending_by_kind: {}, reviewed_by_kind: {},
                pre_agenda_pending: 22, pre_agenda_pending_total: 40, pre_agenda_before: '2026-11-15T17:56:46Z' },
        })).toEqual({ pending: 23, reviewed: 1, total: 24 });
    });

    it('lista los barberos de las diferencias, sin repetir', () => {
        expect(issueEmployees([...issues, issue({ employee_id: null, name: null })]).map((e) => e.name)).toEqual(['Dani', 'Deya', 'Sin barbero']);
    });
});

describe('textos y acciones por tipo', () => {
    it('cada tipo tiene etiqueta, por qué importa y qué hacer, en oraciones', () => {
        for (const kind of ISSUE_KINDS) {
            expect(ISSUE_LABELS[kind]).toMatch(/^[A-ZÁÉÍÓÚ][^A-Z]*$/);
            expect(ISSUE_GUIDE[kind].why).toMatch(/\.$/);
            expect(ISSUE_GUIDE[kind].todo).toMatch(/\.$/);
        }
    });

    it('las ventas anteriores a la agenda explican que no hay nada que corregir', () => {
        expect(issueGuide({ kind: 'cobro_sin_agenda', pre_agenda: true }).todo).toMatch(/No hay nada que corregir/);
        expect(issueGuide({ kind: 'cobro_sin_agenda', pre_agenda: false })).toBe(ISSUE_GUIDE.cobro_sin_agenda);
    });

    it('elige la acción principal según el tipo', () => {
        expect(primaryAction({ kind: 'llego_sin_cobro', appointment_id: APPT, sale_id: null }))
            .toEqual({ kind: 'cobrar', label: 'Cobrar la cita', href: `/pos?cita=${APPT}` });
        expect(primaryAction({ kind: 'cobro_sin_agenda', appointment_id: null, sale_id: 's1' })?.href).toBe('/ticket/s1');
        expect(primaryAction({ kind: 'otro_barbero', appointment_id: APPT, sale_id: 's1' })?.kind).toBe('ticket');
        expect(secondaryAction({ kind: 'otro_barbero', appointment_id: APPT })?.href).toBe('/citas');
        expect(primaryAction({ kind: 'sin_cerrar', appointment_id: APPT, sale_id: null })?.label).toBe('Ir a la agenda');
        expect(primaryAction({ kind: 'completada_sin_cobro', appointment_id: APPT, sale_id: null })?.kind).toBe('agenda');
        expect(primaryAction({ kind: 'sin_cerrar', appointment_id: null, sale_id: null })).toBeNull();
    });

    it('"Ir a la agenda" abre el día y el barbero de la diferencia', () => {
        const where = { day: '2026-11-15', employee_id: DEYA };
        expect(primaryAction({ kind: 'sin_cerrar', appointment_id: APPT, sale_id: null, ...where })?.href).toBe(`/citas?fecha=2026-11-15&barbero=${DEYA}`);
        expect(secondaryAction({ kind: 'otro_barbero', appointment_id: APPT, ...where })?.href).toBe(`/citas?fecha=2026-11-15&barbero=${DEYA}`);
        // Sin barbero (cita sin asignar) solo lleva el día.
        expect(primaryAction({ kind: 'sin_cerrar', appointment_id: APPT, sale_id: null, day: '2026-11-15', employee_id: null })?.href).toBe('/citas?fecha=2026-11-15');
    });
});
