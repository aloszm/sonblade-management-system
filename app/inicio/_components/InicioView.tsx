import Image from 'next/image';
import { Clock, MapPin, MessageCircle, Phone, Scissors } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { CLIENT_LOGO_DARK, CLIENT_LOGO_LIGHT } from '@/lib/brand';
import { formatDuration, formatPrice, initialOf } from '@/lib/booking-ui/format';
import { slotLabel } from '@/lib/booking/rules';
import { groupServices } from '@/lib/services/categories';
import type { Catalog } from '@/lib/site/catalog';
import { SITE_CONTENT, socialLinks } from '@/lib/site/content';
import { directionsUrl, telHref, whatsappUrl, type PageLinks } from '@/lib/site/links';

const PRIMARY = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-bos-accent px-6 text-base font-semibold text-bos-on-accent transition-colors hover:bg-bos-accent-strong sm:w-auto';
const SECONDARY = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-bos-control px-6 text-base font-medium text-bos-text transition-colors hover:bg-bos-raised sm:w-auto';
const LINK = 'inline-flex min-h-11 items-center gap-2 font-medium text-bos-accent-text underline underline-offset-2 hover:text-bos-text';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <section aria-labelledby={id} className="mt-12 scroll-mt-6">
            <h2 id={id} className="font-display text-2xl font-semibold text-bos-text">{title}</h2>
            <div className="mt-4">{children}</div>
        </section>
    );
}

