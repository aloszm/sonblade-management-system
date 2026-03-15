'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Bell, HelpCircle, Search, ChevronDown, Plus, LogOut, Settings, Users } from 'lucide-react';

interface HeaderProps {
  toggleSidebar: () => void;
}

const pageTitles: Record<string, string> = {
  '/': 'Panel',
  '/pos': 'Punto de Venta',
  '/ventas': 'Ventas',
  '/inventario': 'Inventario',
  '/caja': 'Caja',
  '/equipo': 'Equipo',
  '/barbero': '',
};

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? 'Sonblade';
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
        <button onClick={toggleSidebar} className="text-gray-500 hover:text-sonblade-primary">
          <Menu className="h-6 w-6" />
        </button>

        {/* Search Bar */}
        <div className="relative w-full max-w-md hidden sm:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-sonblade-primary focus:border-sonblade-primary sm:text-sm transition-colors"
            placeholder="Buscar clientes, citas o artículos..."
          />
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
            <kbd className="inline-flex items-center border border-gray-200 rounded px-2 text-xs font-sans font-medium text-gray-400">⌘K</kbd>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <button className="hidden md:flex items-center gap-2 bg-sonblade-primary hover:bg-sonblade-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
          <Plus className="h-4 w-4" />
          Nueva Cita
        </button>

        <div className="h-6 w-px bg-gray-200 mx-1 hidden md:block"></div>

        <button className="p-2 text-gray-500 hover:text-sonblade-primary rounded-lg hover:bg-gray-100 relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>

        <button className="p-2 text-gray-500 hover:text-sonblade-primary rounded-lg hover:bg-gray-100">
          <HelpCircle className="h-5 w-5" />
        </button>

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
                 <p className="text-xs text-gray-500 capitalize">{userRole}</p>
              </div>
              
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              >
                <Users className="h-4 w-4" /> Cambiar de usuario
              </button>

              <div className="h-px bg-gray-100 my-1"></div>

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