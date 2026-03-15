'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    ShoppingCart,
    Banknote,
    UserCircle,
    UserPlus,
    Calendar,
    LogOut
} from 'lucide-react';

const mobileItems = [
    { href: '/', label: 'Inicio', icon: LayoutDashboard, roles: ['admin'] },
    { href: '/pos', label: 'POS', icon: ShoppingCart, roles: ['admin', 'barber'] },
    { href: '/caja', label: 'Caja', icon: Banknote, roles: ['admin', 'barber', 'recepcion'] },
    { href: '/clientes', label: 'Clientes', icon: UserPlus, roles: ['admin', 'barber', 'recepcion'] },
    { href: '/citas', label: 'Citas', icon: Calendar, roles: ['admin', 'recepcion'] },
    { href: '/barbero', label: 'Perfil', icon: UserCircle, roles: ['admin', 'barber'] },
];

const MobileNav = () => {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = React.useState<{ name: string, role: string, id: string } | null>(null);

    React.useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' })
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

    // Filter items by role and remap /barbero for barbers
    const role = user?.role ?? 'barber';
    const visibleItems = mobileItems
        .filter(item => item.roles.includes(role))
        .map(item => {
            if (item.href === '/barbero' && role === 'barber' && user?.id) {
                return { ...item, href: `/barberos/${user.id}` };
            }
            return item;
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
