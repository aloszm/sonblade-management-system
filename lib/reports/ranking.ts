// Ranking del equipo: tres clasificaciones (cortes, ingreso, productos vendidos) a partir de cifras por persona.
// Funciones puras. La privacidad se aplica AQUÍ, en el servidor: lo que sale de buildBoards es lo único que
// llega a la pantalla, y para un barbero no contiene el dinero de los demás (solo orden y nombres).

import type { BusinessRole } from '@/lib/auth/context';
import { mayReadRankingMoney } from '@/lib/barber/permissions';
import type { PodiumRow } from '@/lib/reports/podium';

export type RankMetric = 'cuts' | 'revenue' | 'products';
export const RANK_METRICS: RankMetric[] = ['cuts', 'revenue', 'products'];
export const METRIC_LABELS: Record<RankMetric, string> = { cuts: 'Cortes', revenue: 'Ingreso', products: 'Productos vendidos' };

/** Cifras de una persona en un periodo. Dinero en centavos; null = la fuente no lo entregó (puesto barbero). */
export interface RankingPerson {
    id: string;
    name: string;
    isBarber: boolean;
    services: number;
    productUnits: number;
    serviceRevenueCents: number | null;
    productRevenueCents: number | null;
    /** Lugar en ingreso calculado por la base cuando oculta los importes ajenos. */
    revenuePlace?: number | null;
}

export interface RankingViewer { role: BusinessRole; employeeId: string | null }

export interface BoardRow {
    id: string;
    name: string;
    isMe: boolean;
    place: number;
    /** Cortes, centavos o piezas según la clasificación; null si el importe no se puede ver. */
    value: number | null;
    /** Productos: importe vendido en centavos (null si no se puede ver). */
    secondary: number | null;
    /** Avance contra el líder, de 0 a 1; null si no se puede calcular sin mostrar dinero. */
    share: number | null;
    /** Lugar en el periodo anterior; null si no hay dato. */
    previousPlace: number | null;
}

export interface Board {
    status: 'ready' | 'unavailable';
    /** Hubo actividad en este periodo (antes de ocultar importes). */
    hasActivity: boolean;
    rows: BoardRow[];
}
export type Boards = Record<RankMetric, Board>;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

const revenueOf = (p: RankingPerson): number | null =>
    p.serviceRevenueCents === null || p.productRevenueCents === null ? null : p.serviceRevenueCents + p.productRevenueCents;

/** Lugares con empate (1, 1, 3): quien tiene la misma cifra comparte lugar. */
export function competitionPlaces(entries: { id: string; key: number }[]): Map<string, number> {
    const sorted = [...entries].sort((a, b) => b.key - a.key);
    const places = new Map<string, number>();
    let place = 0;
    let previous: number | null = null;
    sorted.forEach((entry, index) => {
        if (entry.key !== previous) { place = index + 1; previous = entry.key; }
        places.set(entry.id, place);
    });
    return places;
}

interface Ranked { person: RankingPerson; place: number; key: number | null }

function rankMetric(people: RankingPerson[], metric: RankMetric): Ranked[] {
    if (metric === 'cuts') {
        const eligible = people.filter((p) => p.isBarber);
        const places = competitionPlaces(eligible.map((p) => ({ id: p.id, key: p.services })));
        return eligible.map((person) => ({ person, place: places.get(person.id)!, key: person.services }));
    }
    if (metric === 'products') {
        const eligible = people.filter((p) => p.isBarber || p.productUnits > 0);
        const places = competitionPlaces(eligible.map((p) => ({ id: p.id, key: p.productUnits })));
        return eligible.map((person) => ({ person, place: places.get(person.id)!, key: person.productUnits }));
    }
    const eligible = people.filter((p) => p.isBarber || (revenueOf(p) ?? 0) > 0 || (revenueOf(p) === null && (p.revenuePlace ?? 0) > 0));
    if (eligible.every((p) => revenueOf(p) !== null)) {
        const places = competitionPlaces(eligible.map((p) => ({ id: p.id, key: revenueOf(p)! })));
        return eligible.map((person) => ({ person, place: places.get(person.id)!, key: revenueOf(person) }));
    }
    // La base ocultó importes: se respeta el lugar que ella calculó.
    return eligible.map((person) => ({ person, place: person.revenuePlace ?? eligible.length, key: revenueOf(person) }));
}

function placesOf(people: RankingPerson[], metric: RankMetric): Map<string, number> {
    return new Map(rankMetric(people, metric).map((r) => [r.person.id, r.place]));
}

