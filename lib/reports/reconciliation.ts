// Cuadre agenda ↔ cobros ↔ comisiones ↔ recibos (public.agenda_reconciliation). La base calcula; aquí solo se interpreta.

export type IssueKind = 'llego_sin_cobro' | 'sin_cerrar' | 'completada_sin_cobro' | 'cobro_sin_agenda' | 'otro_barbero';
export type IssueStatus = 'pendiente' | 'revisada';
export type ReviewDecision = 'aceptada' | 'reabierta';

export const ISSUE_KINDS: IssueKind[] = ['llego_sin_cobro', 'sin_cerrar', 'completada_sin_cobro', 'otro_barbero', 'cobro_sin_agenda'];

export interface ReconciliationRow {
    day: string;
    employee_id: string;
    name: string;
    agenda_services: number;
    agenda_walk_in: number;
    charged_services: number;
    charged_units: number;
    charged_amount: number;
    commission: number;
    commission_in_receipt: number;
    /** Todas las diferencias del renglón (pendientes y revisadas). */
    issues: number;
    /** Las que siguen sin revisar. */
    issues_pending?: number;
}

export interface IssueReview {
    decision: ReviewDecision;
    reason: string;
    at: string;
    by: string;
}

export interface ReconciliationIssue {
    day: string;
    employee_id: string | null;
    name: string | null;
    kind: IssueKind;
    at: string;
    appointment_id: string | null;
    sale_id: string | null;
    message: string;
    /** Clave estable: tipo:día:cita:renglón de venta:barbero ('-' cuando falta). */
    key: string;
    sale_item_id: string | null;
    /** Cobro sin agenda hecho antes de que el cobro pasara por la agenda. */
    pre_agenda: boolean;
    status: IssueStatus;
    /** Última revisión registrada (también si se reabrió). */
    review: IssueReview | null;
}

export interface ReconciliationSummary {
    total: number;
    pending: number;
    reviewed: number;
    pending_by_kind: Partial<Record<IssueKind, number>>;
    reviewed_by_kind: Partial<Record<IssueKind, number>>;
    pre_agenda_pending: number;
    /** Pendientes anteriores a la agenda en todas las fechas (lo que acepta "Aceptar todas"). */
    pre_agenda_pending_total: number;
    pre_agenda_before: string;
}

export interface Reconciliation {
    range: { from: string; to: string; timezone: string };
    rows: ReconciliationRow[];
    issues: ReconciliationIssue[];
    summary: ReconciliationSummary;
}

export const ISSUE_LABELS: Record<IssueKind, string> = {
    llego_sin_cobro: 'Llegó y no se cobró',
    sin_cerrar: 'Cita sin cerrar',
    completada_sin_cobro: 'Completada sin cobro',
    cobro_sin_agenda: 'Cobro sin agenda',
    otro_barbero: 'Cobrada a otro barbero',
};

/** Misma clave que private.reconciliation_issue_key en la base. */
export function issueKey(kind: IssueKind, day: string, appointmentId: string | null, saleItemId: string | null, employeeId: string | null): string {
    return [kind, day, appointmentId ?? '-', saleItemId ?? '-', employeeId ?? '-'].join(':');
}

export type IssueActionKind = 'cobrar' | 'ticket' | 'agenda';
export interface IssueAction { kind: IssueActionKind; label: string; href: string }

interface IssueGuide { why: string; todo: string }

/** Por qué importa y qué hacer, por tipo. "Qué pasó" es el mensaje de la base, que ya va en una frase llana. */
export const ISSUE_GUIDE: Record<IssueKind, IssueGuide> = {
    llego_sin_cobro: {
        why: 'Mientras no se cobre, ese dinero no está en la caja y al barbero no se le cuenta la comisión.',
        todo: 'Cóbrala desde Cobro. Si el cliente se fue sin pagar o el servicio fue de cortesía, márcala como revisada y escribe qué pasó.',
    },
    sin_cerrar: {
        why: 'La cita quedó abierta: no se sabe si el cliente vino, no vino o se canceló, y el día del barbero no cuadra.',
        todo: 'Abre la agenda y márcala como llegó, no llegó o cancelada.',
    },
    completada_sin_cobro: {
        why: 'La agenda dice que se hizo el servicio, pero no hay cobro: o falta dinero o falta registrar el cobro.',
        todo: 'Revisa la cita en la agenda. Si se cobró en otro ticket o fue de cortesía, márcala como revisada con el motivo.',
    },
    cobro_sin_agenda: {
        why: 'El servicio se cobró pero no aparece en la agenda del barbero, así que su día no cuadra con lo cobrado.',
        todo: 'Revisa el ticket. Si el servicio sí se hizo como se cobró, márcalo como revisado.',
    },
    otro_barbero: {
        why: 'La comisión es para quien aparece en el cobro; si no es quien atendió, se le paga a otro barbero.',
        todo: 'Revisa el ticket. Si otro barbero cubrió la cita a propósito, márcala como revisada; si fue un error, corrige el cobro antes del pago semanal.',
    },
};

export const PRE_AGENDA_GUIDE: IssueGuide = {
    why: 'Se cobró antes de que el cobro pasara por la agenda, así que es normal que no aparezca en ella. El dinero y la comisión sí están registrados.',
    todo: 'No hay nada que corregir: acéptalas para que dejen de contar como pendientes.',
};

