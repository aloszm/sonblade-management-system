/**
 * Rótulos del resumen de Cuadre.
 *
 * Cuadre compara VISITAS, no servicios: `agenda_services` cuenta las citas atendidas (una por visita) y
 * `charged_services` cuenta las ventas distintas que llevan al menos un servicio (`count(distinct sale_id)` en
 * `get_agenda_reconciliation`). Una visita puede llevar varios servicios (corte + ceja), así que este número es
 * menor que «Servicios» del Panel. Antes se rotulaba «Servicios cobrados» y parecía que las cifras no coincidían
 * (auditoría del 21 nov 2026: Cuadre 112 contra Panel 137 en la misma semana). El cálculo no cambia: solo el nombre.
 */
export const RECONCILIATION_LABELS = {
    agenda: 'Visitas atendidas en la agenda',
    charged: 'Visitas cobradas',
    chargedHint: 'con al menos un servicio',
    columnAgenda: 'Visitas en agenda',
    columnCharged: 'Visitas cobradas',
    note: 'Aquí se cuentan visitas: una visita con corte y ceja es una sola. El número de servicios está en el Panel.',
} as const;

const visits = (n: number) => (n === 1 ? '1 visita más' : `${n} visitas más`);

/** Frase que compara lo cobrado con la agenda, en visitas. */
export function reconciliationSummaryText(charged: number, agenda: number): string {
    if (charged === agenda) return 'La agenda y los cobros cuentan las mismas visitas.';
    return charged > agenda
        ? `Se cobraron ${visits(charged - agenda)} de las que hay en la agenda. Las diferencias de abajo dicen cuáles.`
        : `La agenda tiene ${visits(agenda - charged)} de las que se cobraron. Las diferencias de abajo dicen cuáles.`;
}

/** Renglón de la lista en celular: «Visitas: agenda 5 (1 sin cita) · cobradas 5 por $750.00». */
export function reconciliationRowText(row: { agenda_services: number | string; agenda_walk_in: number | string; charged_services: number | string }, amount: string): string {
    const walkIn = Number(row.agenda_walk_in) > 0 ? ` (${row.agenda_walk_in} sin cita)` : '';
    return `Visitas: agenda ${row.agenda_services}${walkIn} · cobradas ${row.charged_services} por ${amount}`;
}
