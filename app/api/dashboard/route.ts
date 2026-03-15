import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { getBarbers, getBarberStats } from '@/lib/services/barber';
import { getTodayRangeMX, getCurrentWeekRangeMX, getCurrentMonthRangeMX } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const period = searchParams.get('period') || 'today'; // 'today', 'week', 'month'

        let startISO: string;
        let endISO: string;

        if (period === 'week') {
            const range = getCurrentWeekRangeMX();
            startISO = range.start;
            endISO = range.end;
        } else if (period === 'month') {
            const range = getCurrentMonthRangeMX();
            startISO = range.start;
            endISO = range.end;
        } else {
            const range = getTodayRangeMX();
            startISO = range.start;
            endISO = range.end;
        }

        // 1. Fetch Sales for the selected period
        const { data: salesRaw, error: salesError } = await supabase
            .from('sales')
            .select('*, items:sale_items(*)')
            .gte('created_at', startISO)
            .lte('created_at', endISO);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const salesPeriod = salesRaw as any[] | null;

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
        const { data: expensesRaw } = await supabase
            .from('cash_movements')
            .select('amount')
            .eq('type', 'expense')
            .gte('created_at', startISO)
            .lte('created_at', endISO);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expensesPeriod = expensesRaw as any[] | null;

        const totalExpenses = expensesPeriod?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

        // 2. Fetch Weekly Barbers (always weekly per requirements)
        const barbers = await getBarbers();
        const allStats = await Promise.all(barbers.map(b => getBarberStats(b.id)));
        const barbersTable = barbers
            .map((b, i) => {
                const stats = allStats[i];
                if (!stats) return null;
                return {
                    id: b.id,
                    name: b.name,
                    avatar_url: b.avatar_url,
                    cuts: stats.weeklyStats.cuts,
                    revenue: stats.weeklyStats.totalGenerated,
                    commission: stats.weeklyStats.commission,
                    rate: stats.tier.current
                };
            })
            .filter(Boolean);
        barbersTable.sort((a, b) => b!.revenue - a!.revenue);

        // 3. Charts Data

        // A. Week Bar Chart (Sun-Sat of current week)
        const weekRange = getCurrentWeekRangeMX();

        const { data: weekSalesRaw } = await supabase
            .from('sales')
            .select('created_at, total')
            .gte('created_at', weekRange.start);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const weekSales = weekSalesRaw as any[] | null;

        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const weekBar = days.map(d => ({ name: d, revenue: 0 }));
        weekSales?.forEach(s => {
            const dIdx = new Date(new Date(s.created_at).toLocaleString("en-US", { timeZone: 'America/Mexico_City' })).getDay();
            weekBar[dIdx].revenue += Number(s.total);
        });

        // B. Month Line Chart (Last 4 weeks) — parallelized
        const now = new Date();
        const weekRanges = [3, 2, 1, 0].map(i => {
            const wStart = new Date(now);
            wStart.setDate(wStart.getDate() - (wStart.getDay() + (i * 7)));
            wStart.setHours(0, 0, 0, 0);
            const wEnd = new Date(wStart);
            wEnd.setDate(wStart.getDate() + 6);
            wEnd.setHours(23, 59, 59, 999);
            return { i, wStart, wEnd };
        });
        const weekResults = await Promise.all(
            weekRanges.map(({ wStart, wEnd }) =>
                supabase.from('sales').select('total')
                    .gte('created_at', wStart.toISOString())
                    .lte('created_at', wEnd.toISOString())
            )
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const monthLine = weekRanges.map(({ i }, idx) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wSl = weekResults[idx].data as any[] | null;
            const rev = wSl?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
            return { name: i === 0 ? 'Esta Sem' : `Hace ${i} Sem`, revenue: rev };
        });


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

    } catch (err: unknown) {
        console.error('Error fetching dashboard data:', err);
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
