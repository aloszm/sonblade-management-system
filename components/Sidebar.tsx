'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Package,
  Banknote,
  Users,
  Settings,
  Store,
  UserCircle,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

const menuItems = [
  { href: '/', label: 'Panel', icon: LayoutDashboard },
  { href: '/pos', label: 'POS', icon: ShoppingCart },
  { href: '/ventas', label: 'Ventas', icon: Receipt },
  { href: '/inventario', label: 'Inventario', icon: Package },
  { href: '/caja', label: 'Caja', icon: Banknote },
  { href: '/equipo', label: 'Equipo', icon: Users },
  { href: '/barbero', label: 'Mi Panel (Barbero)', icon: UserCircle },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <aside className="w-64 bg-sonblade-dark text-white flex flex-col flex-shrink-0 transition-all duration-300 shadow-xl">
      <div className="h-16 flex items-center px-6 bg-black/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-sonblade-primary rounded flex items-center justify-center font-bold">S</div>
          <span className="font-bold text-xl tracking-tight">SONBLADE</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${isActive
                ? 'bg-sonblade-primary text-white shadow-md'
                : 'text-blue-100 hover:bg-white/10 hover:text-white'
                }`}
            >
              <item.icon
                className={`mr-3 h-5 w-5 ${isActive ? 'text-white' : 'text-blue-200 group-hover:text-white'
                  }`}
              />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4 mt-4 border-t border-white/10">
          <h3 className="px-3 text-xs font-semibold text-blue-200 uppercase tracking-wider mb-2">Configuración</h3>
          <Link href="/configuracion" className={`w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${pathname === '/configuracion' ? 'bg-sonblade-primary text-white shadow-md' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}>
            <Store className={`mr-3 h-5 w-5 ${pathname === '/configuracion' ? 'text-white' : 'text-blue-200 group-hover:text-white'}`} />
            Perfil del Negocio
          </Link>
          <Link href="/configuracion" className={`w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${pathname === '/configuracion' ? 'bg-sonblade-primary text-white shadow-md' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}>
            <Settings className={`mr-3 h-5 w-5 ${pathname === '/configuracion' ? 'text-white' : 'text-blue-200 group-hover:text-white'}`} />
            Configuración
          </Link>
        </div>
      </nav>

      <div className="p-4 bg-black/20">
        <div className="flex items-center gap-3">
          <img
            src="https://picsum.photos/100/100"
            alt="Admin"
            className="w-9 h-9 rounded-full border-2 border-sonblade-primary object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Alonso Miranda</p>
            <p className="text-xs text-blue-200 truncate">Administrador</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;