import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import { ArrowRight, Clock, MapPin, MessageCircle, Navigation, Phone, Scissors as ScissorsIcon } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { CLIENT_LOGO_DARK, CLIENT_LOGO_LIGHT } from '@/lib/brand';
import { formatDuration, formatPrice, initialOf } from '@/lib/booking-ui/format';
import { slotLabel } from '@/lib/booking/rules';
import { groupServices } from '@/lib/services/categories';
import { canBookOnline, type Catalog } from '@/lib/site/catalog';
import { SITE_CONTENT, socialLinks } from '@/lib/site/content';
import { DAY_NAMES_ES, pageHours, type TodayStatus } from '@/lib/site/hours';
import { directionsUrl, telHref, whatsappUrl, type PageLinks } from '@/lib/site/links';
import { Corner, Flourish, Razor, Rule, Scissors, SealRing, Sunburst } from './ornaments';

/*
 * Movimiento (todo en app/globals.css, bloque "Página pública de inicio"): solo CSS, sin JavaScript.
 * gi-enter / gi-stamp / gi-draw → entrada del primer pantallazo; gi-reveal / gi-price → revelado con el
 * desplazamiento donde el navegador lo soporta; gi-shine, gi-barberpole, gi-live → detalles vivos.
 * Con "reducir movimiento" nada se anima y todo se ve completo desde el inicio.
 */

// Botones: esquinas apenas redondeadas y versalitas, como un letrero; ≥ 48px de alto. El relleno
// horizontal lo pone cada uso (px-*), para que nunca choquen dos clases de relleno.
const BTN = 'inline-flex min-h-12 items-center justify-center gap-2.5 rounded-md text-[0.9375rem] font-semibold uppercase tracking-[0.12em] transition-colors';
const PRIMARY = `${BTN} bg-bos-accent text-bos-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_10px_30px_-12px_rgba(201,164,106,.55)] hover:bg-bos-accent-strong`;
const SECONDARY = `${BTN} border border-(--gi-line-strong) text-bos-text hover:border-bos-accent hover:bg-bos-accent-soft`;
const TEXT_LINK = 'gi-underline inline-flex min-h-11 items-center gap-2 font-medium text-bos-accent-text underline decoration-(--gi-line-strong) underline-offset-4 hover:text-bos-text';
const NEW_TAB = <>{' '}<span className="sr-only">(se abre en una pestaña nueva)</span></>;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Retraso de entrada en milisegundos (variable CSS --gi-delay). */
const delay = (ms: number) => ({ '--gi-delay': `${ms}ms` }) as CSSProperties;

function FrameCorners() {
    return (
        <>
            <Corner className="gi-corner gi-corner--tl" />
            <Corner className="gi-corner gi-corner--tr" />
            <Corner className="gi-corner gi-corner--bl" />
            <Corner className="gi-corner gi-corner--br" />
        </>
    );
}

function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
    return (
        <div className="gi-reveal mx-auto max-w-2xl px-4 text-center">
            <p className="gi-caps text-bos-accent-text">{eyebrow}</p>
            <h2 id={id} className="gi-serif mt-3 text-balance text-[2.125rem] font-semibold leading-[1.1] text-bos-text sm:text-5xl">{title}</h2>
            <Flourish className="gi-reveal-x mx-auto mt-5 h-3 w-44 text-(--gi-ornament)" />
            {children && <div className="mt-5 text-base leading-relaxed text-bos-muted sm:text-lg">{children}</div>}
        </div>
    );
}

