import { describe, expect, it } from 'vitest';
import { ACTION_LABELS, actionLabel, entityLabel } from './labels';

describe('actionLabel', () => {
    it('traduce las acciones técnicas que aparecían en inglés', () => {
        expect(actionLabel('pin_reset_emergency')).toBe('PIN restablecido por emergencia');
        expect(actionLabel('account.migrated_to_pin')).toBe('Cuenta migrada a usuario y PIN');
        expect(actionLabel('employee_weekly_schedule.insert')).toBe('Alta de un horario semanal');
        expect(actionLabel('appointments.update')).toBe('Cambio en una cita');
        expect(actionLabel('public_booking.created')).toBe('Reserva en línea creada');
    });
    it('da un respaldo legible a lo desconocido, sin guiones bajos ni puntos', () => {
        expect(actionLabel('something_new_happened')).toBe('Something new happened');
        expect(actionLabel('gadgets.insert')).toBe('Alta de gadgets');
        expect(actionLabel('')).toBe('Acción registrada');
    });
    it('ninguna frase contiene guiones bajos', () => {
        for (const text of Object.values(ACTION_LABELS)) expect(text).not.toMatch(/[_]/);
    });
});

describe('entityLabel', () => {
    it('traduce y tolera desconocidos y vacíos', () => {
        expect(entityLabel('cash_session')).toBe('Caja');
        expect(entityLabel('weird_thing')).toBe('Weird thing');
        expect(entityLabel(null)).toBe('');
    });
});

