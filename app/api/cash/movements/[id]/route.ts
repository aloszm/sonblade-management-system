import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

// Los movimientos de caja no se borran (RB-13): un error se corrige con un ajuste
// o una anulación trazable. Esta ruta se mantiene solo para responder 501.
export async function DELETE() {
    try {
        await requireAuthContext(['owner', 'admin']);
        return Response.json(
            { error: 'Los movimientos de caja no se pueden borrar. Registra un ajuste o una anulación.' },
            { status: 501, headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        return authErrorResponse(error);
    }
}
