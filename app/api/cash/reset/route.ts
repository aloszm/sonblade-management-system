import { NextResponse } from 'next/server';
import { resetCashSession, getArchivedSessions } from '@/lib/services/cash';

export async function POST() {
    try {
        await resetCashSession('Admin');
        return NextResponse.json({ success: true, message: 'Caja reiniciada y archivada exitosamente' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const archives = await getArchivedSessions();
        return NextResponse.json(archives);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