export function buildBoards(people: RankingPerson[], previous: RankingPerson[] | null, viewer: RankingViewer): Boards {
    const make = (metric: RankMetric): Board => {
        const ranked = rankMetric(people, metric).sort((a, b) => a.place - b.place || byName(a.person, b.person));
        const prevPlaces = previous ? placesOf(previous, metric) : null;
        const leader = ranked.reduce((max, r) => Math.max(max, r.key ?? 0), 0);
        const hasActivity = ranked.some((r) => (r.key ?? 0) > 0 || (r.key === null && r.person.services + r.person.productUnits > 0));
        // Si a alguien se le oculta el importe, ningún avance se calcula: con tu propio importe y un porcentaje se deduciría el del líder.
        const anyHidden = metric === 'revenue' && ranked.some((r) => !mayReadRankingMoney(viewer.role, viewer.employeeId, r.person.id));
        const rows = ranked.map<BoardRow>(({ person, place, key }) => {
            const money = mayReadRankingMoney(viewer.role, viewer.employeeId, person.id);
            const isMoneyMetric = metric === 'revenue';
            const visible = !isMoneyMetric || money;
            return {
                id: person.id,
                name: person.name,
                isMe: person.id === viewer.employeeId,
                place,
                value: !visible || key === null ? null : key,
                secondary: metric === 'products' && money ? person.productRevenueCents : null,
                share: visible && !anyHidden && key !== null && leader > 0 ? key / leader : null,
                previousPlace: prevPlaces?.get(person.id) ?? null,
            };
        });
        return { status: 'ready', hasActivity, rows };
    };
    return { cuts: make('cuts'), revenue: make('revenue'), products: make('products') };
}

const NOT_AVAILABLE: Board = { status: 'unavailable', hasActivity: false, rows: [] };

/** Solo hay cortes de la semana (función weekly_cuts_podium): ingreso y productos aún no están disponibles. */
export function boardsFromCuts(rows: PodiumRow[]): Boards {
    const people: RankingPerson[] = rows.map((r) => ({
        id: r.employee_id, name: r.name, isBarber: true, services: r.cuts, productUnits: 0, serviceRevenueCents: 0, productRevenueCents: 0,
    }));
    const me = rows.find((r) => r.is_me)?.employee_id ?? null;
    const cuts = buildBoards(people, null, { role: 'barber', employeeId: me }).cuts;
    return { cuts, revenue: NOT_AVAILABLE, products: NOT_AVAILABLE };
}

export const unavailableBoards = (): Boards => ({ cuts: NOT_AVAILABLE, revenue: NOT_AVAILABLE, products: NOT_AVAILABLE });

export function boardIsEmpty(board: Board): boolean {
    return board.status === 'ready' && !board.hasActivity;
}

/** Variación de lugar: positivo = subió (mejoró), negativo = bajó, 0 = igual, null = sin dato. */
export function placeChange(row: BoardRow): number | null {
    return row.previousPlace === null ? null : row.previousPlace - row.place;
}

const unitText = (metric: RankMetric, n: number) =>
    metric === 'cuts' ? `${n} ${n === 1 ? 'corte' : 'cortes'}` : `${n} ${n === 1 ? 'pieza' : 'piezas'}`;

/** "a 3 de Deya": distancia contra quien va justo arriba. Solo cifras visibles (cortes y piezas). */
export function gapToAbove(rows: BoardRow[], row: BoardRow, metric: RankMetric): { name: string; gap: number; text: string } | null {
    if (metric === 'revenue' || row.value === null) return null;
    const above = [...rows].filter((r) => r.value !== null && r.value > row.value!).sort((a, b) => a.value! - b.value!)[0];
    if (!above) return null;
    const gap = above.value! - row.value;
    return { name: above.name, gap, text: `a ${gap} de ${above.name}` };
}

/** Frase para quien se mira, sin revelar dinero ajeno. */
export function rankingInsight(board: Board, highlightId: string, metric: RankMetric, mine: boolean): string | null {
    const me = board.rows.find((r) => r.id === highlightId);
    if (!me || !board.hasActivity) return null;
    const who = mine ? 'Vas' : `${me.name} va`;
    const tied = board.rows.some((r) => r.id !== me.id && r.place === me.place);
    if (metric === 'revenue') {
        return me.place === 1 ? `${who} al frente${tied ? ', empatado' : ''}.` : `${who} en ${me.place}.º lugar.`;
    }
    const gap = gapToAbove(board.rows, me, metric);
    if (gap) return `${who} en ${me.place}.º lugar${tied ? ' (empatado)' : ''}. ${mine ? 'Te' : 'Le'} ${gap.gap === 1 ? 'falta' : 'faltan'} ${unitText(metric, gap.gap)} para alcanzar a ${gap.name}.`;
    const next = board.rows.filter((r) => r.value !== null && r.value < (me.value ?? 0)).sort((a, b) => b.value! - a.value!)[0];
    if (next && me.value !== null && me.value > next.value!) return `${who} al frente, con ${unitText(metric, me.value - next.value!)} de ventaja.`;
    return `${who} al frente${tied ? ', empatado' : ''}.`;
}
