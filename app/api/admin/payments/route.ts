import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

// El pago de comisiones de la versión 1 registraba un monto libre. En la versión 2 se paga
// desde Liquidaciones: el servidor calcula el total, lo reparte en efectivo/transferencia,
// descuenta la caja y genera el recibo con folio (POST /api/settlements).
const NOT_AVAILABLE = { error: 'El pago de comisiones se hace desde Liquidaciones.' };

export async function POST() {
    try {
        await requireAuthContext(['owner', 'admin']);
        return Response.json(NOT_AVAILABLE, { status: 501, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}

export async function GET() {
    try {
        await requireAuthContext(['owner', 'admin']);
        return Response.json(NOT_AVAILABLE, { status: 501, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
