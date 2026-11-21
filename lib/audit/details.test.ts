import { describe, expect, it } from 'vitest';
import { detailReference, detailRows } from './details';

// «Ver detalle» de la Bitácora: antes era el JSON crudo de la base (llaves en inglés, ids y montos sin formato).
// La API (list_audit_log) entrega el detalle como { before, after, reason }.
describe('detalle legible de la bitácora', () => {
    const byLabel = (details: Record<string, unknown>, action?: string) => Object.fromEntries(detailRows(details, action).map((r) => [r.label, r.value]));

    it('cierre de caja: nombres en español, montos en pesos y sin identificadores', () => {
        const rows = byLabel({ after: {
            expected_cash: 955, counted_cash: 925, difference: -30, difference_reason: 'Di cambio de más a un cliente',
            float_left: 500, float_target: 500, short_float_reason: null, reserve_amount: 425, reserve_label: 'Renta y gastos',
            withdrawn_amount: 0, withdrawal_delivered_to: null, withdrawal_recipient_user_id: null,
            envelope_id: '687a8809-1b1c-4c55-9a0e-2f3b1c0d9e77', breakdown: { 500: 1, 200: 2, 5: 5 },
        } }, 'cash_closed');
        expect(rows).toEqual({
            'Efectivo que debía haber': '$955.00', 'Efectivo contado': '$925.00', Diferencia: '-$30.00',
            'Motivo de la diferencia': 'Di cambio de más a un cliente', 'Fondo que se dejó': '$500.00', 'Fondo recomendado': '$500.00',
            'Apartado al sobre': '$425.00', Sobre: 'Renta y gastos', Retiro: '$0.00',
        });
    });

    it('confirmación con PIN: sí/no, el comentario y qué se confirmó en español', () => {
        const rows = byLabel({ after: { action: 'expense_recorded', comment: 'Recibo de luz de noviembre', confirmed_with_pin: true, amount: 350, paid_from: 'envelope' } }, 'pin_confirmed_action');
        expect(rows).toEqual({ 'Qué se confirmó': 'Gasto registrado', Comentario: 'Recibo de luz de noviembre', 'Confirmado con PIN': 'Sí', Monto: '$350.00', 'Pagado desde': 'Sobre' });
    });

    it('traduce formas de pago, tipos y estados; los identificadores (uuid, *_id) se omiten', () => {
        const rows = detailRows({ after: {
            type: 'withdrawal', method: 'cash', status: 'refunded', source: 'walk_in',
            employee_id: 'a1b4c2d3-0000-4000-8000-000000000001', service_ids: ['a1b4c2d3-0000-4000-8000-000000000002'],
            created_by: 'a1b4c2d3-0000-4000-8000-000000000003', idempotency_key: 'sim-2646-d0-v003', quantity_delta: 6, quantity_after: 59,
        } }, 'cash_movement_recorded');
        expect(rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
            'Tipo de movimiento: Retiro', 'Forma de pago: Efectivo', 'Estado: Anulada', 'Origen: Sin cita',
            'Cambio de existencias: 6', 'Existencias que quedaron: 59',
        ]);
    });

    it('el motivo del registro va primero', () => {
        const rows = detailRows({ reason: ' Se cobró propina en efectivo y fue con tarjeta ', after: { refunded_amount: 20 } }, 'sale_reversed');
        expect(rows).toEqual([
            { key: 'reason', label: 'Motivo', value: 'Se cobró propina en efectivo y fue con tarjeta' },
            { key: 'refunded_amount', label: 'Devuelto', value: '$20.00' },
        ]);
    });

    it('cambio en una fila (tabla.update): solo lo que cambió, como «antes → después», sin columnas técnicas', () => {
        const before = { id: 'a1b4c2d3-0000-4000-8000-000000000001', business_id: 'a1b4c2d3-0000-4000-8000-000000000009', display_name: 'Deya', is_active: true, is_barber: true, phone: null, display_title: null, updated_at: '2026-11-21T09:00:00Z' };
        const rows = detailRows({ before, after: { ...before, is_active: false, updated_at: '2026-11-21T09:11:57Z' } }, 'employees.update');
        expect(rows).toEqual([{ key: 'is_active', label: 'Activo', value: 'Sí → No' }]);
    });

    it('precio de un producto: antes → después, en pesos (aunque la base lo mande como texto)', () => {
        const rows = detailRows({ before: { name: 'Peine de textura', sale_price: '80.00', cost_price: '27.00' }, after: { name: 'Peine de textura', sale_price: '85.00', cost_price: '27.00' } }, 'products.update');
        expect(rows).toEqual([{ key: 'sale_price', label: 'Precio de venta', value: '$80.00 → $85.00' }]);
    });

    it('alta de una fila (tabla.insert): solo los datos con nombre propio; fechas en la hora de la barbería', () => {
        const rows = byLabel({ after: {
            id: 'a1b4c2d3-0000-4000-8000-000000000001', customer_name: 'Luis Hernández', status: 'scheduled', source: 'appointment',
            scheduled_start_at: '2026-11-21T18:30:00+00:00', scheduled_end_at: '2026-11-21T19:00:00+00:00', customer_phone: '5512345678',
            assigned_employee_id: 'a1b4c2d3-0000-4000-8000-000000000002', created_at: '2026-11-21T08:50:00Z', notes: null,
        } }, 'appointments.insert');
        expect(rows).toEqual({
            Cliente: 'Luis Hernández', Estado: 'Agendada', Origen: 'Con cita',
            'Inicio de la cita': 'sáb 21 nov 2026, 12:30 p. m.', 'Fin de la cita': 'sáb 21 nov 2026, 1:00 p. m.',
        });
    });

    it('cambio de ajustes de caja (acción de función con antes y después): muestra el cambio y el comentario', () => {
        const rows = byLabel({ before: { cash_float_target: 500, daily_reserve_amount: 600 }, after: { cash_float_target: 550, daily_reserve_amount: 600, comment: 'Temporada alta', confirmed_with_pin: true } }, 'cash_settings_changed');
        expect(rows).toEqual({ 'Fondo recomendado': '$500.00 → $550.00', 'Apartado diario': '$600.00', Comentario: 'Temporada alta', 'Confirmado con PIN': 'Sí' });
    });

    it('una llave desconocida de una acción no se esconde: se muestra legible, sin guiones bajos', () => {
        expect(detailRows({ after: { something_new: 'valor', other_flag: false } }, 'algo_nuevo')).toEqual([
            { key: 'something_new', label: 'Something new', value: 'valor' },
            { key: 'other_flag', label: 'Other flag', value: 'No' },
        ]);
    });

    it('sin nada que mostrar devuelve vacío (la pantalla pone «—» en vez de un detalle hueco)', () => {
        expect(detailRows(null)).toEqual([]);
        expect(detailRows({})).toEqual([]);
        expect(detailRows({ after: { appointment_id: null, tips: [], notes: '' } }, 'sale_confirmed')).toEqual([]);
        expect(detailRows({ after: { id: 'a1b4c2d3-0000-4000-8000-000000000001', business_id: 'a1b4c2d3-0000-4000-8000-000000000009' } }, 'user_branch_access.insert')).toEqual([]);
    });

    it('referencia del registro: folio de la venta o recibo del pago, nunca el id interno', () => {
        expect(detailReference({ after: { folio: 'V2611-0220', total: 330 } })).toBe('V2611-0220');
        expect(detailReference({ after: { receipt_number: 'P2647-01' } })).toBe('P2647-01');
        expect(detailReference({ after: { cash_session_id: 'a1b4c2d3-0000-4000-8000-000000000001' } })).toBe('');
        expect(detailReference(null)).toBe('');
    });
});
