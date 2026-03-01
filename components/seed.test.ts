import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('seed.sql — Validación de datos reales', () => {
    const seedContent = readFileSync(resolve(__dirname, '../supabase/seed.sql'), 'utf-8');

    describe('Barberos', () => {
        it('incluye a Deya', () => {
            expect(seedContent).toContain("'Deya'");
        });

        it('incluye a Sonny', () => {
            expect(seedContent).toContain("'Sonny'");
        });

        it('incluye a Abraham', () => {
            expect(seedContent).toContain("'Abraham'");
        });

        it('tiene exactamente 3 barberos', () => {
            const barberSection = seedContent.split('INSERT INTO barbers')[1]?.split(';')[0] || '';
            const barberNames = barberSection.match(/'(Deya|Sonny|Abraham)'/g);
            expect(barberNames?.length).toBe(3);
        });
    });

    describe('Servicios', () => {
        const servicios = [
            { name: 'Corte', precio: 150 },
            { name: 'Corte y Ceja', precio: 180 },
            { name: 'Corte y Barba Delineada', precio: 250 },
            { name: 'Corte de Niño', precio: 120 },
            { name: 'Barba', precio: 100 },
            { name: 'Corte, Barba y MP', precio: 300 },
            { name: 'Corte y Afeitado Maq', precio: 220 },
            { name: 'Servicio VIP', precio: 420 },
            { name: 'Corte y Ritual Barba', precio: 270 },
            { name: 'Afeitado Completo', precio: 120 },
            { name: 'Corte y Afeitado', precio: 270 },
            { name: 'Corte y Tinte', precio: 250 },
            { name: 'Corte, Barba y Tinte', precio: 350 },
            { name: 'Corte, Cejas y Tinte', precio: 280 },
            { name: 'Corte Dama', precio: 180 },
            { name: 'Brusheado', precio: 250 },
            { name: 'Barba Ritual', precio: 150 },
            { name: 'Barba y Ceja', precio: 130 },
            { name: 'Barba y Tinte', precio: 150 },
            { name: 'Planchado de Ceja', precio: 100 },
            { name: 'Corte y Planchado de Ceja', precio: 250 },
            { name: 'Corte, Barba y Ceja', precio: 280 },
            { name: 'Bigote', precio: 40 },
            { name: 'Corte y MP', precio: 180 },
            { name: 'Afeitado Barba Máquina', precio: 70 },
        ];

        it('contiene los 25 servicios', () => {
            for (const s of servicios) {
                expect(seedContent).toContain(`'${s.name}'`);
            }
        });

        it('todos los servicios tienen is_active = true', () => {
            // Count the number of 'true' in the services INSERT block
            const servicesSection = seedContent.split('INSERT INTO services')[1]?.split(';')[0] || '';
            const trueCount = (servicesSection.match(/true/g) || []).length;
            expect(trueCount).toBe(25);
        });

        it('contiene los precios correctos', () => {
            for (const s of servicios) {
                expect(seedContent).toContain(`'${s.name}', ${s.precio}.00`);
            }
        });
    });

    describe('Productos', () => {
        const productos = [
            { name: 'Pomada B', costo: 180, precio: 250 },
            { name: 'Pomada A', costo: 180, precio: 250 },
            { name: 'Pomada R', costo: 180, precio: 250 },
            { name: 'Polvo T', costo: 225, precio: 300 },
            { name: 'Bálsamo B', costo: 180, precio: 250 },
            { name: 'Peine T', costo: 80, precio: 120 },
            { name: 'Peine B', costo: 10, precio: 25 },
        ];

        it('contiene todos los productos', () => {
            for (const p of productos) {
                expect(seedContent).toContain(`'${p.name}'`);
            }
        });

        it('el costo y precio son correctos para cada producto', () => {
            for (const p of productos) {
                // cost, price  → should appear as "180.00, 250.00" etc.
                expect(seedContent).toContain(`${p.costo}.00, ${p.precio}.00`);
            }
        });
    });

    describe('Estructura SQL', () => {
        it('incluye DELETE statements para limpieza (idempotencia)', () => {
            expect(seedContent).toContain('DELETE FROM sale_items');
            expect(seedContent).toContain('DELETE FROM sales');
            expect(seedContent).toContain('DELETE FROM barbers');
            expect(seedContent).toContain('DELETE FROM services');
            expect(seedContent).toContain('DELETE FROM products');
        });

        it('no incluye sample data del schema original', () => {
            expect(seedContent).not.toContain("'Juan Pérez'");
            expect(seedContent).not.toContain("'Pedro Mendez'");
            expect(seedContent).not.toContain("'Carlos López'");
            expect(seedContent).not.toContain("'Corte Clásico'");
            expect(seedContent).not.toContain("'Cera Premium'");
        });
    });
});
