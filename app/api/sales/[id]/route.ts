import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // 1. Fetch the sale to get its details, including items and amounts
        const { data: saleRaw, error: fetchError } = await supabase
            .from('sales')
            .select(`
                *,
                items:sale_items(*)
            `)
            .eq('id', id)
            .single();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sale = saleRaw as any;

        if (fetchError || !sale) {
            return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
        }

        // 2. Restore product inventory (atomic RPC — no race condition)
        for (const item of sale.items) {
            if (item.item_type === 'product' && item.product_id) {
                // `as never` needed because RPC arg types aren't in the untyped Supabase client schema
                await supabase.rpc('increment_stock', {
                    p_product_id: item.product_id,
                    p_qty: item.quantity || 1,
                } as never);
            }
        }

        // 3. Register a reversal movement in the currently open Cash Session
        // (This discounts it directly from the cash_session totals)
        const { data: sessionRaw } = await supabase
            .from('cash_sessions')
            .select('*')
            .eq('status', 'open')
            .order('opened_at', { ascending: false })
            .limit(1)
            .single();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = sessionRaw as any;

        if (session) {
            const movements = [];

            if (sale.cash_amount > 0) {
                movements.push({ session_id: session.id, type: 'expense', description: `Reversión Venta Eliminada (Efectivo)`, amount: sale.cash_amount, payment_method: 'cash' });
            }
            if (sale.card_amount > 0) {
                movements.push({ session_id: session.id, type: 'expense', description: `Reversión Venta Eliminada (Tarjeta)`, amount: sale.card_amount, payment_method: 'card' });
            }
            if (sale.transfer_amount > 0) {
                movements.push({ session_id: session.id, type: 'expense', description: `Reversión Venta Eliminada (Transferencia)`, amount: sale.transfer_amount, payment_method: 'transfer' });
            }
            if (sale.tip > 0) {
                movements.push({ session_id: session.id, type: 'expense', description: `Reversión Propina Eliminada`, amount: sale.tip, payment_method: 'mixed' });
            }

            if (movements.length > 0) {
                await supabase.from('cash_movements').insert(movements as never);
            }
        }

        // 4. Delete the sale items first (if no cascade)
        await supabase.from('sale_items').delete().eq('sale_id', id);

        // 5. Delete the sale
        const { error: deleteError } = await supabase.from('sales').delete().eq('id', id);

        if (deleteError) throw deleteError;

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        console.error('DELETE /api/sales/[id] error:', err);
        const message = err instanceof Error ? err.message : 'Error al eliminar venta';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
