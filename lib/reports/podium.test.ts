import { describe, expect, it } from 'vitest';
import { podiumInsight, podiumIsEmpty, rankPodium } from './podium';

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

describe('lo que le falta al barbero en el podio', () => {
    const ranked = rankPodium([row('Deya', 12), row('Sonia', 9), row('Dani', 5, true)]);

    it('dice a quién alcanzar y cuántos cortes faltan', () => {
        const insight = podiumInsight(ranked, 'Dani');
        expect(insight?.me.place).toBe(3);
        expect(insight?.above?.name).toBe('Sonia');
        expect(insight?.gapToAbove).toBe(4);
        expect(insight?.tied).toBe(false);
    });

    it('quien va al frente ve su ventaja', () => {
        const insight = podiumInsight(ranked, 'Deya');
        expect(insight?.above).toBeNull();
        expect(insight?.gapToAbove).toBe(0);
        expect(insight?.leadOverNext).toBe(3);
    });

    it('un empate se marca y el de arriba es el siguiente con más cortes', () => {
        const tied = rankPodium([row('Deya', 12), row('Sonia', 5), row('Dani', 5)]);
        const insight = podiumInsight(tied, 'Dani');
        expect(insight?.tied).toBe(true);
        expect(insight?.above?.name).toBe('Deya');
        expect(insight?.gapToAbove).toBe(7);
    });

    it('sin cortes nadie está arriba, y quien no está en el podio da null', () => {
        const zero = rankPodium([row('Deya', 0), row('Dani', 0)]);
        expect(podiumInsight(zero, 'Dani')?.above).toBeNull();
        expect(podiumInsight(zero, 'Dani')?.leadOverNext).toBe(0);
        expect(podiumInsight(ranked, 'Emi')).toBeNull();
    });
});
