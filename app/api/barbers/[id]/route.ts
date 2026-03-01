import { updateBarber } from '@/lib/services/barber';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const data = await updateBarber(id, body);
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
