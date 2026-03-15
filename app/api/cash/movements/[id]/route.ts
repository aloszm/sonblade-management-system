import { NextRequest, NextResponse } from 'next/server';
import { deleteMovement } from '@/lib/services/cash';

export const dynamic = 'force-dynamic';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const reason = body?.reason || '';
        const deletedBy = body?.deleted_by || 'Admin';

        await deleteMovement(id, deletedBy, reason);

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
