'use client';

import React, { useState } from 'react';
import { Package, Download, Plus, Search, AlertTriangle, CheckCircle, Loader2, Edit2, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useSupabase } from '@/hooks/useSupabase';
import type { Product, CreateProduct } from '@/types';
import { downloadCsv } from '@/lib/utils/csv';
import { localDateKey } from '@/lib/utils/dates';
import DatePicker from '@/components/ui/DatePicker';

const Inventory: React.FC = () => {
    const [modalOpen, setModalOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | 'low'>('all');
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saveError, setSaveError] = useState('');
    const [listError, setListError] = useState('');

    // Form state for new product
    const [form, setForm] = useState<CreateProduct & { entry_date?: string; exit_date?: string }>({
        name: '', sku: '', category: 'Ceras', stock: 0, min_stock: 5, cost: 0, price: 0, entry_date: '', exit_date: '',
    });

    // Fetch data from API routes
    const fetchProducts = async () => {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error('Error al cargar productos');
        return res.json();
    };

    const fetchStats = async () => {
        const res = await fetch('/api/products/stats');
        if (!res.ok) throw new Error('Error al cargar métricas');
        return res.json();
    };

    const { data: products, loading, error, refetch } = useSupabase<Product[]>(fetchProducts);
    const { data: stats, refetch: refetchStats } = useSupabase<{ total: number; lowStock: number; outOfStock: number; totalValue: number }>(fetchStats);

    // Filter & search
    const filteredProducts = (products || [])
        .filter(p => filter === 'all' || ['low', 'critical', 'empty'].includes(p.status))
        .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

    const handleSave = async () => {
        if (!form.name || !form.sku) return;
        setSaving(true);
        setSaveError('');
        try {
            const url = editingId ? `/api/products/${editingId}` : '/api/products';
            const method = editingId ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error ? (body.detail ? `${body.error} (${body.detail})` : body.error) : 'Error al guardar producto');
            }

            setModalOpen(false);
            setEditingId(null);
            setForm({ name: '', sku: '', category: 'Ceras', stock: 0, min_stock: 5, cost: 0, price: 0, entry_date: '', exit_date: '' });
            refetch();
            refetchStats();
        } catch (err) {
            console.error('Error saving product:', err);
            setSaveError(err instanceof Error ? err.message : 'Error al guardar producto');
        } finally {
            setSaving(false);
        }
    };

    const handleEditClick = (p: Product) => {
        setForm({
            name: p.name,
            sku: p.sku,
            category: p.category,
            stock: p.stock,
            min_stock: p.min_stock,
            cost: p.cost,
            price: p.price,
            entry_date: p.entry_date || '',
            exit_date: p.exit_date || ''
        });
        setEditingId(p.id);
        setSaveError('');
        setModalOpen(true);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`¿Dar de baja el producto "${name}"?\nYa no aparecerá para vender; su historial se conserva.`)) return;
        setListError('');
        try {
            const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Error deleting product');
            refetch();
            refetchStats();
        } catch (e) {
            console.error(e);
            setListError('No se pudo dar de baja el producto');
        }
    };

    const getStockPercentage = (p: Product) => {
        const max = Math.max(p.stock, p.min_stock * 4, 20);
        return Math.min(100, Math.round((p.stock / max) * 100));
    };

    const getStockColor = (status: Product['status']) => {
        switch (status) {
            case 'ok': return 'bg-bos-success';
            case 'low': return 'bg-bos-accent';
            case 'critical': return 'bg-bos-danger';
            case 'empty': return 'bg-bos-muted';
        }
    };

    const card = 'rounded-xl border border-bos-border bg-bos-surface';
    const field = 'mt-1.5 block w-full h-11 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
    const label = 'block text-[13px] font-medium text-bos-muted';
    const th = 'px-5 py-3 text-[13px] font-medium';
    const sectionTitle = 'text-[13px] font-medium text-bos-muted mb-3';

    return (
        <div className="max-w-[1600px] mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Inventario</h1>
                    <p className="text-sm text-bos-muted mt-1">Gestión general de productos y stock</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => {
                        const label: Record<Product['status'], string> = { ok: 'Normal', low: 'Bajo', critical: 'Crítico', empty: 'Agotado' };
                        downloadCsv(`inventario_${localDateKey(new Date())}.csv`,
                            ['SKU', 'Producto', 'Categoría', 'Existencias', 'Mínimo', 'Costo', 'Precio', 'Valor en inventario', 'Estado'],
                            (products || []).map(p => [p.sku, p.name, p.category, p.stock, p.min_stock, p.cost, p.price, p.price * p.stock, label[p.status]]));
                    }} className="min-h-[52px] flex items-center gap-2 px-5 border border-bos-border rounded-xl font-semibold text-bos-text hover:bg-bos-raised transition-colors">
                        <Download className="h-4 w-4" /> Exportar
                    </button>
                    <button onClick={() => {
                        setEditingId(null);
                        setSaveError('');
                        setForm({ name: '', sku: '', category: 'Ceras', stock: 0, min_stock: 5, cost: 0, price: 0 });
                        setModalOpen(true);
                    }} className="min-h-[52px] flex items-center gap-2 px-5 bg-bos-accent text-bos-on-accent rounded-xl font-bold hover:bg-bos-accent-strong transition-opacity">
                        <Plus className="h-5 w-5" /> Agregar producto
                    </button>
                </div>
            </header>

            {listError && <p role="alert" className={`${card} p-3 text-sm text-bos-danger`}>{listError}</p>}

            {/* Resumen */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={`${card} p-5`}>
                    <h3 className="text-[13px] font-medium text-bos-muted">Total de productos</h3>
                    <div className="mt-1 font-display text-3xl font-semibold tabular-nums">{stats?.total ?? '—'}</div>
                </div>
                <div className={`${card} p-5`}>
                    <h3 className="text-[13px] font-medium text-bos-muted">Stock bajo</h3>
                    <div className="mt-1 font-display text-3xl font-semibold tabular-nums text-bos-danger">{stats?.lowStock ?? '—'}</div>
                    <p className="text-xs text-bos-muted mt-1">Requieren reposición</p>
                </div>
                <div className={`${card} p-5`}>
                    <h3 className="text-[13px] font-medium text-bos-muted">Sin stock</h3>
                    <div className="mt-1 font-display text-3xl font-semibold tabular-nums">{stats?.outOfStock ?? '—'}</div>
                </div>
                <div className={`${card} p-5`}>
                    <h3 className="text-[13px] font-medium text-bos-muted">Valor del inventario</h3>
                    <div className="mt-1 font-display text-3xl font-semibold tabular-nums text-bos-accent-text">
                        ${stats?.totalValue?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
                <div role="group" aria-label="Filtro de stock" className="flex gap-2">
                    {([['all', 'Todos'], ['low', 'Stock bajo']] as const).map(([key, text]) => (
                        <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
                            className={`min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${filter === key ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:text-bos-text'}`}>{text}</button>
                    ))}
                </div>
                <div className="relative w-full sm:w-72">
                    <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-bos-muted h-5 w-5" />
                    <input
                        className="w-full h-11 pl-11 pr-4 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text"
                        placeholder="Buscar producto..."
                        aria-label="Buscar producto"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Cargando / error */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-bos-muted" />
                    <span className="ml-3 text-bos-muted">Cargando inventario...</span>
                </div>
            )}

            {error && (
                <div role="alert" className={`${card} p-6 text-center`}>
                    <p className="text-bos-danger font-medium">Error: {error}</p>
                    <button onClick={refetch} className="mt-2 min-h-11 px-4 text-sm font-semibold text-bos-text underline">Reintentar</button>
                </div>
            )}

            {/* Tabla */}
            {!loading && !error && (
                <div className={`${card} overflow-hidden`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="text-bos-muted">
                                <tr>
                                    <th className={th}>Producto</th>
                                    <th className={th}>Categoría</th>
                                    <th className={`${th} w-1/4 min-w-[10rem]`}>Stock</th>
                                    <th className={th}>Precios</th>
                                    <th className={`${th} text-right`}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.length === 0 && (
                                    <tr className="border-t border-bos-border">
                                        <td colSpan={5} className="py-12 text-center text-bos-muted">
                                            No se encontraron productos
                                        </td>
                                    </tr>
                                )}
                                {filteredProducts.map((p) => {
                                    const pct = getStockPercentage(p);
                                    const isLow = ['low', 'critical', 'empty'].includes(p.status);
                                    return (
                                        <tr key={p.id} className="border-t border-bos-border hover:bg-bos-raised">
                                            <td className="px-5 py-4">
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${isLow ? 'bg-bos-accent-soft text-bos-accent-text' : 'bg-bos-raised text-bos-muted'}`}>
                                                        {isLow ? <AlertTriangle className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-[15px]">{p.name}</div>
                                                        <div className="text-xs text-bos-muted mt-0.5">SKU: {p.sku}</div>
                                                        {isLow && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-bos-accent-soft text-bos-accent-text border border-bos-border mt-1">
                                                                {p.status === 'empty' ? 'Sin stock' : 'Stock bajo'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-bos-raised text-bos-text border border-bos-border">
                                                    {p.category}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-baseline gap-2">
                                                        <span className={`font-display text-lg font-semibold tabular-nums ${isLow ? 'text-bos-accent-text' : ''}`}>{p.stock}</span>
                                                        <span className="text-xs text-bos-muted">unidades</span>
                                                    </div>
                                                    <div className="w-full bg-bos-raised rounded-full h-2">
                                                        <div className={`${getStockColor(p.status)} h-2 rounded-full`} style={{ width: `${pct}%` }}></div>
                                                    </div>
                                                    <div className={`text-xs ${isLow ? 'text-bos-danger font-medium' : 'text-bos-muted'}`}>
                                                        {pct}% {isLow ? 'crítico' : 'capacidad'}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <div className="flex justify-between gap-4 text-sm">
                                                        <span className="text-bos-muted">Costo:</span>
                                                        <span className="font-medium tabular-nums">${p.cost.toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 text-sm mt-1">
                                                        <span className="text-bos-muted">Venta:</span>
                                                        <span className="font-semibold tabular-nums">${p.price.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-2 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => handleEditClick(p)} className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-text hover:bg-bos-raised rounded-xl transition-colors" title="Editar / Ajustar Stock" aria-label={`Editar ${p.name}`}>
                                                        <Edit2 className="h-4 w-4" />
                                                    </button>
                                                    <button onClick={() => handleDelete(p.id, p.name)} className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-danger hover:bg-bos-raised rounded-xl transition-colors" title="Dar de baja" aria-label={`Dar de baja ${p.name}`}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Ventana: agregar o editar producto */}
            {modalOpen && (
                <Modal title={editingId ? 'Editar producto' : 'Agregar nuevo producto'} size="lg" onClose={() => setModalOpen(false)}>
                    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                        <section>
                            <h3 className={sectionTitle}>Información básica</h3>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="p-name" className={label}>Nombre del producto *</label>
                                    <input id="p-name" type="text" required value={form.name}
                                        onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                                        className={field} placeholder="Ej: Cera Premium" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="p-sku" className={label}>SKU (código) *</label>
                                        <input id="p-sku" type="text" required value={form.sku}
                                            onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))}
                                            className={field} placeholder="Ej: CER-001" />
                                    </div>
                                    <div>
                                        <label htmlFor="p-category" className={label}>Categoría *</label>
                                        <select id="p-category" value={form.category}
                                            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                            className={field}>
                                            <option>Ceras</option>
                                            <option>Pomadas</option>
                                            <option>Geles</option>
                                            <option>Shampoos</option>
                                            <option>Aceites</option>
                                            <option>Accesorios</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="p-stock" className={label}>Stock inicial</label>
                                        <input id="p-stock" type="number" inputMode="numeric" min="0" value={form.stock}
                                            onChange={(e) => setForm(f => ({ ...f, stock: Number(e.target.value) }))} className={field} />
                                    </div>
                                    <div>
                                        <label htmlFor="p-min" className={label}>Stock mínimo</label>
                                        <input id="p-min" type="number" inputMode="numeric" min="0" value={form.min_stock}
                                            onChange={(e) => setForm(f => ({ ...f, min_stock: Number(e.target.value) }))} className={field} />
                                    </div>
                                </div>
                            </div>
                        </section>
                        <section>
                            <h3 className={sectionTitle}>Precios</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="p-cost" className={label}>Precio costo *</label>
                                    <input id="p-cost" type="number" inputMode="decimal" step="0.01" required value={form.cost}
                                        onChange={(e) => setForm(f => ({ ...f, cost: Number(e.target.value) }))} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="p-price" className={label}>Precio venta *</label>
                                    <input id="p-price" type="number" inputMode="decimal" step="0.01" required value={form.price}
                                        onChange={(e) => setForm(f => ({ ...f, price: Number(e.target.value) }))} className={`${field} font-semibold`} />
                                </div>
                            </div>
                        </section>
                        <section>
                            <h3 className={sectionTitle}>Fechas</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="p-entry" className={label}>Fecha de ingreso</label>
                                    <DatePicker id="p-entry" clearable value={form.entry_date || ''} onChange={(v) => setForm(f => ({ ...f, entry_date: v }))} className={field} />
                                </div>
                                <div>
                                    <label htmlFor="p-exit" className={label}>Fecha de egreso (opcional)</label>
                                    <DatePicker id="p-exit" clearable value={form.exit_date || ''} onChange={(v) => setForm(f => ({ ...f, exit_date: v }))} className={field} />
                                </div>
                            </div>
                        </section>
                        {saveError && <p role="alert" className="text-sm text-bos-danger">{saveError}</p>}
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                            <button type="button" onClick={() => setModalOpen(false)} className="min-h-[52px] px-5 border border-bos-border rounded-xl text-bos-text font-semibold hover:bg-bos-raised">Cancelar</button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="min-h-[52px] px-5 bg-bos-accent text-bos-on-accent rounded-xl font-bold hover:bg-bos-accent-strong flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                {saving ? 'Guardando...' : 'Guardar producto'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default Inventory;
