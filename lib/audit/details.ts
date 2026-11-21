/**
 * «Ver detalle» de la Bitácora, legible. Antes se mostraba el JSON crudo de la base (`"float_left": 450`,
 * `"employee_id": "a1b4…"`): llaves en inglés, identificadores que no dicen nada y montos sin formato
 * (auditoría del 21 nov 2026). Aquí cada dato conocido lleva su nombre en español, los montos van en pesos,
 * las fechas en la hora de la barbería, sí/no en vez de true/false, y los identificadores internos se omiten.
 *
 * La API (`list_audit_log`) entrega el detalle como `{ before, after, reason }`:
 * - Acciones que escriben las funciones de la base (cierre de caja, venta, pago…): `after` trae los datos del
 *   hecho. Se muestran todos; una llave sin nombre propio se muestra legible, nunca se esconde.
 * - Altas y cambios automáticos de una tabla (`tabla.insert`, `tabla.update`): `before`/`after` son la fila
 *   completa. Se muestran solo los datos con nombre propio y, en un cambio, solo lo que cambió («antes → después»).
 */
import { BUSINESS_TIME_ZONE, formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatMoney } from '@/lib/utils/money';
import { ACTION_LABELS } from './labels';

export interface DetailRow { key: string; label: string; value: string }
type Json = Record<string, unknown>;

