'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, Plus, LogOut } from 'lucide-react';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setUserName(data.user.name);
          setUserRole(data.user.role);
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
    <header className="h-16 bg-white shadow-sm border-b border-gray-200 flex items-center justify-between px-6 z-10">
      <div className="flex items-center gap-6 flex-1">
        <button onClick={toggleSidebar} aria-label="Abrir o cerrar el menú" className="text-gray-500 hover:text-sonblade-primary">
          <Menu className="h-6 w-6" />
        </button>

        <h1 className="text-base font-semibold text-gray-800 truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {(userRole === 'admin' || userRole === 'recepcion') && pathname !== '/citas' && (
          <Link href="/citas?nueva=1" className="hidden md:flex items-center gap-2 bg-sonblade-primary hover:bg-sonblade-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <Plus className="h-4 w-4" />
            Nueva Cita
          </Link>
        )}

        <div className="relative ml-2" ref={menuRef}>
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 focus:outline-none group"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-black to-gray-700 flex items-center justify-center text-sonblade-gold font-bold text-xs ring-2 ring-transparent group-hover:ring-sonblade-primary/50 transition-all">
              {initials}
            </div>
            <span className="hidden md:block text-sm font-medium text-gray-700 group-hover:text-sonblade-primary transition-colors">
              {userName || 'Cargando...'}
            </span>
            <ChevronDown className={`h-4 w-4 text-gray-400 group-hover:text-sonblade-primary transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-lg shadow-black/5 py-1 z-50">
              <div className="block md:hidden px-4 py-2 border-b border-gray-100">
                 <p className="text-sm font-semibold text-gray-800">{userName || 'Usuario'}</p>
                 <p className="text-xs text-gray-500">{ROLE_LABELS[userRole] ?? userRole}</p>
              </div>
              
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
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