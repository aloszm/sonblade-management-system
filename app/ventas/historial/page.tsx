'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, Loader2, ChevronLeft, ChevronRight, FileSpreadsheet, X, RefreshCw, Plus, Calendar, AlertTriangle } from 'lucide-react';
import type { Barber, Service, Product, Sale } from '@/types';
import { supabase } from '@/lib/supabase';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import CreateSaleModal from '@/components/CreateSaleModal';

function PaymentBadge({ sale }: { sale: Sale }) {
    const cash = Number(sale.cash_amount || 0);
    const card = Number(sale.card_amount || 0);
    const transfer = Number(sale.transfer_amount || 0);

    if (sale.payment_method === 'mixed' || [cash, card, transfer].filter(v => v > 0).length > 1) {
        const parts: string[] = [];
        if (cash > 0) parts.push(`Efect. $${cash.toFixed(0)}`);
        if (card > 0) parts.push(`Tarj. $${card.toFixed(0)}`);
        if (transfer > 0) parts.push(`Transf. $${transfer.toFixed(0)}`);
        return <span className="text-xs text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-semibold">{parts.join(' / ')}</span>;
    }

    const methodLabel = sale.payment_method === 'cash' ? 'Efectivo' : sale.payment_method === 'card' ? 'Tarjeta' : sale.payment_method === 'transfer' ? 'Transferencia' : sale.payment_method;
    const color = sale.payment_method === 'cash' ? 'bg-green-100 text-green-700' : sale.payment_method === 'card' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700';
    return <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${color}`}>{methodLabel} ${Number(sale.total).toFixed(0)}</span>;
}

type PeriodFilter = 'today' | 'week' | 'month' | 'custom';

function getDateRange(period: PeriodFilter): { start: string; end: string } {
    const now = new Date();
    if (period === 'today') {
        return { start: format(startOfDay(now), 'yyyy-MM-dd'), end: format(endOfDay(now), 'yyyy-MM-dd') };
    }
    if (period === 'week') {
        const ws = startOfWeek(now, { weekStartsOn: 1 });
        const we = endOfWeek(now, { weekStartsOn: 1 });
        return { start: format(ws, 'yyyy-MM-dd'), end: format(we, 'yyyy-MM-dd') };
    }
    if (period === 'month') {
        return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') };
    }
    // custom — fallback to last 30 days
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    return { start: format(d30, 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
}

export default function SalesHistoryPage() {
    const [sales, setSales] = useState<Sale[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Filters
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
    const [dateRange, setDateRange] = useState(getDateRange('today'));
    const [selectedBarber, setSelectedBarber] = useState('all');
    const [selectedService, setSelectedService] = useState('all');
    const [selectedProduct, setSelectedProduct] = useState('all');
    const [paymentMethod, setPaymentMethod] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Period filter change
    const handlePeriodChange = (period: PeriodFilter) => {
        setPeriodFilter(period);
        if (period !== 'custom') {
            setDateRange(getDateRange(period));
        }
        setCurrentPage(1);
    };

    // Init: load barbers, services, products
    useEffect(() => {
        const init = async () => {
            try {
                const [bRes, pRes, sRes] = await Promise.all([
                    fetch('/api/barbers'), fetch('/api/products'), fetch('/api/settings')
                ]);
                if (bRes.ok) setBarbers(await bRes.json());
                if (pRes.ok) setProducts(await pRes.json());
                if (sRes.ok) { const s = await sRes.json(); if (s.services) setServices(s.services); }
            } catch (e) { console.error(e); }
        };
        init();
    }, []);

    const fetchSales = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('from', dateRange.start);
            params.set('to', dateRange.end);
            if (selectedBarber !== 'all') params.set('barber_id', selectedBarber);
            if (paymentMethod !== 'all') params.set('payment_method', paymentMethod);

            const res = await fetch(`/api/sales?${params.toString()}`);
            if (!res.ok) throw new Error('Error fetching sales');
            let data: Sale[] = await res.json();

            if (selectedService !== 'all') {
                data = data.filter((s: Sale) => s.items?.some(i => i.item_type === 'service' && i.item_name === selectedService));
            }
            if (selectedProduct !== 'all') {
                data = data.filter((s: Sale) => s.items?.some(i => i.item_type === 'product' && i.item_name === selectedProduct));
            }

            setSales(data);
        } catch (e) { console.error(e); }
        finally { if (!silent) setLoading(false); }
    }, [dateRange, selectedBarber, paymentMethod, selectedService, selectedProduct]);

    // Fetch on filter change
    useEffect(() => { fetchSales(); }, [fetchSales]);

    // Supabase Realtime subscription
    useEffect(() => {
        const channel = supabase
            .channel('sales-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
                // Refetch on any INSERT, UPDATE, DELETE
                fetchSales(true);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchSales]);

    const clearFilters = () => {
        setSelectedBarber('all'); setSelectedService('all'); setSelectedProduct('all'); setPaymentMethod('all');
        handlePeriodChange('today');
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setSales(prev => prev.filter(s => s.id !== id));
            } else {
                alert('Error al eliminar');
            }
        } catch (e: any) { alert(e.message); }
        finally { setDeletingId(null); setShowDeleteConfirm(null); }
    };

    const exportCSV = () => {
        const headers = ['Fecha', 'Hora', 'Barbero', 'Servicio', 'Producto', 'Propina', 'Metodo Pago', 'Efectivo', 'Tarjeta', 'Transferencia', 'Total'];
        const rows = sales.map(s => {
            const d = new Date(s.created_at);
            const srvs = s.items?.filter(i => i.item_type === 'service').map(i => i.item_name).join(' | ') || '—';
            const prds = s.items?.filter(i => i.item_type === 'product').map(i => i.item_name).join(' | ') || '—';
            return [format(d, 'yyyy-MM-dd'), format(d, 'HH:mm'), s.barber?.name || '', srvs, prds, s.tip || 0, s.payment_method, s.cash_amount || 0, s.card_amount || 0, s.transfer_amount || 0, s.total].map(c => `"${c}"`).join(',');
        });
        const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        link.download = `ventas_${format(new Date(), 'yyyy-MM-dd')}.csv`; link.click();
    };

    const totalPages = Math.ceil(sales.length / itemsPerPage);
    const page = sales.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalFiltered = sales.reduce((s, v) => s + Number(v.total), 0);
    const serviceNames = [...new Set(services.map(s => s.name))];
    const productNames = [...new Set(products.map(p => p.name))];

    const periodLabel = periodFilter === 'today' ? 'Hoy' : periodFilter === 'week' ? 'Esta Semana' : periodFilter === 'month' ? 'Este Mes' : 'Personalizado';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileSpreadsheet className="text-sonblade-gold h-6 w-6" />Registro de Ventas</h1>
                    <p className="text-gray-500 text-sm mt-1">Tiempo real · {sales.length} ventas ({periodLabel})</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => fetchSales()} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw className="h-4 w-4 text-gray-500" /></button>
                    <button onClick={() => setShowCreateModal(true)} className="bg-sonblade-gold text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-yellow-500 flex items-center gap-2">
                        <Plus className="h-4 w-4" />Nueva Venta
                    </button>
                    <button onClick={exportCSV} className="bg-black text-sonblade-gold px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 flex items-center gap-2">
                        <Download className="h-4 w-4" />CSV
                    </button>
                </div>
            </div>

            {/* Period Quick Filters */}
            <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-400" />
                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                    {(['today', 'week', 'month', 'custom'] as PeriodFilter[]).map(p => (
                        <button key={p} onClick={() => handlePeriodChange(p)}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${periodFilter === p ? 'bg-black text-sonblade-gold shadow' : 'text-gray-500 hover:text-gray-900'}`}>
                            {p === 'today' ? 'Diaria' : p === 'week' ? 'Semanal' : p === 'month' ? 'Mensual' : 'Rango'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Inicio</label><input type="date" value={dateRange.start} onChange={e => { setPeriodFilter('custom'); setDateRange(p => ({ ...p, start: e.target.value })); setCurrentPage(1); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Fin</label><input type="date" value={dateRange.end} onChange={e => { setPeriodFilter('custom'); setDateRange(p => ({ ...p, end: e.target.value })); setCurrentPage(1); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Barbero</label><select value={selectedBarber} onChange={e => { setSelectedBarber(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none"><option value="all">Todos</option>{barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Servicio</label><select value={selectedService} onChange={e => { setSelectedService(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none"><option value="all">Todos</option>{serviceNames.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Producto</label><select value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none"><option value="all">Todos</option>{productNames.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Método Pago</label><select value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm appearance-none"><option value="all">Todos</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="mixed">Mixto</option></select></div>
                </div>
                <button onClick={clearFilters} className="text-sm text-red-500 hover:text-red-700 font-semibold flex items-center gap-1"><X className="h-3 w-3" /> Limpiar Filtros</button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-sonblade-gold"><p className="text-xs font-bold text-gray-500 uppercase">Total Generado</p><p className="text-2xl font-bold">${totalFiltered.toFixed(2)}</p></div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-black"><p className="text-xs font-bold text-gray-500 uppercase">Ventas</p><p className="text-2xl font-bold">{sales.length}</p></div>
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
                                <th className="p-4 text-xs uppercase font-semibold">Método de Pago</th>
                                <th className="p-4 text-xs uppercase font-semibold text-right">Total</th>
                                <th className="p-4 text-xs uppercase font-semibold text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sonblade-gold" /></td></tr>
                            ) : page.length === 0 ? (
                                <tr><td colSpan={9} className="p-8 text-center text-gray-400">Sin resultados para {periodLabel}</td></tr>
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
                                        <td className="p-4"><PaymentBadge sale={sale} /></td>
                                        <td className="p-4 text-right font-bold">${Number(sale.total).toFixed(2)}</td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => setShowDeleteConfirm(sale.id)} disabled={deletingId === sale.id} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">
                                                {deletingId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            </button>
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

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                                <AlertTriangle className="h-6 w-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">¿Eliminar esta venta?</h3>
                                <p className="text-sm text-gray-500">Se revertirá inventario y caja. Esta acción no se puede deshacer.</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 text-gray-600 font-medium hover:text-gray-900">Cancelar</button>
                            <button onClick={() => handleDelete(showDeleteConfirm)} disabled={deletingId !== null}
                                className="px-5 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                                {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Sale Modal */}
            <CreateSaleModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onCreated={() => fetchSales()}
                barbers={barbers}
                services={services}
            />
        </div>
    );
}
