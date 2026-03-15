import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const params = request.nextUrl.searchParams;
        const role = params.get('role') || undefined;
        const action = params.get('action') || undefined;
        const from = params.get('from') || undefined;
        const to = params.get('to') || undefined;
        const limit = params.get('limit') ? Number(params.get('limit')) : 100;

        const logs = await getAuditLogs({ role, action, from, to, limit });
        return NextResponse.json(logs);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