/** Página pública de inicio. Componente puro de servidor: recibe el catálogo ya leído y los enlaces ya armados. */
export default function InicioView({ catalog, links, jsonLd }: { catalog: Catalog; links: PageLinks; jsonLd?: string | null }) {
    const whatsapp = whatsappUrl();
    const bookingOn = catalog.state === 'on';
    const groups = catalog.state === 'on' ? groupServices(catalog.services) : [];
    const barbers = catalog.state === 'on' ? catalog.barbers : [];
    const socials = socialLinks();

    return (
        <div className="min-h-dvh bg-bos-bg text-bos-text">
            {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
            <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-bos-accent focus:px-4 focus:py-3 focus:text-bos-on-accent">Saltar al contenido</a>
            <div className="mx-auto w-full max-w-[880px] px-4 pb-10 sm:px-6">
                <div className="flex justify-end pt-3"><ThemeToggle /></div>

                <header className="flex flex-col items-center pt-2 text-center">
                    <Image src={CLIENT_LOGO_DARK} alt="" width={1200} height={731} priority sizes="(max-width: 640px) 240px, 300px" className="logo-dark block h-auto w-[240px] sm:w-[300px]" />
                    <Image src={CLIENT_LOGO_LIGHT} alt="" width={1200} height={731} sizes="(max-width: 640px) 240px, 300px" className="logo-light h-auto w-[240px] sm:w-[300px]" />
                    <h1 className="font-display mt-4 text-3xl font-semibold leading-tight text-bos-text sm:text-4xl">{SITE_CONTENT.fullName}</h1>
                    <p className="mt-1 text-base font-medium tracking-wide text-bos-accent-text">Desde {SITE_CONTENT.foundedYear}</p>
                    <p className="mt-3 max-w-md text-bos-muted">{SITE_CONTENT.street}, {SITE_CONTENT.locality}, {SITE_CONTENT.region}.</p>
                    <div className="mt-6 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                        {bookingOn ? (
                            <a href={links.booking} className={PRIMARY}><Scissors className="h-5 w-5" aria-hidden="true" />Reservar cita</a>
                        ) : whatsapp ? (
                            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={PRIMARY}>
                                <MessageCircle className="h-5 w-5" aria-hidden="true" />Agenda por WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span>
                            </a>
                        ) : null}
                        <a href={telHref()} className={SECONDARY}><Phone className="h-5 w-5" aria-hidden="true" />Llamar</a>
                    </div>
                </header>

                <main id="contenido" tabIndex={-1} className="outline-none">
                    {groups.length > 0 && (
                        <Section id="servicios" title="Servicios y precios">
                            <div className="grid gap-4 md:grid-cols-2">
                                {groups.map((group) => (
                                    <div key={group.category} className="rounded-2xl border border-bos-border bg-bos-surface p-4">
                                        <h3 className="text-sm font-semibold uppercase tracking-wide text-bos-accent-text">{group.label}</h3>
                                        <ul className="mt-2 divide-y divide-bos-border">
                                            {group.items.map((service) => (
                                                <li key={service.id} className="flex items-start justify-between gap-4 py-3">
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-bos-text">{service.name}</p>
                                                        <p className="text-sm text-bos-muted">
                                                            {formatDuration(service.duration_minutes)}
                                                            {service.description ? ` · ${service.description}` : ''}
                                                        </p>
                                                    </div>
                                                    <p className={`shrink-0 text-right font-semibold tabular-nums text-bos-text ${service.variable_price ? 'max-w-[9rem] text-sm' : ''}`}>
                                                        {formatPrice(service.price, service.variable_price)}
                                                    </p>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}
                    {!bookingOn && (
                        <Section id="servicios" title="Servicios y precios">
                            <p className="rounded-2xl border border-bos-border bg-bos-surface p-4 text-bos-muted" data-testid="sin-servicios">
                                Por ahora no podemos mostrar la lista de servicios. Escríbenos o llámanos y con gusto te informamos precios y disponibilidad.
                            </p>
                        </Section>
                    )}

                    {barbers.length > 0 && (
                        <Section id="equipo" title="Nuestro equipo">
                            <ul className="grid gap-3 sm:grid-cols-2">
                                {barbers.map((barber) => (
                                    <li key={barber.id} className="flex items-center gap-3 rounded-2xl border border-bos-border bg-bos-surface p-4">
                                        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bos-accent-soft text-lg font-semibold text-bos-accent-text">{initialOf(barber.name)}</span>
                                        <div className="min-w-0">
                                            <p className="font-medium text-bos-text">{barber.name}</p>
                                            <a href={links.barber(barber.name)} className={LINK}>Reservar con {barber.name}</a>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    {SITE_CONTENT.photos.length > 0 && (
                        <Section id="fotos" title="El local">
                            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                {SITE_CONTENT.photos.map((photo) => (
                                    <li key={photo.src} className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-bos-border">
                                        <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 768px) 50vw, 280px" className="object-cover" />
                                    </li>
                                ))}
                            </ul>
                        </Section>
                    )}

                    <Section id="horario" title="Horario">
                        <div className="rounded-2xl border border-bos-border bg-bos-surface p-4">
                            <dl className="divide-y divide-bos-border">
                                {SITE_CONTENT.hours.map((h) => (
                                    <div key={h.label} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3 first:pt-0 last:pb-0">
                                        <dt className="flex items-center gap-2 font-medium text-bos-text"><Clock className="h-4 w-4 text-bos-accent-text" aria-hidden="true" />{h.label}</dt>
                                        <dd className="tabular-nums text-bos-muted">{slotLabel(h.open)} a {slotLabel(h.close)}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    </Section>

                    <Section id="ubicacion" title="Dónde estamos">
                        <div className="rounded-2xl border border-bos-border bg-bos-surface p-4">
                            <p className="flex items-start gap-2 text-bos-text"><MapPin className="mt-1 h-4 w-4 shrink-0 text-bos-accent-text" aria-hidden="true" /><span>{SITE_CONTENT.address}</span></p>
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                                <a href={directionsUrl()} target="_blank" rel="noopener noreferrer" className={SECONDARY}>
                                    <MapPin className="h-5 w-5" aria-hidden="true" />Cómo llegar<span className="sr-only"> (se abre en una pestaña nueva)</span>
                                </a>
                                <a href={telHref()} className={SECONDARY}><Phone className="h-5 w-5" aria-hidden="true" />{SITE_CONTENT.phone}</a>
                                {bookingOn && whatsapp && (
                                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={SECONDARY}>
                                        <MessageCircle className="h-5 w-5" aria-hidden="true" />WhatsApp<span className="sr-only"> (se abre en una pestaña nueva)</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    </Section>
                </main>

                <footer className="mt-12 border-t border-bos-border pt-6 text-sm text-bos-muted">
                    {socials.length > 0 && (
                        <ul className="mb-3 flex flex-wrap gap-x-4">
                            {socials.map((s) => <li key={s.label}><a href={s.href} target="_blank" rel="noopener noreferrer" className={LINK}>{s.label}<span className="sr-only"> (se abre en una pestaña nueva)</span></a></li>)}
                        </ul>
                    )}
                    <nav aria-label="Enlaces del pie" className="flex flex-wrap gap-x-5">
                        <a href={links.privacy} className={LINK}>Aviso de privacidad</a>
                        <a href={links.team} className={LINK}>Acceso del equipo</a>
                    </nav>
                    <p className="mt-2">© {SITE_CONTENT.name} Barber Shop · Desde {SITE_CONTENT.foundedYear}</p>
                </footer>
            </div>
        </div>
    );
}
