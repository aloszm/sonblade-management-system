'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { Calendar, User, CreditCard, Search, Download, Edit, Trash2, Loader2, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { getBarbers } from '@/lib/services/barber';
import type { Barber, Sale } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter } from 'next/navigation';

export default function SalesHistoryPage() {
    const router = useRouter();
    const [sales, setSales] = useState<Sale[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Filters
    const [dateRange, setDateRange] = useState({
        start: format(new Date(new Date().setDate(new Date().getDate() - 30)), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });
    const [selectedBarber, setSelectedBarber] = useState<string>('all');
    const [paymentMethod, setPaymentMethod] = useState<string>('all');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    useEffect(() => {
        const fetchInitialData = async () => {
            const barbersData = await getBarbers();
            setBarbers(barbersData);
        };
        fetchInitialData();
    }, []);

    const fetchSales = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('sales')
                .select(`
                    *,
                    barber:barbers(*),
                    items:sale_items(*)
                `)
                .order('created_at', { ascending: false });

            // Apply filters
            if (dateRange.start) {
                query = query.gte('created_at', `${dateRange.start}T00:00:00.000Z`);
            }
            if (dateRange.end) {
                query = query.lte('created_at', `${dateRange.end}T23:59:59.999Z`);
            }
            if (selectedBarber !== 'all') {
                query = query.eq('barber_id', selectedBarber);
            }
            if (paymentMethod !== 'all') {
                query = query.eq('payment_method', paymentMethod);
            }

            const { data, error } = await query;
            if (error) throw error;
            setSales(data || []);
        } catch (error) {
            console.error('Error fetching sales:', error);
            alert('Error al cargar historial de ventas');
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when filters change and are applied manually, or auto
    useEffect(() => {
        fetchSales();
    }, [dateRange, selectedBarber, paymentMethod]);

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Estás seguro de eliminar esta venta? Esto revertirá el stock de los productos y modificará la caja actual.')) return;

        setDeletingId(id);
        try {
            const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Error desconocido');
            }

            // Remove from local state immediately
            setSales(prev => prev.filter(s => s.id !== id));
            // alert('Venta eliminada exitosamente');
        } catch (err: any) {
            alert(`Error al eliminar: ${err.message}`);
        } finally {
            setDeletingId(null);
        }
    };

    const handleEdit = (id: string) => {
        // Redirige al POS con el ID de la venta para su precarga
        router.push(`/caja?edit=${id}`);
    };

    const exportToCSV = () => {
        const headers = ['Fecha', 'Hora', 'Barbero', 'Servicios', 'Productos', 'Metodo Pago', 'Propina', 'Total'];
        const rows = sales.map(s => {
            const date = new Date(s.created_at);
            const services = s.items?.filter(i => i.item_type === 'service').map(i => i.item_name).join(' | ') || '-';
            const products = s.items?.filter(i => i.item_type === 'product').map(i => `${i.item_name} (x${i.quantity || 1})`).join(' | ') || '-';

            return [
                format(date, 'yyyy-MM-dd'),
                format(date, 'HH:mm'),
                s.barber?.name || 'Desconocido',
                services,
                products,
                s.payment_method,
                s.tip || 0,
                s.total
            ].map(col => `"${col}"`).join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `historial_ventas_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Pagination Logic
    const totalPages = Math.ceil(sales.length / itemsPerPage);
    const paginatedSales = sales.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Totals for filtered view
    const totalFiltered = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalTips = sales.reduce((sum, s) => sum + Number(s.tip || 0), 0);

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FileSpreadsheet className="text-sonblade-gold h-6 w-6" />
                        Registro de Ventas
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Historial filtrable de todas las transacciones</p>
                </div>

                <button
                    onClick={exportToCSV}
                    className="bg-black text-sonblade-gold px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                </button>
            </div>

            {/* Filters Bar */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fecha Inicio</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => { setDateRange(prev => ({ ...prev, start: e.target.value })); setCurrentPage(1); }}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-sonblade-primary outline-none"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Fecha Fin</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => { setDateRange(prev => ({ ...prev, end: e.target.value })); setCurrentPage(1); }}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-sonblade-primary outline-none"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Barbero</label>
                    <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <select
                            value={selectedBarber}
                            onChange={(e) => { setSelectedBarber(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-sonblade-primary outline-none appearance-none"
                        >
                            <option value="all">Todos los barberos</option>
                            {barbers.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Método Pago</label>
                    <div className="relative">
                        <CreditCard className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <select
                            value={paymentMethod}
                            onChange={(e) => { setPaymentMethod(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-sonblade-primary outline-none appearance-none"
                        >
                            <option value="all">Todos los métodos</option>
                            <option value="cash">Efectivo</option>
                            <option value="card">Tarjeta</option>
                            <option value="transfer">Transferencia</option>
                            <option value="mixed">Mixto</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-sonblade-primary">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Generado</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">${totalFiltered.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-green-500">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Propinas</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">${totalTips.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-sonblade-gold">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ventas Encontradas</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{sales.length}</p>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="p-4 font-semibold text-xs uppercase">Fecha / Hora</th>
                                <th className="p-4 font-semibold text-xs uppercase">Barbero</th>
                                <th className="p-4 font-semibold text-xs uppercase">Servicios / Productos</th>
                                <th className="p-4 font-semibold text-xs uppercase">Pago</th>
                                <th className="p-4 font-semibold text-xs uppercase text-right">Propina</th>
                                <th className="p-4 font-semibold text-xs uppercase text-right">Total</th>
                                <th className="p-4 font-semibold text-xs uppercase text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sonblade-primary" /></td></tr>
                            ) : paginatedSales.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-gray-500 font-medium">No se encontraron ventas con estos filtros</td></tr>
                            ) : (
                                paginatedSales.map((sale) => {
                                    const date = new Date(sale.created_at);
                                    const services = sale.items?.filter(i => i.item_type === 'service');
                                    const products = sale.items?.filter(i => i.item_type === 'product');

                                    return (
                                        <tr key={sale.id} className="hover:bg-gray-50/80 transition-colors">
                                            <td className="p-4">
                                                <div className="font-medium text-gray-900">{format(date, 'MMM dd, yyyy')}</div>
                                                <div className="text-xs text-gray-500">{format(date, 'hh:mm a')}</div>
                                            </td>
                                            <td className="p-4 font-medium text-gray-900">
                                                {sale.barber?.name || 'Desconocido'}
                                            </td>
                                            <td className="p-4">
                                                <div className="space-y-1">
                                                    {services && services.length > 0 && (
                                                        <div className="text-xs">
                                                            <span className="text-blue-600 font-semibold">✂️ Serv:</span> {services.map(s => s.item_name).join(', ')}
                                                        </div>
                                                    )}
                                                    {products && products.length > 0 && (
                                                        <div className="text-xs">
                                                            <span className="text-orange-600 font-semibold">📦 Prod:</span> {products.map(p => `${p.item_name} (x${p.quantity || 1})`).join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold uppercase ${sale.payment_method === 'cash' ? 'bg-green-100 text-green-700' :
                                                        sale.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                    {sale.payment_method}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-medium text-gray-500">
                                                ${Number(sale.tip || 0).toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right font-bold text-gray-900">
                                                ${Number(sale.total).toFixed(2)}
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleEdit(sale.id)}
                                                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Editar Venta (Requiere re-ingreso en POS)"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(sale.id)}
                                                        disabled={deletingId === sale.id}
                                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                        title="Eliminar Venta Permanentemente"
                                                    >
                                                        {deletingId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-sm text-gray-500">
                            Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, sales.length)} de {sales.length}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <div className="flex items-center px-4 font-semibold text-sm">
                                {currentPage} / {totalPages}
                            </div>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
