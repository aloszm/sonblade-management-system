// Podio de cortes de la semana. Solo cortes: nunca dinero.

export interface PodiumRow { employee_id: string; name: string; cuts: number; is_me: boolean }
export interface RankedRow extends PodiumRow { place: number; share: number }

/**
 * Asigna lugares respetando empates (dos barberos con los mismos cortes comparten lugar)
 * y calcula el avance de cada quien respecto al primero, para dibujar las barras.
 */
export function rankPodium(rows: PodiumRow[]): RankedRow[] {
    const sorted = [...rows].sort((a, b) => b.cuts - a.cuts || a.name.localeCompare(b.name, 'es'));
    const top = sorted[0]?.cuts ?? 0;
    let place = 0;
    let previous: number | null = null;
    return sorted.map((row, index) => {
        if (row.cuts !== previous) { place = index + 1; previous = row.cuts; }
        return { ...row, place, share: top > 0 ? row.cuts / top : 0 };
    });
}

/** Nadie ha cortado todavía esta semana: no hay podio que mostrar. */
export function podiumIsEmpty(rows: PodiumRow[]): boolean {
    return rows.every((row) => row.cuts === 0);
}

export interface PodiumInsight {
    me: RankedRow;
    /** Quién va justo arriba (otro lugar distinto al mío); null si voy al frente. */
    above: RankedRow | null;
    /** Cuántos cortes le faltan para alcanzar al de arriba (0 si no hay nadie arriba). */
    gapToAbove: number;
    /** Si voy al frente: por cuántos cortes sobre quien sigue; 0 si empato o no hay más. */
    leadOverNext: number;
    tied: boolean;
}

/**
 * Lo que le importa al barbero de su lugar: a quién alcanzar y por cuánto. Solo cortes, nunca dinero.
 * Devuelve null si la persona no aparece en el podio.
 */
export function podiumInsight(rows: RankedRow[], employeeId: string): PodiumInsight | null {
    const me = rows.find((r) => r.employee_id === employeeId);
    if (!me) return null;
    const above = [...rows].filter((r) => r.cuts > me.cuts).sort((a, b) => a.cuts - b.cuts || a.place - b.place)[0] ?? null;
    const below = rows.filter((r) => r.cuts < me.cuts).sort((a, b) => b.cuts - a.cuts)[0];
    return {
        me,
        above,
        gapToAbove: above ? above.cuts - me.cuts : 0,
        leadOverNext: !above && below ? me.cuts - below.cuts : 0,
        tied: rows.some((r) => r.employee_id !== me.employee_id && r.cuts === me.cuts),
    };
}
