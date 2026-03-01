import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Test products
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('*');

        if (productsError) {
            return NextResponse.json({
                status: 'error',
                message: 'Products query failed',
                error: productsError.message
            }, { status: 500 });
        }

        // Test barbers
        const { data: barbers, error: barbersError } = await supabase
            .from('barbers')
            .select('*');

        if (barbersError) {
            return NextResponse.json({
                status: 'error',
                message: 'Barbers query failed',
                error: barbersError.message
            }, { status: 500 });
        }

        // Test services
        const { data: services, error: servicesError } = await supabase
            .from('services')
            .select('*');

        if (servicesError) {
            return NextResponse.json({
                status: 'error',
                message: 'Services query failed',
                error: servicesError.message
            }, { status: 500 });
        }

        // Test cash_sessions
        const { data: sessions, error: sessionsError } = await supabase
            .from('cash_sessions')
            .select('*');

        if (sessionsError) {
            return NextResponse.json({
                status: 'error',
                message: 'Cash sessions query failed',
                error: sessionsError.message
            }, { status: 500 });
        }

        return NextResponse.json({
            status: 'ok',
            connection: 'Supabase connected successfully ✅',
            tables: {
                products: { count: products?.length || 0, sample: products?.[0]?.name },
                barbers: { count: barbers?.length || 0, sample: barbers?.[0]?.name },
                services: { count: services?.length || 0, sample: services?.[0]?.name },
                cash_sessions: { count: sessions?.length || 0 },
            }
        });
    } catch (err: unknown) {
        return NextResponse.json({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error'
        }, { status: 500 });
    }
}
