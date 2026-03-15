import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import Providers from '@/components/Providers';

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
    title: 'Sonblade — Gestión de Barbería',
    description: 'ERP para gestión de barberías. Administra citas, POS, inventario, caja y equipo.',
    manifest: '/manifest.json',
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Sonblade',
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
                <Script id="register-sw" strategy="afterInteractive">
                    {`
                         if ('serviceWorker' in navigator) {
                             window.addEventListener('load', function() {
                                 navigator.serviceWorker.register('/sw.js').catch(function(err) {
                                     console.error('ServiceWorker registration failed: ', err);
                                 });
                             });
                         }
                     `}
                </Script>
            </body>
        </html>
    );
}
