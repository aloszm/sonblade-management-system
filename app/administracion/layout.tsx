import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/**
 * Administración es solo para dueño y gerencia. El middleware todavía no lista esta ruta,
 * así que se protege aquí además de en la API (/api/admin/profit), que es la que decide.
 */
export default async function AdministracionLayout({ children }: { children: React.ReactNode }) {
    const context = await getAuthContext();
    if (!context) redirect('/login');
    if (context.role !== 'owner' && context.role !== 'admin') redirect(context.role === 'barber' ? '/barbero' : '/pos');
    return <>{children}</>;
}
