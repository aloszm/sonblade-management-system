'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { KeyRound, LogOut, MoreHorizontal } from 'lucide-react';
import { ACCOUNT_ITEM, moreSections, quickItems } from '@/lib/nav';
import { useNavUser } from '@/hooks/useNavUser';
import LogoutDialog from '@/components/LogoutDialog';
import Modal from '@/components/ui/Modal';

const tabClass = (active: boolean) => `flex flex-col items-center justify-center gap-1 w-full h-full min-h-11 min-w-0 transition-colors ${active ? 'text-bos-accent-text' : 'text-bos-muted hover:text-bos-text'}`;

const MobileNav = () => {
    const pathname = usePathname();
    const router = useRouter();
    const user = useNavUser();
    const [moreOpen, setMoreOpen] = React.useState(false);

    // La hoja se cierra al cambiar de pantalla; Escape, foco atrapado y foco devuelto los da el Modal base.
    React.useEffect(() => { setMoreOpen(false); }, [pathname]);

    // "Salir" pide la misma confirmación que en el menú lateral y el encabezado.
    const [confirmLogout, setConfirmLogout] = React.useState(false);
    const handleLogout = () => { setMoreOpen(false); setConfirmLogout(true); };
    const finishLogout = () => { router.push('/login'); router.refresh(); };

    // Hasta saber quién es, no se muestra ningún acceso. Con PIN temporal: solo Mi cuenta y Salir.
    const mustChangePin = Boolean(user?.mustChangePin);
    const quick = quickItems(user);
    const sections = moreSections(user);
    const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));
    const moreActive = sections.some((s) => s.items.some((i) => isActive(i.href)));

    return (
        <>
            <nav aria-label="Principal" className="md:hidden fixed bottom-0 left-0 right-0 h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-bos-surface border-t border-bos-border flex items-center justify-around px-1 z-50">
                {mustChangePin ? (
                    <Link href={ACCOUNT_ITEM.href} aria-current={isActive(ACCOUNT_ITEM.href) ? 'page' : undefined} className={tabClass(isActive(ACCOUNT_ITEM.href))}>
                        <KeyRound aria-hidden="true" className="h-5 w-5" />
                        <span className="text-[11px] font-semibold">{ACCOUNT_ITEM.label}</span>
                    </Link>
                ) : quick.map((item) => {
                    const active = isActive(item.href);
                    return (
                        <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                            <item.icon aria-hidden="true" className="h-5 w-5" />
                            <span className={`text-[11px] truncate max-w-full ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                        </Link>
                    );
                })}
                {mustChangePin ? (
                    <button type="button" onClick={handleLogout} className={tabClass(false)}>
                        <LogOut aria-hidden="true" className="h-5 w-5" />
                        <span className="text-[11px] font-medium">Salir</span>
                    </button>
                ) : user && (
                    <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={tabClass(moreActive || moreOpen)}>
                        <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
                        <span className={`text-[11px] ${moreActive ? 'font-semibold' : 'font-medium'}`}>Más</span>
                    </button>
                )}
            </nav>

            {moreOpen && (
                <Modal title="Más" onClose={() => setMoreOpen(false)}>
                    {sections.map((section, i) => (
                        <div key={section.title ?? i} className="mb-2">
                            {section.title && <p className="px-3 pb-1 pt-2 text-xs font-medium text-bos-muted">{section.title}</p>}
                            <ul>
                                {section.items.map((item) => {
                                    const active = isActive(item.href);
                                    return (
                                        <li key={item.href}>
                                            <Link href={item.href} aria-current={active ? 'page' : undefined}
                                                className={`flex items-center gap-3 min-h-11 px-3 rounded-lg text-sm ${active ? 'bg-bos-accent-soft text-bos-text font-semibold' : 'text-bos-text font-medium hover:bg-bos-raised'}`}>
                                                <item.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-bos-muted" />
                                                {item.label}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                    <ul className="border-t border-bos-border pt-2">
                        <li>
                            <Link href={ACCOUNT_ITEM.href} className="flex items-center gap-3 min-h-11 px-3 rounded-lg text-sm font-medium text-bos-text hover:bg-bos-raised">
                                <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-bos-muted" />{ACCOUNT_ITEM.label}
                            </Link>
                        </li>
                        <li>
                            <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 min-h-11 px-3 rounded-lg text-sm font-medium text-bos-danger hover:bg-bos-raised text-left">
                                <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />Salir
                            </button>
                        </li>
                    </ul>
                </Modal>
            )}
            {confirmLogout && <LogoutDialog onCancel={() => setConfirmLogout(false)} onLoggedOut={finishLogout} />}
        </>
    );
};

export default MobileNav;