const MONEY_KEYS = new Set([
    'amount', 'total', 'paid', 'discount', 'refunded_amount', 'opening_cash', 'opening_expected', 'counted_cash', 'expected_cash', 'difference',
    'float_left', 'float_target', 'cash_float_target', 'reserve_amount', 'daily_reserve_amount', 'withdrawn_amount', 'paid_amount',
    'gross_commission', 'bonuses', 'wages', 'advances', 'loan_payments', 'deductions', 'staff_deductions', 'carryover_in', 'carryover_out',
    'previous_balance', 'balance_after', 'weekly_amount', 'suggested_amount', 'daily_amount', 'max_amount',
    'price', 'sale_price', 'cost_price', 'price_snapshot',
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
    // Inventario y catálogo
    quantity_delta: 'Cambio de existencias', quantity_after: 'Existencias que quedaron', quantity: 'Cantidad', minimum_quantity: 'Mínimo',
    name: 'Nombre', price: 'Precio', sale_price: 'Precio de venta', cost_price: 'Costo', sku: 'Código', duration_minutes: 'Duración (minutos)',
    variable_price: 'Precio libre', bookable_online: 'Se puede reservar en línea', tracks_inventory: 'Lleva inventario', is_active: 'Activo',
    // Citas, ausencias y reservas
    starts_at: 'Inicio', ends_at: 'Fin', scheduled_start_at: 'Inicio de la cita', scheduled_end_at: 'Fin de la cita', customer_name: 'Cliente',
    arrived_at: 'Llegó', completed_at: 'Se atendió', minutes: 'Duración (minutos)', channel: 'Medio', kind: 'Tipo', client_linked: 'Cliente ligado',
    privacy_version: 'Versión del aviso de privacidad', by: 'Quién canceló', enabled: 'Encendidas',
    requested_via: 'Cómo avisó', requested_at: 'Cuándo avisó', cancelled_at: 'Se canceló', cancel_reason: 'Motivo de la cancelación',
    // Personas y cuentas
    display_name: 'Nombre', display_title: 'Título visible', phone: 'Teléfono', is_barber: 'Es barbero', role: 'Puesto', login_name: 'Usuario',
    must_change_pin: 'Debe cambiar su PIN', can_authorize_discounts: 'Autoriza descuentos', accepts_online_booking: 'Acepta reservas en línea',
    // Pago semanal
    receipt_number: 'Recibo', period_start: 'Periodo desde', period_end: 'Periodo hasta', paid_amount: 'Pagado', gross_commission: 'Comisiones',
    bonuses: 'Bonos', wages: 'Sueldos', advances: 'Adelantos', loan_payments: 'Abonos a préstamos', deductions: 'Ajustes', staff_deductions: 'Descuentos',
    carryover_in: 'Arrastre que entró', carryover_out: 'Arrastre que quedó', weekly_amount: 'Abono semanal', daily_amount: 'Sueldo por día',
    // Reportes
    audience: 'Para quién', period_from: 'Periodo desde', period_to: 'Periodo hasta',
    // Gastos
    category: 'Categoría', vendor: 'Proveedor', incurred_on: 'Fecha del gasto', suggested_amount: 'Monto sugerido', is_estimate: 'Es un estimado',
    // Negocio
    address: 'Dirección', service_commission_pct: 'Comisión de servicios (%)', product_commission_pct: 'Comisión de productos (%)',
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
    method: { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', mixed: 'Mixto' },
    type: { deposit: 'Entrada', expense: 'Gasto', withdrawal: 'Retiro' },
    status: { paid: 'Pagada', refunded: 'Anulada', scheduled: 'Agendada', confirmed: 'Confirmada', checked_in: 'Llegó', completed: 'Atendida', cancelled: 'Cancelada', no_show: 'No llegó', open: 'Abierta', closed: 'Cerrada' },
    source: { appointment: 'Con cita', walk_in: 'Sin cita', online: 'Reserva en línea', sql: 'Cambio hecho por SQL' },
    paid_from: { cash_drawer: 'Caja del día', envelope: 'Sobre', bank: 'Banco' },
    kind: { confirmation: 'Confirmación', reminder: 'Recordatorio', absent: 'Falta', extra: 'Día extra' },
    channel: { whatsapp: 'WhatsApp' },
    by: { self: 'El cliente, desde su enlace', staff: 'El equipo' },
    audience: { interno: 'Interno', externo: 'Contador / externo' },
    role: { owner: 'Gerente (cuenta principal)', admin: 'Gerente', viewer: 'Consulta', receptionist: 'Recepción', cashier: 'Caja', barber: 'Barbero' },
    requested_via: { en_persona: 'En persona', whatsapp: 'WhatsApp', llamada: 'Llamada', mensaje: 'Mensaje', otro: 'Otro' },
};

/** Identificadores internos, huellas y marcas técnicas: no le dicen nada a quien lee la bitácora. */
const HIDDEN = new Set([
    'idempotency_key', 'sha256_prefix', 'breakdown', 'variable_prices', 'appointment_link', 'created_at', 'updated_at', 'created_by', 'updated_by',
    'opened_by', 'closed_by', 'cancelled_by', 'changed_columns', 'settings', 'slug', 'timezone', 'currency', 'position', 'sort_order',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ROW_CHANGE = /\.(insert|update|delete)$/;
const isIdKey = (key: string) => key === 'id' || key.endsWith('_id') || key.endsWith('_ids');
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const readable = (key: string) => { const t = key.replace(/[_.]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function formatValue(key: string, value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (typeof value === 'number') return MONEY_KEYS.has(key) ? formatMoney(value, { cents: true }) : String(value);
    if (typeof value === 'string') {
        if (UUID.test(value)) return null;
        if (key === 'action') return ACTION_LABELS[value] ?? readable(value);
        if (ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))) return formatDateTime(value, BUSINESS_TIME_ZONE);
        if (ISO_DAY.test(value)) return formatDate(`${value}T12:00:00Z`, BUSINESS_TIME_ZONE);
        if (MONEY_KEYS.has(key) && value.trim() !== '' && Number.isFinite(Number(value))) return formatMoney(Number(value), { cents: true });
        return VALUE_LABELS[key]?.[value] ?? value;
    }
    if (Array.isArray(value)) {
        const items = value.filter((v) => typeof v === 'string' || typeof v === 'number').filter((v) => !(typeof v === 'string' && UUID.test(v)));
        return items.length > 0 && items.length === value.length ? items.join(', ') : null;
    }
    return null;
}

const shown = (key: string, onlyLabelled: boolean) => !HIDDEN.has(key) && !isIdKey(key) && (!onlyLabelled || key in KEY_LABELS);
const labelOf = (key: string) => KEY_LABELS[key] ?? readable(key);

function flatRows(data: Json, onlyLabelled: boolean): DetailRow[] {
    const rows: DetailRow[] = [];
    for (const [key, value] of Object.entries(data)) {
        if (!shown(key, onlyLabelled)) continue;
        const text = formatValue(key, value);
        if (text !== null) rows.push({ key, label: labelOf(key), value: text });
    }
    return rows;
}

/**
 * Renglones legibles del detalle de un registro. `action` es la acción del registro (para saber si es una fila
 * completa de una tabla). Devuelve [] si no queda nada que mostrar.
 */
export function detailRows(details: Json | null | undefined, action?: string): DetailRow[] {
    if (!details) return [];
    const nested = Object.keys(details).length > 0 && Object.keys(details).every((k) => k === 'before' || k === 'after' || k === 'reason');
    if (!nested) return flatRows(details, false);

    const before = isObject(details.before) ? details.before : null;
    const after = isObject(details.after) ? details.after : null;
    const rowChange = ROW_CHANGE.test(action ?? '');
    const rows: DetailRow[] = [];
    if (typeof details.reason === 'string' && details.reason.trim()) rows.push({ key: 'reason', label: 'Motivo', value: details.reason.trim() });

    if (before && after) {
        for (const [key, value] of Object.entries(after)) {
            if (!shown(key, rowChange)) continue;
            const now = formatValue(key, value);
            if (key in before && !same(before[key], value)) {
                const was = formatValue(key, before[key]);
                if (was !== null || now !== null) rows.push({ key, label: labelOf(key), value: `${was ?? '—'} → ${now ?? '—'}` });
            } else if (!rowChange && now !== null) {
                // En un cambio de fila, lo que no cambió no se repite; en lo demás, sí se muestra.
                rows.push({ key, label: labelOf(key), value: now });
            }
        }
        return rows;
    }
    const data = after ?? before;
    return data ? [...rows, ...flatRows(data, rowChange)] : rows;
}

/** Folio o recibo del registro, si lo tiene: la única referencia que alguien puede reconocer a simple vista. */
export function detailReference(details: Json | null | undefined): string {
    const data = details && isObject(details.after) ? details.after : details;
    if (!data) return '';
    return typeof data.folio === 'string' ? data.folio : typeof data.receipt_number === 'string' ? data.receipt_number : '';
}
