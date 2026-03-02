'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Download, Edit, Trash2, Loader2, ChevronLeft, ChevronRight, FileSpreadsheet, X, RefreshCw } from 'lucide-react';
import type { Barber, Service, Product, Sale } from '@/types';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';

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

export default function SalesHistoryPage() {
    const router = useRouter();
    const [sales, setSales] = useState<Sale[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const lastFetchRef = useRef<string>('');

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

    const fetchSales = async (silent = false) => {
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
                data = data.filter((s: any) => s.items?.some((i: any) => i.item_type === 'service' && i.item_name === selectedService));
            }
            if (selectedProduct !== 'all') {
                data = data.filter((s: any) => s.items?.some((i: any) => i.item_type === 'product' && i.item_name === selectedProduct));
            }

            // Check if data actually changed
            const hash = JSON.stringify(data.map(s => s.id));
            if (hash !== lastFetchRef.current) {
                lastFetchRef.current = hash;
                setSales(data);
            }
        } catch (e) { console.error(e); }
        finally { if (!silent) setLoading(false); }
    };

    // Initial fetch + polling every 10s
    useEffect(() => { fetchSales(); }, [dateRange, selectedBarber, paymentMethod, selectedService, selectedProduct]);
    useEffect(() => {
        const interval = setInterval(() => fetchSales(true), 10000);
        return () => clearInterval(interval);
    }, [dateRange, selectedBarber, paymentMethod, selectedService, selectedProduct]);

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
            else alert('Error al eliminar');
        } catch (e: any) { alert(e.message); }
        finally { setDeletingId(null); }
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

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FileSpreadsheet className="text-sonblade-gold h-6 w-6" />Registro de Ventas</h1>
                    <p className="text-gray-500 text-sm mt-1">Actualización automática cada 10s · {sales.length} ventas</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => fetchSales()} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw className="h-4 w-4 text-gray-500" /></button>
                    <button onClick={exportCSV} className="bg-black text-sonblade-gold px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 flex items-center gap-2">
                        <Download className="h-4 w-4" />Exportar CSV
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Inicio</label><input type="date" value={dateRange.start} onChange={e => { setDateRange(p => ({ ...p, start: e.target.value })); setCurrentPage(1); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Fin</label><input type="date" value={dateRange.end} onChange={e => { setDateRange(p => ({ ...p, end: e.target.value })); setCurrentPage(1); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" /></div>
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
                                        <td className="p-4"><PaymentBadge sale={sale} /></td>
                                        <td className="p-4 text-right font-bold">${Number(sale.total).toFixed(2)}</td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => router.push(`/pos?edit=${sale.id}`)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit className="h-4 w-4" /></button>
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
