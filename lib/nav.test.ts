import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ADMIN_ONLY_PATHS } from '@/lib/auth/route-access';
import { PAGE_TITLES, isNavActive, menuItems, menuSections, moreSections, navProfile, quickItems } from './nav';

const labels = (items: { label: string }[]) => items.map((i) => i.label);
const owner = { role: 'admin', isOwner: true };
const manager = { role: 'admin', isOwner: false };
const viewer = { role: 'admin', readOnly: true };
const front = { role: 'recepcion' };
const barber = { role: 'barber' };

describe('menú por puesto', () => {
    it('perfil de pantalla', () => {
        expect(navProfile(owner)).toBe('admin');
        expect(navProfile(viewer)).toBe('viewer');
        expect(navProfile(front)).toBe('recepcion');
        expect(navProfile(barber)).toBe('barber');
        expect(navProfile(null)).toBeNull();
    });

    it('dueño: 4 atajos y el resto en Más, con Configuración', () => {
        expect(labels(quickItems(owner))).toEqual(['Panel', 'Agenda', 'Caja', 'Finanzas']);
        const more = labels(moreSections(owner).flatMap((s) => s.items));
        for (const l of ['Reportes', 'Gastos', 'Cuadre', 'Bitácora', 'Configuración', 'Cobro']) expect(more).toContain(l);
        expect(more).not.toContain('Panel');
    });

    it('gerencia: igual al dueño pero sin Configuración', () => {
        expect(labels(quickItems(manager))).toEqual(['Panel', 'Agenda', 'Caja', 'Finanzas']);
        expect(labels(menuItems(manager))).not.toContain('Configuración');
    });

    it('recepción: Caja, Agenda, Barberos hoy, Clientes; Mi semana, Cobro e Inventario en Más (sin Pago semanal)', () => {
        expect(labels(quickItems(front))).toEqual(['Caja', 'Agenda', 'Barberos hoy', 'Clientes']);
        expect(labels(moreSections(front).flatMap((s) => s.items))).toEqual(['Mi semana', 'Cobro', 'Inventario']);
    });

    it('«Mi semana» es de quien trabaja (barbero, gerencia con ficha y recepción); la consulta no la ve', () => {
        for (const u of [barber, owner, manager, front]) expect(labels(menuItems(u))).toContain('Mi semana');
        expect(labels(menuItems(viewer))).not.toContain('Mi semana');
    });

    it('barbero: Mi semana, Agenda, Clientes y nada más (sin Pago semanal)', () => {
        expect(labels(quickItems(barber))).toEqual(['Mi semana', 'Agenda', 'Clientes']);
        expect(moreSections(barber)).toEqual([]);
        expect(labels(menuItems(barber))).not.toContain('Caja');
    });

    it('recibos de pago (Pago semanal): solo dueño, gerencia y consulta; barbero y recepción no lo tienen', () => {
        for (const u of [owner, manager, viewer]) expect(labels(menuItems(u))).toContain('Pago semanal');
        for (const u of [barber, front]) expect(labels(menuItems(u))).not.toContain('Pago semanal');
    });

    it('consulta: sin Caja del atajo, sin Cobro, Mi semana ni Configuración', () => {
        expect(labels(quickItems(viewer))).toEqual(['Panel', 'Agenda', 'Finanzas', 'Barberos hoy']);
        const all = labels(menuItems(viewer));
        for (const l of ['Cobro', 'Mi semana', 'Configuración']) expect(all).not.toContain(l);
        expect(all).toContain('Caja');
        expect(labels(moreSections(viewer).flatMap((s) => s.items))).toContain('Reportes');
    });

    it('«Reservas en línea»: dueño y gerencia la ven; recepción, barbero y consulta no', () => {
        expect(labels(menuItems(owner))).toContain('Reservas en línea');
        expect(labels(menuItems(manager))).toContain('Reservas en línea');
        for (const u of [front, barber, viewer]) expect(labels(menuItems(u))).not.toContain('Reservas en línea');
        expect(PAGE_TITLES['/configuracion/reservas']).toBe('Reservas en línea');
    });

    it('en «/configuracion/reservas» solo se marca esa entrada y no también «Configuración»', () => {
        const hrefs = menuItems(owner).map((i) => i.href);
        expect(isNavActive('/configuracion/reservas', '/configuracion/reservas', hrefs)).toBe(true);
        expect(isNavActive('/configuracion', '/configuracion/reservas', hrefs)).toBe(false);
        expect(isNavActive('/configuracion', '/configuracion', hrefs)).toBe(true);
        expect(isNavActive('/configuracion', '/configuracion/estado', hrefs)).toBe(true);
        expect(isNavActive('/', '/citas', hrefs)).toBe(false);
    });

    it('con PIN temporal no hay menú ni atajos', () => {
        for (const u of [owner, front, barber, viewer]) {
            const t = { ...u, mustChangePin: true };
            expect(menuItems(t)).toEqual([]);
            expect(quickItems(t)).toEqual([]);
            expect(moreSections(t)).toEqual([]);
        }
    });

    it('sin sesión no hay nada', () => {
        expect(menuItems(null)).toEqual([]);
    });
});

describe('Sobres en el menú', () => {
    it('dueño, gerencia y consulta lo ven en el grupo Negocio, junto a Gastos', () => {
        for (const u of [owner, manager, viewer]) {
            const negocio = menuSections(u).find((s) => s.title === 'Negocio')!;
            const names = labels(negocio.items);
            expect(names).toContain('Sobres');
            expect(names.indexOf('Sobres')).toBe(names.indexOf('Gastos') + 1);
            expect(labels(moreSections(u).flatMap((s) => s.items))).toContain('Sobres');
        }
    });
    it('recepción y barbero no lo ven', () => {
        expect(labels(menuItems(front))).not.toContain('Sobres');
        expect(labels(menuItems(barber))).not.toContain('Sobres');
    });
    it('tiene título de pantalla y la ruta está protegida (lib/auth/route-access.ts, que aplica el middleware) igual que /gastos', () => {
        expect(PAGE_TITLES['/sobres']).toBe('Sobres');
        expect(ADMIN_ONLY_PATHS).toContain('/gastos');
        expect(ADMIN_ONLY_PATHS).toContain('/sobres');
        // El middleware usa esa misma regla (no una lista propia).
        const source = readFileSync(path.resolve(__dirname, '../middleware.ts'), 'utf8');
        expect(source).toContain('routeVerdict(');
    });
    it('Punto de equilibrio en el menú de cuenta principal, gerencia y consulta; no en recepción ni barbero', () => {
        const has = (user: Parameters<typeof menuItems>[0]) => menuItems(user).some((i) => i.href === '/punto-de-equilibrio');
        expect(has({ role: 'admin', isOwner: true })).toBe(true);
        expect(has({ role: 'admin' })).toBe(true);
        expect(has({ role: 'admin', readOnly: true })).toBe(true);
        expect(has({ role: 'recepcion' })).toBe(false);
        expect(has({ role: 'barber' })).toBe(false);
    });
});
