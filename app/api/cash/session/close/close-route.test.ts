// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessRole } from '@/lib/auth/context';

// POST /api/cash/session/close: motivo obligatorio de la diferencia (21 nov 2026) y compatibilidad con la base sin migrar.
const BASE = { userId: 'u', email: 'x@gallo-420.barberos.invalid', displayName: 'X', employeeId: null, businessId: 'biz', branchId: 'br1' };
let role: BusinessRole = 'receptionist';
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new real.AuthorizationError();
            return { ...BASE, role };
        },
    };
});

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));

const loadSession = vi.fn();
vi.mock('@/lib/cash/session-view', () => ({ loadSessionById: (...a: unknown[]) => loadSession(...a) }));

import { POST } from './route';

const ID = '3f1c2b0e-7a41-4b6e-9d52-0c1f6a8e4b11';
const MSG_30 = 'Hay una diferencia de $30 (faltante): escribe el motivo para cerrar (de 5 a 300 letras).';
const post = (body: Record<string, unknown>) => POST(new NextRequest(new URL('/api/cash/session/close', 'http://localhost'), {
    method: 'POST', body: JSON.stringify({ session_id: ID, float_left: 500, reserve_amount: 0, ...body }),
}));
const argsOf = (i: number) => rpc.mock.calls[i][1] as Record<string, unknown>;

beforeEach(() => {
    role = 'receptionist';
    rpc.mockReset();
    rpc.mockResolvedValue({ data: {}, error: null });
    loadSession.mockReset();
    // Debe haber $500 en la caja abierta.
    loadSession.mockResolvedValue({ id: ID, status: 'open', expected_cash: 500 });
});

describe('POST /api/cash/session/close · motivo de la diferencia', () => {
    it('faltante sin motivo (pantalla nueva): 400 con el mismo mensaje de la base y no se llama a la base', async () => {
        const res = await post({ physical_count: 470, difference_reason: '' });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ error: MSG_30, expected_cash: 500 });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('motivo corto (4 letras) o de puros espacios: rechazado', async () => {
        expect((await post({ physical_count: 470, difference_reason: 'abcd' })).status).toBe(400);
        expect((await post({ physical_count: 470, difference_reason: '      ' })).status).toBe(400);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('motivo de más de 300 letras: lo rechaza la validación (zod)', async () => {
        const res = await post({ physical_count: 470, difference_reason: 'x'.repeat(301) });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('El motivo de la diferencia es muy largo (máximo 300 letras).');
    });

    it('faltante con motivo: viaja recortado a close_cash_session', async () => {
        const res = await post({ physical_count: 470, difference_reason: '  Cambio mal dado  ' });
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc.mock.calls[0][0]).toBe('close_cash_session');
        expect(argsOf(0)).toMatchObject({ p_cash_session_id: ID, p_counted_cash: 470, p_difference_reason: 'Cambio mal dado' });
    });

    it('sobrante con motivo: pasa', async () => {
        expect((await post({ physical_count: 550, difference_reason: 'Propina entregada en efectivo sin registrar' })).status).toBe(200);
        expect(argsOf(0).p_difference_reason).toBe('Propina entregada en efectivo sin registrar');
    });

    it('si cuadra, el motivo no viaja (la base anterior y la nueva aceptan la llamada)', async () => {
        expect((await post({ physical_count: 500, difference_reason: '' })).status).toBe(200);
        expect(argsOf(0)).not.toHaveProperty('p_difference_reason');
    });

    it('base todavía sin el parámetro (PGRST202): se repite sin él y el cierre pasa', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.close_cash_session(...) in the schema cache' } });
        const res = await post({ physical_count: 470, difference_reason: 'Error al contar' });
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledTimes(2);
        expect(argsOf(0).p_difference_reason).toBe('Error al contar');
        expect(argsOf(1)).not.toHaveProperty('p_difference_reason');
        expect(argsOf(1)).toMatchObject({ p_cash_session_id: ID, p_counted_cash: 470 });
    });

    it('otro error de la base no se repite', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Cash permission denied' } });
        expect((await post({ physical_count: 470, difference_reason: 'Error al contar' })).status).toBe(403);
        expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('la base encuentra una diferencia que la pantalla no veía: 400 con su mensaje', async () => {
        // Entró un cobro mientras se contaba: la ruta aún veía $470, la base ya cuenta $500.
        loadSession.mockResolvedValue({ id: ID, status: 'open', expected_cash: 470 });
        rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: MSG_30 } });
        const res = await post({ physical_count: 470, difference_reason: '' });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe(MSG_30);
    });

    it('pantalla abierta antes de publicar (no manda la llave): decide la base; si pide motivo, se sugiere recargar', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: MSG_30 } });
        const res = await post({ physical_count: 470 });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe(`${MSG_30} Si no ves dónde escribirlo, recarga la página.`);
        // Sin aviso temprano: con la base anterior esa pantalla todavía puede cerrar.
        expect(loadSession).not.toHaveBeenCalled();
        rpc.mockResolvedValueOnce({ data: {}, error: null });
        expect((await post({ physical_count: 470 })).status).toBe(200);
        expect(argsOf(1)).not.toHaveProperty('p_difference_reason');
    });

    it('permisos sin cambios: barbero y consulta no cierran', async () => {
        for (const r of ['barber', 'viewer'] as BusinessRole[]) {
            role = r;
            expect((await post({ physical_count: 500, difference_reason: '' })).status).toBe(403);
        }
        expect(rpc).not.toHaveBeenCalled();
    });
});