export function issueGuide(issue: Pick<ReconciliationIssue, 'kind' | 'pre_agenda'>): IssueGuide {
    return issue.kind === 'cobro_sin_agenda' && issue.pre_agenda ? PRE_AGENDA_GUIDE : ISSUE_GUIDE[issue.kind];
}

/**
 * La acción principal de cada diferencia. La agenda no acepta todavía fecha ni barbero en la dirección,
 * así que "Ir a la agenda" abre /citas tal cual.
 */
export function primaryAction(issue: Pick<ReconciliationIssue, 'kind' | 'appointment_id' | 'sale_id'>): IssueAction | null {
    if (issue.kind === 'llego_sin_cobro' && issue.appointment_id) return { kind: 'cobrar', label: 'Cobrar la cita', href: `/pos?cita=${issue.appointment_id}` };
    if ((issue.kind === 'cobro_sin_agenda' || issue.kind === 'otro_barbero') && issue.sale_id) return { kind: 'ticket', label: 'Ver ticket', href: `/ticket/${issue.sale_id}` };
    if (issue.appointment_id) return { kind: 'agenda', label: 'Ir a la agenda', href: '/citas' };
    if (issue.sale_id) return { kind: 'ticket', label: 'Ver ticket', href: `/ticket/${issue.sale_id}` };
    return null;
}

/** Acción extra: en "cobrada a otro barbero" también sirve ver la cita. */
export function secondaryAction(issue: Pick<ReconciliationIssue, 'kind' | 'appointment_id'>): IssueAction | null {
    if (issue.kind === 'otro_barbero' && issue.appointment_id) return { kind: 'agenda', label: 'Ir a la agenda', href: '/citas' };
    return null;
}

export type IssueTab = 'pendiente' | 'revisada';
export interface IssueFilter { tab: IssueTab; kind: IssueKind | 'all'; employee: string | 'all' }

/**
 * Reparte las diferencias de la pestaña: las ventas anteriores a la agenda van en su propio grupo plegado
 * (pendientes: se aceptan juntas; revisadas: historial); el resto, una por una.
 */
export function groupIssues(issues: ReconciliationIssue[], filter: IssueFilter) {
    const visible = issues.filter((i) => i.status === filter.tab
        && (filter.kind === 'all' || i.kind === filter.kind)
        && (filter.employee === 'all' || (i.employee_id ?? 'none') === filter.employee));
    return { preAgenda: visible.filter((i) => i.pre_agenda), others: visible.filter((i) => !i.pre_agenda) };
}

/** Cuántas hay de cada tipo en la pestaña (para los filtros). */
export function countByKind(issues: ReconciliationIssue[], tab: IssueTab, employee: string | 'all' = 'all') {
    const counts = Object.fromEntries(ISSUE_KINDS.map((k) => [k, 0])) as Record<IssueKind, number>;
    for (const i of issues) {
        if (i.status !== tab) continue;
        if (employee !== 'all' && (i.employee_id ?? 'none') !== employee) continue;
        counts[i.kind] += 1;
    }
    return counts;
}

/** Barberos que aparecen en las diferencias, para el filtro. */
export function issueEmployees(issues: ReconciliationIssue[]) {
    const seen = new Map<string, string>();
    for (const i of issues) seen.set(i.employee_id ?? 'none', i.name ?? 'Sin barbero');
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Contadores: los de la base si vienen; si no (versión anterior), se calculan con la lista. */
export function issueCounts(data: Pick<Reconciliation, 'issues'> & { summary?: ReconciliationSummary }) {
    if (data.summary) return { pending: Number(data.summary.pending), reviewed: Number(data.summary.reviewed), total: Number(data.summary.total) };
    const pending = data.issues.filter((i) => i.status !== 'revisada').length;
    return { pending, reviewed: data.issues.length - pending, total: data.issues.length };
}

/** Un renglón cuadra cuando la agenda y los cobros cuentan lo mismo y no hay pendientes. */
export function rowBalanced(row: ReconciliationRow): boolean {
    return Number(row.agenda_services) === Number(row.charged_services) && Number(row.issues_pending ?? row.issues) === 0;
}

/** Estado del renglón: cuadra, revisado (no coincide, pero todas sus diferencias se revisaron) o con pendientes. */
export function rowState(row: ReconciliationRow): 'cuadra' | 'revisado' | 'pendiente' {
    const pending = Number(row.issues_pending ?? row.issues);
    if (pending > 0) return 'pendiente';
    return Number(row.agenda_services) === Number(row.charged_services) ? 'cuadra' : 'revisado';
}

export function totals(rows: ReconciliationRow[]) {
    return rows.reduce((acc, row) => ({
        agenda: acc.agenda + Number(row.agenda_services),
        charged: acc.charged + Number(row.charged_services),
        amount: acc.amount + Number(row.charged_amount),
        commission: acc.commission + Number(row.commission),
        inReceipt: acc.inReceipt + Number(row.commission_in_receipt),
    }), { agenda: 0, charged: 0, amount: 0, commission: 0, inReceipt: 0 });
}

/** Lo mismo que totals, más la comisión que falta pagar al equipo (redondeada a centavos). */
export function moneySummary(rows: ReconciliationRow[]) {
    const t = totals(rows);
    return { ...t, commissionPending: Math.max(0, Math.round((t.commission - t.inReceipt) * 100) / 100) };
}
