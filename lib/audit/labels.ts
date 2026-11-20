/**
 * Textos en español de la bitácora. Un solo lugar: la pantalla de Bitácora (y cualquier otra que muestre
 * acciones de auditoría) pasa por aquí, para que nunca se vea un nombre técnico como `pin_reset_emergency`.
 */

/** Acciones que registran las funciones de la base, con su frase. */
export const ACTION_LABELS: Record<string, string> = {
    initial_owner_bootstrap: 'Alta del negocio',
    initial_haircut_commission_configured: 'Configuración de la comisión de cortes',
    product_created: 'Alta de producto',
    cash_opened: 'Apertura de caja',
    cash_closed: 'Cierre de caja',
    cash_movement_recorded: 'Movimiento de caja',
    cash_settings_changed: 'Cambio de fondo y apartado de caja',
    sale_confirmed: 'Venta registrada',
    sale_payment_recorded: 'Abono a una venta',
    sale_reversed: 'Venta anulada',
    discount_approval_used: 'Descuento autorizado con PIN',
    sale_item_without_cost: 'Venta de producto sin costo capturado',
    pin_confirmed_action: 'Acción confirmada con PIN',
    inventory_adjusted: 'Ajuste de inventario',
    inventory_received: 'Entrada de mercancía',
    inventory_minimum_changed: 'Cambio de mínimo de inventario',
    commission_settlement_paid: 'Pago semanal al equipo',
    commission_adjustment_approved: 'Ajuste de comisión aprobado',
    commission_adjustment_rejected: 'Ajuste de comisión rechazado',
    commission_defaults_changed: 'Cambio de tasas de comisión',
    business_profile_updated: 'Cambio de los datos del negocio',
    appointment_saved: 'Cita guardada',
    appointment_rescheduled: 'Cita reprogramada',
    appointment_link: 'Cita ligada a una venta',
    client_linked: 'Cliente ligado a una cita',
    'public_booking.created': 'Reserva en línea creada',
    'public_booking.cancelled': 'Reserva en línea cancelada',
    report_exported: 'Reporte descargado',
    reconciliation_issue_accepted: 'Diferencia del cuadre aceptada',
    reconciliation_issue_reopened: 'Diferencia del cuadre reabierta',
    reconciliation_pre_agenda_accepted: 'Venta anterior a la agenda aceptada en el cuadre',
    'account.created': 'Cuenta creada',
    'account.activated': 'Cuenta reactivada',
    'account.deactivated': 'Cuenta desactivada',
    'account.pin_changed': 'PIN cambiado por la persona',
    'account.pin_reset': 'PIN restablecido por la gerencia',
    'account.migrated_to_pin': 'Cuenta migrada a usuario y PIN',
    pin_reset_emergency: 'PIN restablecido por emergencia',
};

const TABLE_LABELS: Record<string, string> = {
    services: 'un servicio', products: 'un producto', clients: 'un cliente', commission_rules: 'una regla de comisión',
    employees: 'un empleado', business_memberships: 'el puesto de una cuenta', branches: 'la sucursal', businesses: 'los datos del negocio',
    appointments: 'una cita', appointment_items: 'los servicios de una cita', user_branch_access: 'el acceso a una sucursal',
    employee_time_off: 'una ausencia', employee_weekly_schedule: 'un horario semanal', business_hours: 'el horario del negocio',
    cash_sessions: 'una caja', cash_movements: 'un movimiento de caja', inventory_movements: 'un movimiento de inventario',
};
const VERB_LABELS: Record<string, string> = { insert: 'Alta de', update: 'Cambio en', delete: 'Baja de' };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const spaced = (text: string) => text.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Frase en español de una acción. Las altas y cambios automáticos vienen como "tabla.operación". */
export function actionLabel(action: string): string {
    if (ACTION_LABELS[action]) return ACTION_LABELS[action];
    const [table, verb] = action.split('.');
    if (verb && VERB_LABELS[verb]) {
        return `${VERB_LABELS[verb]} ${TABLE_LABELS[table] ?? spaced(table)}`;
    }
    // Acción que aún no tiene frase: se muestra legible, sin guiones bajos ni puntos.
    return capitalize(spaced(action)) || 'Acción registrada';
}

const ENTITY_LABELS: Record<string, string> = {
    sale: 'Venta', cash_session: 'Caja', cash_movement: 'Movimiento de caja', product: 'Producto', products: 'Producto',
    service: 'Servicio', services: 'Servicio', client: 'Cliente', clients: 'Cliente', appointment: 'Cita', appointments: 'Cita',
    appointment_items: 'Servicios de una cita', employee: 'Empleado', employees: 'Empleado', account: 'Cuenta',
    business: 'Negocio', businesses: 'Negocio', branch: 'Sucursal', branches: 'Sucursal', inventory: 'Inventario',
    commission_settlement: 'Pago semanal', commission_adjustment: 'Ajuste de comisión', commission_rules: 'Regla de comisión',
    business_memberships: 'Puesto', report: 'Reporte', report_export: 'Reporte', booking: 'Reserva en línea', reconciliation_issue: 'Cuadre',
    reconciliation_batch: 'Cuadre', employee_time_off: 'Ausencia', employee_weekly_schedule: 'Horario semanal',
};

/** Nombre en español de lo que tocó la acción (venta, caja, cita…). */
export function entityLabel(entity: string | null | undefined): string {
    if (!entity) return '';
    return ENTITY_LABELS[entity] ?? capitalize(spaced(entity));
}
