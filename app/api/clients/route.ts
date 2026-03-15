import { NextResponse } from 'next/server';
import { getClients, createClient } from '@/lib/services/clients';
import { getSession } from '@/lib/utils/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateClientSchema = z.object({
    name: z.string().min(1, 'El nombre es requerido'),
    phone: z.string().min(10, 'El teléfono debe tener al menos 10 dígitos').optional().nullable(),
    email: z.string().email('Email inválido').optional().nullable(),
    pin: z.string().length(4, 'El PIN debe ser de 4 dígitos').optional().nullable(),
});

export async function GET() {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const clients = await getClients();
        return NextResponse.json(clients);
    } catch (error: any) {
        console.error('Error in GET /api/clients:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const validated = CreateClientSchema.parse(body);

        const newClient = await createClient({
            name: validated.name,
            phone: validated.phone || undefined,
            email: validated.email || undefined,
            pin: validated.pin || undefined,
        });

        return NextResponse.json(newClient);
    } catch (error: any) {
        if (error.code === '23505') {
            return NextResponse.json({ error: 'El teléfono ingresado ya está registrado.' }, { status: 400 });
        }
        if (error instanceof z.ZodError) {
            const zodError = error as any;
            return NextResponse.json({ error: zodError.errors[0].message }, { status: 400 });
        }
        console.error('Error in POST /api/clients:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
