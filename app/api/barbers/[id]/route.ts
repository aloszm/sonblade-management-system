import { updateBarber } from '@/lib/services/barber';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/utils/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAdmin();
        const { id } = await params;
        const body = await request.json();
        const data = await updateBarber(id, body);
        return NextResponse.json(data);
    } catch (err: unknown) {
        const status = (err as { status?: number }).status ?? 500;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status });
    }
}