// Auditoría del 21 nov 2026: la Bitácora mostraba en inglés todo lo que no tenía frase («Envelope reserve in»,
// «Recurring expense created», «Appointment notification opened»…) y decía «Alta de el acceso a una sucursal».
describe('Bitácora sin textos en inglés', () => {
    // Todas las acciones que escriben las funciones de la base (migraciones hasta 20261121120000) y las que
    // viajan dentro de una confirmación con PIN.
    const DB_ACTIONS = [
        'account.activated', 'account.created', 'account.deactivated', 'account.pin_changed', 'account.pin_reset',
        'appointment_notification_opened', 'appointment_product_added', 'appointment_product_quantity_changed', 'appointment_product_removed',
        'appointment_product_seller_changed', 'appointment_rescheduled', 'appointment_saved', 'bonus_goal_created', 'bonus_goal_updated',
        'booking_enabled', 'booking_settings_changed', 'business_profile_updated', 'cash_closed', 'cash_movement_recorded', 'cash_opened',
        'cash_settings_changed', 'cash_withdrawal_recipient_changed', 'commission_adjustment_approved', 'commission_adjustment_rejected',
        'commission_defaults_changed', 'commission_settlement_paid', 'discount_approval_used', 'discount_approved', 'envelope_adjusted',
        'envelope_bank_deposit', 'envelope_reserve_in', 'expense_cancelled', 'expense_category_created', 'expense_category_updated',
        'expense_receipt_attached', 'expense_recorded', 'employee_ledger_advance', 'employee_ledger_cancelled', 'employee_ledger_deduction',
        'employee_ledger_loan', 'employee_ledger_loan_payment', 'employee_wage_set', 'attendance_absent', 'attendance_extra',
        'attendance_exception_voided', 'initial_haircut_commission_configured', 'initial_owner_bootstrap', 'inventory_adjusted',
        'inventory_minimum_changed', 'inventory_received', 'pin_confirmed_action', 'pin_reset_emergency', 'product_created',
        'public_booking.cancelled', 'public_booking.created', 'reconciliation_issue_accepted', 'reconciliation_issue_reopened',
        'reconciliation_pre_agenda_accepted', 'recurring_expense_created', 'recurring_expense_reordered', 'recurring_expense_updated',
        'report_exported', 'sale_confirmed', 'sale_item_without_cost', 'sale_payment_recorded', 'sale_reversed',
    ];
    const AUDITED_TABLES = ['appointment_items', 'appointments', 'branches', 'business_memberships', 'businesses', 'clients', 'commission_rules',
        'employee_time_off', 'employee_weekly_schedule', 'employees', 'products', 'services', 'user_branch_access'];
    const DB_ENTITIES = ['account', 'appointment', 'appointment_product', 'appointments', 'bonus_goal', 'branch', 'business', 'cash_movement',
        'cash_session', 'commission_adjustment', 'commission_settlement', 'discount_approval', 'employee_attendance_exceptions', 'employee_ledger',
        'employee_wage_rates', 'envelope_movement', 'expense', 'expense_category', 'inventory', 'inventory_threshold', 'product',
        'reconciliation_batch', 'reconciliation_issue', 'recurring_expense', 'report_export', 'sale', 'service', ...AUDITED_TABLES];

    it('cada acción de la base tiene su frase propia en español', () => {
        for (const action of DB_ACTIONS) expect(ACTION_LABELS[action], action).toBeTruthy();
    });

    it('las que salían en inglés ahora dicen', () => {
        expect(actionLabel('envelope_reserve_in')).toBe('Apartado del cierre de caja al sobre');
        expect(actionLabel('recurring_expense_created')).toBe('Gasto fijo creado');
        expect(actionLabel('appointment_notification_opened')).toBe('Se abrió WhatsApp para avisar a un cliente');
        expect(actionLabel('appointment_product_added')).toBe('Producto agregado a una cita');
    });

    it('altas, cambios y bajas de cada tabla auditada: en español y sin «de el»', () => {
        for (const table of AUDITED_TABLES) {
            for (const verb of ['insert', 'update', 'delete']) {
                const text = actionLabel(`${table}.${verb}`);
                expect(text, `${table}.${verb}`).not.toMatch(/ de el /);
                expect(text, `${table}.${verb}`).not.toContain(table);
            }
        }
        expect(actionLabel('user_branch_access.insert')).toBe('Alta del acceso a una sucursal');
        expect(actionLabel('business_memberships.insert')).toBe('Alta del puesto de una cuenta');
        expect(actionLabel('business_memberships.update')).toBe('Cambio en el puesto de una cuenta');
        expect(actionLabel('business_hours.delete')).toBe('Baja del horario del negocio');
        expect(actionLabel('businesses.update')).toBe('Cambio en los datos del negocio');
    });

    it('una confirmación con PIN dice QUÉ se confirmó, no un genérico igual para todas', () => {
        // Así lo entrega list_audit_log: { before, after, reason }.
        expect(actionLabel('pin_confirmed_action', { after: { action: 'expense_recorded', comment: 'Recibo de luz' } })).toBe('Gasto registrado · confirmado con PIN');
        expect(actionLabel('pin_confirmed_action', { after: { action: 'envelope_adjusted' } })).toBe('Ajuste del sobre por conteo · confirmado con PIN');
        expect(actionLabel('pin_confirmed_action', { after: { action: 'employee_ledger_advance' } })).toBe('Adelanto a una persona del equipo · confirmado con PIN');
        expect(actionLabel('pin_confirmed_action', { action: 'expense_recorded' })).toBe('Gasto registrado · confirmado con PIN');
        expect(actionLabel('pin_confirmed_action', { after: {} })).toBe('Acción confirmada con PIN');
        expect(actionLabel('pin_confirmed_action')).toBe('Acción confirmada con PIN');
        expect(actionLabel('pin_confirmed_action', {})).toBe('Acción confirmada con PIN');
    });

    it('cada entidad de la base tiene nombre en español', () => {
        const english = /^(Envelope|Recurring|Employee|Expense|Appointment|Discount|User|Bonus|Inventory|Commission|Cash|Report|Sale|Service|Product|Branch|Business|Client|Account)\b/;
        for (const entity of DB_ENTITIES) expect(entityLabel(entity), entity).not.toMatch(english);
        expect(entityLabel('envelope_movement')).toBe('Movimiento del sobre');
        expect(entityLabel('recurring_expense')).toBe('Gasto fijo');
        expect(entityLabel('employee_ledger')).toBe('Movimiento del equipo');
        expect(entityLabel('expense')).toBe('Gasto');
        expect(entityLabel('appointment_product')).toBe('Producto de una cita');
        expect(entityLabel('discount_approval')).toBe('Autorización de descuento');
        expect(entityLabel('user_branch_access')).toBe('Acceso a una sucursal');
    });
});
