import type { BusinessRole } from '@/lib/auth/context';
import { assignableRoles, canManageAccount } from '@/lib/auth/account-rules';
import { canSeeClientPhones, canSeeStaffPhones } from '@/lib/auth/privacy';
import {
    FRONT_DESK_ROLES, FRONT_DESK_READ_ROLES, MANAGEMENT_ROLES, MANAGEMENT_READ_ROLES, OWNER_ONLY_ROLES, PAY_RECEIPT_ROLES,
    PRIMARY_ACCOUNT_BADGE, ROLE_TITLES, canSeePayReceipts, canSeeSaleCost, canWrite, cashMovementNeedsPin, isPrimaryAccount, readerRole,
} from '@/lib/auth/roles';
import { canEnter } from '@/lib/auth/route-access';
import {
    APPOINTMENT_PRODUCT_EDITOR_ROLES, APPOINTMENT_PRODUCT_SELLER_ROLES, CLIENT_CREATE_ROLES, CLIENT_EDIT_ROLES, mayReadBarberStats,
} from '@/lib/barber/permissions';

/**
 * Catálogo de capacidades de Configuración → «Quién ve qué». CADA capacidad se evalúa llamando al mismo ayudante
 * (o a la misma lista de puestos) que usa la API o la pantalla, nunca con una tabla copiada: si mañana cambia un
 * permiso en lib/auth, esta página cambia sola. `source` dice de dónde sale la regla.
 *
 * Las reglas que viven SOLO en la base de datos (funciones SQL) no se pueden evaluar aquí: salen como nivel `base`
 * con su fuente y una nota, en vez de inventar una respuesta.
 */

/** Los puestos que se muestran (recepción incluye al puesto heredado `cashier`, que se comporta igual). */
export const PUESTOS: { role: BusinessRole; label: string }[] = [
    { role: 'owner', label: PRIMARY_ACCOUNT_BADGE },
    { role: 'admin', label: 'Gerencia' },
    { role: 'viewer', label: ROLE_TITLES.viewer },
    { role: 'receptionist', label: ROLE_TITLES.receptionist },
    { role: 'barber', label: ROLE_TITLES.barber },
];

/**
 * si = puede; no = no puede; ver = solo ve (no cambia); pin = puede, pero confirmando con su PIN;
 * base = depende de una regla que vive solo en la base (se explica en la nota).
 */
export type Level = 'si' | 'no' | 'ver' | 'pin' | 'base';

export interface Outcome {
    level: Level;
    note?: string;
}

export interface Capability {
    id: string;
    /** Pantalla a la que pertenece (se agrupa por ella). */
    screen: string;
    label: string;
    /** De dónde sale la regla (archivo y ayudante), para quien quiera comprobarlo. */
    source: string;
    evaluate: (role: BusinessRole) => Outcome;
}

const si = (allowed: boolean): Outcome => ({ level: allowed ? 'si' : 'no' });
/** Puede cambiar (lista `write`); si no, ve cuando su puesto entra a la pantalla; si no, nada. */
const cambiaOVe = (role: BusinessRole, write: readonly BusinessRole[], screen: string): Outcome =>
    write.includes(role) ? { level: 'si' } : { level: canEnter(role, screen) ? 'ver' : 'no' };
const conPin = (allowed: boolean): Outcome => ({ level: allowed ? 'pin' : 'no' });
const baseDeDatos = (note: string): Outcome => ({ level: 'base', note });

