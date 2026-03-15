import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

        const { data: barberRaw, error: bErr } = await supabase
            .from('barbers').select('*').eq('id', id).single();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const barber = barberRaw as any;
        if (bErr || !barber) return NextResponse.json({ error: 'Barbero no encontrado' }, { status: 404 });

        const { data: salesRaw } = await supabase
            .from('sales')
            .select('*, items:sale_items(*)')
            .eq('barber_id', id)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: false });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sales = salesRaw as any[] | null;

        // Tier table for 'tiered' commission
        // 1-24 cuts: 40% | 25-49 cuts: 45% | 50+ cuts: 50%
        const tiers = [
            { min: 0, rate: 40 }, { min: 25, rate: 45 },
            { min: 50, rate: 50 }
        ];
        function getTieredRate(cuts: number): number {
            let r = 40;
            for (const t of tiers) { if (cuts >= t.min) r = t.rate; }
            return r;
        }

        let totalCuts = 0;
        let serviceRevenue = 0;
        let productRevenue = 0;
        let totalTips = 0;
        let totalServiceCommission = 0;
        let totalProductCommission = 0;

        // Service breakdown: { name: { count, revenue } }
        const svcMap: Record<string, { count: number; revenue: number }> = {};

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
                    // Aggregate service breakdown
                    if (!svcMap[i.item_name]) svcMap[i.item_name] = { count: 0, revenue: 0 };
                    svcMap[i.item_name].count += (i.quantity || 1);
                    svcMap[i.item_name].revenue += amt;
                } else {
                    prdNames.push(i.item_name);
                    saleProductRev += amt;
                }
            });

            totalCuts += saleCuts;
            serviceRevenue += saleServiceRev;
            productRevenue += saleProductRev;
            totalTips += Number(sale.tip || 0);

            // Use the commission_type stored AT the time of sale
            const saleCommType = sale.commission_type || barber.commission_type || 'tiered';
            let rate: number;
            if (saleCommType === 'flat_50') {
                rate = 50;
            } else {
                // Tiered: based on accumulated cuts so far in this period
                rate = getTieredRate(totalCuts);
            }

            const svcComm = saleServiceRev * rate / 100;
            const prdComm = saleProductRev * 0.20;
            const saleCommission = svcComm + prdComm + Number(sale.tip || 0);

            totalServiceCommission += svcComm;
            totalProductCommission += prdComm;

            return {
                id: sale.id,
                date: sale.created_at,
                services: srvNames.join(', ') || '—',
                products: prdNames.join(', ') || '—',
                payment_method: sale.payment_method,
                cash_amount: Number(sale.cash_amount || 0),
                card_amount: Number(sale.card_amount || 0),
                transfer_amount: Number(sale.transfer_amount || 0),
                tip: Number(sale.tip || 0),
                total: Number(sale.total),
                commission: Math.round(saleCommission * 100) / 100
            };
        });

        // Final commission rate (current, for display purposes)
        const commissionRate = barber.commission_type === 'flat_50' ? 50 : getTieredRate(totalCuts);
        const totalCommission = totalServiceCommission + totalProductCommission + totalTips;

        // Build sorted service breakdown array
        const serviceBreakdown = Object.entries(svcMap)
            .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
            .sort((a, b) => b.count - a.count);

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
                totalCommission: Math.round(totalCommission * 100) / 100,
                serviceCommission: Math.round(totalServiceCommission * 100) / 100,
                productCommission: Math.round(totalProductCommission * 100) / 100
            },
            serviceBreakdown,
            movements
        });
    } catch (err: unknown) {
        console.error('Barber stats error:', err);
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

