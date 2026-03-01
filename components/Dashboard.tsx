'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, DollarSign, Users, Package, TrendingUp, TrendingDown, MoreHorizontal } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Types
interface DashboardData {
  stats: {
    totalAppointments: number;
    todayRevenue: number;
    newClients: number;
    lowStockProducts: number;
  };
  revenueChart: { name: string; revenue: number }[];
  upcomingAppointments: any[];
}

const Dashboard: React.FC = () => {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/dashboard');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex justify-center items-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sonblade-primary"></div>
      </div>
    );
  }

  const stats = [
    { label: 'Citas Hoy', value: data.stats.totalAppointments.toString(), change: '', icon: Calendar, color: 'text-sonblade-primary', bg: 'bg-blue-50' },
    { label: 'Ingresos de Hoy', value: `$${data.stats.todayRevenue.toFixed(2)}`, change: '', icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Ventas de Hoy', value: data.stats.newClients.toString(), change: '', icon: Users, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Productos con Stock Bajo', value: data.stats.lowStockProducts.toString(), change: '', icon: Package, color: 'text-blue-500', bg: 'bg-blue-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resumen General</h1>
          <nav className="flex mt-1 text-sm text-gray-500">
            <span>Inicio</span>
            <span className="mx-2">/</span>
            <span className="text-sonblade-primary font-medium">Panel</span>
          </nav>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-2 text-sm text-gray-500 shadow-sm">
          <Calendar className="h-4 w-4" />
          <span>Oct 24, 2023</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded text-gray-500 bg-gray-50`}>
                Hoy
              </span>
            </div>
            <p className="text-gray-500 text-sm mb-1">{stat.label}</p>
            <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6 min-h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Resumen de Ingresos</h2>
            <select className="bg-gray-50 border-none text-sm text-gray-600 rounded-md py-1 px-2 focus:ring-1 focus:ring-sonblade-primary cursor-pointer">
              <option>Esta Semana</option>
              <option>Semana Pasada</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenueChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Bar dataKey="revenue" fill="#2E75B6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Próximas Citas</h2>
            <Link href="/citas" className="text-sonblade-primary text-sm font-medium hover:underline">Ver Todas</Link>
          </div>
          <div className="space-y-4">
            {data.upcomingAppointments.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No hay citas para hoy</p>
            ) : (
              data.upcomingAppointments.map((apt: any) => (
                <div key={apt.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group border border-transparent hover:border-gray-100">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-gray-600 bg-blue-100">
                    {apt.client_name?.charAt(0) || 'C'}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-900">{apt.client_name || 'Cliente sin nombre'}</h4>
                    <p className="text-xs text-gray-500">{apt.status === 'pending' ? 'Pendiente' : apt.status}</p>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs font-bold text-sonblade-primary">
                      {new Date(apt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="block text-[10px] text-gray-400">Hoy</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <Link href="/citas" className="w-full mt-6 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center">
            Ver Calendario
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;