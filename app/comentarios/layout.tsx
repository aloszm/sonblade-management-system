import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/context';
import { canWriteFeedback } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Comentarios' };

/**
 * Comentarios y sugerencias: entran TODOS los puestos (consulta incluida). El middleware ya pide sesión y PIN
 * definitivo; aquí se repite la regla de lib/auth/roles.ts y la base vuelve a decidir qué ve cada quien.
 */
export default async function ComentariosLayout({ children }: { children: React.ReactNode }) {
    const context = await getAuthContext();
    if (!context) redirect('/login');
    if (!canWriteFeedback(context.role)) redirect('/');
    return <>{children}</>;
}
