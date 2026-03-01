'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, DollarSign, Scissors, TrendingDown, Gift, Loader2, Award } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

interface DashboardData {
  kpis: {
    revenue: number;
    cuts: number;
    tips: number;
    expenses: number;
  };
  barbersTable: {
    id: string;
    name: string;
    avatar_url: string;
    cuts: number;
    revenue: number;
    commission: number;
    rate: number;
  }[];
  charts: {
    weekBar: { name: string; revenue: number }[];
    monthLine: { name: string; revenue: number }[];
    paymentDonut: { name: string; value: number }[];
  };
}

const PIE_COLORS = ['#D4AF37', '#000000', '#4B5563'];

export default function Dashboard() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard?period=${period}`);
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
  }, [period]);

  if (!data) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="animate-spin text-sonblade-gold h-8 w-8" />
      </div>
    );
  }

  const { kpis, barbersTable, charts } = data;

  const stats = [
    { label: 'Ingresos Totales', value: `$${kpis.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-sonblade-gold', bg: 'bg-yellow-50' },
    { label: 'Servicios (Cortes)', value: kpis.cuts.toString(), icon: Scissors, color: 'text-gray-800', bg: 'bg-gray-100' },
    { label: 'Propinas Generadas', value: `$${kpis.tips.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: Gift, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Egresos Caja', value: `$${kpis.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-50' },
  ];

  const periodLabel = period === 'today' ? 'Hoy' : period === 'week' ? 'Esta Semana' : 'Este Mes';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Análisis en tiempo real de tu barbería</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-sm relative z-10">
          <button
            onClick={() => setPeriod('today')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${period === 'today' ? 'bg-black text-sonblade-gold shadow' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Día
          </button>
          <button
            onClick={() => setPeriod('week')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${period === 'week' ? 'bg-black text-sonblade-gold shadow' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Semana
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${period === 'month' ? 'bg-black text-sonblade-gold shadow' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Mes
          </button>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-20 flex items-center justify-center rounded-xl">
            <Loader2 className="h-6 w-6 animate-spin text-sonblade-gold" />
          </div>
        )}
        {stats.map((stat, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm hover:border-sonblade-gold/50 transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded text-gray-500 bg-gray-50 uppercase tracking-widest border border-gray-200">
                {periodLabel}
              </span>
            </div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">{stat.label}</p>
            <h3 className="text-3xl font-bold text-gray-900 truncate">{stat.value}</h3>
          </div>
        ))}
      </div>

      {/* Income vs Expenses summary card */}
      <div className="bg-gradient-to-r from-black to-gray-800 rounded-2xl p-6 shadow-md border border-gray-800 flex items-center justify-between text-white">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm border border-white/20">
            <DollarSign className="h-8 w-8 text-sonblade-gold" />
          </div>
          <div>
            <p className="text-gray-300 text-sm font-medium uppercase tracking-wider">Flujo de Caja ({periodLabel})</p>
            <h2 className="text-2xl lg:text-3xl font-black mt-1 flex items-baseline gap-2">
              ${(kpis.revenue - kpis.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-xs font-normal text-gray-400 bg-white/10 px-2 py-0.5 rounded-full">Utilidad Bruta</span>
            </h2>
          </div>
        </div>
        <div className="hidden md:flex gap-8 text-right">
          <div>
            <p className="text-green-400 text-xs font-bold uppercase tracking-wider">Ingresos (+)</p>
            <p className="text-lg font-bold">${kpis.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="text-red-400 text-xs font-bold uppercase tracking-wider">Egresos (-)</p>
            <p className="text-lg font-bold">${kpis.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Bar Chart (Current Week) */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Ingresos (Semana Actual)</h2>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.weekBar} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  cursor={{ fill: '#F3F4F6' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontWeight: 'bold' }}
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Ingreso']}
                />
                <Bar dataKey="revenue" fill="#D4AF37" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart (Payment Methods) */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex flex-col items-center">
          <h2 className="text-lg font-bold text-gray-900 mb-2 w-full text-left">Métodos de Pago</h2>
          <p className="text-xs text-gray-500 w-full text-left mb-4 uppercase">{periodLabel}</p>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.paymentDonut}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {charts.paymentDonut.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => `$${Number(value).toFixed(2)}`}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full grid grid-cols-2 gap-2 mt-4">
            {charts.paymentDonut.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}></span>
                {item.name}: <span className="text-gray-900">${item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Line Chart (Last 4 Weeks) */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 lg:col-span-3">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Tendencia últimas 4 Semanas</h2>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.monthLine} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 500 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  cursor={{ stroke: '#D4AF37', strokeWidth: 1, strokeDasharray: '3 3' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontWeight: 'bold' }}
                  formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Ingreso']}
                />
                <Line type="monotone" dataKey="revenue" stroke="#000000" strokeWidth={3} dot={{ r: 4, fill: '#D4AF37', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#D4AF37', stroke: '#000000', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Barber Summary Table (Always Weekly per requirements) */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm lg:col-span-3 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Award className="h-5 w-5 text-sonblade-gold" />
                Rendimiento de Barberos
              </h2>
              <p className="text-xs text-gray-500 mt-1 uppercase font-semibold">Semana Actual (Domingo a Sábado)</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="p-4 font-semibold text-xs uppercase">Barbero</th>
                  <th className="p-4 font-semibold text-xs uppercase text-center">Cortes (Semana)</th>
                  <th className="p-4 font-semibold text-xs uppercase text-center">Tasa Actual (%)</th>
                  <th className="p-4 font-semibold text-xs uppercase text-right">Ingresos (Semana)</th>
                  <th className="p-4 font-semibold text-xs uppercase text-right">Comisión Proyectada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {barbersTable.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400 font-medium">No hay actividad de barberos esta semana</td>
                  </tr>
                )}
                {barbersTable.map((barber) => (
                  <tr key={barber.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-black to-gray-700 flex items-center justify-center text-sonblade-gold font-bold text-xs ring-2 ring-sonblade-gold/20">
                          {barber.name.charAt(0)}
                        </div>
                        <span className="font-bold text-gray-900">{barber.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center font-bold text-gray-800">
                      {barber.cuts}
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex bg-sonblade-gold text-black px-2 py-0.5 rounded text-xs font-bold">
                        {barber.rate}%
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-gray-900">
                      ${barber.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-right font-black text-sonblade-gold">
                      ${barber.commission.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}