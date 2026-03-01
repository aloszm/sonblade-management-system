import { getBarbers, createBarber } from '@/lib/services/barber';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
    try {
        const data = await getBarbers();
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const data = await createBarber(body);
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
