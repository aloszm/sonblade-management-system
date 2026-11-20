import { redirect } from 'next/navigation';
import { Playfair_Display } from 'next/font/google';
import { getAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

// Números grandes en la serif de letrero de la marca (servida por Next desde el propio dominio).
const serif = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-gi-serif', display: 'swap' });

/**
 * Punto de equilibrio: cuenta principal, gerencia y consulta (solo lectura). El middleware ya lo protege
 * (lib/auth/route-access.ts); aquí se repite como en Finanzas, y la API y la base vuelven a decidir.
 */
export default async function PuntoDeEquilibrioLayout({ children }: { children: React.ReactNode }) {
    const context = await getAuthContext();
    if (!context) redirect('/login');
    if (!MANAGEMENT_READ_ROLES.includes(context.role)) redirect(context.role === 'barber' ? '/barbero' : '/pos');
    return <div className={serif.variable}>{children}</div>;
}
