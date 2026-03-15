'use server';

import { supabaseAdmin as supabase } from '@/lib/supabase';
import type { CashSession, CashMovement, CloseCashSession, CashSessionArchive, DeletedRecord } from '@/types';
import { logAuditAction, logDeletedRecord } from './audit';

// ==============================================
// CASH DRAWER service
// ==============================================

export async function getActiveSession(): Promise<CashSession | null> {
    const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as any;
}

export async function openCashSession(initialAmount: number, openedBy: string = 'Admin'): Promise<CashSession> {
    const existing = await getActiveSession();
    if (existing) throw new Error('Ya hay una caja abierta. Ciérrala antes de abrir otra.');

    const { data, error } = await supabase
        .from('cash_sessions')
        .insert({
            opened_by: openedBy,
            initial_amount: initialAmount,
            status: 'open',
        } as never)
        .select()
        .single();

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = data as any;

    await logAuditAction(openedBy, 'admin', 'open_cash', 'cash_sessions', session.id, { initial_amount: initialAmount });

    return session;
}

export async function closeCashSession(sessionId: string, closeData: CloseCashSession): Promise<CashSession> {
    const session = await getActiveSession();
    if (!session) throw new Error('No hay una caja abierta.');

    const expectedCash = session.initial_amount + session.total_cash - session.total_expenses;
    const difference = closeData.physical_count - expectedCash;

    const { data, error } = await supabase
        .from('cash_sessions')
        .update({
            physical_count: closeData.physical_count,
            difference,
            status: 'closed',
            closed_at: new Date().toISOString(),
        } as never)
        .eq('id', sessionId)
        .select()
        .single();

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const closed = data as any;

    await logAuditAction('Admin', 'admin', 'close_cash', 'cash_sessions', sessionId, {
        physical_count: closeData.physical_count,
        expected: expectedCash,
        difference,
    });

    return closed;
}

export async function getSessionMovements(sessionId: string): Promise<CashMovement[]> {
    const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []) as any[];
}

export async function addCashMovement(
    sessionId: string,
    type: CashMovement['type'],
    description: string,
    amount: number,
    paymentMethod: string = 'cash',
    status: 'confirmed' | 'pending' = 'confirmed'
): Promise<CashMovement> {
    const { data, error } = await supabase
        .from('cash_movements')
        .insert({
            session_id: sessionId,
            type,
            description,
            amount,
            payment_method: paymentMethod,
            status,
        } as never)
        .select()
        .single();

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movement = data as any;

    // Only update session totals if confirmed
    if (status === 'confirmed') {
        await updateSessionTotals(sessionId, type, amount, paymentMethod);
    }

    await logAuditAction('Admin', 'admin', 'create_movement', 'cash_movements', movement.id, {
        type, description, amount, status,
    });

    return movement;
}

export async function confirmMovement(movementId: string): Promise<CashMovement> {
    const { data: movementRaw, error: fetchError } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('id', movementId)
        .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movement = movementRaw as any;
    if (fetchError || !movement) throw new Error('Movimiento no encontrado');
    if (movement.status === 'confirmed') throw new Error('El movimiento ya está confirmado');

    const { data, error } = await supabase
        .from('cash_movements')
        .update({ status: 'confirmed' } as never)
        .eq('id', movementId)
        .select()
        .single();

    if (error) throw error;

    // Update session totals now
    await updateSessionTotals(movement.session_id, movement.type, movement.amount, movement.payment_method);

    await logAuditAction('Admin', 'admin', 'confirm_movement', 'cash_movements', movementId, {
        type: movement.type, amount: movement.amount,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data as any;
}

export async function deleteMovement(movementId: string, deletedBy: string = 'Admin', reason: string = ''): Promise<void> {
    const { data: movementRaw, error: fetchError } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('id', movementId)
        .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movement = movementRaw as any;
    if (fetchError || !movement) throw new Error('Movimiento no encontrado');

    // Log to deleted records
    await logDeletedRecord('cash_movements', movementId, movement, deletedBy, reason);

    // If it was confirmed, reverse the session totals
    if (movement.status === 'confirmed') {
        await reverseSessionTotals(movement.session_id, movement.type, movement.amount, movement.payment_method);
    }

    // Delete the movement
    const { error } = await supabase
        .from('cash_movements')
        .delete()
        .eq('id', movementId);

    if (error) throw error;

    await logAuditAction(deletedBy, 'admin', 'delete_movement', 'cash_movements', movementId, {
        type: movement.type, amount: movement.amount, reason,
    });
}

async function updateSessionTotals(sessionId: string, type: string, amount: number, paymentMethod: string) {
    await supabase.rpc('update_session_totals', {
        p_session_id: sessionId,
        p_type: type,
        p_amount: amount,
        p_method: paymentMethod,
        p_reverse: false,
    } as never);
}

async function reverseSessionTotals(sessionId: string, type: string, amount: number, paymentMethod: string) {
    await supabase.rpc('update_session_totals', {
        p_session_id: sessionId,
        p_type: type,
        p_amount: amount,
        p_method: paymentMethod,
        p_reverse: true,
    } as never);
}

export async function getCashSessionHistory(): Promise<CashSession[]> {
    const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .order('opened_at', { ascending: false })
        .limit(30);

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []) as any[];
}

// =================== Task 5: Cash Reset ===================

export async function resetCashSession(archivedBy: string = 'Admin'): Promise<void> {
    const session = await getActiveSession();
    if (!session) throw new Error('No hay una caja abierta para reiniciar.');

    // Get movements for the archive
    const movements = await getSessionMovements(session.id);

    // Archive the session
    const { error: archiveError } = await supabase
        .from('cash_session_archives')
        .insert({
            original_session_id: session.id,
            opened_by: session.opened_by,
            initial_amount: session.initial_amount,
            total_sales: session.total_sales,
            total_expenses: session.total_expenses,
            total_cash: session.total_cash,
            total_card: session.total_card,
            total_transfer: session.total_transfer,
            physical_count: session.physical_count,
            difference: session.difference,
            movements: JSON.parse(JSON.stringify(movements)),
            opened_at: session.opened_at,
            closed_at: session.closed_at || new Date().toISOString(),
            archived_by: archivedBy,
        } as never);

    if (archiveError) throw archiveError;

    // Close & mark the session
    await supabase
        .from('cash_sessions')
        .update({
            status: 'closed',
            closed_at: new Date().toISOString(),
        } as never)
        .eq('id', session.id);

    await logAuditAction(archivedBy, 'admin', 'reset_cash', 'cash_sessions', session.id, {
        total_sales: session.total_sales,
        total_expenses: session.total_expenses,
        movements_count: movements.length,
    });
}

export async function getArchivedSessions(): Promise<CashSessionArchive[]> {
    const { data, error } = await supabase
        .from('cash_session_archives')
        .select('*')
        .order('archived_at', { ascending: false })
        .limit(50);

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []) as any[];
}

export async function getDeletedMovements(): Promise<DeletedRecord[]> {
    const { data, error } = await supabase
        .from('deleted_records_log')
        .select('*')
        .eq('table_name', 'cash_movements')
        .order('deleted_at', { ascending: false })
        .limit(50);

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []) as any[];
}
