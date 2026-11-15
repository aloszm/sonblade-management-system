'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, Loader2, ChevronLeft, ChevronRight, FileText, X, RefreshCw, Plus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Link from 'next/link';
import type { Barber, Service, Product, Sale } from '@/types';
import { downloadCsv } from '@/lib/utils/csv';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import CreateSaleModal from '@/components/CreateSaleModal';

function PaymentBadge({ sale }: { sale: Sale }) {
    const cash = Number(sale.cash_amount || 0);
    const card = Number(sale.card_amount || 0);
    const transfer = Number(sale.transfer_amount || 0);
    const pill = 'inline-block whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium border border-bos-border bg-bos-raised text-bos-text';

    if (sale.payment_method === 'mixed' || [cash, card, transfer].filter(v => v > 0).length > 1) {
        const parts: string[] = [];
        if (cash > 0) parts.push(`Efect. $${cash.toFixed(0)}`);
        if (card > 0) parts.push(`Tarj. $${card.toFixed(0)}`);
        if (transfer > 0) parts.push(`Transf. $${transfer.toFixed(0)}`);
        return <span className={pill}>{parts.join(' / ')}</span>;
    }

    const methodLabel = sale.payment_method === 'cash' ? 'Efectivo' : sale.payment_method === 'card' ? 'Tarjeta' : sale.payment_method === 'transfer' ? 'Transferencia' : sale.payment_method;
    return <span className={pill}>{methodLabel} ${Number(sale.total).toFixed(0)}</span>;
}

type PeriodFilter = 'today' | 'week' | 'month' | 'custom';

