import Skeleton from '@/components/ui/Skeleton';

/** Mientras llega una pantalla: esqueleto con el mismo ancho que el contenido. */
export default function Loading() {
    return (
        <div role="status" aria-busy="true" className="mx-auto max-w-7xl space-y-6">
            <span className="sr-only">Cargando…</span>
            <Skeleton className="h-9 w-48" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-64 rounded-xl" />
        </div>
    );
}
