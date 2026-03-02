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

export function getWeeklyDateRange() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

export async function getBarberWeeklySales(barberId: string): Promise<Sale[]> {
    const { start, end } = getWeeklyDateRange();

    const { data, error } = await supabase
        .from('sales')
        .select(`
      *,
      items:sale_items(*)
    `)
        .eq('barber_id', barberId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function getBarberStats(barberId: string) {
    const weeklySales = await getBarberWeeklySales(barberId);
    const barber = await getBarber(barberId);

    if (!barber) return null;

    let weeklyServiceGenerated = 0;
    let weeklyProductGenerated = 0;
    let weeklyCuts = 0;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    let todayServiceGenerated = 0;
    let todayProductGenerated = 0;
    let todayCuts = 0;
    let todayTips = 0;
    const todaySales: Sale[] = [];

    weeklySales.forEach(s => {
        const isToday = s.created_at.startsWith(todayStr);
        if (isToday) todaySales.push(s);

        let srvVal = 0;
        let prdVal = 0;
        let srvCount = 0;

        s.items?.forEach(i => {
            const amount = Number(i.item_price) * (i.quantity || 1);
            if (i.item_type === 'service') {
                srvVal += amount;
                srvCount += 1;
            }
            if (i.item_type === 'product') {
                prdVal += amount;
            }
        });

        weeklyServiceGenerated += srvVal;
        weeklyProductGenerated += prdVal;
        weeklyCuts += srvCount;

        if (isToday) {
            todayServiceGenerated += srvVal;
            todayProductGenerated += prdVal;
            todayCuts += srvCount;
            todayTips += Number(s.tip || 0);
        }
    });

    const weeklyTips = weeklySales.reduce((sum, s) => sum + Number(s.tip || 0), 0);
    const tier = getCommissionTier(weeklyCuts);
    const commissionRate = tier.current / 100;

    // Detailed service breakdown
    const serviceBreakdownIdx: Record<string, { count: number; revenue: number }> = {};
    weeklySales.forEach(s => {
        s.items?.forEach(i => {
            if (i.item_type === 'service') {
                const amt = Number(i.item_price) * (i.quantity || 1);
                if (!serviceBreakdownIdx[i.item_name]) serviceBreakdownIdx[i.item_name] = { count: 0, revenue: 0 };
                serviceBreakdownIdx[i.item_name].count += (i.quantity || 1);
                serviceBreakdownIdx[i.item_name].revenue += amt;
            }
        });
    });
    const serviceBreakdown = Object.entries(serviceBreakdownIdx)
        .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
        .sort((a, b) => b.revenue - a.revenue);

    // Rules: Service base (35-50%), Product (20%), Tips (100%)
    const serviceCommission = weeklyServiceGenerated * commissionRate;
    const productCommission = weeklyProductGenerated * 0.20;

    const weeklyCommission = serviceCommission + productCommission + weeklyTips;
    const weeklyGenerated = weeklyServiceGenerated + weeklyProductGenerated;

    return {
        barber,
        weeklyStats: {
            cuts: weeklyCuts,
            totalGenerated: weeklyGenerated,
            commission: weeklyCommission,
            serviceCommission: serviceCommission,
            productCommission: productCommission,
            tips: weeklyTips,
            serviceBreakdown
        },
        todayStats: {
            cuts: todayCuts,
            totalGenerated: todayServiceGenerated + todayProductGenerated,
            tips: todayTips,
            sales: todaySales
        },
        tier
    };
}

// Commission tiers
export function getCommissionTier(totalCuts: number): { current: number; next: number; cutsForNext: number } {
    const tiers = [
        { minCuts: 0, rate: 35 },
        { minCuts: 20, rate: 40 },
        { minCuts: 40, rate: 45 },
        { minCuts: 60, rate: 50 },
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
