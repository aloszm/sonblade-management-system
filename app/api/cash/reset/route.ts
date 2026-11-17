import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

// El reinicio de caja de la versión 1 borraba registros. En la versión 2 no existe:
// se reemplaza por el cierre de caja (POST /api/cash/session/close). RB-13.
const NOT_AVAILABLE = {
    error: 'El reinicio de caja ya no existe: se reemplazó por el cierre de caja.',
};

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
        await requireAuthContext(MANAGEMENT_READ_ROLES);
        return Response.json(NOT_AVAILABLE, { status: 501, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
