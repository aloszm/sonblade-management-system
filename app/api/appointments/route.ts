import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { notifyAppointmentConfirmed } from '@/lib/services/notifications';

export const dynamic = 'force-dynamic';

// GET /api/appointments?year=YYYY&month=MM
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const params = request.nextUrl.searchParams;
        const year = params.get('year');
        const month = params.get('month'); // 0-based from client

        let query = supabase
            .from('appointments' as never)
            .select('*, client:clients(id,name), barber:barbers(id,name)')
            .order('scheduled_at', { ascending: true }) as unknown as {
                gte: (col: string, val: string) => typeof query;
                lt: (col: string, val: string) => typeof query;
                then: Promise<{ data: unknown[]; error: unknown }>['then'];
            };

        if (year && month !== null) {
            const m = Number(month);
            const y = Number(year);
            const from = new Date(y, m, 1).toISOString();
            const to = new Date(y, m + 1, 1).toISOString();
            (query as any) = (query as any).gte('scheduled_at', from).lt('scheduled_at', to);
        }

        const { data, error } = await (query as any);
        if (error) throw error;

        // Flatten client_name for easy UI access
        const appointments = (data || []).map((a: any) => ({
            ...a,
            client_name: a.client?.name ?? a.service_note ?? 'Sin cliente',
        }));

        return NextResponse.json(appointments);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/appointments
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

        const body = await request.json();
        const { client_id, barber_id, scheduled_at, service_note } = body;

        if (!scheduled_at) {
            return NextResponse.json({ error: 'scheduled_at es requerido' }, { status: 400 });
        }

        const { data, error } = await (supabase as any)
            .from('appointments')
            .insert({
                client_id: client_id || null,
                barber_id: barber_id || null,
                scheduled_at,
                service_note: service_note || null,
                status: 'pending',
            })
            .select('*, client:clients(id,name), barber:barbers(id,name)')
            .single();

        if (error) throw error;

        // Notificar al cliente por WhatsApp (fire & forget, no bloquea la respuesta)
        if (data.client?.name) {
            const { data: clientRaw } = await supabase
                .from('clients').select('phone').eq('id', client_id).single();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const clientData = clientRaw as any;
            notifyAppointmentConfirmed({
                clientName: data.client.name,
                phone: clientData?.phone,
                barberName: data.barber?.name ?? 'Tu barbero',
                scheduledAt: scheduled_at,
                serviceNote: service_note,
            }).catch(() => {});
        }

        return NextResponse.json({
            ...data,
            client_name: data.client?.name ?? data.service_note ?? 'Sin cliente',
        }, { status: 201 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