function PrimaryAction({ bookingOn, booking, whatsapp, className = 'px-6' }: { bookingOn: boolean; booking: string; whatsapp: string | null; className?: string }) {
    if (bookingOn) return <a href={booking} className={`${PRIMARY} gi-shine ${className}`}><ScissorsIcon className="h-5 w-5 shrink-0" aria-hidden="true" />Reservar cita</a>;
    if (!whatsapp) return null;
    return (
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${PRIMARY} gi-shine ${className}`}>
            <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />Agenda por WhatsApp{NEW_TAB}
        </a>
    );
}

/** Poste de barbero pequeño con franjas que suben (CSS). */
function BarberPole() {
    return (
        <span aria-hidden="true" className="flex flex-col items-center">
            <span className="h-2 w-2 rounded-full border border-(--gi-line-strong)" />
            <span className="mt-0.5 h-1.5 w-6 rounded-t-sm border border-(--gi-line-strong)" />
            <span className="gi-barberpole h-14 w-4"><span /></span>
            <span className="h-1.5 w-6 rounded-b-sm border border-(--gi-line-strong)" />
        </span>
    );
}

/** Franja bajo el primer pantallazo: abierto hoy, colonia y teléfono. */
function QuickFacts({ status }: { status: TodayStatus }) {
    const open = status.state === 'open';
    const fact = 'gi-underline mt-0.5 inline-flex min-h-11 items-center text-[0.9375rem] text-bos-text underline decoration-(--gi-line-strong) underline-offset-4';
    return (
        <div className="gi-band border-y border-(--gi-line)">
            <ul className="mx-auto grid max-w-6xl divide-y divide-(--gi-line) px-4 md:grid-cols-3 md:divide-x md:divide-y-0">
                <li className="flex items-start gap-4 py-5 md:px-6">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-bos-accent-text" aria-hidden="true" />
                    <div>
                        <p className="gi-caps flex items-center gap-2 text-bos-accent-text">
                            <span aria-hidden="true" className={`relative inline-block h-2 w-2 rounded-full ${open ? 'gi-live bg-bos-success' : 'bg-bos-control'}`} />
                            {status.label}
                        </p>
                        <p className="mt-1.5 text-[0.9375rem] leading-snug text-bos-text" data-testid="abierto-hoy">{status.text}</p>
                    </div>
                </li>
                <li className="flex items-start gap-4 py-5 md:px-6">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-bos-accent-text" aria-hidden="true" />
                    <div>
                        <p className="gi-caps text-bos-accent-text">Dónde</p>
                        <a href="#ubicacion" className={fact}>Lomas Estrella, {SITE_CONTENT.locality}</a>
                    </div>
                </li>
                <li className="flex items-start gap-4 py-5 md:px-6">
                    <Phone className="mt-0.5 h-5 w-5 shrink-0 text-bos-accent-text" aria-hidden="true" />
                    <div>
                        <p className="gi-caps text-bos-accent-text">Teléfono</p>
                        <a href={telHref()} className={`${fact} tabular-nums`}>{SITE_CONTENT.phone}</a>
                    </div>
                </li>
            </ul>
        </div>
    );
}

/** Página pública de inicio. Componente puro de servidor: recibe el catálogo ya leído y los enlaces ya armados. */
export default function InicioView({ catalog, links, jsonLd, now = new Date() }: { catalog: Catalog; links: PageLinks; jsonLd?: string | null; now?: Date }) {
    const whatsapp = whatsappUrl();
    // Con reservas en línea apagadas se muestra todo el catálogo, pero la acción es WhatsApp y el equipo va sin enlace.
    const bookingOn = canBookOnline(catalog);
    const groups = catalog.state === 'on' ? groupServices(catalog.services) : [];
    const barbers = catalog.state === 'on' ? catalog.barbers : [];
    const socials = socialLinks();
    const { blocks: hourBlocks, status } = pageHours(catalog, now);
    const [addrLine1, addrLine2, ...addrRest] = SITE_CONTENT.address.split(', ');

    return (
        <div className="gi-page min-h-dvh bg-bos-bg text-bos-text">
            {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}
            <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-[calc(var(--bos-banner-h,0px)+0.75rem)] focus:z-50 focus:rounded-md focus:bg-bos-accent focus:px-4 focus:py-3 focus:text-bos-on-accent">Saltar al contenido</a>

            {/* ── Primer pantallazo ─────────────────────────────────────────────────────── */}
            <header className="gi-hero gi-grain relative overflow-hidden">
                <div className="gi-frame" aria-hidden="true"><FrameCorners /></div>
                <div className="absolute right-5 top-5 z-10 md:right-10 md:top-10"><ThemeToggle /></div>
                {/* Herramientas del oficio a los lados, solo en pantallas anchas (en celular no caben sin estorbar). */}
                <div aria-hidden="true" className="gi-enter pointer-events-none absolute inset-y-0 left-0 hidden w-[22%] items-center justify-center lg:flex" style={delay(600)}>
                    <Razor className="w-44 -rotate-[24deg] text-(--gi-ornament) opacity-60" />
                </div>
                <div aria-hidden="true" className="gi-enter pointer-events-none absolute inset-y-0 right-0 hidden w-[22%] items-center justify-center lg:flex" style={delay(700)}>
                    <Scissors className="w-28 rotate-[18deg] text-(--gi-ornament) opacity-60" />
                </div>

                <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 pb-12 pt-14 text-center sm:pb-16 md:pb-24 md:pt-20">
                    <div className="relative flex justify-center">
                        <Sunburst className="gi-sunburst pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 md:h-[52rem] md:w-[52rem]" />
                        <div className="gi-enter-logo">
                            <Image src={CLIENT_LOGO_DARK} alt="" width={1200} height={731} priority sizes="(max-width: 640px) 248px, 400px" className="logo-dark block h-auto w-[248px] sm:w-[340px] md:w-[400px]" />
                            <Image src={CLIENT_LOGO_LIGHT} alt="" width={1200} height={731} sizes="(max-width: 640px) 248px, 400px" className="logo-light h-auto w-[248px] sm:w-[340px] md:w-[400px]" />
                        </div>
                    </div>

                    <p className="mt-6 flex items-center gap-3 text-bos-accent-text md:mt-8">
                        <Rule dir="left" className="gi-draw h-1 w-10 text-(--gi-line-strong) sm:w-16" style={delay(450)} />
                        <span className="gi-stamp inline-flex items-center gap-3" style={delay(350)}>
                            <span aria-hidden="true" className="text-[0.6rem]">◆</span>
                            <span className="gi-caps">Desde {SITE_CONTENT.foundedYear}</span>
                            <span aria-hidden="true" className="text-[0.6rem]">◆</span>
                        </span>
                        <Rule className="gi-draw h-1 w-10 text-(--gi-line-strong) sm:w-16" style={delay(450)} />
                    </p>

                    <h1 className="gi-serif mt-3 text-[2.75rem] font-bold leading-none text-bos-text sm:text-6xl md:mt-4 md:text-7xl">
                        <span className="gi-enter block" style={delay(150)}>{SITE_CONTENT.name}</span>
                        {' '}<span className="sr-only">·</span>{' '}
                        <span className="gi-enter gi-caps mt-3 block font-sans text-[0.8125rem] tracking-[0.42em] text-bos-accent-text md:mt-4" style={delay(300)}>Barber Shop</span>
                    </h1>

                    <p className="gi-enter gi-serif mt-5 max-w-lg text-balance text-xl italic leading-snug text-bos-muted sm:text-2xl md:mt-6" style={delay(450)}>
                        Corte, barba y estilo, como se hace desde el {SITE_CONTENT.foundedYear}.
                    </p>

                    {/* Sin retraso: el botón principal se puede tocar desde el primer cuadro. */}
                    <div className="mt-7 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center md:mt-9">
                        <PrimaryAction bookingOn={bookingOn} booking={links.booking} whatsapp={whatsapp} className="w-full px-6 sm:w-auto" />
                        <a href={telHref()} className={`${SECONDARY} w-full px-6 sm:w-auto`}><Phone className="h-5 w-5 shrink-0" aria-hidden="true" />Llamar</a>
                    </div>
                </div>
            </header>

            <QuickFacts status={status} />

            <main id="contenido" tabIndex={-1} className="outline-none">
                {/* ── Carta de servicios ─────────────────────────────────────────────────── */}
                <section aria-labelledby="servicios" className="gi-grain scroll-mt-12 py-20 md:py-28">
                    <SectionHead id="servicios" eyebrow="La carta" title="Servicios y precios">
                        {groups.length > 0 ? <p>Precios en pesos mexicanos.</p> : null}
                    </SectionHead>

                    <div className="mx-auto mt-12 max-w-5xl px-4 sm:px-6">
                        <div className="gi-paper gi-reveal relative border border-(--gi-line) px-5 py-10 sm:px-10 md:px-14 md:py-14">
                            <div aria-hidden="true" className="pointer-events-none absolute inset-[5px] border border-(--gi-line) opacity-55"><FrameCorners /></div>

                            {groups.length > 0 ? (
                                <div className="relative grid gap-x-16 gap-y-12 md:grid-cols-2 md:gap-y-14">
                                    {groups.map((group, i) => (
                                        <div key={group.category}>
                                            <h3 className="flex items-baseline gap-3">
                                                <span aria-hidden="true" className="gi-serif text-2xl italic text-bos-accent-text">{ROMAN[i] ?? i + 1}.</span>
                                                <span className="gi-caps text-[0.8125rem] text-bos-text">{group.label}</span>
                                                <span aria-hidden="true" className="gi-reveal-x h-px flex-1 origin-left translate-y-[-0.2em] bg-(--gi-line)" />
                                            </h3>
                                            <ul className="mt-6 space-y-6">
                                                {group.items.map((service) => (
                                                    <li key={service.id}>
                                                        <div className="flex gap-3 [align-items:last_baseline]">
                                                            <p className="gi-serif min-w-0 text-[1.1875rem] font-medium leading-snug text-bos-text sm:text-xl">{service.name}</p>
                                                            <span aria-hidden="true" className="gi-leader" />
                                                            <p className={`gi-serif gi-price shrink-0 text-right tabular-nums text-bos-accent-text ${service.variable_price ? 'max-w-[8.5rem] text-base italic leading-tight' : 'text-2xl font-semibold'}`}>
                                                                {formatPrice(service.price, service.variable_price)}
                                                            </p>
                                                        </div>
                                                        <p className="mt-1 text-sm text-bos-muted">
                                                            {formatDuration(service.duration_minutes)}
                                                            {service.description ? ` · ${service.description}` : ''}
                                                        </p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="relative mx-auto max-w-lg text-center" data-testid="sin-servicios">
                                    <Scissors className="mx-auto h-14 w-14 text-(--gi-ornament)" />
                                    <p className="gi-serif mt-5 text-2xl font-semibold text-bos-text">Corte · Barba · Estilo</p>
                                    <p className="mt-4 leading-relaxed text-bos-muted">
                                        Por ahora no podemos mostrar la lista de servicios. Escríbenos o llámanos y con gusto te informamos precios y disponibilidad.
                                    </p>
                                    <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                                        {whatsapp && (
                                            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${SECONDARY} px-6`}>
                                                <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />WhatsApp{NEW_TAB}
                                            </a>
                                        )}
                                        <a href={telHref()} className={`${SECONDARY} whitespace-nowrap px-6 tracking-[0.06em]`}><Phone className="h-5 w-5 shrink-0" aria-hidden="true" />{SITE_CONTENT.phone}</a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* ── Equipo ─────────────────────────────────────────────────────────────── */}
                {barbers.length > 0 && (
                    <section aria-labelledby="equipo" className="gi-band border-y border-(--gi-line) py-20 md:py-28">
                        <SectionHead id="equipo" eyebrow="Quién te atiende" title="Nuestro equipo" />
                        <ul className="mx-auto mt-12 grid max-w-5xl gap-4 px-4 sm:grid-cols-2 sm:gap-6 sm:px-6 lg:grid-cols-3">
                            {barbers.map((barber) => (
                                <li key={barber.id} className="gi-reveal flex items-center gap-5 border border-(--gi-line) bg-bos-bg p-5 sm:flex-col sm:rounded-t-[12rem] sm:px-6 sm:pb-7 sm:pt-10 sm:text-center">
                                    <div aria-hidden="true" className="relative h-20 w-20 shrink-0 sm:h-32 sm:w-32">
                                        <SealRing className="absolute inset-0 h-full w-full text-(--gi-ornament)" ticks={40} />
                                        <span className="gi-serif absolute inset-0 grid place-items-center pb-0.5 text-[2.125rem] italic text-bos-accent-text sm:text-5xl">{initialOf(barber.name)}</span>
                                    </div>
                                    <div className="min-w-0 sm:flex sm:flex-col sm:items-center">
                                        <p className="gi-serif text-2xl font-semibold leading-tight text-bos-text sm:mt-2 sm:text-[1.75rem]">{barber.name}</p>
                                        {barber.title && <p className="gi-caps mt-1.5 text-[0.6875rem] text-bos-accent-text sm:mt-2">{barber.title}</p>}
                                        <Razor className="mt-3 hidden h-4 w-20 text-(--gi-ornament) sm:block" />
                                        {bookingOn && (
                                            <a href={links.barber(barber.name)} className={`${TEXT_LINK} sm:mt-2`}>
                                                Reservar con {barber.name}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                                            </a>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* ── Fotos (solo si el dueño las aporta en lib/site/content.ts) ──────────── */}
                {SITE_CONTENT.photos.length > 0 && (
                    <section aria-labelledby="fotos" className="py-20 md:py-28">
                        <SectionHead id="fotos" eyebrow="La barbería" title="El local" />
                        <ul className="mx-auto mt-12 grid max-w-6xl grid-cols-2 gap-3 px-4 sm:gap-5 sm:px-6 md:grid-cols-3">
                            {SITE_CONTENT.photos.map((photo, i) => (
                                <li key={photo.src} className={`gi-reveal relative overflow-hidden border border-(--gi-line) p-1.5 ${i === 0 ? 'col-span-2 aspect-[3/2] md:row-span-2 md:aspect-auto' : 'aspect-[4/5]'}`}>
                                    <div className="relative h-full w-full overflow-hidden">
                                        <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 768px) 100vw, 400px" className="object-cover" />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {/* ── Horario y ubicación ────────────────────────────────────────────────── */}
                <div className="gi-grain py-20 md:py-28">
                    <div className="mx-auto grid max-w-5xl gap-20 px-4 sm:px-6 lg:grid-cols-2 lg:gap-12">
                        <section aria-labelledby="horario" className="scroll-mt-12">
                            <SectionHead id="horario" eyebrow="Cuándo venir" title="Horario" />
                            <dl className="mt-10 space-y-4">
                                {hourBlocks.map((h) => {
                                    const isToday = h.days.includes(status.day);
                                    return (
                                        <div key={h.label} className={`gi-reveal relative border px-5 py-5 sm:px-6 ${isToday ? 'border-(--gi-line-strong) bg-bos-accent-soft' : 'gi-paper border-(--gi-line)'}`}>
                                            <dt className="flex items-center justify-between gap-3">
                                                <span className="gi-serif text-[1.375rem] font-semibold text-bos-text">{h.label}</span>
                                                {isToday && <span className="gi-caps rounded-sm bg-bos-accent px-2.5 py-1 text-[0.6875rem] text-bos-on-accent">Hoy<span className="sr-only">, {DAY_NAMES_ES[status.day]}</span></span>}
                                            </dt>
                                            <dd className="mt-1.5 text-lg tabular-nums text-bos-text">{slotLabel(h.open)} a {slotLabel(h.close)}</dd>
                                            <dd aria-hidden="true" className="mt-4 flex gap-1.5">
                                                {DAY_LETTERS.map((letter, day) => {
                                                    const inBlock = h.days.includes(day);
                                                    const today = day === status.day && inBlock;
                                                    return (
                                                        <span key={day} className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${today ? 'bg-bos-accent text-bos-on-accent' : inBlock ? 'border border-(--gi-line-strong) text-bos-text' : 'font-normal text-bos-muted'}`}>{letter}</span>
                                                    );
                                                })}
                                            </dd>
                                        </div>
                                    );
                                })}
                            </dl>
                        </section>

                        <section id="ubicacion" aria-labelledby="ubicacion-titulo" className="scroll-mt-12">
                            <SectionHead id="ubicacion-titulo" eyebrow="Cómo llegar" title="Dónde estamos" />
                            <div className="gi-paper gi-reveal relative mt-10 border border-(--gi-line) px-6 py-8 sm:px-8">
                                <MapPin aria-hidden="true" className="absolute right-6 top-8 h-8 w-8 text-(--gi-ornament)" />
                                <address className="not-italic">
                                    <span className="gi-serif block pr-12 text-[2.5rem] font-semibold leading-none text-bos-text">{addrLine1}<span className="sr-only">,</span></span>{' '}
                                    <span className="mt-3 block text-lg text-bos-text">{addrLine2}<span className="sr-only">,</span></span>{' '}
                                    <span className="mt-1 block text-bos-muted">{addrRest.join(', ')}</span>
                                </address>
                                <div className="mt-7 flex flex-col gap-3">
                                    <a href={directionsUrl()} target="_blank" rel="noopener noreferrer" className={`${PRIMARY} px-6`}>
                                        <Navigation className="h-5 w-5 shrink-0" aria-hidden="true" />Cómo llegar{NEW_TAB}
                                    </a>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <a href={telHref()} className={`${SECONDARY} whitespace-nowrap px-4 tracking-[0.04em]`}><Phone className="h-5 w-5 shrink-0" aria-hidden="true" />{SITE_CONTENT.phone}</a>
                                        {whatsapp && (
                                            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${SECONDARY} px-4`}>
                                                <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />WhatsApp{NEW_TAB}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                {/* ── Cierre ─────────────────────────────────────────────────────────────── */}
                <section aria-labelledby="cierre" className="gi-hero gi-grain relative overflow-hidden border-t border-(--gi-line)">
                    <div className="gi-pole" aria-hidden="true" />
                    <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center md:py-28">
                        <div aria-hidden="true" className="gi-reveal flex items-center gap-7 text-(--gi-ornament)">
                            <BarberPole />
                            <div className="relative h-32 w-32">
                                <SealRing className="absolute inset-0 h-full w-full" />
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-bos-accent-text">
                                    <span className="gi-caps text-[0.625rem] tracking-[0.3em]">Desde</span>
                                    <span className="gi-serif text-[2rem] font-bold leading-none">{SITE_CONTENT.foundedYear}</span>
                                </div>
                            </div>
                            <BarberPole />
                        </div>
                        <h2 id="cierre" className="gi-serif gi-reveal mt-8 text-balance text-[2.25rem] font-semibold leading-[1.1] text-bos-text sm:text-5xl">Te esperamos en la silla</h2>
                        <p className="gi-reveal mt-4 max-w-md text-balance text-lg leading-relaxed text-bos-muted">{SITE_CONTENT.street}, {SITE_CONTENT.locality}. {status.text}</p>
                        <div className="mt-9 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                            <PrimaryAction bookingOn={bookingOn} booking={links.booking} whatsapp={whatsapp} className="w-full px-6 sm:w-auto" />
                            <a href={telHref()} className={`${SECONDARY} w-full px-6 sm:w-auto`}><Phone className="h-5 w-5 shrink-0" aria-hidden="true" />Llamar</a>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="gi-band border-t border-(--gi-line)">
                <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-4 py-12 text-center text-sm text-bos-muted sm:px-6">
                    <Image src={CLIENT_LOGO_DARK} alt="" width={1200} height={731} sizes="132px" className="logo-dark block h-auto w-[132px]" />
                    <Image src={CLIENT_LOGO_LIGHT} alt="" width={1200} height={731} sizes="132px" className="logo-light h-auto w-[132px]" />
                    <p className="text-balance">{SITE_CONTENT.address}</p>
                    {socials.length > 0 && (
                        <ul className="flex flex-wrap justify-center gap-x-6">
                            {socials.map((s) => <li key={s.label}><a href={s.href} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>{s.label}{NEW_TAB}</a></li>)}
                        </ul>
                    )}
                    <nav aria-label="Enlaces del pie" className="flex flex-wrap justify-center gap-x-6">
                        <a href={links.privacy} className={TEXT_LINK}>Aviso de privacidad</a>
                        <a href={links.team} className={TEXT_LINK}>Acceso del equipo</a>
                    </nav>
                    <Flourish className="h-3 w-32 text-(--gi-ornament)" />
                    <p>© {SITE_CONTENT.name} Barber Shop · Desde {SITE_CONTENT.foundedYear}</p>
                </div>
                <div className="gi-dock-spacer" aria-hidden="true" />
            </footer>

            {/* Barra inferior de celular (ver .gi-dock en globals.css). */}
            <nav aria-label="Acciones rápidas" className="gi-dock">
                <div className="mx-auto flex max-w-md gap-2.5">
                    <PrimaryAction bookingOn={bookingOn} booking={links.booking} whatsapp={whatsapp} className="flex-1 px-4" />
                    <a href={telHref()} aria-label="Llamar" className={`${SECONDARY} w-14 shrink-0`}><Phone className="h-5 w-5" aria-hidden="true" /></a>
                </div>
            </nav>
        </div>
    );
}
