import type { Metadata } from 'next';
import { Playfair_Display } from 'next/font/google';
import { headers } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { withPracticeTitle } from '@/lib/app-mode';
import { siteFromHost, siteOrigin } from '@/lib/hosts';
import { canBookOnline, loadCatalog, loadPublicCatalog } from '@/lib/site/catalog';
import { SITE_CONTENT } from '@/lib/site/content';
import { buildLocalBusinessJsonLd, jsonLdScript } from '@/lib/site/jsonld';
import { pageLinks } from '@/lib/site/links';
import InicioView from './_components/InicioView';

// Serif de letrero para los titulares. next/font la descarga AL COMPILAR y la sirve desde este mismo
// dominio (/_next/static/media), así que cumple la CSP (font-src 'self'); el navegador nunca va a Google.
const serif = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-gi-serif', display: 'swap' });

const TITLE = `${SITE_CONTENT.fullName} · Iztapalapa, CDMX`;
const DESCRIPTION = `${SITE_CONTENT.fullName} en Lomas Estrella, Iztapalapa (CDMX), desde el año ${SITE_CONTENT.foundedYear}. Servicios, precios, horario y cómo llegar.`;

// Catálogo público (servicios, equipo y horario), independiente de que las reservas en línea estén encendidas.
// Cambia poco: se guarda 5 minutos para que la página de inicio no consulte la base en cada visita.
const cachedCatalog = unstable_cache(loadPublicCatalog, ['public-catalog'], { revalidate: 300 });

export async function generateMetadata(): Promise<Metadata> {
    const site = siteFromHost((await headers()).get('host'));
    const origin = siteOrigin('public');
    const isPublicSite = site === 'public';
    return {
        title: { absolute: withPracticeTitle(TITLE) },
        description: DESCRIPTION,
        ...(isPublicSite && origin ? { metadataBase: new URL(origin), alternates: { canonical: '/' } } : {}),
        // Solo el sitio público real se indexa; práctica, vistas previas y localhost no.
        robots: isPublicSite ? { index: true, follow: true } : { index: false, follow: false },
        openGraph: { type: 'website', locale: 'es_MX', siteName: SITE_CONTENT.fullName, title: TITLE, description: DESCRIPTION, ...(isPublicSite && origin ? { url: '/' } : {}) },
    };
}

export default async function InicioPage() {
    const site = siteFromHost((await headers()).get('host'));
    const catalog = await loadCatalog(cachedCatalog);
    const links = pageLinks(site);
    const jsonLd = site === 'public'
        ? jsonLdScript(buildLocalBusinessJsonLd({ origin: siteOrigin('public'), bookingUrl: canBookOnline(catalog) ? links.booking : null }))
        : null;
    return <div className={serif.variable}><InicioView catalog={catalog} links={links} jsonLd={jsonLd} now={new Date()} /></div>;
}
