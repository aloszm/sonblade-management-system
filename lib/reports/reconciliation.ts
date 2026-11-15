// Cuadre agenda ↔ cobros ↔ comisiones ↔ recibos (public.agenda_reconciliation). La base calcula; aquí solo se interpreta.

export type IssueKind = 'llego_sin_cobro' | 'sin_cerrar' | 'completada_sin_cobro' | 'cobro_sin_agenda' | 'otro_barbero';

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
    issues: number;
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
}

export interface Reconciliation {
    range: { from: string; to: string; timezone: string };
    rows: ReconciliationRow[];
    issues: ReconciliationIssue[];
}

export const ISSUE_LABELS: Record<IssueKind, string> = {
    llego_sin_cobro: 'Llegó y no se cobró',
    sin_cerrar: 'Cita sin cerrar',
    completada_sin_cobro: 'Completada sin cobro',
    cobro_sin_agenda: 'Cobro sin agenda',
    otro_barbero: 'Cobrada a otro barbero',
};

/** Un renglón cuadra cuando la agenda y los cobros cuentan lo mismo y no hay pendientes. */
export function rowBalanced(row: ReconciliationRow): boolean {
    return Number(row.agenda_services) === Number(row.charged_services) && Number(row.issues) === 0;
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
