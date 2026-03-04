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

import { getCurrentWeekRangeMX, getNowMX } from '@/lib/utils/timezone';

export function getWeeklyDateRange() {
    return getCurrentWeekRangeMX();
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
        .gte('created_at', start)
        .lte('created_at', end)
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

    const todayMX = getNowMX();
    const todayStr = `${todayMX.getFullYear()}-${String(todayMX.getMonth() + 1).padStart(2, '0')}-${String(todayMX.getDate()).padStart(2, '0')}`;
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

    // Detailed service breakdown and commission calculation
    // Rules: Service base (tiered or flat 50%), Product (20%), Tips (100%)
    const serviceBreakdownIdx: Record<string, { count: number; revenue: number }> = {};
    let serviceCommission = 0;

    weeklySales.forEach(s => {
        const isFlat50 = s.commission_type === 'flat_50';
        s.items?.forEach(i => {
            if (i.item_type === 'service') {
                const amt = Number(i.item_price) * (i.quantity || 1);
                if (!serviceBreakdownIdx[i.item_name]) serviceBreakdownIdx[i.item_name] = { count: 0, revenue: 0 };
                serviceBreakdownIdx[i.item_name].count += (i.quantity || 1);
                serviceBreakdownIdx[i.item_name].revenue += amt;

                // Calculate commission for this exact line item
                if (isFlat50) {
                    serviceCommission += amt * 0.50;
                } else {
                    serviceCommission += amt * commissionRate;
                }
            }
        });
    });
    const serviceBreakdown = Object.entries(serviceBreakdownIdx)
        .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
        .sort((a, b) => b.revenue - a.revenue);

    const productCommission = weeklyProductGenerated * 0.20;

    const weeklyCommission = serviceCommission + productCommission + weeklyTips;
    const weeklyGenerated = weeklyServiceGenerated + weeklyProductGenerated;

    return {
        barber,
        weeklyStats: {
            cuts: weeklyCuts,
            totalGenerated: weeklyGenerated,
            serviceRevenue: weeklyServiceGenerated,
            productRevenue: weeklyProductGenerated,
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

// Commission tiers: 1-24 cuts = 40% | 25-49 cuts = 45% | 50+ cuts = 50%
export function getCommissionTier(totalCuts: number): { current: number; next: number; cutsForNext: number } {
    const tiers = [
        { minCuts: 0, rate: 40 },
        { minCuts: 25, rate: 45 },
        { minCuts: 50, rate: 50 },
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
