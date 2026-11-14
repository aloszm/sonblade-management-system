import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

// Editar y dar de baja un producto se migra en la siguiente fase (precio con historial,
// ajuste de existencias con adjust_inventory_stock y baja por desactivación, nunca borrado).
const NOT_AVAILABLE = {
    error: 'Editar o dar de baja productos todavía no está disponible. Los ajustes de existencias se harán con movimientos de inventario.',
};

export async function PATCH() {
    try {
        await requireAuthContext(['owner', 'admin']);
        return Response.json(NOT_AVAILABLE, { status: 501, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}

export async function DELETE() {
    try {
        await requireAuthContext(['owner', 'admin']);
        return Response.json(NOT_AVAILABLE, { status: 501, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
