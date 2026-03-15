import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/utils/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        await requireAdmin();
        const body = await request.json();
        const { barber_id, amount, commission_amount, tips_amount, note, period_start, period_end } = body;

        if (!barber_id || !amount) {
            return NextResponse.json({ error: 'barber_id y amount son requeridos' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('barber_payments' as never)
            .insert([{
                barber_id,
                amount,
                commission_amount: commission_amount || 0,
                tips_amount: tips_amount || 0,
                note: note || '',
                period_start,
                period_end
            }] as never)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err: unknown) {
        const status = (err as { status?: number }).status ?? 500;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status });
    }
}

export async function GET() {
    try {
        await requireAdmin();
        const { data, error } = await supabase
            .from('barber_payments')
            .select('*, barber:barbers(name)')
            .order('paid_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json(data || []);
    } catch (err: unknown) {
        const status = (err as { status?: number }).status ?? 500;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status });
    }
}
