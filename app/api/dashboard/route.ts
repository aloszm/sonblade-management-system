import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Get Today's Revenue & Total Appointments (simplified as 'Nuevos Clientes' for now since we have no client table)
        const { data: salesToday, error: salesError } = await supabase
            .from('sales')
            .select('total')
            .gte('created_at', today.toISOString());

        if (salesError) throw salesError;

        const todayRevenue = salesToday?.reduce((sum, sale) => sum + Number(sale.total), 0) || 0;
        const totalSalesCount = salesToday?.length || 0; // Using this as proxy for 'Nuevos Clientes' or walk-ins for now

        // 2. Get Appointments for Today
        const { data: aptsToday, error: aptsError } = await supabase
            .from('appointments')
            .select('*')
            .gte('scheduled_at', today.toISOString())
            .order('scheduled_at', { ascending: true });

        if (aptsError) throw aptsError;
        const upcomingAppointments = aptsToday || [];

        // 3. Get Low Stock Products
        const { data: lowStock, error: stockError } = await supabase
            .from('products')
            .select('id')
            .lt('stock', 5); // Assuming < 5 is low stock, or we could use min_stock

        if (stockError) throw stockError;
        const lowStockCount = lowStock?.length || 0;

        // 4. Get Revenue for the last 7 days for the chart
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const { data: weeklySales, error: weeklyError } = await supabase
            .from('sales')
            .select('created_at, total')
            .gte('created_at', sevenDaysAgo.toISOString());

        if (weeklyError) throw weeklyError;

        // Group by day for the chart
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const chartDataMap = new Map();

        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayName = days[d.getDay()];
            // If duplicate day name in the loop (like 7 days), the map overwrites, 
            // but for 7 days it's fine. We use a Date string key to be safe.
            const dateKey = d.toISOString().split('T')[0];
            chartDataMap.set(dateKey, { name: dayName, revenue: 0 });
        }

        weeklySales?.forEach(sale => {
            const dateKey = new Date(sale.created_at).toISOString().split('T')[0];
            if (chartDataMap.has(dateKey)) {
                const existing = chartDataMap.get(dateKey);
                existing.revenue += Number(sale.total);
            }
        });

        const revenueChart = Array.from(chartDataMap.values());

        return NextResponse.json({
            stats: {
                totalAppointments: upcomingAppointments.length, // total apts today
                todayRevenue,
                newClients: totalSalesCount, // proxy
                lowStockProducts: lowStockCount
            },
            revenueChart,
            upcomingAppointments
        });

    } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
