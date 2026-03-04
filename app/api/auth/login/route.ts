import { NextRequest, NextResponse } from "next/server";
import { createSession, destroySession } from "@/lib/utils/auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
};

export async function POST(req: NextRequest) {
    try {
        const { userId, pin } = await req.json();

        // 1. Check Admin default config
        const adminUser = process.env.ADMIN_USER || 'admin';
        const adminPin = process.env.ADMIN_PIN || '1234';

        if (userId === adminUser && pin === adminPin) {
            await createSession({ id: 'admin', name: 'Administrador', role: 'admin' });
            return NextResponse.json({ success: true, role: 'admin' }, { headers: NO_CACHE_HEADERS });
        }

        // 2. Check Barber — uses supabaseAdmin to bypass RLS
        if (userId !== adminUser) {
            const { data: barber } = await supabaseAdmin.from('barbers').select('*').eq('id', userId).single();
            if (barber && barber.pin === pin) {
                await createSession({ id: barber.id, name: barber.name, role: 'barber' });
                return NextResponse.json({ success: true, role: 'barber' }, { headers: NO_CACHE_HEADERS });
            }
        }

        return NextResponse.json({ success: false, error: 'PIN incorrecto' }, { status: 401, headers: NO_CACHE_HEADERS });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500, headers: NO_CACHE_HEADERS });
    }
}

export async function DELETE() {
    await destroySession();
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
}
