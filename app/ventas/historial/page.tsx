'use client';

import React, { useState, useEffect } from 'react';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { Calendar, User, CreditCard, Search, Download, Edit, Trash2, Loader2, ChevronLeft, ChevronRight, FileSpreadsheet, X, Scissors, ShoppingBag } from 'lucide-react';
import { getBarbers } from '@/lib/services/barber';
import { getServices } from '@/lib/services/sales';
import { getProducts } from '@/lib/services/products';
import type { Barber, Service, Product, Sale } from '@/types';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

export default function SalesHistoryPage() {
    const router = useRouter();
    const [sales, setSales] = useState<Sale[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Filters
    const [dateRange, setDateRange] = useState({
        start: format(new Date(new Date().setDate(new Date().getDate() - 30)), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });
    const [selectedBarber, setSelectedBarber] = useState('all');
    const [selectedService, setSelectedService] = useState('all');
    const [selectedProduct, setSelectedProduct] = useState('all');
    const [paymentMethod, setPaymentMethod] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    useEffect(() => {
        const init = async () => {
            const [b, s, p] = await Promise.all([getBarbers(), getServices(), getProducts()]);
            setBarbers(b); setServices(s); setProducts(p);
        };
        init();
    }, []);

    const fetchSales = async () => {
        setLoading(true);
        try {
            let query = supabase.from('sales').select('*, barber:barbers(*), items:sale_items(*)').order('created_at', { ascending: false });
            if (dateRange.start) query = query.gte('created_at', `${dateRange.start}T00:00:00.000Z`);
            if (dateRange.end) query = query.lte('created_at', `${dateRange.end}T23:59:59.999Z`);
            if (selectedBarber !== 'all') query = query.eq('barber_id', selectedBarber);
            if (paymentMethod !== 'all') query = query.eq('payment_method', paymentMethod);
            const { data } = await query;
            let filtered = data || [];

            // Client-side filter for service/product (need to check items)
            if (selectedService !== 'all') {
                filtered = filtered.filter((s: any) => s.items?.some((i: any) => i.item_type === 'service' && i.item_name === selectedService));
            }
            if (selectedProduct !== 'all') {
                filtered = filtered.filter((s: any) => s.items?.some((i: any) => i.item_type === 'product' && i.item_name === selectedProduct));
            }
            setSales(filtered);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchSales(); }, [dateRange, selectedBarber, paymentMethod, selectedService, selectedProduct]);

    const clearFilters = () => {
        setSelectedBarber('all'); setSelectedService('all'); setSelectedProduct('all'); setPaymentMethod('all');
        setDateRange({ start: format(new Date(new Date().setDate(new Date().getDate() - 30)), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') });
        setCurrentPage(1);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Eliminar esta venta? Se revertirá inventario y caja.')) return;
        setDeletingId(id);
        try {
            const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
            if (res.ok) setSales(prev => prev.filter(s => s.id !== id));
        } catch (e: any) { alert(e.message); }
        finally { setDeletingId(null); }
    };

    const exportCSV = () => {
        const headers = ['Fecha', 'Hora', 'Barbero', 'Servicio', 'Producto', 'Propina', 'Metodo Pago', 'Total'];
        const rows = sales.map(s => {
            const d = new Date(s.created_at);
            const srvs = s.items?.filter(i => i.item_type === 'service').map(i => i.item_name).join(' | ') || '—';
            const prds = s.items?.filter(i => i.item_type === 'product').map(i => i.item_name).join(' | ') || '—';
            return [format(d, 'yyyy-MM-dd'), format(d, 'HH:mm'), s.barber?.name || '', srvs, prds, s.tip || 0, s.payment_method, s.total].map(c => `"${c}"`).join(',');
        });
        const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        link.download = `ventas_${format(new Date(), 'yyyy-MM-dd')}.csv`; link.click();
    };

    const totalPages = Math.ceil(sales.length / itemsPerPage);
    const page = sales.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalFiltered = sales.reduce((s, v) => s + Number(v.total), 0);

    // Unique service/product names for dropdowns
    const serviceNames = [...new Set(services.map(s => s.name))];
    const productNames = [...new Set(products.map(p => p.name))];

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileSpreadsheet className="text-sonblade-gold h-6 w-6" />Registro de Ventas</h1>
                    <p className="text-gray-500 text-sm mt-1">Historial completo con filtros avanzados</p>
                </div>
                <button onClick={exportCSV} className="bg-black text-sonblade-gold px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 flex items-center gap-2">
                    <Download className="h-4 w-4" />Exportar CSV
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Inicio</label>
                        <input type="date" value={dateRange.start} onChange={e => { setDateRange(p => ({ ...p, start: e.target.value })); setCurrentPage(1); }}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Fin</label>
                        <input type="date" value={dateRange.end} onChange={e => { setDateRange(p => ({ ...p, end: e.target.value })); setCurrentPage(1); }}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Barbero</label>
                        <select value={selectedBarber} onChange={e => { setSelectedBarber(e.target.value); setCurrentPage(1); }}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none">
                            <option value="all">Todos</option>
                            {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Servicio</label>
                        <select value={selectedService} onChange={e => { setSelectedService(e.target.value); setCurrentPage(1); }}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none">
                            <option value="all">Todos</option>
                            {serviceNames.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Producto</label>
                        <select value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); setCurrentPage(1); }}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none">
                            <option value="all">Todos</option>
                            {productNames.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Método Pago</label>
                        <select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); setCurrentPage(1); }}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none">
                            <option value="all">Todos</option>
                            <option value="cash">Efectivo</option>
                            <option value="card">Tarjeta</option>
                            <option value="transfer">Transferencia</option>
                            <option value="mixed">Mixto</option>
                        </select>
                    </div>
                </div>
                <button onClick={clearFilters} className="text-sm text-red-500 hover:text-red-700 font-semibold flex items-center gap-1">
                    <X className="h-3 w-3" /> Limpiar Filtros
                </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-sonblade-gold">
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Generado</p>
                    <p className="text-2xl font-bold">${totalFiltered.toFixed(2)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-black">
                    <p className="text-xs font-bold text-gray-500 uppercase">Ventas Encontradas</p>
                    <p className="text-2xl font-bold">{sales.length}</p>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="p-4 text-xs uppercase font-semibold">Fecha</th>
                                <th className="p-4 text-xs uppercase font-semibold">Hora</th>
                                <th className="p-4 text-xs uppercase font-semibold">Barbero</th>
                                <th className="p-4 text-xs uppercase font-semibold">Servicio</th>
                                <th className="p-4 text-xs uppercase font-semibold">Producto</th>
                                <th className="p-4 text-xs uppercase font-semibold text-right">Propina</th>
                                <th className="p-4 text-xs uppercase font-semibold">Pago</th>
                                <th className="p-4 text-xs uppercase font-semibold text-right">Total</th>
                                <th className="p-4 text-xs uppercase font-semibold text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sonblade-gold" /></td></tr>
                            ) : page.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-gray-400">Sin resultados</td></tr>
                            ) : page.map(sale => {
                                const d = new Date(sale.created_at);
                                const srvs = sale.items?.filter(i => i.item_type === 'service').map(i => i.item_name).join(', ') || '—';
                                const prds = sale.items?.filter(i => i.item_type === 'product').map(i => `${i.item_name}${(i.quantity || 1) > 1 ? ` x${i.quantity}` : ''}`).join(', ') || '—';
                                return (
                                    <tr key={sale.id} className="hover:bg-gray-50">
                                        <td className="p-4 font-medium">{format(d, 'MMM dd, yyyy')}</td>
                                        <td className="p-4 text-gray-500">{format(d, 'hh:mm a')}</td>
                                        <td className="p-4 font-medium">{sale.barber?.name || '—'}</td>
                                        <td className="p-4 text-sm">{srvs}</td>
                                        <td className="p-4 text-sm text-gray-500">{prds}</td>
                                        <td className="p-4 text-right">${Number(sale.tip || 0).toFixed(2)}</td>
                                        <td className="p-4"><span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${sale.payment_method === 'cash' ? 'bg-green-100 text-green-700' : sale.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>{sale.payment_method}</span></td>
                                        <td className="p-4 text-right font-bold">${Number(sale.total).toFixed(2)}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => router.push(`/caja?edit=${sale.id}`)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit className="h-4 w-4" /></button>
                                                <button onClick={() => handleDelete(sale.id)} disabled={deletingId === sale.id} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">
                                                    {deletingId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-sm text-gray-500">Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, sales.length)} de {sales.length}</span>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
                            <span className="flex items-center px-4 font-semibold text-sm">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
