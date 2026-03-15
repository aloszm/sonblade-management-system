import { NextRequest, NextResponse } from 'next/server';
import { addCashMovement, confirmMovement, getSessionMovements, getDeletedMovements, getActiveSession } from '@/lib/services/cash';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { AddCashMovementSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        let { session_id, status } = body;
        const movementData = AddCashMovementSchema.parse(body);

        if (!session_id) {
            const active = await getActiveSession();
            if (!active) return NextResponse.json({ error: 'Debe haber una caja abierta para registrar movimientos.' }, { status: 400 });
            session_id = active.id;
        }

        const movement = await addCashMovement(
            session_id,
            movementData.type,
            movementData.description,
            movementData.amount,
            movementData.payment_method,
            status || 'confirmed'
        );

        return NextResponse.json(movement);
    } catch (err: any) {
        if (err.name === 'ZodError') {
            return NextResponse.json({ error: err.errors[0].message }, { status: 400 });
        }
        const message = err.message || 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const params = request.nextUrl.searchParams;
        const sessionId = params.get('session_id');
        const type = params.get('type');

        if (type === 'deleted') {
            const deleted = await getDeletedMovements();
            return NextResponse.json(deleted);
        }

        if (type === 'expense' && !sessionId) {
            // Fetch all expenses regardless of session
            const { data, error } = await supabase
                .from('cash_movements')
                .select('*')
                .eq('type', 'expense')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return NextResponse.json(data);
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'session_id requerido' }, { status: 400 });
        }

        const movements = await getSessionMovements(sessionId);
        return NextResponse.json(movements);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { movement_id, action } = body;

        if (!movement_id || action !== 'confirm') {
            return NextResponse.json({ error: 'movement_id y action=confirm requeridos' }, { status: 400 });
        }

        const confirmed = await confirmMovement(movement_id);
        return NextResponse.json(confirmed);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
