import { getSettings, updateSettings } from '@/lib/services/settings';
import { NextResponse } from 'next/server';
import { UpdateSettingsSchema } from '@/lib/validations';
import { requireAdmin } from '@/lib/utils/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const key = searchParams.get('key');
        if (!key) return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });

        const value = await getSettings(key);
        return NextResponse.json(value || {});
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        await requireAdmin();
        const body = await req.json();
        const { key, value } = UpdateSettingsSchema.parse(body);

        await updateSettings(key, value);
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'ZodError') {
            const zodErr = err as unknown as { errors: { message: string }[] };
            return NextResponse.json({ error: zodErr.errors[0].message }, { status: 400 });
        }
        const status = (err as { status?: number }).status ?? 500;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status });
    }
}
