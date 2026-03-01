import { supabaseAdmin as supabase } from '@/lib/supabase';
import type { Sale, CreateSale, Barber, Service } from '@/types';

// ==============================================
// SALES / POS service
// ==============================================


export async function getServices(): Promise<Service[]> {
    const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('name');

    if (error) throw error;
    return data || [];
}

export async function createSale(sale: CreateSale): Promise<Sale> {
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

    // 4. Update barber's total cuts
    if (sale.barber_id) {
        const serviceItems = sale.items.filter(i => i.item_type === 'service');
        if (serviceItems.length > 0) {
            const { data: barber } = await supabase
                .from('barbers')
                .select('total_cuts')
                .eq('id', sale.barber_id)
                .single();

            if (barber) {
                await supabase
                    .from('barbers')
                    .update({ total_cuts: barber.total_cuts + serviceItems.length })
                    .eq('id', sale.barber_id);
            }
        }
    }

    return saleData;
}

export async function getTodaySales(): Promise<Sale[]> {
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
    return data || [];
}

export async function getTodaySalesTotal(): Promise<number> {
    const sales = await getTodaySales();
    return sales.reduce((sum, sale) => sum + Number(sale.total), 0);
}
