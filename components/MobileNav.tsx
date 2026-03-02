'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    ShoppingCart,
    Banknote,
    Scissors,
    UserCircle,
} from 'lucide-react';

const mobileItems = [
    { href: '/', label: 'Inicio', icon: LayoutDashboard },
    { href: '/pos', label: 'POS', icon: ShoppingCart },
    { href: '/caja', label: 'Caja', icon: Banknote },
    { href: '/barbero', label: 'Perfil', icon: UserCircle },
];

const MobileNav = () => {
    const pathname = usePathname();

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-sonblade-dark border-t border-white/10 flex items-center justify-around px-2 z-50">
            {mobileItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${isActive ? 'text-sonblade-gold' : 'text-gray-400'
                            }`}
                    >
                        <item.icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium">{item.label}</span>
                    </Link>
                );
            })}
        </div>
    );
};

export default MobileNav;
