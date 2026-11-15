'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, Plus, LogOut } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

interface HeaderProps {
  toggleSidebar: () => void;
}

const pageTitles: Record<string, string> = {
  '/': 'Panel',
  '/pos': 'Punto de Venta',
  '/ventas/historial': 'Historial de Ventas',
  '/inventario': 'Inventario',
  '/caja': 'Caja',
  '/gastos': 'Gastos',
  '/citas': 'Agenda',
  '/clientes': 'Clientes',
  '/servicios': 'Servicios',
  '/equipo': 'Equipo',
  '/liquidaciones': 'Pago semanal',
  '/reportes': 'Reportes',
  '/cuadre': 'Cuadre',
  '/administracion': 'Finanzas',
  '/reportes/verificar': 'Verificar reporte',
  '/admin': 'Administración',
  '/admin/auditoria': 'Bitácora',
  '/configuracion': 'Configuración',
};

const ROLE_LABELS: Record<string, string> = { admin: 'Administración', recepcion: 'Recepción', barber: 'Barbero' };

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? '';
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [canBook, setCanBook] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setCanBook(data.user.role === 'admin' || data.user.role === 'recepcion');
          setUserName(data.user.name);
          setUserRole(data.user.title ?? data.user.role);
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

  const handleLogout = async () => {
    if (!window.confirm('¿Estás seguro de que quieres cerrar sesión?')) return;
    await fetch('/api/auth/login', { method: 'DELETE' });
    window.location.href = '/login';
  };

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
            <div className="absolute right-0 mt-2 w-52 bg-bos-surface border border-bos-control rounded-xl shadow-lg shadow-black/20 py-1 z-50">
              <div className="px-4 py-3 border-b border-bos-border">
                 <p className="text-sm font-semibold text-bos-text">{userName || 'Usuario'}</p>
                 <p className="text-xs text-bos-muted">{ROLE_LABELS[userRole] ?? userRole}</p>
              </div>
              
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 min-h-11 text-sm text-bos-danger hover:bg-bos-raised transition-colors text-left"
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;