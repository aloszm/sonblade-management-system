import { NextRequest, NextResponse } from 'next/server';
import { addCashMovement, confirmMovement, getSessionMovements, getDeletedMovements } from '@/lib/services/cash';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { session_id, type, description, amount, payment_method, status } = body;

        if (!session_id || !type || !description || !amount) {
            return NextResponse.json({ error: 'Campos requeridos: session_id, type, description, amount' }, { status: 400 });
        }

        const movement = await addCashMovement(
            session_id, type, description, Number(amount),
            payment_method || 'cash',
            status || 'confirmed'
        );

        return NextResponse.json(movement);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const params = request.nextUrl.searchParams;
        const sessionId = params.get('session_id');
        const type = params.get('type'); // 'deleted' to get deleted records

        if (type === 'deleted') {
            const deleted = await getDeletedMovements();
            return NextResponse.json(deleted);
        }

        if (!sessionId) {
            return NextResponse.json({ error: 'session_id requerido' }, { status: 400 });
        }

        const movements = await getSessionMovements(sessionId);
        return NextResponse.json(movements);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
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
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
