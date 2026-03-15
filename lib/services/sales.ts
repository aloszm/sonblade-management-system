import { supabaseAdmin as supabase } from '@/lib/supabase';
import type { Sale } from '@/types';

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
