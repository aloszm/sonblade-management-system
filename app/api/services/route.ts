import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { CreateServiceSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('services')
            .select('*')
            .order('name');

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const validatedData = CreateServiceSchema.parse(body);

        const { data, error } = await supabase
            .from('services')
            .insert([validatedData] as never)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json(data);
    } catch (err: any) {
        if (err.name === 'ZodError') {
            return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
        }
        const message = err.message || 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
