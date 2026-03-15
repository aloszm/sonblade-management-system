import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { CreateSaleSchema } from '@/lib/validations';
import { notifyLoyaltyPoints } from '@/lib/services/notifications';

export const dynamic = 'force-dynamic';

// GET /api/sales — Sales with optional filters
export async function GET(request: NextRequest) {
    try {
        const params = request.nextUrl.searchParams;
        const from = params.get('from');
        const to = params.get('to');
        const barberId = params.get('barber_id');
        const paymentMethod = params.get('payment_method');

        let query = supabase
            .from('sales')
            .select(`
                *,
                barber:barbers(*),
                items:sale_items(*)
            `)
            .order('created_at', { ascending: false });

        if (from) {
            query = query.gte('created_at', `${from}T00:00:00.000Z`);
        } else {
            // Default: today only
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query = query.gte('created_at', today.toISOString());
        }
        if (to) {
            query = query.lte('created_at', `${to}T23:59:59.999Z`);
        }
        if (barberId) {
            query = query.eq('barber_id', barberId);
        }
        if (paymentMethod) {
            query = query.eq('payment_method', paymentMethod);
        }

        const { data, error } = await query;

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
        const body = await request.json();
        const sale = CreateSaleSchema.parse(body);

        // 0. Fetch barber's current commission type
        const { data: barberRaw } = sale.barber_id ? await supabase.from('barbers').select('commission_type').eq('id', sale.barber_id).single() : { data: null };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const barberData = barberRaw as any;
        const commissionType = barberData?.commission_type || 'tiered';

        // 1. Create the sale record
        const { data: saleDataRaw, error: saleError } = await supabase
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
                commission_type: commissionType,
            } as never)
            .select()
            .single();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saleData = saleDataRaw as any;

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
            .insert(saleItems as never);

        if (itemsError) throw itemsError;

        // 3. Decrease stock for product items (atomic RPC — no race condition)
        for (const item of sale.items) {
            if (item.item_type === 'product' && item.product_id) {
                // `as never` needed because RPC arg types aren't in the untyped Supabase client schema
                await supabase.rpc('decrement_stock', {
                    p_product_id: item.product_id,
                    p_qty: item.quantity || 1,
                } as never);
            }
        }

        // 4. Update barber's total cuts & commission rate
        // We no longer update total_cuts statically in the barbers table,
        // because we compute it dynamically by week (Sun-Sat) in the barber service tier calculation!

        // 5. Register in active Cash Session (Caja)
        let cash = sale.cash_amount || 0;
        let card = sale.card_amount || 0;
        let transfer = sale.transfer_amount || 0;

        if (sale.payment_method === 'cash' && cash === 0) cash = sale.total;
        if (sale.payment_method === 'card' && card === 0) card = sale.total;
        if (sale.payment_method === 'transfer' && transfer === 0) transfer = sale.total;

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
                await supabase.from('cash_movements').insert(movements as never);
            }

            // Accumulate totals
            await supabase
                .from('cash_sessions')
                .update({
                    total_sales: Number(session.total_sales || 0) + Number(sale.total),
                    total_cash: Number(session.total_cash || 0) + Number(cash),
                    total_card: Number(session.total_card || 0) + Number(card),
                    total_transfer: Number(session.total_transfer || 0) + Number(transfer)
                } as never)
                .eq('id', session.id);
        }

        // 6. Award loyalty points if a client is associated (1 point per $10 of services, min 1)
        if (sale.client_id) {
            const serviceSubtotal = sale.items
                .filter(i => i.item_type === 'service')
                .reduce((sum, i) => sum + (i.item_price * (i.quantity || 1)), 0);
            const points = Math.max(1, Math.floor(serviceSubtotal / 10));
            await supabase.rpc('add_client_visit', {
                p_client_id: sale.client_id,
                p_points: points,
            } as never);

            // 7. Notify client via WhatsApp (no-op if not configured)
            const { data: clientRaw } = await supabase
                .from('clients').select('name, phone, loyalty_points').eq('id', sale.client_id).single();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const client = clientRaw as any;
            if (client) {
                notifyLoyaltyPoints({
                    clientName: client.name,
                    phone: client.phone,
                    points,
                    totalPoints: (client.loyalty_points ?? 0) + points,
                }).catch(() => {}); // fire & forget, no bloquea la respuesta
            }
        }

        return NextResponse.json(saleData, { status: 201 });
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'ZodError') {
            const zodErr = err as unknown as { errors: { message: string }[] };
            return NextResponse.json({ error: zodErr.errors[0].message }, { status: 400 });
        }
        const message = err instanceof Error ? err.message : 'Error al crear venta';
        console.error('POST /api/sales error:', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
