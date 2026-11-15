import { describe, expect, it } from 'vitest';
import { activityRows, busiestHour, delta, presetRange } from './metrics';

describe('atajos de periodo', () => {
    it('la semana va del domingo a hoy', () => {
        expect(presetRange('week', '2026-11-18')).toEqual({ from: '2026-11-15', to: '2026-11-18' }); // miércoles
        expect(presetRange('week', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' }); // domingo
    });

    it('mes, hoy y 30 días', () => {
        expect(presetRange('month', '2026-11-18')).toEqual({ from: '2026-11-01', to: '2026-11-18' });
        expect(presetRange('today', '2026-11-18')).toEqual({ from: '2026-11-18', to: '2026-11-18' });
        expect(presetRange('last30', '2026-11-18')).toEqual({ from: '2026-10-20', to: '2026-11-18' });
    });
});

describe('comparación y hora fuerte', () => {
    it('calcula la variación y no divide entre cero', () => {
        expect(delta(150, 100)).toBe(50);
        expect(delta(80, 100)).toBe(-20);
        expect(delta(10, 0)).toBeNull();
    });

    it('elige la hora con más cortes', () => {
        expect(busiestHour([{ hour: 11, cuts: 2, revenue: 0 }, { hour: 18, cuts: 5, revenue: 0 }])).toBe(18);
        expect(busiestHour([{ hour: 11, cuts: 0, revenue: 0 }])).toBeNull();
    });
});

describe('registro descargable', () => {
    it('usa la fecha y hora de la barbería, no UTC', () => {
        const rows = activityRows([{ at: '2026-11-15T02:30:05Z', sale_id: 's', type: 'service', item: 'Corte', quantity: 1, amount: 200, employee: 'Deya', client: null, methods: 'cash,card' }], 'America/Mexico_City');
        expect(rows[0]).toEqual(['2026-11-14', '20:30:05', 'Deya', 'Servicio', 'Corte', 1, 200, 'Efectivo + Tarjeta', '']);
    });
});
