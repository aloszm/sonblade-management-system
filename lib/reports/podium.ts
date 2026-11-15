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
