import { getBarbers, createBarber } from '@/lib/services/barber';
import { NextRequest, NextResponse } from 'next/server';
import { CreateBarberSchema } from '@/lib/validations';
import { requireAdmin } from '@/lib/utils/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getBarbers();
        return NextResponse.json(data);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        await requireAdmin();
        const body = await request.json();
        const validatedData = CreateBarberSchema.parse(body);
        const data = await createBarber(validatedData);
        return NextResponse.json(data);
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
