import { describe, expect, it } from 'vitest';
import { boardIsEmpty, boardsFromCuts, buildBoards, competitionPlaces, gapToAbove, placeChange, rankingInsight, type RankingPerson } from './ranking';
import { isMissingFunction, parseTeamRanking } from './ranking-source';

const person = (id: string, services: number, units: number, serviceRev: number | null, productRev: number | null, extra: Partial<RankingPerson> = {}): RankingPerson => ({
    id, name: id, isBarber: true, services, productUnits: units, serviceRevenueCents: serviceRev, productRevenueCents: productRev, ...extra,
});
const team = [
    person('Deya', 40, 3, 600000, 54000),
    person('Dani', 25, 5, 380000, 90000),
    person('Sonia', 25, 1, 410000, 22500),
    person('Dago', 0, 4, 0, 72000, { isBarber: false }),
    person('Emi', 0, 0, 0, 0, { isBarber: false }),
];
const front = { role: 'receptionist' as const, employeeId: 'Dago' };

describe('lugares con empate', () => {
    it('quien comparte cifra comparte lugar y el siguiente se salta', () => {
        const places = competitionPlaces([{ id: 'a', key: 5 }, { id: 'b', key: 5 }, { id: 'c', key: 1 }]);
        expect([places.get('a'), places.get('b'), places.get('c')]).toEqual([1, 1, 3]);
    });
});

describe('clasificaciones', () => {
    const boards = buildBoards(team, null, front);

    it('cortes: solo barberos, con empate entre Dani y Sonia', () => {
        expect(boards.cuts.rows.map((r) => `${r.place}:${r.name}:${r.value}`)).toEqual(['1:Deya:40', '2:Dani:25', '2:Sonia:25']);
    });
    it('ingreso: suma servicios y productos y deja fuera a quien no vendió y no corta', () => {
        expect(boards.revenue.rows.map((r) => r.value)).toEqual([654000, 470000, 432500, 72000]);
        expect(boards.revenue.rows.map((r) => r.name)).toEqual(['Deya', 'Dani', 'Sonia', 'Dago']);
        expect(boards.revenue.rows.map((r) => r.place)).toEqual([1, 2, 3, 4]);
    });
    it('productos: cuenta piezas e incluye a recepción si vendió', () => {
        expect(boards.products.rows.map((r) => `${r.place}:${r.name}:${r.value}`)).toEqual(['1:Dani:5', '2:Dago:4', '3:Deya:3', '4:Sonia:1']);
        expect(boards.products.rows[0].secondary).toBe(90000);
    });
    it('el avance es contra el líder', () => {
        expect(boards.cuts.rows.map((r) => r.share)).toEqual([1, 0.625, 0.625]);
    });
    it('sin actividad el tablero se considera vacío, sin dividir entre cero', () => {
        const empty = buildBoards([person('Deya', 0, 0, 0, 0), person('Dani', 0, 0, 0, 0)], null, front);
        expect(boardIsEmpty(empty.cuts)).toBe(true);
        expect(boardIsEmpty(empty.revenue)).toBe(true);
        expect(empty.cuts.rows.every((r) => r.share === null || r.share === 0)).toBe(true);
    });
    it('una sola persona es un tablero válido', () => {
        const solo = buildBoards([person('Deya', 3, 0, 45000, 0)], null, { role: 'barber', employeeId: 'Deya' });
        expect(solo.cuts.rows).toHaveLength(1);
        expect(solo.cuts.rows[0]).toMatchObject({ place: 1, isMe: true, share: 1 });
    });
    it('flecha contra el periodo anterior', () => {
        const before = [person('Deya', 10, 0, 0, 0), person('Dani', 30, 0, 0, 0), person('Sonia', 5, 0, 0, 0)];
        const b = buildBoards(team, before, front).cuts;
        const byName = Object.fromEntries(b.rows.map((r) => [r.name, placeChange(r)]));
        expect(byName).toEqual({ Deya: 1, Dani: -1, Sonia: 1 });
        expect(placeChange(buildBoards(team, null, front).cuts.rows[0])).toBeNull();
    });
});