function getDateRange(period: PeriodFilter): { start: string; end: string } {
    const now = new Date();
    if (period === 'today') {
        return { start: format(startOfDay(now), 'yyyy-MM-dd'), end: format(endOfDay(now), 'yyyy-MM-dd') };
    }
    if (period === 'week') {
        const ws = startOfWeek(now, { weekStartsOn: 0 }); // la semana del negocio va de domingo a sábado
        const we = endOfWeek(now, { weekStartsOn: 0 });
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
    const [reverseReason, setReverseReason] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [deleteError, setDeleteError] = useState('');

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
                    fetch('/api/barbers'), fetch('/api/products'), fetch('/api/services')
                ]);
                if (bRes.ok) setBarbers(await bRes.json());
                if (pRes.ok) setProducts(await pRes.json());
                if (sRes.ok) { const s = await sRes.json(); if (Array.isArray(s)) setServices(s); }
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

    // Actualiza solo cada 30 segundos mientras la pestaña está visible (sin conexiones en tiempo real).
    useEffect(() => {
        const timer = setInterval(() => { if (document.visibilityState === 'visible') fetchSales(true); }, 30_000);
        return () => clearInterval(timer);
    }, [fetchSales]);

    const clearFilters = () => {
        setSelectedBarber('all'); setSelectedService('all'); setSelectedProduct('all'); setPaymentMethod('all');
        handlePeriodChange('today');
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        setDeleteError('');
        try {
            const res = await fetch(`/api/sales/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reverseReason }),
            });
            const body = await res.json().catch(() => null);
            if (res.ok) {
                setSales(prev => prev.map(s => s.id === id ? { ...s, status: 'refunded' } : s));
                setShowDeleteConfirm(null);
                setReverseReason('');
            } else {
                setDeleteError(body?.detail ? `${body.error} (${body.detail})` : body?.error || 'No se pudo anular la venta');
            }
        } catch (e: unknown) { setDeleteError(e instanceof Error ? e.message : 'Error'); }
        finally { setDeletingId(null); }
    };

    const exportCSV = () => {
        const methodLabel: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', mixed: 'Mixto' };
        const rows = sales.map(s => {
            const d = new Date(s.created_at);
            const srvs = s.items?.filter(i => i.item_type === 'service').map(i => i.item_name).join(' | ') || '';
            const prds = s.items?.filter(i => i.item_type === 'product').map(i => i.item_name).join(' | ') || '';
            return [format(d, 'yyyy-MM-dd'), format(d, 'HH:mm'), s.barber?.name || '', s.client?.name || '', srvs, prds, s.tip || 0,
                methodLabel[s.payment_method] || s.payment_method, s.cash_amount || 0, s.card_amount || 0, s.transfer_amount || 0, s.total,
                s.status === 'refunded' ? 'Anulada' : 'Pagada'];
        });
        downloadCsv(`ventas_${format(new Date(), 'yyyy-MM-dd')}.csv`,
            ['Fecha', 'Hora', 'Barbero', 'Cliente', 'Servicio', 'Producto', 'Propina', 'Método de pago', 'Efectivo', 'Tarjeta', 'Transferencia', 'Total', 'Estado'], rows);
    };

    const totalPages = Math.ceil(sales.length / itemsPerPage);
    const page = sales.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalFiltered = sales.filter(v => v.status !== 'refunded').reduce((s, v) => s + Number(v.total), 0);
    const serviceNames = [...new Set(services.map(s => s.name))];
    const productNames = [...new Set(products.map(p => p.name))];

    const periodLabel = periodFilter === 'today' ? 'Hoy' : periodFilter === 'week' ? 'Esta semana' : periodFilter === 'month' ? 'Este mes' : 'Personalizado';

    const field = 'w-full h-11 px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text outline-none focus:border-bos-accent';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const th = 'px-4 py-3 text-[13px] font-medium';
    const iconBtn = 'h-11 w-11 inline-flex items-center justify-center rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised align-middle';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Registro de ventas</h1>
                    <p className="text-bos-muted text-sm mt-1">Se actualiza cada 30 s · {sales.length} ventas ({periodLabel})</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => fetchSales()} aria-label="Actualizar" title="Actualizar" className="h-[52px] w-[52px] inline-flex items-center justify-center border border-bos-border rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised"><RefreshCw className="h-4 w-4" /></button>
                    <button onClick={exportCSV} className="min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text font-semibold hover:bg-bos-raised flex items-center gap-2">
                        <Download className="h-4 w-4" />CSV
                    </button>
                    <button onClick={() => setShowCreateModal(true)} className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold hover:opacity-90 flex items-center gap-2">
                        <Plus className="h-4 w-4" />Nueva venta
                    </button>
                </div>
            </header>

            {/* Periodo */}
            <div role="group" aria-label="Periodo" className="flex flex-wrap gap-2">
                {(['today', 'week', 'month', 'custom'] as PeriodFilter[]).map(p => (
                    <button key={p} type="button" aria-pressed={periodFilter === p} onClick={() => handlePeriodChange(p)}
                        className={`min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${periodFilter === p ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:text-bos-text'}`}>
                        {p === 'today' ? 'Diaria' : p === 'week' ? 'Semanal' : p === 'month' ? 'Mensual' : 'Rango'}
                    </button>
                ))}
            </div>

            {/* Filtros */}
            <div className="rounded-xl border border-bos-border bg-bos-surface p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                    <div><label htmlFor="f-start" className={label}>Fecha inicio</label><input id="f-start" type="date" value={dateRange.start} onChange={e => { setPeriodFilter('custom'); setDateRange(p => ({ ...p, start: e.target.value })); setCurrentPage(1); }} className={field} /></div>
                    <div><label htmlFor="f-end" className={label}>Fecha fin</label><input id="f-end" type="date" value={dateRange.end} onChange={e => { setPeriodFilter('custom'); setDateRange(p => ({ ...p, end: e.target.value })); setCurrentPage(1); }} className={field} /></div>
                    <div><label htmlFor="f-barber" className={label}>Barbero</label><select id="f-barber" value={selectedBarber} onChange={e => { setSelectedBarber(e.target.value); setCurrentPage(1); }} className={field}><option value="all">Todos</option>{barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                    <div><label htmlFor="f-service" className={label}>Servicio</label><select id="f-service" value={selectedService} onChange={e => { setSelectedService(e.target.value); setCurrentPage(1); }} className={field}><option value="all">Todos</option>{serviceNames.map(sn => <option key={sn} value={sn}>{sn}</option>)}</select></div>
                    <div><label htmlFor="f-product" className={label}>Producto</label><select id="f-product" value={selectedProduct} onChange={e => { setSelectedProduct(e.target.value); setCurrentPage(1); }} className={field}><option value="all">Todos</option>{productNames.map(pn => <option key={pn} value={pn}>{pn}</option>)}</select></div>
                    <div><label htmlFor="f-method" className={label}>Método de pago</label><select id="f-method" value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); setCurrentPage(1); }} className={field}><option value="all">Todos</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="mixed">Mixto</option></select></div>
                </div>
                <button onClick={clearFilters} className="min-h-11 text-sm text-bos-muted hover:text-bos-text font-semibold flex items-center gap-1.5"><X className="h-4 w-4" /> Limpiar filtros</button>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-bos-border bg-bos-surface p-4 sm:p-5"><p className="text-[13px] font-medium text-bos-muted">Total generado</p><p className="mt-1 font-display text-2xl sm:text-3xl font-semibold tabular-nums text-bos-accent-text">${totalFiltered.toFixed(2)}</p></div>
                <div className="rounded-xl border border-bos-border bg-bos-surface p-4 sm:p-5"><p className="text-[13px] font-medium text-bos-muted">Ventas</p><p className="mt-1 font-display text-2xl sm:text-3xl font-semibold tabular-nums">{sales.length}</p></div>
            </div>

            {/* Tabla */}
            <div className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={th}>Fecha</th>
                                <th className={th}>Hora</th>
                                <th className={th}>Barbero</th>
                                <th className={th}>Servicio</th>
                                <th className={th}>Producto</th>
                                <th className={`${th} text-right`}>Propina</th>
                                <th className={th}>Método de pago</th>
                                <th className={`${th} text-right`}>Total</th>
                                <th className={`${th} text-center`}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="border-t border-bos-border"><td colSpan={9} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-bos-muted" /></td></tr>
                            ) : page.length === 0 ? (
                                <tr className="border-t border-bos-border"><td colSpan={9} className="p-8 text-center text-bos-muted">Sin resultados para {periodLabel}</td></tr>
                            ) : page.map(sale => {
                                const d = new Date(sale.created_at);
                                const srvs = sale.items?.filter(i => i.item_type === 'service').map(i => i.item_name).join(', ') || '—';
                                const prds = sale.items?.filter(i => i.item_type === 'product').map(i => `${i.item_name}${(i.quantity || 1) > 1 ? ` x${i.quantity}` : ''}`).join(', ') || '—';
                                return (
                                    <tr key={sale.id} className="border-t border-bos-border hover:bg-bos-raised">
                                        <td className="px-4 py-3 font-medium whitespace-nowrap">{format(d, 'MMM dd, yyyy')}</td>
                                        <td className="px-4 py-3 text-bos-muted whitespace-nowrap">{format(d, 'hh:mm a')}</td>
                                        <td className="px-4 py-3 font-medium">{sale.barber?.name || '—'}</td>
                                        <td className="px-4 py-3">{srvs}</td>
                                        <td className="px-4 py-3 text-bos-muted">{prds}</td>
                                        <td className="px-4 py-3 text-right tabular-nums">${Number(sale.tip || 0).toFixed(2)}</td>
                                        <td className="px-4 py-3"><PaymentBadge sale={sale} /></td>
                                        <td className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${sale.status === 'refunded' ? 'line-through text-bos-muted' : ''}`}>${Number(sale.total).toFixed(2)}{sale.status === 'refunded' && <span className="ml-2 text-xs no-underline text-bos-danger font-semibold align-middle inline-block">Anulada</span>}</td>
                                        <td className="px-4 py-1 text-center whitespace-nowrap">
                                            <Link href={`/ticket/${sale.id}`} aria-label="Ver ticket" title="Ver ticket" className={iconBtn}>
                                                <FileText className="h-4 w-4" />
                                            </Link>
                                            <button onClick={() => { setDeleteError(''); setShowDeleteConfirm(sale.id); }} disabled={deletingId === sale.id || sale.status === 'refunded'} aria-label="Anular venta" className={`${iconBtn} hover:text-bos-danger disabled:opacity-40`}>
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
                    <div className="p-4 border-t border-bos-border flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm text-bos-muted">Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, sales.length)} de {sales.length}</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} aria-label="Página anterior" className="h-11 w-11 inline-flex items-center justify-center border border-bos-border rounded-xl hover:bg-bos-raised disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                            <span className="px-3 font-semibold text-sm tabular-nums">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} aria-label="Página siguiente" className="h-11 w-11 inline-flex items-center justify-center border border-bos-border rounded-xl hover:bg-bos-raised disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* Confirmar anulación */}
            {showDeleteConfirm && (
                <Modal title="¿Anular esta venta?" subtitle="Se devuelve el dinero a la caja abierta y las existencias, y queda registrado quién la anuló. La venta no se borra."
                    onClose={() => { setShowDeleteConfirm(null); setReverseReason(''); }}>
                    <label htmlFor="reverse-reason" className={label}>Motivo de la anulación</label>
                    <textarea id="reverse-reason" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} maxLength={500} rows={2}
                        className="w-full px-3 py-2.5 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text outline-none focus:border-bos-accent resize-none" />
                    {deleteError && <p role="alert" className="mt-3 text-sm text-bos-danger">{deleteError}</p>}
                    <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                        <button onClick={() => { setShowDeleteConfirm(null); setReverseReason(''); }} className="min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text font-semibold hover:bg-bos-raised">Cancelar</button>
                        <button onClick={() => handleDelete(showDeleteConfirm)} disabled={deletingId !== null || reverseReason.trim().length < 3}
                            className="min-h-[52px] px-5 rounded-xl border border-bos-danger text-bos-danger font-bold hover:bg-bos-raised disabled:opacity-50 flex items-center justify-center gap-2">
                            {deletingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Anular venta
                        </button>
                    </div>
                </Modal>
            )}

            {/* Crear venta manual */}
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
