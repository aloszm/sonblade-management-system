import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { getBarbers, getBarberStats } from '@/lib/services/barber';
import { getTodayRangeMX, getCurrentWeekRangeMX, getCurrentMonthRangeMX, getNowMX } from '@/lib/utils/timezone';
import { requireAdmin } from '@/lib/utils/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        await requireAdmin();
        const period = request.nextUrl.searchParams.get('period') || 'week';

        let startISO = '';
        let endISO = '';

        if (period === 'today') {
            const range = getTodayRangeMX();
            startISO = range.start; endISO = range.end;
        } else if (period === 'week') {
            const range = getCurrentWeekRangeMX();
            startISO = range.start; endISO = range.end;
        } else {
            const range = getCurrentMonthRangeMX();
            startISO = range.start; endISO = range.end;
        }

        // Fetch all sales for the period
        const { data: rawSales } = await supabase
            .from('sales')
            .select('*, items:sale_items(*)')
            .gte('created_at', startISO)
            .lte('created_at', endISO);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allSales = rawSales as any[] | null;

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
                    serviceRevenue: stats.weeklyStats.serviceRevenue,
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
            .from('barber_payments' as never)
            .select('*, barber:barbers(name)')
            .order('paid_at', { ascending: false })
            .limit(50);

        // Weekly breakdown for current month
        // We'll skip complex weekly breakdown adjustments for now to save complexity,
        // or just calculate it using simple days if period is month
        const weeklyBreakdown = [];
        if (period === 'month' && allSales) {
            // Group sales by week roughly (every 7 days from start of month)
            for (let w = 0; w < 5; w++) {
                const wsDate = new Date(startISO);
                wsDate.setDate(wsDate.getDate() + (w * 7));
                const weDate = new Date(wsDate);
                weDate.setDate(wsDate.getDate() + 6);
                const wSales = allSales.filter(s => new Date(s.created_at) >= wsDate && new Date(s.created_at) <= weDate);
                if (wSales.length > 0 || w < 4) {
                    weeklyBreakdown.push({ week: `Semana ${w + 1}`, revenue: wSales.reduce((sum, s) => sum + Number(s.total), 0) });
                }
            }
        }

        // Hourly sales (for today)
        const hourlySales = Array.from({ length: 14 }, (_, i) => ({ hour: `${i + 8}:00`, revenue: 0 }));
        if (period === 'today') {
            allSales?.forEach(s => {
                const hour = new Date(new Date(s.created_at).toLocaleString("en-US", { timeZone: 'America/Mexico_City' })).getHours();
                if (hour >= 8 && hour < 22) {
                    hourlySales[hour - 8].revenue += Number(s.total);
                }
            });
        }

        // Daily sales (for week/month) -> Group by YYYY-MM-DD
        const dailySalesMap: Record<string, number> = {};
        allSales?.forEach(s => {
            const mxDate = new Date(new Date(s.created_at).toLocaleString("en-US", { timeZone: 'America/Mexico_City' }));
            const dayStr = `${String(mxDate.getDate()).padStart(2, '0')}/${String(mxDate.getMonth() + 1).padStart(2, '0')}`;
            dailySalesMap[dayStr] = (dailySalesMap[dayStr] || 0) + Number(s.total);
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
    } catch (err: unknown) {
        console.error('Admin summary error:', err);
        const status = (err as { status?: number }).status ?? 500;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status });
    }
}