export const CAPABILITIES: Capability[] = [
    // General
    { id: 'general.cambiar', screen: 'General', label: 'Hacer cambios en el sistema (Consulta es solo lectura)', source: 'lib/auth/roles.ts · canWrite',
        evaluate: (r) => si(canWrite(r)) },

    // Cobro y ventas
    { id: 'cobro.cobrar', screen: 'Cobro', label: 'Cobrar', source: 'POST /api/sales · FRONT_DESK_ROLES',
        evaluate: (r) => si(FRONT_DESK_ROLES.includes(r)) },
    { id: 'cobro.descuento', screen: 'Cobro', label: 'Autorizar descuentos con PIN', source: 'base: confirm_sale / list_discount_authorizers (migración 20261119180000)',
        evaluate: () => baseDeDatos('Regla en la base: la cuenta principal y la gerencia siempre; cualquier otra persona solo si su ficha tiene marcado «puede autorizar descuentos». La página no puede ver esa marca.') },
    { id: 'cobro.ticket', screen: 'Cobro', label: 'Ver el ticket de una venta', source: 'GET /api/sales/[id] · FRONT_DESK_READ_ROLES',
        evaluate: (r) => si(FRONT_DESK_READ_ROLES.includes(r)) },
    { id: 'cobro.anular', screen: 'Cobro', label: 'Anular ventas', source: 'DELETE /api/sales/[id] · MANAGEMENT_ROLES, siempre con PIN',
        evaluate: (r) => conPin(MANAGEMENT_ROLES.includes(r)) },
    { id: 'cobro.costo', screen: 'Cobro', label: 'Ver costo de producto y lo que le queda a la barbería', source: 'lib/auth/roles.ts · canSeeSaleCost',
        evaluate: (r) => si(canSeeSaleCost(r)) },

    // Caja
    { id: 'caja.abrir', screen: 'Caja', label: 'Abrir y cerrar caja', source: 'POST /api/cash/session (y /close) · FRONT_DESK_ROLES',
        evaluate: (r) => si(FRONT_DESK_ROLES.includes(r)) },
    { id: 'caja.movimientos', screen: 'Caja', label: 'Registrar entradas y salidas de efectivo', source: 'POST /api/cash/movements · FRONT_DESK_ROLES + cashMovementNeedsPin',
        evaluate: (r) => (FRONT_DESK_ROLES.includes(r) ? { level: cashMovementNeedsPin(r) ? 'pin' : 'si' } : { level: canEnter(r, '/caja') ? 'ver' : 'no' }) },
    { id: 'caja.historial', screen: 'Caja', label: 'Ver el historial de cajas', source: 'GET /api/cash/history · MANAGEMENT_READ_ROLES',
        evaluate: (r) => si(MANAGEMENT_READ_ROLES.includes(r)) },

    // Agenda
    { id: 'agenda.citas', screen: 'Agenda', label: 'Agendar, mover y cancelar citas', source: 'POST/PATCH /api/appointments · FRONT_DESK_ROLES',
        evaluate: (r) => cambiaOVe(r, FRONT_DESK_ROLES, '/citas') },
    { id: 'agenda.whatsapp', screen: 'Agenda', label: 'Enviar WhatsApp (confirmación y recordatorio)', source: 'POST /api/appointments/[id]/notifications · FRONT_DESK_ROLES',
        evaluate: (r) => si(FRONT_DESK_ROLES.includes(r)) },
    { id: 'agenda.producto', screen: 'Agenda', label: 'Agregar producto a una cita', source: 'POST /api/appointments/[id]/products · APPOINTMENT_PRODUCT_EDITOR_ROLES',
        evaluate: (r) => (APPOINTMENT_PRODUCT_EDITOR_ROLES.includes(r)
            ? (FRONT_DESK_ROLES.includes(r) ? { level: 'si' } : { level: 'si', note: 'Solo en sus propias citas (la base lo valida).' })
            : { level: canEnter(r, '/citas') ? 'ver' : 'no' }) },
    { id: 'agenda.vendedor', screen: 'Agenda', label: 'Cambiar a quién se apunta la venta de un producto', source: 'PATCH /api/appointments/[id]/products/[lineId] · APPOINTMENT_PRODUCT_SELLER_ROLES',
        evaluate: (r) => si(APPOINTMENT_PRODUCT_SELLER_ROLES.includes(r)) },
    { id: 'agenda.telefono', screen: 'Agenda', label: 'Ver el teléfono de los clientes', source: 'lib/auth/privacy.ts · canSeeClientPhones',
        evaluate: (r) => si(canSeeClientPhones(r)) },
    { id: 'agenda.ausencias', screen: 'Agenda', label: 'Registrar ausencias y descansos del equipo', source: 'POST /api/time-off · FRONT_DESK_ROLES',
        evaluate: (r) => si(FRONT_DESK_ROLES.includes(r)) },

    // Clientes
    { id: 'clientes.crear', screen: 'Clientes', label: 'Registrar clientes nuevos', source: 'POST /api/clients · CLIENT_CREATE_ROLES',
        evaluate: (r) => cambiaOVe(r, CLIENT_CREATE_ROLES, '/clientes') },
    { id: 'clientes.editar', screen: 'Clientes', label: 'Editar los datos de un cliente', source: 'PATCH /api/clients/[id] · CLIENT_EDIT_ROLES',
        evaluate: (r) => cambiaOVe(r, CLIENT_EDIT_ROLES, '/clientes') },

    // Inventario y catálogo
    { id: 'inventario.entradas', screen: 'Inventario', label: 'Registrar entradas de inventario', source: 'POST /api/products/[id]/receive · FRONT_DESK_ROLES',
        evaluate: (r) => cambiaOVe(r, FRONT_DESK_ROLES, '/inventario') },
    { id: 'inventario.productos', screen: 'Inventario', label: 'Crear y editar productos, precios y costos', source: 'POST/PATCH/DELETE /api/products · MANAGEMENT_ROLES',
        evaluate: (r) => cambiaOVe(r, MANAGEMENT_ROLES, '/inventario') },
    { id: 'servicios.editar', screen: 'Servicios', label: 'Crear y editar servicios y precios', source: 'POST/PATCH/DELETE /api/services · MANAGEMENT_ROLES',
        evaluate: (r) => cambiaOVe(r, MANAGEMENT_ROLES, '/servicios') },

    // Gastos y sobres
    { id: 'gastos.registrar', screen: 'Gastos', label: 'Registrar gastos', source: 'POST /api/expenses · MANAGEMENT_ROLES',
        evaluate: (r) => cambiaOVe(r, MANAGEMENT_ROLES, '/gastos') },
    { id: 'gastos.anular', screen: 'Gastos', label: 'Anular un gasto', source: 'POST /api/expenses/[id]/cancel · MANAGEMENT_ROLES',
        evaluate: (r) => cambiaOVe(r, MANAGEMENT_ROLES, '/gastos') },
    { id: 'sobres.mover', screen: 'Sobres', label: 'Depositar o ajustar un sobre', source: 'POST /api/envelopes/[id]/deposit y /adjust · MANAGEMENT_ROLES',
        evaluate: (r) => cambiaOVe(r, MANAGEMENT_ROLES, '/sobres') },

    // Cifras del negocio
    { id: 'cifras.panel', screen: 'Cifras del negocio', label: 'Ver el Panel', source: 'lib/auth/route-access.ts · canEnter',
        evaluate: (r) => si(canEnter(r, '/')) },
    { id: 'cifras.ventas', screen: 'Cifras del negocio', label: 'Ver el historial de Ventas', source: 'lib/auth/route-access.ts · canEnter',
        evaluate: (r) => si(canEnter(r, '/ventas/historial')) },
    { id: 'cifras.finanzas', screen: 'Cifras del negocio', label: 'Ver Finanzas', source: 'lib/auth/route-access.ts · canEnter',
        evaluate: (r) => si(canEnter(r, '/administracion')) },
    { id: 'cifras.cuadre', screen: 'Cifras del negocio', label: 'Ver el Cuadre', source: 'lib/auth/route-access.ts · canEnter',
        evaluate: (r) => si(canEnter(r, '/cuadre')) },
    { id: 'cifras.cuadre-revisar', screen: 'Cifras del negocio', label: 'Revisar diferencias del Cuadre', source: 'POST /api/reconciliation · MANAGEMENT_ROLES',
        evaluate: (r) => cambiaOVe(r, MANAGEMENT_ROLES, '/cuadre') },
    { id: 'cifras.reportes', screen: 'Cifras del negocio', label: 'Ver Reportes', source: 'lib/auth/route-access.ts · canEnter',
        evaluate: (r) => si(canEnter(r, '/reportes')) },
    { id: 'cifras.bitacora', screen: 'Cifras del negocio', label: 'Ver la Bitácora', source: 'lib/auth/route-access.ts · canEnter',
        evaluate: (r) => si(canEnter(r, '/admin/auditoria')) },

    // Equipo y pagos
    { id: 'equipo.fichas', screen: 'Equipo', label: 'Crear y editar barberos y recepción (ficha, horario)', source: 'POST/PATCH /api/barbers · MANAGEMENT_ROLES',
        evaluate: (r) => cambiaOVe(r, MANAGEMENT_ROLES, '/equipo') },
    { id: 'equipo.telefono', screen: 'Equipo', label: 'Ver el teléfono del personal', source: 'lib/auth/privacy.ts · canSeeStaffPhones',
        evaluate: (r) => si(canSeeStaffPhones(r)) },
    { id: 'equipo.crear-acceso', screen: 'Equipo', label: 'Crear accesos de barberos y recepción', source: 'POST /api/accounts · canManageAccount / assignableRoles',
        evaluate: (r) => si(assignableRoles(r).includes('barber')) },
    { id: 'equipo.pin-basico', screen: 'Equipo', label: 'Restablecer el PIN de barberos y recepción', source: 'POST /api/accounts/[userId]/reset-pin · canManageAccount',
        evaluate: (r) => si(canManageAccount(r, 'barber') && canManageAccount(r, 'receptionist')) },
    { id: 'equipo.pin-alto', screen: 'Equipo', label: 'Restablecer el PIN de gerencia, consulta u otra cuenta principal', source: 'POST /api/accounts/[userId]/reset-pin · canManageAccount',
        evaluate: (r) => si(canManageAccount(r, 'admin') && canManageAccount(r, 'viewer') && canManageAccount(r, 'owner')) },
    { id: 'equipo.titulo', screen: 'Equipo', label: 'Cambiar el título visible de una persona', source: 'PATCH /api/barbers/[id] · isPrimaryAccount',
        evaluate: (r) => si(isPrimaryAccount(r)) },
    { id: 'equipo.sueldos', screen: 'Equipo', label: 'Cambiar sueldos', source: 'PUT /api/wages · OWNER_ONLY_ROLES (con PIN y motivo)',
        evaluate: (r) => (OWNER_ONLY_ROLES.includes(r) ? { level: 'pin' } : { level: MANAGEMENT_READ_ROLES.includes(r) ? 'ver' : 'no' }) },
    { id: 'equipo.metas', screen: 'Equipo', label: 'Crear y editar metas y bonos', source: 'POST/PATCH /api/bonus-goals · OWNER_ONLY_ROLES',
        evaluate: (r) => si(OWNER_ONLY_ROLES.includes(r)) },
    { id: 'equipo.semana-otros', screen: 'Equipo', label: 'Ver la semana (sueldo y comisiones) de otras personas', source: 'GET /api/barbers/[id]/stats · mayReadBarberStats(readerRole)',
        evaluate: (r) => si(mayReadBarberStats(readerRole(r), 'yo', 'otra-persona')) },
    { id: 'equipo.semana-propia', screen: 'Equipo', label: 'Ver su propia semana (Mi semana)', source: 'lib/auth/route-access.ts · canEnter',
        evaluate: (r) => si(canEnter(r, '/barbero')) },
    { id: 'pago.pagar', screen: 'Pago semanal', label: 'Pagar la semana, registrar adelantos y descuentos', source: 'POST /api/settlements y /api/employee-ledger · MANAGEMENT_ROLES',
        evaluate: (r) => cambiaOVe(r, MANAGEMENT_ROLES, '/liquidaciones') },
    { id: 'pago.recibos', screen: 'Pago semanal', label: 'Ver recibos de pago', source: 'lib/auth/roles.ts · canSeePayReceipts (PAY_RECEIPT_ROLES)',
        evaluate: (r) => si(canSeePayReceipts(r)) },

    // Configuración
    { id: 'config.negocio', screen: 'Configuración', label: 'Cambiar datos del negocio, comisiones y horario', source: 'POST /api/settings · OWNER_ONLY_ROLES',
        evaluate: (r) => si(OWNER_ONLY_ROLES.includes(r)) },
    { id: 'config.reservas-ver', screen: 'Configuración', label: 'Ver Reservas en línea', source: 'lib/auth/route-access.ts · canEnter (excepción de la gerencia)',
        evaluate: (r) => si(canEnter(r, '/configuracion/reservas')) },
    { id: 'config.reservas', screen: 'Configuración', label: 'Encender o apagar reservas en línea', source: 'PUT /api/booking-settings · OWNER_ONLY_ROLES, con PIN',
        evaluate: (r) => (OWNER_ONLY_ROLES.includes(r) ? { level: 'pin' } : { level: canEnter(r, '/configuracion/reservas') ? 'ver' : 'no' }) },
    { id: 'config.estado', screen: 'Configuración', label: 'Ver el estado del sistema', source: 'GET /api/system-status · OWNER_ONLY_ROLES',
        evaluate: (r) => si(OWNER_ONLY_ROLES.includes(r) && canEnter(r, '/configuracion/estado')) },
    { id: 'config.quien', screen: 'Configuración', label: 'Ver esta página (Quién ve qué)', source: 'lib/auth/route-access.ts · canEnter',
        evaluate: (r) => si(canEnter(r, '/configuracion/quien-ve-que')) },
];

