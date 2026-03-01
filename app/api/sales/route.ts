import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import type { CreateSale } from '@/types';

// GET /api/sales — Today's sales
export async function GET() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
            .from('sales')
            .select(`
                *,
                barber:barbers(*),
                items:sale_items(*)
            `)
            .gte('created_at', today.toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json(data || []);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al obtener ventas';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/sales — Create a new sale
export async function POST(request: NextRequest) {
    try {
        const sale: CreateSale = await request.json();

        // 1. Create the sale record
        const { data: saleData, error: saleError } = await supabase
            .from('sales')
            .insert({
                barber_id: sale.barber_id,
                total: sale.total,
                tip: sale.tip || 0,
                cash_amount: sale.cash_amount || 0,
                card_amount: sale.card_amount || 0,
                transfer_amount: sale.transfer_amount || 0,
                payment_method: sale.payment_method,
                notes: sale.notes || '',
            })
            .select()
            .single();

        if (saleError) throw saleError;

        // 2. Create sale items
        const saleItems = sale.items.map(item => ({
            sale_id: saleData.id,
            item_type: item.item_type,
            item_name: item.item_name,
            item_price: item.item_price,
            quantity: item.quantity || 1,
            product_id: item.product_id || null,
            service_id: item.service_id || null,
        }));

        const { error: itemsError } = await supabase
            .from('sale_items')
            .insert(saleItems);

        if (itemsError) throw itemsError;

        // 3. Decrease stock for product items
        for (const item of sale.items) {
            if (item.item_type === 'product' && item.product_id) {
                const { data: product } = await supabase
                    .from('products')
                    .select('stock')
                    .eq('id', item.product_id)
                    .single();

                if (product) {
                    await supabase
                        .from('products')
                        .update({ stock: Math.max(0, product.stock - (item.quantity || 1)) })
                        .eq('id', item.product_id);
                }
            }
        }

        // 4. Update barber's total cuts & commission rate
        if (sale.barber_id) {
            const serviceItems = sale.items.filter(i => i.item_type === 'service');
            if (serviceItems.length > 0) {
                const { data: barber } = await supabase
                    .from('barbers')
                    .select('total_cuts, commission_rate')
                    .eq('id', sale.barber_id)
                    .single();

                if (barber) {
                    const newTotalCuts = barber.total_cuts + serviceItems.length;

                    // Calculate automatic commission tiers based on cuts
                    let newRate = 30; // base
                    if (newTotalCuts >= 50) newRate = 35;
                    if (newTotalCuts >= 100) newRate = 40;
                    if (newTotalCuts >= 150) newRate = 45;
                    if (newTotalCuts >= 200) newRate = 50;

                    await supabase
                        .from('barbers')
                        .update({
                            total_cuts: newTotalCuts,
                            commission_rate: Math.max(barber.commission_rate, newRate) // Never downgrade automatically, only upgrade
                        })
                        .eq('id', sale.barber_id);
                }
            }
        }

        // 5. Register in active Cash Session (Caja)
        let cash = sale.cash_amount || 0;
        let card = sale.card_amount || 0;
        let transfer = sale.transfer_amount || 0;

        if (sale.payment_method === 'cash' && cash === 0) cash = sale.total;
        if (sale.payment_method === 'card' && card === 0) card = sale.total;
        if (sale.payment_method === 'transfer' && transfer === 0) transfer = sale.total;

        const { data: session } = await supabase
            .from('cash_sessions')
            .select('*')
            .eq('status', 'open')
            .order('opened_at', { ascending: false })
            .limit(1)
            .single();

        if (session) {
            const movements = [];

            // Add movements
            if (cash > 0) {
                movements.push({ session_id: session.id, type: 'sale', description: `Venta (Efectivo)`, amount: cash, payment_method: 'cash' });
            }
            if (card > 0) {
                movements.push({ session_id: session.id, type: 'sale', description: `Venta (Tarjeta)`, amount: card, payment_method: 'card' });
            }
            if (transfer > 0) {
                movements.push({ session_id: session.id, type: 'sale', description: `Venta (Transferencia)`, amount: transfer, payment_method: 'transfer' });
            }
            // Add tip as a movement if it exists
            if (sale.tip && sale.tip > 0) {
                // Determine tip payment method for movement log. For now defaulting to cash as standard logic or mixed logic.
                movements.push({ session_id: session.id, type: 'sale', description: `Propina`, amount: sale.tip, payment_method: 'mixed' });
            }

            if (movements.length > 0) {
                await supabase.from('cash_movements').insert(movements);
            }

            // Accumulate totals
            await supabase
                .from('cash_sessions')
                .update({
                    total_sales: Number(session.total_sales || 0) + Number(sale.total),
                    total_cash: Number(session.total_cash || 0) + Number(cash),
                    total_card: Number(session.total_card || 0) + Number(card),
                    total_transfer: Number(session.total_transfer || 0) + Number(transfer)
                })
                .eq('id', session.id);
        }

        return NextResponse.json(saleData, { status: 201 });
    } catch (err: any) {
        const message = err?.message || 'Error al crear venta';
        console.error('POST /api/sales error:', err);
        return NextResponse.json({ error: message, details: err }, { status: 500 });
    }
}
