import { NextRequest, NextResponse } from "next/server";
import { createSession, destroySession } from "@/lib/utils/auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
    try {
        const { userId, pin } = await req.json();

        // 1. Check Admin default config
        const adminUser = process.env.ADMIN_USER || 'admin';
        const adminPin = process.env.ADMIN_PIN || '1234';

        if (userId === adminUser && pin === adminPin) {
            await createSession({ id: 'admin', name: 'Administrador', role: 'admin' });
            return NextResponse.json({ success: true, role: 'admin' });
        }

        // 2. Check Barber
        if (userId !== adminUser) {
            const { data: barber } = await supabase.from('barbers').select('*').eq('id', userId).single();
            if (barber && barber.pin === pin) {
                await createSession({ id: barber.id, name: barber.name, role: 'barber' });
                return NextResponse.json({ success: true, role: 'barber' });
            }
        }

        return NextResponse.json({ success: false, error: 'PIN incorrecto' }, { status: 401 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE() {
    await destroySession();
    return NextResponse.json({ success: true });
}