/** Pantallas, en el orden en que aparecen en CAPABILITIES. */
export function capabilityScreens(): string[] {
    return [...new Set(CAPABILITIES.map((c) => c.screen))];
}

/** Todas las capacidades de un puesto, ya evaluadas, agrupadas por pantalla. */
export function capabilitiesFor(role: BusinessRole): { screen: string; items: (Capability & Outcome)[] }[] {
    return capabilityScreens().map((screen) => ({
        screen,
        items: CAPABILITIES.filter((c) => c.screen === screen).map((c) => ({ ...c, ...c.evaluate(role) })),
    }));
}

/**
 * Decisiones temporales vigentes: se detectan comparando la regla real, no con un texto fijo. Hoy: los recibos de
 * pago están cerrados a barberos y recepción (PAY_RECEIPT_ROLES, decisión del dueño del 20 nov 2026).
 */
export function temporaryDecisions(): string[] {
    const closed = (['barber', 'receptionist', 'cashier'] as BusinessRole[]).filter((r) => !PAY_RECEIPT_ROLES.includes(r));
    const out: string[] = [];
    if (closed.length > 0) {
        out.push('Recibos de pago ocultos a barberos y recepción (decisión del dueño, 20 nov 2026). Cuando se revierta, esta página lo reflejará sola.');
    }
    return out;
}
