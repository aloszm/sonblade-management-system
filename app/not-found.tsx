import Link from 'next/link';
import EmptyState from '@/components/ui/EmptyState';

/** Ruta que no existe. */
export default function NotFound() {
    return (
        <div className="mx-auto max-w-lg py-10">
            <EmptyState
                title="No encontramos esta página"
                description="Puede que el enlace esté mal escrito o que la página ya no exista."
                action={<Link href="/" className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-bos-accent px-5 text-[15px] font-bold text-bos-on-accent hover:bg-bos-accent-strong">Ir al inicio</Link>}
            />
        </div>
    );
}
