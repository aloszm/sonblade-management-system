'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KeyRound, LogOut } from 'lucide-react';
import { ACCOUNT_ITEM, menuSections } from '@/lib/nav';
import { useNavUser } from '@/hooks/useNavUser';
import { sessionTitle } from '@/lib/auth/roles';
import { CLIENT_NAME, CLIENT_TAGLINE, SYSTEM_NAME } from '@/lib/brand';
import BrandLogo from '@/components/BrandLogo';
import LogoutDialog from '@/components/LogoutDialog';

interface SidebarProps { isOpen: boolean }

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
    const pathname = usePathname();
    const user = useNavUser();

    const [confirmLogout, setConfirmLogout] = React.useState(false);
    const handleLogout = () => setConfirmLogout(true);

    if (!isOpen) return null;

    const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
    // Con PIN temporal no hay menú: solo Mi cuenta y Salir.
    const mustChangePin = Boolean(user?.mustChangePin);
    const sections = menuSections(user);

    return (
        <aside className="h-full w-60 flex flex-col shrink-0 bg-bos-surface text-bos-text border-r border-bos-border">
            <Link href={mustChangePin ? '/mi-cuenta' : user?.role === 'barber' ? '/barbero' : user?.role === 'recepcion' ? '/pos' : '/'} aria-label={`${CLIENT_NAME}, ${CLIENT_TAGLINE}. ${SYSTEM_NAME}: ir al inicio`}
                className="flex flex-col items-start gap-1.5 px-5 pt-4 pb-3 border-b border-bos-border">
                <BrandLogo alt={`${CLIENT_NAME} ${CLIENT_TAGLINE}`} className="h-20 w-auto max-w-full" />
                <span className="text-xs font-medium text-bos-muted">{SYSTEM_NAME}</span>
            </Link>

            <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
                {mustChangePin && (
                    <ul className="space-y-0.5">
                        <li>
                            <Link href={ACCOUNT_ITEM.href} aria-current={isActive(ACCOUNT_ITEM.href) ? 'page' : undefined}
                                className="relative flex items-center gap-3 min-h-11 md:min-h-9 px-3 rounded-lg text-sm bg-bos-accent-soft text-bos-text font-semibold">
                                <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-bos-accent-text" />
                                {ACCOUNT_ITEM.label}
                            </Link>
                        </li>
                    </ul>
                )}
                {sections.map((section, i) => {
                    const items = section.items;
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
                                                className={`relative flex items-center gap-3 min-h-11 md:min-h-9 px-3 rounded-lg text-sm transition-colors ${active ? 'bg-bos-accent-soft text-bos-text font-semibold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-bos-accent' : 'text-bos-muted font-medium hover:text-bos-text hover:bg-bos-raised'}`}>
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
                        <span className="block text-xs text-bos-muted">{sessionTitle(user)}</span>
                    </span>
                    <button type="button" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión"
                        className="h-11 w-11 inline-flex items-center justify-center rounded-lg text-bos-muted hover:text-bos-text hover:bg-bos-raised transition-colors">
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
            {confirmLogout && <LogoutDialog onCancel={() => setConfirmLogout(false)} />}
        </aside>
    );
};

export default Sidebar;
