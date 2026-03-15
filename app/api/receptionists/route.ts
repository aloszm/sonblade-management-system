import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/receptionists — returns active receptionists for the login dropdown
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('receptionists')
            .select('id, name')
            .eq('is_active', true)
            .order('name');

        if (error) throw error;
        return NextResponse.json(data || []);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
