'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    ShoppingCart,
    Banknote,
    Scissors,
    UserCircle,
    LogOut
} from 'lucide-react';

const mobileItems = [
    { href: '/', label: 'Inicio', icon: LayoutDashboard },
    { href: '/pos', label: 'POS', icon: ShoppingCart },
    { href: '/caja', label: 'Caja', icon: Banknote },
    { href: '/barbero', label: 'Perfil', icon: UserCircle },
];

const MobileNav = () => {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = React.useState<{ name: string, role: string, id: string } | null>(null);

    React.useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.json())
            .then(data => {
                if (data.authenticated) setUser(data.user);
            });
    }, []);

    const handleLogout = async () => {
        await fetch('/api/auth/login', { method: 'DELETE' });
        router.push('/login');
        router.refresh();
    };

    // Filter items
    const visibleItems = mobileItems.filter(item => {
        if (user?.role === 'admin') return true;
        const allowed = ['/pos', '/caja', '/barbero'];
        if (item.href === '/barbero') item.href = `/barberos/${user?.id}`;
        return allowed.some(p => item.href.startsWith(p));
    });

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-sonblade-dark border-t border-white/10 flex items-center justify-around px-2 z-50">
            {visibleItems.map((item) => {
                const isActive = pathname === item.href || (pathname.startsWith('/barberos') && item.href.startsWith('/barberos'));
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
            <button
                onClick={handleLogout}
                className="flex flex-col items-center justify-center gap-1 w-full h-full transition-colors text-red-500 hover:text-red-400"
            >
                <LogOut className="h-5 w-5" />
                <span className="text-[10px] font-medium">Salir</span>
            </button>
        </div>
    );
};

export default MobileNav;
