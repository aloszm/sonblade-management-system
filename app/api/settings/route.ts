import { getSettings, updateSettings } from '@/lib/services/settings';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const key = searchParams.get('key');
        if (!key) return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });

        const value = await getSettings(key);
        return NextResponse.json(value || {});
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { key, value } = body;
        if (!key || !value) return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });

        await updateSettings(key, value);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