describe('privacidad del ingreso para el barbero', () => {
    // Lo que entrega la base a Dani: importes ajenos en null y el lugar en ingreso ya calculado.
    const hidden: RankingPerson[] = [
        person('Deya', 40, 3, null, null, { revenuePlace: 1 }),
        person('Dani', 25, 5, 380000, 90000, { revenuePlace: 2 }),
        person('Sonia', 25, 1, null, null, { revenuePlace: 3 }),
    ];
    const dani = { role: 'barber' as const, employeeId: 'Dani' };

    it('conserva el orden y los nombres, pero no el dinero de los demás', () => {
        const { revenue } = buildBoards(hidden, null, dani);
        expect(revenue.rows.map((r) => `${r.place}:${r.name}`)).toEqual(['1:Deya', '2:Dani', '3:Sonia']);
        expect(revenue.rows.find((r) => r.name === 'Dani')?.value).toBe(470000);
        expect(revenue.rows.every((r) => r.share === null)).toBe(true); // ni siquiera el avance propio: delataría al líder
        expect(revenue.rows.filter((r) => r.name !== 'Dani').every((r) => r.value === null && r.share === null && r.secondary === null)).toBe(true);
    });
    it('aunque la fuente traiga todos los importes, la respuesta para el barbero no los lleva', () => {
        const json = JSON.stringify(buildBoards(team.slice(0, 3), null, dani));
        for (const secret of ['654000', '432500', '600000', '54000', '410000', '22500']) expect(json).not.toContain(secret);
        const b = buildBoards(team.slice(0, 3), null, dani);
        expect(b.revenue.rows.map((r) => r.name)).toEqual(['Deya', 'Dani', 'Sonia']); // el orden sí viaja
        expect(b.products.rows.every((r) => r.name === 'Dani' ? r.secondary === 90000 : r.secondary === null)).toBe(true);
    });
    it('cortes y piezas de productos sí son visibles para el barbero', () => {
        const b = buildBoards(hidden, null, dani);
        expect(b.cuts.rows.map((r) => r.value)).toEqual([40, 25, 25]);
        expect(b.products.rows.map((r) => r.value)).toEqual([5, 3, 1]);
    });
    it('recepción y gerencia ven todos los importes', () => {
        for (const role of ['receptionist', 'cashier', 'admin', 'owner'] as const) {
            const b = buildBoards(team, null, { role, employeeId: null });
            expect(b.revenue.rows.every((r) => r.value !== null)).toBe(true);
        }
    });
});

describe('respaldo con solo cortes (sin la función nueva)', () => {
    const boards = boardsFromCuts([
        { employee_id: 'a', name: 'Deya', cuts: 9, is_me: false },
        { employee_id: 'b', name: 'Dani', cuts: 4, is_me: true },
    ]);
    it('arma cortes y deja ingreso y productos como no disponibles', () => {
        expect(boards.cuts.rows.map((r) => `${r.place}:${r.name}`)).toEqual(['1:Deya', '2:Dani']);
        expect(boards.cuts.rows[1].isMe).toBe(true);
        expect(boards.revenue).toMatchObject({ status: 'unavailable', rows: [] });
        expect(boards.products.status).toBe('unavailable');
    });
});

describe('texto de apoyo', () => {
    const board = buildBoards(team, null, front).cuts;
    it('dice cuánto falta para alcanzar al de arriba', () => {
        const dani = board.rows.find((r) => r.name === 'Dani')!;
        expect(gapToAbove(board.rows, dani, 'cuts')).toMatchObject({ name: 'Deya', gap: 15, text: 'a 15 de Deya' });
        expect(rankingInsight(board, 'Dani', 'cuts', true)).toBe('Vas en 2.º lugar (empatado). Te faltan 15 cortes para alcanzar a Deya.');
    });
    it('el líder ve su ventaja y en ingreso nunca se menciona dinero', () => {
        expect(rankingInsight(board, 'Deya', 'cuts', false)).toBe('Deya va al frente, con 15 cortes de ventaja.');
        const revenue = buildBoards(team, null, { role: 'barber', employeeId: 'Dani' }).revenue;
        expect(rankingInsight(revenue, 'Dani', 'revenue', true)).toBe('Vas en 2.º lugar.');
        expect(gapToAbove(revenue.rows, revenue.rows[1], 'revenue')).toBeNull();
    });
});

describe('origen de las cifras', () => {
    it('reconoce que la función aún no existe', () => {
        expect(isMissingFunction({ code: 'PGRST202', message: 'x' })).toBe(true);
        expect(isMissingFunction({ code: '42883', message: 'x' })).toBe(true);
        expect(isMissingFunction({ code: '42501', message: 'permiso' })).toBe(false);
        expect(isMissingFunction(null)).toBe(false);
    });
    it('convierte el jsonb de la función a centavos y respeta los nulos', () => {
        const people = parseTeamRanking({ rows: [
            { employee_id: 'a', name: 'Deya', is_barber: true, services: 3, product_units: 1, service_revenue: 450, product_revenue: 180.5, revenue_rank: 1 },
            { employee_id: 'b', name: 'Dani', is_barber: true, services: 2, product_units: 0, service_revenue: null, product_revenue: null, revenue_rank: 2 },
        ] });
        expect(people[0]).toMatchObject({ serviceRevenueCents: 45000, productRevenueCents: 18050, revenuePlace: 1 });
        expect(people[1]).toMatchObject({ serviceRevenueCents: null, productRevenueCents: null, revenuePlace: 2 });
        expect(parseTeamRanking(null)).toEqual([]);
    });
});
