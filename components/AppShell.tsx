'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import MobileNav from '@/components/MobileNav';

const REDESIGNED = ['/pos'];

export default function AppShell({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default closed on mobile
    const pathname = usePathname();

    if (pathname === '/login' || pathname === '/onboarding') return <>{children}</>;

    // Pantallas ya pasadas al diseño nuevo (colores centrales, modo oscuro y claro). Las demás
    // conservan su fondo claro original hasta que se migren, para que su texto siga legible.
    const redesigned = REDESIGNED.some((path) => pathname === path || pathname.startsWith(`${path}/`));

    return (
        <div className="flex h-screen overflow-hidden bg-bos-bg flex-col md:flex-row print:block print:h-auto print:overflow-visible">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div className={`print:hidden fixed inset-y-0 left-0 z-50 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
                <Sidebar isOpen={true} />
            </div>

            <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible">
                <div className="print:hidden"><Header toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} /></div>

                <main className={`flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 relative print:overflow-visible print:bg-white print:p-0 ${redesigned ? 'bg-bos-bg text-bos-text' : 'scrollbar-sonblade-light bg-gray-100 text-slate-800'}`}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="h-full"
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>

                <div className="print:hidden"><MobileNav /></div>
            </div>
        </div>
    );
}

