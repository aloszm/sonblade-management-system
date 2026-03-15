import { NextResponse } from 'next/server';
import { resetCashSession, getArchivedSessions } from '@/lib/services/cash';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        await resetCashSession('Admin');
        return NextResponse.json({ success: true, message: 'Caja reiniciada y archivada exitosamente' });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const archives = await getArchivedSessions();
        return NextResponse.json(archives);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
