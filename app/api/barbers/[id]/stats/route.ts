import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const searchParams = request.nextUrl.searchParams;
        const period = searchParams.get('period') || 'week';
        const fromDate = searchParams.get('from');
        const toDate = searchParams.get('to');

        const now = new Date();
        let startDate = new Date(now);
        let endDate = new Date(now);

        if (fromDate && toDate) {
            startDate = new Date(fromDate + 'T00:00:00.000Z');
            endDate = new Date(toDate + 'T23:59:59.999Z');
        } else if (period === 'today') {
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
        } else if (period === 'week') {
            const day = now.getDay();
            startDate.setDate(now.getDate() - day);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }

        // Fetch barber info
        const { data: barber, error: bErr } = await supabase
            .from('barbers').select('*').eq('id', id).single();
        if (bErr || !barber) return NextResponse.json({ error: 'Barbero no encontrado' }, { status: 404 });

        // Fetch sales for the period
        const { data: sales } = await supabase
            .from('sales')
            .select('*, items:sale_items(*)')
            .eq('barber_id', id)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: false });

        let totalCuts = 0;
        let serviceRevenue = 0;
        let productRevenue = 0;
        let totalTips = 0;

        const movements = (sales || []).map((sale: any) => {
            let srvNames: string[] = [];
            let prdNames: string[] = [];
            let saleCuts = 0;
            let saleServiceRev = 0;
            let saleProductRev = 0;

            sale.items?.forEach((i: any) => {
                const amt = Number(i.item_price) * (i.quantity || 1);
                if (i.item_type === 'service') {
                    srvNames.push(i.item_name);
                    saleCuts++;
                    saleServiceRev += amt;
                } else {
                    prdNames.push(i.item_name);
                    saleProductRev += amt;
                }
            });

            totalCuts += saleCuts;
            serviceRevenue += saleServiceRev;
            productRevenue += saleProductRev;
            totalTips += Number(sale.tip || 0);

            // commission per sale
            // Use the global cut count to determine rate at point of sale
            const tiers = [
                { min: 0, rate: 35 }, { min: 20, rate: 40 },
                { min: 40, rate: 45 }, { min: 60, rate: 50 }
            ];
            let rate = 35;
            for (const t of tiers) { if (totalCuts >= t.min) rate = t.rate; }
            const saleCommission = (saleServiceRev * rate / 100) + (saleProductRev * 0.20) + Number(sale.tip || 0);

            return {
                id: sale.id,
                date: sale.created_at,
                services: srvNames.join(', ') || '—',
                products: prdNames.join(', ') || '—',
                payment_method: sale.payment_method,
                tip: Number(sale.tip || 0),
                total: Number(sale.total),
                commission: Math.round(saleCommission * 100) / 100
            };
        });

        // Final commission calculation from accumulated totals
        const tiers = [
            { min: 0, rate: 35 }, { min: 20, rate: 40 },
            { min: 40, rate: 45 }, { min: 60, rate: 50 }
        ];
        let commissionRate = 35;
        for (const t of tiers) { if (totalCuts >= t.min) commissionRate = t.rate; }

        const totalCommission = (serviceRevenue * commissionRate / 100) + (productRevenue * 0.20) + totalTips;

        return NextResponse.json({
            barber,
            period,
            kpis: {
                cuts: totalCuts,
                serviceRevenue,
                productRevenue,
                totalRevenue: serviceRevenue + productRevenue,
                tips: totalTips,
                commissionRate,
                totalCommission: Math.round(totalCommission * 100) / 100
            },
            movements
        });
    } catch (err: any) {
        console.error('Barber stats error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
