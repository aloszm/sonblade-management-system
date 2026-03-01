import { supabaseAdmin as supabase } from '@/lib/supabase';
import type { Barber, Sale } from '@/types';

// ==============================================
// BARBER DASHBOARD & MANAGEMENT service
// ==============================================

export async function getBarbers(): Promise<Barber[]> {
    const { data, error } = await supabase
        .from('barbers')
        .select('*')
        .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
}

export async function createBarber(barberData: Partial<Barber>): Promise<Barber | null> {
    const { data, error } = await supabase
        .from('barbers')
        .insert([barberData])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateBarber(id: string, barberData: Partial<Barber>): Promise<Barber | null> {
    const { data, error } = await supabase
        .from('barbers')
        .update(barberData)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getBarber(barberId: string): Promise<Barber | null> {
    const { data, error } = await supabase
        .from('barbers')
        .select('*')
        .eq('id', barberId)
        .single();

    if (error) throw error;
    return data;
}

export async function getBarberTodaySales(barberId: string): Promise<Sale[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('sales')
        .select(`
      *,
      items:sale_items(*)
    `)
        .eq('barber_id', barberId)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function getBarberStats(barberId: string) {
    const sales = await getBarberTodaySales(barberId);
    const barber = await getBarber(barberId);

    if (!barber) return null;

    const totalGenerated = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalTips = sales.reduce((sum, s) => sum + Number(s.tip || 0), 0);
    const commissionRate = barber.commission_rate / 100;
    const commission = totalGenerated * commissionRate;
    const servicesCount = sales.reduce((sum, s) => {
        const serviceItems = s.items?.filter(i => i.item_type === 'service') || [];
        return sum + serviceItems.length;
    }, 0);

    return {
        barber,
        totalGenerated,
        commission,
        servicesCount,
        totalTips,
        sales,
    };
}

// Commission tiers
export function getCommissionTier(totalCuts: number): { current: number; next: number; cutsForNext: number } {
    const tiers = [
        { minCuts: 0, rate: 30 },
        { minCuts: 50, rate: 35 },
        { minCuts: 100, rate: 40 },
        { minCuts: 150, rate: 45 },
        { minCuts: 200, rate: 50 },
    ];

    let currentTier = tiers[0];
    let nextTier = tiers[1];

    for (let i = 0; i < tiers.length; i++) {
        if (totalCuts >= tiers[i].minCuts) {
            currentTier = tiers[i];
            nextTier = tiers[i + 1] || tiers[i];
        }
    }

    return {
        current: currentTier.rate,
        next: nextTier.rate,
        cutsForNext: Math.max(0, nextTier.minCuts - totalCuts),
    };
}
