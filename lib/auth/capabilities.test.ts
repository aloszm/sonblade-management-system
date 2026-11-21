import { describe, expect, it } from 'vitest';
import type { BusinessRole } from '@/lib/auth/context';
import { CAPABILITIES, PUESTOS, capabilitiesFor, temporaryDecisions, type Level } from './capabilities';
import { PAY_RECEIPT_ROLES, canSeePayReceipts, canSeeSaleCost } from './roles';

const ORDER: BusinessRole[] = PUESTOS.map((p) => p.role);
const row = (id: string) => ORDER.map((r) => CAPABILITIES.find((c) => c.id === id)!.evaluate(r).level).join(' ');

describe('catálogo de capacidades', () => {
    it('los cinco puestos, en orden', () => {
        expect(PUESTOS.map((p) => p.label)).toEqual(['Cuenta principal', 'Gerencia', 'Consulta', 'Recepción', 'Barbero']);
        expect(ORDER).toEqual(['owner', 'admin', 'viewer', 'receptionist', 'barber']);
    });

    it('cada capacidad tiene id único, pantalla, texto en español y fuente', () => {
        const ids = CAPABILITIES.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const c of CAPABILITIES) {
            expect(c.screen.length).toBeGreaterThan(0);
            expect(c.label.length).toBeGreaterThan(3);
            expect(c.source.length).toBeGreaterThan(5);
        }
    });

    it('la capacidad pedida por el dueño existe', () => {
        const labels = CAPABILITIES.map((c) => c.label).join('\n');
        for (const text of ['Cobrar', 'Abrir y cerrar caja', 'Autorizar descuentos con PIN', 'Anular ventas', 'Registrar gastos', 'Ver recibos de pago',
            'Ver costo de producto', 'Cambiar sueldos', 'Encender o apagar reservas', 'Restablecer el PIN', 'Registrar entradas de inventario',
            'Agregar producto a una cita', 'Enviar WhatsApp', 'Ver Finanzas', 'Ver la Bitácora']) {
            expect(labels).toContain(text);
        }
    });

    it('recepción y caja (puesto heredado) tienen exactamente las mismas capacidades', () => {
        for (const c of CAPABILITIES) expect(c.evaluate('cashier')).toEqual(c.evaluate('receptionist'));
    });

    it('las que dependen de los ayudantes de roles.ts dicen lo mismo que ellos', () => {
        for (const role of ORDER) {
            expect(CAPABILITIES.find((c) => c.id === 'pago.recibos')!.evaluate(role).level === 'si').toBe(canSeePayReceipts(role));
            expect(CAPABILITIES.find((c) => c.id === 'cobro.costo')!.evaluate(role).level === 'si').toBe(canSeeSaleCost(role));
        }
    });

    it('si se cambia PAY_RECEIPT_ROLES, el catálogo y la decisión temporal cambian solos', () => {
        const original = [...PAY_RECEIPT_ROLES];
        try {
            PAY_RECEIPT_ROLES.push('barber', 'receptionist', 'cashier');
            expect(row('pago.recibos')).toBe('si si si si si');
            expect(temporaryDecisions()).toEqual([]);
        } finally {
            PAY_RECEIPT_ROLES.splice(0, PAY_RECEIPT_ROLES.length, ...original);
        }
        expect(row('pago.recibos')).toBe('si si si no no');
        expect(temporaryDecisions()).toHaveLength(1);
        expect(temporaryDecisions()[0]).toMatch(/Recibos de pago ocultos a barberos y recepción/);
    });

    it('las reglas que viven solo en la base salen como «base», con su fuente, sin inventar', () => {
        const base = CAPABILITIES.filter((c) => ORDER.some((r) => c.evaluate(r).level === 'base'));
        expect(base.map((c) => c.id)).toEqual(['cobro.descuento']);
        expect(base[0].source).toMatch(/confirm_sale/);
        expect(base[0].evaluate('owner').note).toMatch(/base/i);
    });

    it('capabilitiesFor agrupa por pantalla y trae el nivel de cada capacidad', () => {
        const groups = capabilitiesFor('barber');
        expect(groups.flatMap((g) => g.items)).toHaveLength(CAPABILITIES.length);
        const level = (id: string): Level => groups.flatMap((g) => g.items).find((c) => c.id === id)!.level;
        expect(level('cobro.cobrar')).toBe('no');
        expect(level('agenda.producto')).toBe('si');
    });

    /**
     * Tabla vigente (cuenta principal, gerencia, consulta, recepción, barbero). Congela lo que HOY dicen las reglas
     * reales para que un cambio de permiso no pase sin que alguien lo note: si cambias un permiso a propósito,
     * actualiza la fila (y avisa al dueño).
     */
    const TABLA: Record<string, string> = {
        'general.cambiar': 'si si no si si',
        'cobro.cobrar': 'si si no si no',
        'cobro.descuento': 'base base base base base',
        'cobro.ticket': 'si si si si no',
        'cobro.anular': 'pin pin no no no',
        'cobro.costo': 'si si si no no',
        'caja.abrir': 'si si no si no',
        'caja.movimientos': 'si pin ver si no',
        'caja.historial': 'si si si no no',
        // «Ver el resumen de caja del día»: recepción solo hoy y ayer (nota), por eso el nivel es sí.
        'caja.resumen': 'si si si si no',
        'agenda.citas': 'si si ver si ver',
        'agenda.whatsapp': 'si si no si no',
        'agenda.producto': 'si si ver si si',
        'agenda.vendedor': 'si si no si no',
        'agenda.telefono': 'si si si si no',
        'agenda.ausencias': 'si si no si no',
        'clientes.crear': 'si si ver si si',
        'clientes.editar': 'si si ver si ver',
        'inventario.entradas': 'si si ver si no',
        'inventario.productos': 'si si ver ver no',
        'servicios.editar': 'si si ver no no',
        'gastos.registrar': 'si si ver no no',
        'gastos.anular': 'si si ver no no',
        'sobres.mover': 'si si ver no no',
        'cifras.panel': 'si si si no no',
        'cifras.ventas': 'si si si no no',
        'cifras.finanzas': 'si si si no no',
        'cifras.equilibrio': 'si si si no no',
        // La API de gastos fijos deja a gerencia; en la pantalla de punto de equilibrio solo edita la cuenta principal.
        'cifras.equilibrio-editar': 'si ver ver no no',
        'cifras.cuadre': 'si si si no no',
        'cifras.cuadre-revisar': 'si si ver no no',
        'cifras.reportes': 'si si si no no',
        'cifras.bitacora': 'si si si no no',
        'equipo.fichas': 'si si ver no no',
        'equipo.telefono': 'si si si no no',
        'equipo.crear-acceso': 'si si no no no',
        'equipo.pin-basico': 'si si no no no',
        'equipo.pin-alto': 'si no no no no',
        'equipo.titulo': 'si no no no no',
        'equipo.sueldos': 'pin ver ver no no',
        'equipo.metas': 'si no no no no',
        'equipo.semana-otros': 'si si si no no',
        'equipo.semana-propia': 'si si no si si',
        'pago.pagar': 'si si ver no no',
        'pago.recibos': 'si si si no no',
        'config.negocio': 'si no no no no',
        'config.reservas-ver': 'si si no no no',
        'config.reservas': 'pin ver no no no',
        'config.estado': 'si no no no no',
        'config.quien': 'si no no no no',
        'comentarios.escribir': 'si si si si si',
        'comentarios.todos': 'si no no no no',
        'comentarios.responder': 'si no no no no',
    };

    it('comentarios: la excepción de consulta queda explícita (escribe aquí aunque sea de solo lectura)', () => {
        const cap = CAPABILITIES.find((c) => c.id === 'comentarios.escribir')!;
        expect(cap.evaluate('viewer').note).toMatch(/Excepción/);
        expect(cap.evaluate('admin').note).toBeUndefined();
    });

    it('tabla vigente de puestos × capacidades (congelada)', () => {
        expect(Object.keys(TABLA).sort()).toEqual(CAPABILITIES.map((c) => c.id).sort());
        for (const [id, expected] of Object.entries(TABLA)) expect(row(id), id).toBe(expected);
    });
});
