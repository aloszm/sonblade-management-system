'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MotionConfig, motion } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import MobileNav from '@/components/MobileNav';
import type { Site } from '@/lib/hosts';

/** `site` (por dominio, ver lib/hosts.ts): en la página pública y en citas nunca hay menú ni encabezado internos. */
export default function AppShell({ children, site = 'all' }: { children: React.ReactNode; site?: Site }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default closed on mobile
    const pathname = usePathname();

    // El cajón se cierra al cambiar de pantalla.
    useEffect(() => { setIsSidebarOpen(false); }, [pathname]);

    // En celular el cajón cerrado queda inerte (sin foco ni lector de pantalla); en escritorio el menú siempre está a la vista.
    const [isDesktop, setIsDesktop] = useState(false);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia('(min-width: 768px)');
        const sync = () => setIsDesktop(query.matches);
        sync();
        query.addEventListener('change', sync);
        return () => query.removeEventListener('change', sync);
    }, []);
    const drawerHidden = !isDesktop && !isSidebarOpen;

    // Páginas públicas (clientes sin cuenta): sin menú ni encabezado internos.
    const isPublic = site === 'public' || site === 'booking' || pathname === '/login' || pathname === '/onboarding'
        || pathname === '/privacidad' || pathname === '/inicio' || pathname === '/reservar' || pathname.startsWith('/reservar/');
    if (isPublic) return <>{children}</>;

    return (
        <MotionConfig reducedMotion="user">
        <div className="flex h-[calc(100dvh-var(--bos-banner-h,0px))] overflow-hidden bg-bos-bg flex-col md:flex-row print:block print:h-auto print:overflow-visible">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div inert={drawerHidden} aria-hidden={drawerHidden || undefined} className={`print:hidden fixed bottom-0 top-[var(--bos-banner-h,0px)] left-0 z-50 transform md:top-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out motion-reduce:transition-none`}>
                <Sidebar isOpen={true} />
            </div>

            <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible">
                <div className="print:hidden"><Header toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} /></div>

                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8 relative bg-bos-bg text-bos-text print:overflow-visible print:bg-white print:p-0">
                    {/* Entrada muy breve, sin esperar la salida de la pantalla anterior y sin desenfoque. */}
                    <motion.div
                        key={pathname}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.12, ease: 'easeOut' }}
                        className="h-full"
                    >
                        {children}
                    </motion.div>
                </main>

                <div className="print:hidden"><MobileNav /></div>
            </div>
        </div>
        </MotionConfig>
    );
}

