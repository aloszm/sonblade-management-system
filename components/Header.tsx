'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, Plus, LogOut, KeyRound } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { PAGE_TITLES } from '@/lib/nav';
import LogoutDialog from '@/components/LogoutDialog';
import { sessionTitle } from '@/lib/auth/roles';

interface HeaderProps {
  toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? '';
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [canBook, setCanBook] = useState(false);
  const [mustChangePin, setMustChangePin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          // La cuenta de consulta (readOnly) no agenda.
          setCanBook((data.user.role === 'admin' || data.user.role === 'recepcion') && !data.user.readOnly && !data.user.mustChangePin);
          setMustChangePin(Boolean(data.user.mustChangePin));
          setUserName(data.user.name);
          // Título de la persona (título visible o etiqueta del puesto), el mismo que en el menú.
          setUserRole(sessionTitle(data.user));
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Menú de usuario: al abrir, el foco pasa al primer elemento; Escape lo cierra y devuelve el foco al botón;
  // Tab y Mayús+Tab dan la vuelta dentro del menú.
  useEffect(() => {
    if (!menuOpen) return;
    const items = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? []);
    items()[0]?.focus();
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setMenuOpen(false); return; }
      if (e.key !== 'Tab' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const list = items();
      if (list.length === 0) return;
      const index = list.indexOf(document.activeElement as HTMLElement);
      const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
      e.preventDefault();
      list[(index + (back ? -1 : 1) + list.length) % list.length].focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Si el foco quedó dentro del menú (Escape, o una opción que lo cierra), vuelve al botón.
      if (!document.activeElement || document.activeElement === document.body || panel?.contains(document.activeElement)) trigger?.focus();
    };
  }, [menuOpen]);

  // "Cerrar sesión" pide confirmación en un diálogo propio (no window.confirm).
  const handleLogout = () => { setMenuOpen(false); setConfirmLogout(true); };

  // Initials for avatar
  const initials = userName ? userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <header className="h-16 bg-bos-bg border-b border-bos-border flex items-center justify-between px-4 md:px-8 z-10">
      <div className="flex items-center gap-6 flex-1">
        <button onClick={toggleSidebar} aria-label="Abrir o cerrar el menú" className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised md:hidden">
          <Menu className="h-6 w-6" />
        </button>

        <p className="md:hidden font-display text-lg font-semibold text-bos-text truncate">{title}</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {canBook && pathname !== '/citas' && (
          <Link href="/citas?nueva=1" className="hidden md:inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-bos-border text-bos-text hover:bg-bos-raised text-sm font-semibold transition-colors">
            <Plus className="h-4 w-4" />
            Nueva Cita
          </Link>
        )}

        <ThemeToggle />

        <div className="relative ml-1" ref={menuRef}>
          <button 
            ref={triggerRef}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu" aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-xl group min-h-11"
          >
            <div className="w-8 h-8 rounded-full bg-bos-raised flex items-center justify-center text-bos-text font-semibold text-xs ring-2 ring-transparent group-hover:ring-bos-accent transition-all">
              {initials}
            </div>
            <span className="hidden md:block text-sm font-medium text-bos-text transition-colors">
              {userName || 'Cargando...'}
            </span>
            <ChevronDown className={`h-4 w-4 text-bos-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div ref={panelRef} role="menu" aria-label="Cuenta" className="absolute right-0 mt-2 w-52 bg-bos-surface border border-bos-control rounded-xl shadow-lg shadow-black/20 py-1 z-50">
              <div className="px-4 py-3 border-b border-bos-border">
                 <p className="text-sm font-semibold text-bos-text">{userName || 'Usuario'}</p>
                 <p className="text-xs text-bos-muted">{userRole}</p>
              </div>

              <Link href="/mi-cuenta" role="menuitem" onClick={() => setMenuOpen(false)}
                className="w-full flex items-center gap-2 px-4 min-h-11 text-sm text-bos-text hover:bg-bos-raised transition-colors">
                <KeyRound className="h-4 w-4" /> {mustChangePin ? 'Mi cuenta · elegir PIN' : 'Mi cuenta · cambiar PIN'}
              </Link>
              <button 
                role="menuitem"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 min-h-11 text-sm text-bos-danger hover:bg-bos-raised transition-colors text-left"
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
      {confirmLogout && <LogoutDialog onCancel={() => setConfirmLogout(false)} />}
    </header>
  );
};

export default Header;