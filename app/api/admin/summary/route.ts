import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { getBarbers, getBarberStats } from '@/lib/services/barber';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
    try {
        const period = request.nextUrl.searchParams.get('period') || 'week';
        const now = new Date();
        let startDate = new Date(now);
        let endDate = new Date(now);

        if (period === 'today') {
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
        } else if (period === 'week') {
            const day = now.getDay();
            startDate.setDate(now.getDate() - day);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }

        // Fetch all sales for the period
        const { data: allSales } = await supabase
            .from('sales')
            .select('*, items:sale_items(*)')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        // Revenue
        const totalRevenue = allSales?.reduce((s, v) => s + Number(v.total), 0) || 0;
        const totalTips = allSales?.reduce((s, v) => s + Number(v.tip || 0), 0) || 0;
        const avgTicket = allSales && allSales.length > 0 ? totalRevenue / allSales.length : 0;

        // Payment breakdown
        let cash = 0, card = 0, transfer = 0;
        allSales?.forEach(s => {
            if (s.payment_method === 'cash') cash += Number(s.total);
            else if (s.payment_method === 'card') card += Number(s.total);
            else if (s.payment_method === 'transfer') transfer += Number(s.total);
            else { cash += Number(s.cash_amount || 0); card += Number(s.card_amount || 0); transfer += Number(s.transfer_amount || 0); }
        });

        // Global service breakdown
        const svcMap: Record<string, { count: number; revenue: number }> = {};
        allSales?.forEach(s => {
            s.items?.forEach((i: any) => {
                if (i.item_type === 'service') {
                    const amt = Number(i.item_price) * (i.quantity || 1);
                    if (!svcMap[i.item_name]) svcMap[i.item_name] = { count: 0, revenue: 0 };
                    svcMap[i.item_name].count += (i.quantity || 1);
                    svcMap[i.item_name].revenue += amt;
                }
            });
        });
        const serviceBreakdown = Object.entries(svcMap)
            .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
            .sort((a, b) => b.count - a.count);

        // Per-barber with commissions
        const barbers = await getBarbers();
        const barberSummaries = [];
        let totalCommissions = 0;

        for (const b of barbers) {
            const stats = await getBarberStats(b.id);
            if (stats) {
                totalCommissions += stats.weeklyStats.commission;
                barberSummaries.push({
                    id: b.id, name: b.name, status: b.status,
                    cuts: stats.weeklyStats.cuts,
                    revenue: stats.weeklyStats.totalGenerated,
                    tips: stats.weeklyStats.tips,
                    rate: stats.tier.current,
                    commission: Math.round(stats.weeklyStats.commission * 100) / 100,
                    serviceCommission: Math.round(stats.weeklyStats.serviceCommission * 100) / 100,
                    productCommission: Math.round(stats.weeklyStats.productCommission * 100) / 100,
                    serviceBreakdown: stats.weeklyStats.serviceBreakdown
                });
            }
        }
        barberSummaries.sort((a, b) => b.revenue - a.revenue);

        // Fetch existing payments
        const { data: payments } = await supabase
            .from('barber_payments')
            .select('*, barber:barbers(name)')
            .order('paid_at', { ascending: false })
            .limit(50);

        // Weekly breakdown for current month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const weeklyBreakdown = [];
        for (let w = 0; w < 5; w++) {
            const ws = new Date(monthStart);
            ws.setDate(ws.getDate() + (w * 7));
            if (ws.getMonth() !== now.getMonth() && w > 0) break;
            const we = new Date(ws);
            we.setDate(ws.getDate() + 6);
            we.setHours(23, 59, 59, 999);

            const { data: weekSales } = await supabase
                .from('sales').select('total')
                .gte('created_at', ws.toISOString())
                .lte('created_at', we.toISOString());

            const weekRev = weekSales?.reduce((s, v) => s + Number(v.total), 0) || 0;
            weeklyBreakdown.push({ week: `Semana ${w + 1}`, revenue: weekRev });
        }

        // Hourly sales (for today)
        const hourlySales = Array.from({ length: 14 }, (_, i) => ({ hour: `${i + 8}:00`, revenue: 0 }));
        if (period === 'today') {
            allSales?.forEach(s => {
                const hour = new Date(s.created_at).getHours();
                if (hour >= 8 && hour < 22) {
                    hourlySales[hour - 8].revenue += Number(s.total);
                }
            });
        }

        // Daily sales (for week/month)
        const dailySalesMap: Record<string, number> = {};
        allSales?.forEach(s => {
            const day = format(new Date(s.created_at), 'dd/MM');
            dailySalesMap[day] = (dailySalesMap[day] || 0) + Number(s.total);
        });
        const dailySales = Object.entries(dailySalesMap).map(([day, revenue]) => ({ day, revenue }));

        // Low stock products
        const { data: lowStockProducts } = await supabase
            .from('products')
            .select('*')
            .neq('status', 'ok')
            .order('stock', { ascending: true })
            .limit(5);

        return NextResponse.json({
            kpis: {
                totalRevenue, totalTips, avgTicket: Math.round(avgTicket * 100) / 100,
                totalCommissions: Math.round(totalCommissions * 100) / 100,
                netProfit: Math.round((totalRevenue - totalCommissions) * 100) / 100,
                totalSales: allSales?.length || 0
            },
            paymentBreakdown: { cash, card, transfer },
            barberSummaries,
            serviceBreakdown,
            payments: payments || [],
            weeklyBreakdown,
            hourlySales,
            dailySales,
            lowStockProducts: lowStockProducts || []
        });
    } catch (err: any) {
        console.error('Admin summary error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
