import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-inter',
});

export const metadata: Metadata = {
    title: 'Sonblade — Gestión de Barbería',
    description: 'ERP para gestión de barberías. Administra citas, POS, inventario, caja y equipo.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body className={`${inter.variable} font-sans bg-gray-50 text-slate-800 antialiased`}>
                <AppShell>{children}</AppShell>
            </body>
        </html>
    );
}
