import Link from 'next/link';
import type { Metadata } from 'next';
import BrandLogo from '@/components/BrandLogo';
import { PRIVACY_NOTICE_VERSION, PRIVACY_SECTIONS } from '@/lib/booking-ui/privacy';

export const metadata: Metadata = {
    title: 'Aviso de privacidad · Gallo 4:20',
    description: 'Aviso de privacidad simplificado de Gallo 4:20.',
    robots: { index: true, follow: true },
};

// BORRADOR: el texto viene de docs/legal/aviso-de-privacidad.md (sección B) y está pendiente de
// revisión por un abogado. No agregar afirmaciones legales aquí sin actualizar ese documento primero.
export default function PrivacidadPage() {
    return (
        <div className="min-h-dvh bg-bos-bg text-bos-text">
            <main className="mx-auto w-full max-w-[560px] px-4 pb-12 pt-6">
                <div className="flex items-center gap-3">
                    <BrandLogo className="h-14 w-14 shrink-0" />
                    <p className="text-sm text-bos-muted">Gallo 4:20</p>
                </div>
                <h1 className="font-display mt-5 text-3xl font-semibold text-bos-text">Aviso de privacidad</h1>
                <p className="mt-1 text-sm text-bos-muted">Versión {PRIVACY_NOTICE_VERSION}</p>
                <div className="mt-6 space-y-5">
                    {PRIVACY_SECTIONS.map((s) => (
                        <section key={s.title} className="rounded-2xl border border-bos-border bg-bos-surface p-4">
                            <h2 className="text-base font-semibold text-bos-accent-text">{s.title}</h2>
                            <p className="mt-1 text-bos-text">{s.body}</p>
                        </section>
                    ))}
                </div>
                <Link href="/reservar" className="mt-8 inline-flex min-h-11 items-center text-sm font-medium text-bos-accent-text underline underline-offset-2">Volver a reservar</Link>
            </main>
        </div>
    );
}
