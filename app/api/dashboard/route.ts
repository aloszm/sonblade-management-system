import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { getBarbers, getBarberStats } from '@/lib/services/barber';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const period = searchParams.get('period') || 'today'; // 'today', 'week', 'month'

        const now = new Date();
        let startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);

        let endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);

        // Date logic
        if (period === 'week') {
            const dayOfWeek = now.getDay();
            startDate.setDate(now.getDate() - dayOfWeek);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }

        // 1. Fetch Sales for the selected period
        const { data: salesPeriod, error: salesError } = await supabase
            .from('sales')
            .select('*, items:sale_items(*)')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        if (salesError) throw salesError;

        // Calculate KPIs
        let totalRevenue = 0;
        let totalTips = 0;
        let totalCuts = 0;
        let cashMethod = 0;
        let cardMethod = 0;
        let transferMethod = 0;

        salesPeriod?.forEach(sale => {
            totalRevenue += Number(sale.total);
            totalTips += Number(sale.tip || 0);

            // Methods
            if (sale.payment_method === 'cash') cashMethod += Number(sale.total);
            else if (sale.payment_method === 'card') cardMethod += Number(sale.total);
            else if (sale.payment_method === 'transfer') transferMethod += Number(sale.total);
            else {
                // mixed
                cashMethod += Number(sale.cash_amount || 0);
                cardMethod += Number(sale.card_amount || 0);
                transferMethod += Number(sale.transfer_amount || 0);
            }

            sale.items?.forEach((i: any) => {
                if (i.item_type === 'service') totalCuts++;
            });
        });

        // Fetch Expenses 
        const { data: expensesPeriod } = await supabase
            .from('cash_session_movements')
            .select('amount')
            .eq('type', 'expense')
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

        const totalExpenses = expensesPeriod?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

        // 2. Fetch Weekly Barbers (always weekly per requirements)
        const barbers = await getBarbers();
        const barbersTable = [];
        for (const b of barbers) {
            const stats = await getBarberStats(b.id);
            if (stats) {
                barbersTable.push({
                    id: b.id,
                    name: b.name,
                    avatar_url: b.avatar_url,
                    cuts: stats.weeklyStats.cuts,
                    revenue: stats.weeklyStats.totalGenerated,
                    commission: stats.weeklyStats.commission,
                    rate: stats.tier.current
                });
            }
        }
        barbersTable.sort((a, b) => b.revenue - a.revenue);

        // 3. Charts Data

        // A. Week Bar Chart (Mon-Sun or Sun-Sat of current week)
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const { data: weekSales } = await supabase
            .from('sales')
            .select('created_at, total')
            .gte('created_at', weekStart.toISOString());

        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const weekBar = days.map(d => ({ name: d, revenue: 0 }));
        weekSales?.forEach(s => {
            const dIdx = new Date(s.created_at).getDay();
            weekBar[dIdx].revenue += Number(s.total);
        });

        // B. Month Line Chart (Last 4 weeks)
        const monthLine = [];
        for (let i = 3; i >= 0; i--) {
            const wStart = new Date(now);
            wStart.setDate(wStart.getDate() - (wStart.getDay() + (i * 7)));
            wStart.setHours(0, 0, 0, 0);

            const wEnd = new Date(wStart);
            wEnd.setDate(wStart.getDate() + 6);
            wEnd.setHours(23, 59, 59, 999);

            const { data: wSl } = await supabase
                .from('sales')
                .select('total')
                .gte('created_at', wStart.toISOString())
                .lte('created_at', wEnd.toISOString());

            const rev = wSl?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
            monthLine.push({ name: i === 0 ? 'Esta Sem' : `Hace ${i} Sem`, revenue: rev });
        }

        return NextResponse.json({
            kpis: {
                revenue: totalRevenue,
                cuts: totalCuts,
                tips: totalTips,
                expenses: totalExpenses
            },
            barbersTable,
            charts: {
                weekBar,
                monthLine,
                paymentDonut: [
                    { name: 'Efectivo', value: cashMethod },
                    { name: 'Tarjeta', value: cardMethod },
                    { name: 'Transferencia', value: transferMethod }
                ]
            }
        });

    } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
