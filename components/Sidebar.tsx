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
  ShieldCheck,
  FileText,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

const menuItems = [
  { href: '/', label: 'Panel', icon: LayoutDashboard },
  { href: '/pos', label: 'POS', icon: ShoppingCart },
  { href: '/ventas/historial', label: 'Historial Ventas', icon: FileText },
  { href: '/citas', label: 'Citas', icon: Receipt },
  { href: '/inventario', label: 'Inventario', icon: Package },
  { href: '/caja', label: 'Caja', icon: Banknote },
  { href: '/equipo', label: 'Equipo', icon: Users },
  { href: '/barbero', label: 'Mi Panel (Barbero)', icon: UserCircle },
  { href: '/admin', label: 'Administrador', icon: ShieldCheck },
  { href: '/admin/auditoria', label: 'Auditoría', icon: ShieldCheck },
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <aside className="h-full bg-sonblade-dark text-white flex flex-col flex-shrink-0 transition-all duration-300 shadow-xl w-64">
      <div className="h-20 flex items-center px-6 bg-black/10">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-lg group-hover:scale-110 transition-transform duration-200">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-xl tracking-tighter text-white">SONBLADE</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto scrollbar-sonblade">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${isActive
                ? 'bg-sonblade-primary text-sonblade-gold shadow-md border border-sonblade-gold/20'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
            >
              <item.icon
                className={`mr-3 h-5 w-5 ${isActive ? 'text-sonblade-gold' : 'text-gray-500 group-hover:text-white'
                  }`}
              />
              {item.label}
            </Link>
          );
        })}

        <div className="pt-4 mt-4 border-t border-white/10">
          <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Configuración</h3>
          <Link href="/configuracion" className={`w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${pathname === '/configuracion' ? 'bg-sonblade-primary text-sonblade-gold shadow-md border border-sonblade-gold/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
            <Store className={`mr-3 h-5 w-5 ${pathname === '/configuracion' ? 'text-sonblade-gold' : 'text-gray-500 group-hover:text-white'}`} />
            Perfil del Negocio
          </Link>
          <Link href="/configuracion" className={`w-full group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${pathname === '/configuracion' ? 'bg-sonblade-primary text-sonblade-gold shadow-md border border-sonblade-gold/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
            <Settings className={`mr-3 h-5 w-5 ${pathname === '/configuracion' ? 'text-sonblade-gold' : 'text-gray-500 group-hover:text-white'}`} />
            Configuración
          </Link>
        </div>
      </nav>

      <div className="p-4 bg-black/20">
        <div className="flex items-center gap-3">
          <img
            src="https://picsum.photos/100/100"
            alt="Admin"
            className="w-9 h-9 rounded-full border-2 border-sonblade-gold object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Alonso Miranda</p>
            <p className="text-xs text-sonblade-gold truncate">Administrador</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;