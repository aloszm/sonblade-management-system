import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

/**
 * Administración es solo para dueño y gerencia (y la cuenta de consulta, que solo lee). El middleware todavía no lista esta ruta,
 * así que se protege aquí además de en la API (/api/admin/profit), que es la que decide.
 */
export default async function AdministracionLayout({ children }: { children: React.ReactNode }) {
    const context = await getAuthContext();
    if (!context) redirect('/login');
    // La consulta (viewer) también entra: Finanzas es solo lectura.
    if (!MANAGEMENT_READ_ROLES.includes(context.role)) redirect(context.role === 'barber' ? '/barbero' : '/pos');
    return <>{children}</>;
}
