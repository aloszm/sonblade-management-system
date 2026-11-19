import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import type { ClientHistoryEntry } from '@/lib/clients/summary';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };
const IdSchema = z.string().uuid();

/**
 * Historial de la ficha (public.client_history): citas y ventas del cliente, de la más reciente a la más antigua
 * (máximo 200). El barbero solo ve lo que hizo él, sin importes; si el cliente no es suyo, 404.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
    try {
        await requireAuthContext();
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
        const { data, error } = await (await createSupabaseServerClient()).rpc('client_history', { p_client_id: id.data });
        if (error) {
            if (error.code === '42501') return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
            throw error;
        }
        const items = (Array.isArray(data) ? data : []) as unknown as ClientHistoryEntry[];
        return NextResponse.json({ items: items.map((i) => ({ ...i, total: i.total === null ? null : Number(i.total) })) },
            { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}
