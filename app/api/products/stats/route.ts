import { getProductStats } from '@/lib/services/products';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const stats = await getProductStats();
        return NextResponse.json(stats);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
