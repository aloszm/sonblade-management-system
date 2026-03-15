import { supabaseAdmin as supabase } from '@/lib/supabase';
import type { AuditLog } from '@/types';

// ==============================================
// AUDIT LOG service
// ==============================================

export async function logAuditAction(
    userId: string,
    role: AuditLog['role'],
    action: string,
    entity: string,
    entityId: string | null,
    details: Record<string, unknown> = {}
): Promise<void> {
    try {
        await supabase
            .from('audit_log')
            .insert({
                user_id: userId,
                role,
                action,
                entity,
                entity_id: entityId,
                details,
            } as never);
    } catch (err) {
        console.error('Audit log error:', err);
        // Don't throw — audit failures shouldn't break operations
    }
}

export async function getAuditLogs(filters?: {
    role?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
}): Promise<AuditLog[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 100);

    if (filters?.role) query = query.eq('role', filters.role);
    if (filters?.action) query = query.eq('action', filters.action);
    if (filters?.from) query = query.gte('created_at', filters.from);
    if (filters?.to) query = query.lte('created_at', filters.to);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as AuditLog[];
}

export async function logDeletedRecord(
    tableName: string,
    recordId: string,
    recordData: Record<string, unknown>,
    deletedBy: string,
    reason: string = ''
): Promise<void> {
    try {
        await supabase
            .from('deleted_records_log')
            .insert({
                table_name: tableName,
                record_id: recordId,
                record_data: recordData,
                deleted_by: deletedBy,
                reason,
            } as never);
    } catch (err) {
        console.error('Deleted record log error:', err);
    }
}
