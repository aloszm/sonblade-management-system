import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import Providers from '@/components/Providers';
import PracticeBanner from '@/components/PracticeBanner';
import { isPracticeMode, PRACTICE_TITLE_PREFIX, withPracticeTitle } from '@/lib/app-mode';
import { APP_DESCRIPTION, APP_TITLE, CLIENT_NAME } from '@/lib/brand';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});


// Se ejecuta antes de pintar para que no haya un destello con el modo equivocado.
// Oscuro por omisión; si la persona eligió claro en este dispositivo, se respeta.
const THEME_SCRIPT = `try{var t=localStorage.getItem('barberos-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#0A0A0B',
};

export const metadata: Metadata = {
    // En práctica la pestaña lleva "PRÁCTICA · " también en las pantallas que ponen su propio título.
    title: { default: withPracticeTitle(APP_TITLE), template: `${isPracticeMode() ? PRACTICE_TITLE_PREFIX : ''}%s` },
    description: APP_DESCRIPTION,
    manifest: '/manifest.json',
    icons: {
        icon: [
            { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
            { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        apple: '/icons/apple-touch-icon.png',
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: CLIENT_NAME,
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" data-theme="dark" data-app-mode={isPracticeMode() ? 'practice' : undefined} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            </head>
            <body className={`${inter.variable} font-sans bg-bos-bg text-bos-text antialiased`}>
                <PracticeBanner />
                <Providers>
                    <AppShell>{children}</AppShell>
                </Providers>
            </body>
        </html>
    );
}
