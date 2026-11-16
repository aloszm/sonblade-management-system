'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BarChart3, Banknote, Calendar, FileText, LayoutDashboard, Layers, LogOut, Package, Scissors,
    Settings, ShoppingCart, Trophy, TrendingDown, UserCircle, UserPlus, Users, Wallet, type LucideIcon, Scale, PiggyBank } from 'lucide-react';
import { CLIENT_NAME, CLIENT_TAGLINE, SYSTEM_NAME } from '@/lib/brand';
import BrandLogo from '@/components/BrandLogo';

interface SidebarProps { isOpen: boolean }
interface MenuItem { href: string; label: string; icon: LucideIcon; roles: Role[]; ownerOnly?: boolean }
type Role = 'admin' | 'recepcion' | 'barber';
type User = { name: string; role: Role; id: string; isOwner?: boolean; title?: string };

// Cada puesto ve solo lo que usa. Pocas secciones y nombres cortos.
const SECTIONS: { title: string | null; items: MenuItem[] }[] = [
    {
        title: null,
        items: [
            { href: '/', label: 'Panel', icon: LayoutDashboard, roles: ['admin'] },
            { href: '/barbero', label: 'Mi semana', icon: UserCircle, roles: ['barber', 'admin'] },
            { href: '/pos', label: 'Cobro', icon: ShoppingCart, roles: ['admin', 'recepcion'] },
            { href: '/caja', label: 'Caja', icon: Banknote, roles: ['admin', 'recepcion'] },
            { href: '/equipo-hoy', label: 'Barberos hoy', icon: Trophy, roles: ['admin', 'recepcion'] },
            { href: '/citas', label: 'Agenda', icon: Calendar, roles: ['admin', 'recepcion', 'barber'] },
            { href: '/clientes', label: 'Clientes', icon: UserPlus, roles: ['admin', 'recepcion', 'barber'] },
            { href: '/liquidaciones', label: 'Pago semanal', icon: Wallet, roles: ['admin', 'recepcion', 'barber'] },
        ],
    },
    {
        title: 'Negocio',
        items: [
            { href: '/ventas/historial', label: 'Ventas', icon: FileText, roles: ['admin'] },
            { href: '/cuadre', label: 'Cuadre', icon: Scale, roles: ['admin'] },
            { href: '/administracion', label: 'Finanzas', icon: PiggyBank, roles: ['admin'] },
            { href: '/gastos', label: 'Gastos', icon: TrendingDown, roles: ['admin'] },
            { href: '/inventario', label: 'Inventario', icon: Package, roles: ['admin'] },
            { href: '/servicios', label: 'Servicios', icon: Scissors, roles: ['admin'] },
            { href: '/equipo', label: 'Equipo', icon: Users, roles: ['admin'] },
            { href: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['admin'] },
            { href: '/admin/auditoria', label: 'Bitácora', icon: Layers, roles: ['admin'] },
            { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['admin'], ownerOnly: true },
        ],
    },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
    const pathname = usePathname();
    const [user, setUser] = React.useState<User | null>(null);

    React.useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => { if (data.authenticated) setUser(data.user); })
            .catch(() => {});
    }, []);

    const handleLogout = async () => {
        if (!window.confirm('¿Cerrar sesión?')) return;
        await fetch('/api/auth/login', { method: 'DELETE' });
        window.location.href = '/login';
    };

    if (!isOpen) return null;

    const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
    const allowed = (item: MenuItem) => Boolean(user) && item.roles.includes(user!.role) && (!item.ownerOnly || Boolean(user!.isOwner));

    return (
        <aside className="h-full w-60 flex flex-col shrink-0 bg-bos-surface text-bos-text border-r border-bos-border">
            <Link href={user?.role === 'barber' ? '/barbero' : user?.role === 'recepcion' ? '/pos' : '/'} aria-label={`${CLIENT_NAME}, ${CLIENT_TAGLINE}. ${SYSTEM_NAME}: ir al inicio`}
                className="flex flex-col items-start gap-1.5 px-5 pt-4 pb-3 border-b border-bos-border">
                <BrandLogo alt={`${CLIENT_NAME} ${CLIENT_TAGLINE}`} className="h-20 w-auto max-w-full" />
                <span className="text-xs font-medium text-bos-muted">{SYSTEM_NAME}</span>
            </Link>

            <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
                {SECTIONS.map((section, i) => {
                    const items = section.items.filter(allowed);
                    if (items.length === 0) return null;
                    return (
                        <div key={section.title ?? i}>
                            {section.title && <p className="px-3 mb-1.5 text-xs font-medium text-bos-muted">{section.title}</p>}
                            <ul className="space-y-0.5">
                                {items.map((item) => {
                                    const active = isActive(item.href);
                                    const Icon = item.icon;
                                    return (
                                        <li key={item.href}>
                                            <Link href={item.href} aria-current={active ? 'page' : undefined}
                                                className={`relative flex items-center gap-3 h-9 px-3 rounded-lg text-sm transition-colors ${active ? 'bg-bos-accent-soft text-bos-text font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-bos-accent' : 'text-bos-muted font-medium hover:text-bos-text hover:bg-bos-raised'}`}>
                                                <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? 'text-bos-accent-text' : ''}`} />
                                                {item.label}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            <div className="p-3 border-t border-bos-border">
                <div className="flex items-center gap-3 px-2 py-2">
                    <span aria-hidden="true" className="h-8 w-8 rounded-full bg-bos-raised inline-flex items-center justify-center text-sm font-semibold shrink-0">
                        {user ? user.name.charAt(0).toUpperCase() : ''}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-sm font-medium">{user?.name ?? ''}</span>
                        <span className="block text-xs text-bos-muted">{user?.title ?? ''}</span>
                    </span>
                    <button type="button" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión"
                        className="h-11 w-11 inline-flex items-center justify-center rounded-lg text-bos-muted hover:text-bos-text hover:bg-bos-raised transition-colors">
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
