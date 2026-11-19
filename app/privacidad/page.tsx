import Link from 'next/link';
import type { Metadata } from 'next';
import BrandLogo from '@/components/BrandLogo';
import Card from '@/components/ui/Card';
import { PRIVACY_NOTICE_UPDATED, PRIVACY_NOTICE_VERSION, PRIVACY_RESPONSIBLE, PRIVACY_SECTIONS } from '@/lib/booking-ui/privacy';

export const metadata: Metadata = {
    title: 'Aviso de privacidad · Gallo 4:20',
    description: 'Aviso de privacidad integral de Gallo 4:20 Barber Shop.',
    robots: { index: true, follow: true },
};

// El texto viene de lib/booking-ui/privacy.ts, que es espejo de docs/legal/aviso-de-privacidad.md (sección A).
export default function PrivacidadPage() {
    return (
        <div className="min-h-dvh bg-bos-bg text-bos-text">
            <main className="mx-auto w-full max-w-[640px] px-4 pb-12 pt-6">
                <div className="flex items-center gap-3">
                    <BrandLogo className="h-14 w-14 shrink-0" />
                    <p className="text-sm text-bos-muted">{PRIVACY_RESPONSIBLE}</p>
                </div>
                <h1 className="font-display mt-5 text-3xl font-semibold text-bos-text">Aviso de privacidad</h1>
                <p className="mt-1 text-sm text-bos-muted">Versión {PRIVACY_NOTICE_VERSION} · Última actualización: {PRIVACY_NOTICE_UPDATED}</p>
                <div className="mt-6 space-y-4">
                    {PRIVACY_SECTIONS.map((s) => (
                        <Card as="section" key={s.title}>
                            <h2 className="text-base font-semibold text-bos-accent-text">{s.title}</h2>
                            <div className="mt-2 space-y-2 break-words text-[15px] leading-relaxed text-bos-text">
                                {s.paragraphs.map((p) => <p key={p}>{p}</p>)}
                                {s.items && <ul className="list-disc space-y-1 pl-5">{s.items.map((i) => <li key={i}>{i}</li>)}</ul>}
                            </div>
                        </Card>
                    ))}
                </div>
                <Link href="/reservar" className="mt-8 inline-flex min-h-11 items-center text-sm font-medium text-bos-accent-text underline underline-offset-2">Volver a reservar</Link>
            </main>
        </div>
    );
}
