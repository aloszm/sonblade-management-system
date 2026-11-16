import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, SERVICE_CATEGORIES, categoryOf, formatDuration, groupServices, isTestName, sortServices } from './categories';
import { DurationSchema, ServiceCategorySchema } from './schema';

describe('categorías de servicios', () => {
    it('define el orden del cartel y las etiquetas visibles', () => {
        expect([...SERVICE_CATEGORIES]).toEqual(['cortes', 'barba', 'ceja_facial', 'paquetes', 'otros']);
        expect(SERVICE_CATEGORIES.map((c) => CATEGORY_LABELS[c])).toEqual(['Cortes', 'Barba y afeitado', 'Ceja y facial', 'Paquetes', 'Otros']);
    });

    it('una categoría desconocida cae en Otros', () => {
        expect(categoryOf('barba')).toBe('barba');
        expect(categoryOf('x')).toBe('otros');
        expect(categoryOf(undefined)).toBe('otros');
    });

    it('ordena por categoría, orden manual y nombre, con los (prueba) al final', () => {
        const sorted = sortServices([
            { name: 'Demo (prueba)', category: 'otros', sort_order: 0 },
            { name: 'Corte y barba', category: 'paquetes', sort_order: 1 },
            { name: 'Barba', category: 'barba', sort_order: 2 },
            { name: 'Bigote', category: 'barba', sort_order: 1 },
            { name: 'Corte niño', category: 'cortes', sort_order: 2 },
            { name: 'Corte adulto', category: 'cortes', sort_order: 1 },
            { name: 'Aaa suelto', category: 'otros', sort_order: 5 },
        ]);
        expect(sorted.map((s) => s.name)).toEqual(['Corte adulto', 'Corte niño', 'Bigote', 'Barba', 'Corte y barba', 'Aaa suelto', 'Demo (prueba)']);
    });

    it('agrupa y omite las categorías vacías', () => {
        const groups = groupServices([{ name: 'A', category: 'paquetes' }, { name: 'B', category: 'cortes' }]);
        expect(groups.map((g) => [g.category, g.label])).toEqual([['cortes', 'Cortes'], ['paquetes', 'Paquetes']]);
    });

    it('detecta los servicios de prueba', () => {
        expect(isTestName('Corte VIP (prueba)')).toBe(true);
        expect(isTestName('Corte adulto')).toBe(false);
    });

    it('da formato a la duración', () => {
        expect([30, 60, 90, 120, 240].map(formatDuration)).toEqual(['30 min', '1 h', '1 h 30 min', '2 h', '4 h']);
    });

    it('valida categoría y duración en bloques de 30', () => {
        expect(ServiceCategorySchema.safeParse('cortes').success).toBe(true);
        expect(ServiceCategorySchema.safeParse('otra').success).toBe(false);
        expect(DurationSchema.safeParse(90).success).toBe(true);
        for (const bad of [0, 15, 45, 510, 31]) expect(DurationSchema.safeParse(bad).success).toBe(false);
        expect(DurationSchema.safeParse(45).error?.issues[0]?.message).toMatch(/bloques de 30/);
    });
});
