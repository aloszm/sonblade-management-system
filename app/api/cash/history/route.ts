import { getCashSessionHistory } from '@/lib/services/cash';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getCashSessionHistory();
        return NextResponse.json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
