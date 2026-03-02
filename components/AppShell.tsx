'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export default function AppShell({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50">
            <Sidebar isOpen={isSidebarOpen} />

            <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300">
                <Header toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

                <main className="flex-1 overflow-x-hidden overflow-y-auto scrollbar-hide bg-gray-100/50 p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
