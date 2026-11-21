/**
 * «Ver detalle» de la Bitácora, legible. Antes se mostraba el JSON crudo de la base (`"float_left": 450`,
 * `"employee_id": "a1b4…"`): llaves en inglés, identificadores que no dicen nada y montos sin formato
 * (auditoría del 21 nov 2026). Aquí cada llave conocida lleva su nombre en español, los montos van en pesos,
 * sí/no en vez de true/false, y los identificadores internos se omiten. Lo desconocido se muestra con la llave
 * legible (sin guiones bajos), nunca se esconde: la bitácora no pierde información útil.
 */
import { formatMoney } from '@/lib/utils/money';
import { ACTION_LABELS } from './labels';

export interface DetailRow { key: string; label: string; value: string }

const MONEY_KEYS = new Set([
    'amount', 'total', 'paid', 'discount', 'refunded_amount', 'opening_cash', 'opening_expected', 'counted_cash', 'expected_cash', 'difference',
    'float_left', 'float_target', 'cash_float_target', 'reserve_amount', 'daily_reserve_amount', 'withdrawn_amount', 'paid_amount',
    'gross_commission', 'bonuses', 'wages', 'advances', 'loan_payments', 'deductions', 'staff_deductions', 'carryover_in', 'carryover_out',
    'previous_balance', 'balance_after', 'weekly_amount', 'suggested_amount', 'daily_amount', 'max_amount', 'tips_total',
]);

const KEY_LABELS: Record<string, string> = {
    // Ventas
    folio: 'Folio', status: 'Estado', total: 'Total', paid: 'Pagado', discount: 'Descuento', discount_reason: 'Motivo del descuento',
    refunded_amount: 'Devuelto', notes: 'Notas', note: 'Nota', source: 'Origen',
    // Caja
    opening_cash: 'Fondo con que se abrió', opening_expected: 'Se esperaba abrir con', opening_reason: 'Motivo de abrir con otro monto',
    counted_cash: 'Efectivo contado', expected_cash: 'Efectivo que debía haber', difference: 'Diferencia', difference_reason: 'Motivo de la diferencia',
    float_left: 'Fondo que se dejó', float_target: 'Fondo recomendado', cash_float_target: 'Fondo recomendado', short_float_reason: 'Motivo de dejar menos fondo',
    reserve_amount: 'Apartado al sobre', daily_reserve_amount: 'Apartado diario', reserve_label: 'Sobre', daily_reserve_label: 'Sobre',
    withdrawn_amount: 'Retiro', withdrawal_delivered_to: 'Retiro entregado a', withdrawal_recipient_name: 'Recibe el retiro',
    amount: 'Monto', method: 'Forma de pago', type: 'Tipo de movimiento', description: 'Concepto', paid_from: 'Pagado desde',
    previous_balance: 'Saldo anterior', balance_after: 'Saldo que quedó',
    // Confirmaciones
    comment: 'Comentario', reason: 'Motivo', confirmed_with_pin: 'Confirmado con PIN', action: 'Qué se confirmó',
    // Inventario
    quantity_delta: 'Cambio de existencias', quantity_after: 'Existencias que quedaron', quantity: 'Cantidad', minimum_quantity: 'Mínimo',
    // Citas y reservas
    starts_at: 'Inicio de la cita', minutes: 'Duración (minutos)', channel: 'Medio', kind: 'Tipo', client_linked: 'Cliente ligado',
    privacy_version: 'Versión del aviso de privacidad', by: 'Quién canceló', enabled: 'Encendidas',
    // Pago semanal
    receipt_number: 'Recibo', period_start: 'Periodo desde', period_end: 'Periodo hasta', paid_amount: 'Pagado', gross_commission: 'Comisiones',
    bonuses: 'Bonos', wages: 'Sueldos', advances: 'Adelantos', loan_payments: 'Abonos a préstamos', deductions: 'Ajustes', staff_deductions: 'Descuentos',
    carryover_in: 'Arrastre que entró', carryover_out: 'Arrastre que quedó', weekly_amount: 'Abono semanal', daily_amount: 'Sueldo por día',
    // Reportes
    audience: 'Para quién', period_from: 'Periodo desde', period_to: 'Periodo hasta',
    // Gastos
    category: 'Categoría', vendor: 'Proveedor', incurred_on: 'Fecha del gasto', suggested_amount: 'Monto sugerido', is_estimate: 'Es un estimado',
    // Cuentas
    login_name: 'Usuario',
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
    method: { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', mixed: 'Mixto' },
    type: { deposit: 'Entrada', expense: 'Gasto', withdrawal: 'Retiro' },
    status: { paid: 'Pagada', refunded: 'Anulada', scheduled: 'Agendada', confirmed: 'Confirmada', checked_in: 'Llegó', completed: 'Atendida', cancelled: 'Cancelada', no_show: 'No llegó' },
    source: { appointment: 'Con cita', walk_in: 'Sin cita', online: 'Reserva en línea', sql: 'Cambio hecho por SQL' },
    paid_from: { cash_drawer: 'Caja del día', envelope: 'Sobre', bank: 'Banco' },
    kind: { confirmation: 'Confirmación', reminder: 'Recordatorio', absent: 'Falta', extra: 'Día extra' },
    channel: { whatsapp: 'WhatsApp' },
    by: { self: 'El cliente, desde su enlace', staff: 'El equipo' },
    audience: { interno: 'Interno', externo: 'Contador / externo' },
};

/** Identificadores internos y huellas: no le dicen nada a quien lee la bitácora. */
const HIDDEN = new Set(['idempotency_key', 'sha256_prefix', 'notification_id', 'breakdown', 'variable_prices', 'appointment_link']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isIdKey = (key: string) => key === 'id' || key.endsWith('_id') || key.endsWith('_ids');
const readable = (key: string) => { const t = key.replace(/[_.]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

function formatValue(key: string, value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'number') return MONEY_KEYS.has(key) ? formatMoney(value, { cents: true }) : String(value);
    if (typeof value === 'string') {
        if (UUID.test(value)) return null;
        if (key === 'action') return ACTION_LABELS[value] ?? readable(value);
        return VALUE_LABELS[key]?.[value] ?? value;
    }
    if (Array.isArray(value)) {
        const items = value.filter((v) => typeof v === 'string' || typeof v === 'number').filter((v) => !(typeof v === 'string' && UUID.test(v)));
        return items.length > 0 && items.length === value.length ? items.join(', ') : null;
    }
    return null;
}

/** Renglones legibles del detalle. Devuelve [] si no queda nada que mostrar. */
export function detailRows(details: Record<string, unknown> | null | undefined): DetailRow[] {
    if (!details) return [];
    const rows: DetailRow[] = [];
    for (const [key, value] of Object.entries(details)) {
        if (HIDDEN.has(key) || isIdKey(key)) continue;
        const text = formatValue(key, value);
        if (text === null) continue;
        rows.push({ key, label: KEY_LABELS[key] ?? readable(key), value: text });
    }
    return rows;
}
