import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import Providers from '@/components/Providers';
import { APP_DESCRIPTION, APP_TITLE, CLIENT_NAME } from '@/lib/brand';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: '#000000',
};

export const metadata: Metadata = {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    manifest: '/manifest.json',
    icons: {
        icon: [
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
        <html lang="es">
            <body className={`${inter.variable} font-sans bg-gray-50 text-slate-800 antialiased`}>
                <Providers>
                    <AppShell>{children}</AppShell>
                </Providers>
            </body>
        </html>
    );
}
