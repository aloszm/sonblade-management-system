import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { barber_id, amount, period_start, period_end } = body;

        if (!barber_id || !amount) {
            return NextResponse.json({ error: 'barber_id y amount son requeridos' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('barber_payments')
            .insert([{ barber_id, amount, period_start, period_end }])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('barber_payments')
            .select('*, barber:barbers(name)')
            .order('paid_at', { ascending: false });

        if (error) throw error;
        return NextResponse.json(data || []);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
