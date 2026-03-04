import { supabaseAdmin as supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('appointments')
            .select('*')
            .order('scheduled_at', { ascending: false });

        if (error) throw error;

        // Aggregate unique clients
        const clientMap: Record<string, { lastVisit: string, totalAppointments: number }> = {};

        data.forEach((app: any) => {
            if (!clientMap[app.client_name]) {
                clientMap[app.client_name] = {
                    lastVisit: format(new Date(app.scheduled_at), 'dd MMM yyyy', { locale: es }),
                    totalAppointments: 0
                };
            }
            clientMap[app.client_name].totalAppointments += 1;
        });

        const clients = Object.entries(clientMap).map(([name, stats]) => ({
            name,
            ...stats
        }));

        return NextResponse.json(clients);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
