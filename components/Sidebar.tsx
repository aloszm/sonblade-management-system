'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Banknote,
  Users,
  Settings,
  UserCircle,
  ShieldCheck,
  FileText,
  LogOut,
  Calendar,
  TrendingDown,
  Scissors,
  BarChart3,
  Layers,
  ChevronRight,
  UserPlus
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

interface MenuItem {
  href: string;
  label: string;
  icon: any;
  adminOnly?: boolean;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

// Items allowed per role (by href prefix)
const BARBER_ALLOWED = ['/pos', '/caja', '/barbero', '/clientes'];
const RECEPCION_ALLOWED = ['/clientes', '/caja', '/citas'];

const menuSections: MenuSection[] = [
  {
    title: 'PRINCIPAL',
    items: [
      { href: '/', label: 'Panel Dashboard', icon: LayoutDashboard, adminOnly: true },
      { href: '/pos', label: 'Punto de Venta', icon: ShoppingCart },
      { href: '/ventas/historial', label: 'Historial de Ventas', icon: FileText, adminOnly: true },
    ]
  },
  {
    title: 'OPERACIONES',
    items: [
      { href: '/citas', label: 'Agenda / Citas', icon: Calendar, adminOnly: true },
      { href: '/caja', label: 'Control de Caja', icon: Banknote },
      { href: '/gastos', label: 'Gastos e Insumos', icon: TrendingDown, adminOnly: true },
      { href: '/inventario', label: 'Inventario / Stock', icon: Package, adminOnly: true },
    ]
  },
  {
    title: 'MI ESPACIO',
    items: [
      { href: '/barbero', label: 'Mi Panel Personal', icon: UserCircle },
    ]
  },
  {
    title: 'GESTIÓN',
    items: [
      { href: '/equipo', label: 'Equipo de Barberos', icon: Users, adminOnly: true },
      { href: '/clientes', label: 'Cartera de Clientes', icon: UserPlus },
    ]
  },
  {
    title: 'ADMINISTRACIÓN',
    items: [
      { href: '/admin', label: 'Resumen Financiero', icon: ShieldCheck, adminOnly: true },
      { href: '/servicios', label: 'Catálogo de Servicios', icon: Scissors, adminOnly: true },
      { href: '/reportes', label: 'Reportes y PDF', icon: BarChart3, adminOnly: true },
      { href: '/admin/auditoria', label: 'Auditoría de Sistema', icon: Layers, adminOnly: true },
    ]
  }
];

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
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
    if (!window.confirm('¿Estás seguro de que quieres cerrar sesión?')) return;
    await fetch('/api/auth/login', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  };

  if (!isOpen) return null;

  return (
    <aside className="h-full bg-[#0a0a0a] text-white flex flex-col flex-shrink-0 transition-all duration-300 shadow-2xl w-64 border-r border-white/5">
      {/* Brand Header */}
      <div className="h-20 flex items-center px-6 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1.5 shadow-lg group-hover:scale-105 transition-all duration-300">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-lg tracking-tighter text-white leading-none">SONBLADE</span>
            <span className="text-[10px] text-sonblade-gold font-bold tracking-[0.2em] mt-1 uppercase">Management</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto scrollbar-sonblade">
        {menuSections.map((section, idx) => {
          // Filter items based on user role
          const visibleItems = section.items.filter(item => {
            if (user?.role === 'recepcion') {
              return RECEPCION_ALLOWED.some(p => item.href.startsWith(p));
            }
            if (user?.role !== 'admin') {
              // Barbers only see non-adminOnly items whose href is in the allowed list
              if (item.adminOnly) return false;
              return BARBER_ALLOWED.some(p => item.href.startsWith(p));
            }
            return true;
          });

          if (visibleItems.length === 0) return null;

          return (
            <div key={idx} className="space-y-1">
              <h3 className="px-3 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  let href = item.href;
                  // Only barbers get redirected to their personal page
                  // Admins go to /barbero which has the barber selector dropdown
                  if (href === '/barbero' && user?.role !== 'admin' && user?.id) {
                    href = `/barberos/${user.id}`;
                  }

                  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));

                  return (
                    <Link
                      key={item.href}
                      href={href}
                      className={`group flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${isActive
                        ? 'bg-sonblade-primary/10 text-sonblade-gold border border-sonblade-gold/20'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                        }`}
                    >
                      <div className="flex items-center">
                        <item.icon
                          className={`mr-3 h-4 w-4 ${isActive ? 'text-sonblade-gold' : 'text-gray-500 group-hover:text-white'
                            }`}
                        />
                        {item.label}
                      </div>
                      {isActive && <ChevronRight className="h-3 w-3" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Account Info & Logout */}
      <div className="mt-auto p-4 border-t border-white/5 bg-black/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl border border-white/10 bg-sonblade-dark flex items-center justify-center font-bold text-white uppercase text-sm shadow-inner">
              {user ? user.name.charAt(0) : '?'}
            </div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-[#0a0a0a] rounded-full"></div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{user ? user.name : 'Cargando...'}</p>
            <p className="text-[10px] text-sonblade-gold font-black uppercase tracking-widest">
              {user?.role === 'admin' ? 'ADMINISTRADOR' : user?.role === 'recepcion' ? 'RECEPCIONISTA' : 'BARBERO'}
            </p>
          </div>
          {user?.role === 'admin' && (
            <Link href="/configuracion" className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
              <Settings className="h-4 w-4" />
            </Link>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="w-full group flex items-center px-4 py-2.5 text-xs font-bold rounded-xl text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
        >
          <LogOut className="mr-3 h-4 w-4" />
          CERRAR SESIÓN
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;