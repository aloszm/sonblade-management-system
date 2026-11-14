import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
    it('deja pasar texto simple y números', () => {
        expect(csvCell('Corte')).toBe('Corte');
        expect(csvCell(200)).toBe('200');
        expect(csvCell(null)).toBe('');
    });

    it('escapa comas, comillas y saltos de línea', () => {
        expect(csvCell('Corte, barba')).toBe('"Corte, barba"');
        expect(csvCell('Dijo "hola"')).toBe('"Dijo ""hola"""');
        expect(csvCell('a\nb')).toBe('"a\nb"');
    });

    it('neutraliza fórmulas pero respeta números negativos', () => {
        expect(csvCell('=SUMA(A1:A2)')).toBe("'=SUMA(A1:A2)");
        expect(csvCell('@usuario')).toBe("'@usuario");
        expect(csvCell(-20)).toBe('-20');
    });
});

describe('toCsv', () => {
    it('arma encabezados y filas con BOM y saltos de línea de Excel', () => {
        const text = toCsv(['Fecha', 'Total'], [['2026-11-14', 200], ['2026-11-13', 150]]);
        expect(text.startsWith('﻿')).toBe(true);
        expect(text).toBe('﻿Fecha,Total\r\n2026-11-14,200\r\n2026-11-13,150\r\n');
    });
});
