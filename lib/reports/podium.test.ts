import { describe, expect, it } from 'vitest';
import { podiumIsEmpty, rankPodium } from './podium';

const row = (name: string, cuts: number, is_me = false) => ({ employee_id: name, name, cuts, is_me });

describe('podio de cortes', () => {
    it('ordena de más a menos cortes y calcula el avance contra el primero', () => {
        const ranked = rankPodium([row('Dani', 10), row('Deya', 40, true), row('Sonia', 20)]);
        expect(ranked.map((r) => `${r.place}:${r.name}`)).toEqual(['1:Deya', '2:Sonia', '3:Dani']);
        expect(ranked.map((r) => r.share)).toEqual([1, 0.5, 0.25]);
        expect(ranked[0].is_me).toBe(true);
    });

    it('los empates comparten lugar', () => {
        const ranked = rankPodium([row('Sonia', 12), row('Deya', 12), row('Dani', 5)]);
        expect(ranked.map((r) => `${r.place}:${r.name}`)).toEqual(['1:Deya', '1:Sonia', '3:Dani']);
    });

    it('sin cortes no hay podio ni división entre cero', () => {
        const rows = [row('Deya', 0), row('Dani', 0)];
        expect(podiumIsEmpty(rows)).toBe(true);
        expect(rankPodium(rows).every((r) => r.share === 0)).toBe(true);
    });
});
