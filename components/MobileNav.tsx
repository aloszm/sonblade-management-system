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
    Wallet,
    Trophy,
    LogOut
} from 'lucide-react';

const mobileItems = [
    { href: '/', label: 'Inicio', icon: LayoutDashboard, roles: ['admin'] },
    // Cada puesto ve solo lo que puede usar: el barbero no cobra ni maneja caja.
    // El cobro es solo en computadora; en el celular no se ofrece.
    { href: '/pos', label: 'Cobro', icon: ShoppingCart, roles: [] as string[] },
    { href: '/caja', label: 'Caja', icon: Banknote, roles: ['admin', 'recepcion'] },
    { href: '/equipo-hoy', label: 'Barberos', icon: Trophy, roles: ['admin', 'recepcion'] },
    { href: '/barbero', label: 'Mi semana', icon: UserCircle, roles: ['barber'] },
    { href: '/clientes', label: 'Clientes', icon: UserPlus, roles: ['admin', 'barber', 'recepcion'] },
    { href: '/citas', label: 'Citas', icon: Calendar, roles: ['admin', 'recepcion', 'barber'] },
    { href: '/liquidaciones', label: 'Recibos', icon: Wallet, roles: ['barber', 'recepcion'] },
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
    // Hasta saber quién es, no se muestra ningún acceso (antes se asumía barbero).
    const role = user?.role ?? '';
    const visibleItems = mobileItems.filter(item => item.roles.includes(role));

    return (
        <nav aria-label="Principal" className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bos-surface border-t border-bos-border flex items-center justify-around px-1 z-50">
            {visibleItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-colors ${isActive ? 'text-bos-accent-text' : 'text-bos-muted hover:text-bos-text'}`}
                    >
                        <item.icon className="h-5 w-5" />
                        <span className={`text-[11px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                    </Link>
                );
            })}
            <button
                type="button"
                onClick={handleLogout}
                className="flex flex-col items-center justify-center gap-1 w-full h-full transition-colors text-bos-muted hover:text-bos-text"
            >
                <LogOut className="h-5 w-5" />
                <span className="text-[11px] font-medium">Salir</span>
            </button>
        </nav>
    );
};

export default MobileNav;
