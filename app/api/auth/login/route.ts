import { NextRequest, NextResponse } from "next/server";
import { createSession, destroySession, hashPin, verifyPin } from "@/lib/utils/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { LoginSchema } from "@/lib/validations";

export const dynamic = 'force-dynamic';

const NO_CACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, pin } = LoginSchema.parse(body);

        // 1. Check Admin — credentials must be defined in env vars, no insecure fallbacks
        if (!process.env.ADMIN_USER || !process.env.ADMIN_PIN) {
            return NextResponse.json({ error: 'Configuración de admin incompleta en el servidor' }, { status: 500, headers: NO_CACHE_HEADERS });
        }
        const adminUser = process.env.ADMIN_USER;
        const adminPin = process.env.ADMIN_PIN;

        if (userId === adminUser && pin === adminPin) {
            await createSession({ id: 'admin', name: 'Administrador', role: 'admin' });
            return NextResponse.json({ success: true, role: 'admin' }, { headers: NO_CACHE_HEADERS });
        }

        // 2. Check Barber — uses supabaseAdmin to bypass RLS
        if (userId !== adminUser) {
            const { data: barber } = await supabaseAdmin
                .from('barbers').select('*').eq('id', userId)
                .single() as { data: { id: string; name: string; pin: string } | null };
            if (barber && barber.pin) {
                const { match, needsRehash } = await verifyPin(pin, barber.pin);
                if (match) {
                    // Lazy migration: upgrade legacy plain-text PIN to bcrypt hash on first login
                    if (needsRehash) {
                        await supabaseAdmin
                            .from('barbers')
                            .update({ pin: await hashPin(pin) } as never)
                            .eq('id', barber.id);
                    }
                    await createSession({ id: barber.id, name: barber.name, role: 'barber' });
                    return NextResponse.json({ success: true, role: 'barber' }, { headers: NO_CACHE_HEADERS });
                }
            }

            // 3. Check Receptionist
            // `as any` needed because receptionists table is not in the untyped Supabase schema
            const { data: receptionist } = await supabaseAdmin
                .from('receptionists' as never)
                .select('*')
                .eq('id', userId)
                .single() as { data: { id: string; name: string; pin: string } | null };
            if (receptionist && receptionist.pin) {
                const { match, needsRehash } = await verifyPin(pin, receptionist.pin);
                if (match) {
                    if (needsRehash) {
                        await supabaseAdmin
                            .from('receptionists' as never)
                            .update({ pin: await hashPin(pin) } as never)
                            .eq('id', receptionist.id);
                    }
                    await createSession({ id: receptionist.id, name: receptionist.name, role: 'recepcion' });
                    return NextResponse.json({ success: true, role: 'recepcion' }, { headers: NO_CACHE_HEADERS });
                }
            }
        }

        return NextResponse.json({ success: false, error: 'PIN incorrecto' }, { status: 401, headers: NO_CACHE_HEADERS });
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'ZodError') {
            const zodErr = err as unknown as { errors: { message: string }[] };
            return NextResponse.json({ success: false, error: zodErr.errors[0].message }, { status: 400, headers: NO_CACHE_HEADERS });
        }
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500, headers: NO_CACHE_HEADERS });
    }
}

export async function DELETE() {
    await destroySession();
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
}
