import { supabase } from '@/lib/supabase';
import type { CashSession, CashMovement, CloseCashSession } from '@/types';

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
    return data;
}

export async function openCashSession(initialAmount: number, openedBy: string = 'Admin'): Promise<CashSession> {
    // Check if there's already an open session
    const existing = await getActiveSession();
    if (existing) throw new Error('Ya hay una caja abierta. Ciérrala antes de abrir otra.');

    const { data, error } = await supabase
        .from('cash_sessions')
        .insert({
            opened_by: openedBy,
            initial_amount: initialAmount,
            status: 'open',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
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
        })
        .eq('id', sessionId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getSessionMovements(sessionId: string): Promise<CashMovement[]> {
    const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function addCashMovement(
    sessionId: string,
    type: CashMovement['type'],
    description: string,
    amount: number,
    paymentMethod: string = 'cash'
): Promise<CashMovement> {
    const { data, error } = await supabase
        .from('cash_movements')
        .insert({
            session_id: sessionId,
            type,
            description,
            amount,
            payment_method: paymentMethod,
        })
        .select()
        .single();

    if (error) throw error;

    // Update session totals
    const session = await getActiveSession();
    if (session) {
        const updates: Partial<CashSession> = {};
        if (type === 'sale') {
            updates.total_sales = session.total_sales + amount;
            if (paymentMethod === 'cash') updates.total_cash = session.total_cash + amount;
            if (paymentMethod === 'card') updates.total_card = session.total_card + amount;
            if (paymentMethod === 'transfer') updates.total_transfer = session.total_transfer + amount;
        } else if (type === 'expense') {
            updates.total_expenses = session.total_expenses + amount;
        }

        await supabase
            .from('cash_sessions')
            .update(updates)
            .eq('id', sessionId);
    }

    return data;
}

export async function getCashSessionHistory(): Promise<CashSession[]> {
    const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .order('opened_at', { ascending: false })
        .limit(30);

    if (error) throw error;
    return data || [];
}
