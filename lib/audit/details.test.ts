import { describe, expect, it } from 'vitest';
import { detailRows } from './details';

// «Ver detalle» de la Bitácora: antes era el JSON crudo de la base (llaves en inglés, ids y montos sin formato).
describe('detalle legible de la bitácora', () => {
    const byLabel = (details: Record<string, unknown>) => Object.fromEntries(detailRows(details).map((r) => [r.label, r.value]));

    it('cierre de caja: nombres en español, montos en pesos y sin identificadores', () => {
        const rows = byLabel({
            expected_cash: 955, counted_cash: 925, difference: -30, difference_reason: 'Di cambio de más a un cliente',
            float_left: 500, float_target: 500, short_float_reason: null, reserve_amount: 425, reserve_label: 'Renta y gastos',
            withdrawn_amount: 0, withdrawal_delivered_to: null, withdrawal_recipient_user_id: null,
            envelope_id: '687a8809-1b1c-4c55-9a0e-2f3b1c0d9e77', breakdown: { 500: 1, 200: 2, 5: 5 },
        });
        expect(rows).toEqual({
            'Efectivo que debía haber': '$955.00', 'Efectivo contado': '$925.00', Diferencia: '-$30.00',
            'Motivo de la diferencia': 'Di cambio de más a un cliente', 'Fondo que se dejó': '$500.00', 'Fondo recomendado': '$500.00',
            'Apartado al sobre': '$425.00', Sobre: 'Renta y gastos', Retiro: '$0.00',
        });
    });

    it('confirmación con PIN: sí/no, el comentario y qué se confirmó en español', () => {
        const rows = byLabel({ action: 'expense_recorded', comment: 'Recibo de luz de noviembre', confirmed_with_pin: true, amount: 350, paid_from: 'envelope' });
        expect(rows).toEqual({ 'Qué se confirmó': 'Gasto registrado', Comentario: 'Recibo de luz de noviembre', 'Confirmado con PIN': 'Sí', Monto: '$350.00', 'Pagado desde': 'Sobre' });
    });

    it('traduce formas de pago, tipos y estados; los identificadores (uuid, *_id) se omiten', () => {
        const rows = detailRows({
            type: 'withdrawal', method: 'cash', status: 'refunded', source: 'walk_in',
            employee_id: 'a1b4c2d3-0000-4000-8000-000000000001', service_ids: ['a1b4c2d3-0000-4000-8000-000000000002'],
            created_by: 'a1b4c2d3-0000-4000-8000-000000000003', idempotency_key: 'sim-2646-d0-v003', quantity_delta: 6, quantity_after: 59,
        });
        expect(rows.map((r) => `${r.label}: ${r.value}`)).toEqual([
            'Tipo de movimiento: Retiro', 'Forma de pago: Efectivo', 'Estado: Anulada', 'Origen: Sin cita',
            'Cambio de existencias: 6', 'Existencias que quedaron: 59',
        ]);
    });

    it('una llave desconocida no se esconde: se muestra legible, sin guiones bajos', () => {
        expect(detailRows({ something_new: 'valor', other_flag: false })).toEqual([
            { key: 'something_new', label: 'Something new', value: 'valor' },
            { key: 'other_flag', label: 'Other flag', value: 'No' },
        ]);
    });

    it('sin nada que mostrar devuelve vacío (la pantalla pone «—» en vez de un detalle hueco)', () => {
        expect(detailRows(null)).toEqual([]);
        expect(detailRows({})).toEqual([]);
        expect(detailRows({ appointment_id: null, tips: [], notes: '' })).toEqual([]);
    });
});
