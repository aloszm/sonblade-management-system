'use client';

import React, { useState } from 'react';
import { Package, Download, Plus, Search, MoreVertical, AlertTriangle, CheckCircle, X, DollarSign, Loader2 } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { getProducts, getProductStats, createProduct } from '@/lib/services/products';
import type { Product, CreateProduct } from '@/types';

const Inventory: React.FC = () => {
    const [modalOpen, setModalOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | 'low'>('all');
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);

    // Form state for new product
    const [form, setForm] = useState<CreateProduct>({
        name: '', sku: '', category: 'Ceras', stock: 0, min_stock: 5, cost: 0, price: 0,
    });

    // Fetch data from Supabase
    const { data: products, loading, error, refetch } = useSupabase<Product[]>(getProducts);
    const { data: stats, refetch: refetchStats } = useSupabase(getProductStats);

    // Filter & search
    const filteredProducts = (products || [])
        .filter(p => filter === 'all' || ['low', 'critical', 'empty'].includes(p.status))
        .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

    const handleSave = async () => {
        if (!form.name || !form.sku) return;
        setSaving(true);
        try {
            await createProduct(form);
            setModalOpen(false);
            setForm({ name: '', sku: '', category: 'Ceras', stock: 0, min_stock: 5, cost: 0, price: 0 });
            refetch();
            refetchStats();
        } catch (err) {
            console.error('Error saving product:', err);
            alert('Error al guardar producto');
        } finally {
            setSaving(false);
        }
    };

    const getStockPercentage = (p: Product) => {
        const max = Math.max(p.stock, p.min_stock * 4, 20);
        return Math.min(100, Math.round((p.stock / max) * 100));
    };

    const getStockColor = (status: Product['status']) => {
        switch (status) {
            case 'ok': return 'bg-sonblade-success';
            case 'low': return 'bg-yellow-500';
            case 'critical': return 'bg-red-500';
            case 'empty': return 'bg-gray-400';
        }
    };

    return (
        <div className="max-w-[1600px] mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
                    <p className="text-sm text-gray-500 mt-1">Gestión general de productos y stock</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors">
                        <Download className="h-4 w-4" /> Exportar
                    </button>
                    <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-sonblade-primary text-white rounded-lg text-sm font-medium shadow-sm hover:bg-sonblade-dark transition-colors">
                        <Plus className="h-5 w-5" /> Agregar Producto
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="p-2 bg-blue-50 rounded-lg text-sonblade-primary w-fit mb-4"><Package className="h-5 w-5" /></div>
                    <h3 className="text-sm font-medium text-gray-500">Total Productos</h3>
                    <div className="mt-2 text-3xl font-bold text-gray-900">{stats?.total ?? '—'}</div>
                </div>
                <div className="bg-red-600 p-5 rounded-xl border border-red-700 shadow-sm text-white">
                    <div className="p-2 bg-white/20 rounded-lg text-white w-fit mb-4"><AlertTriangle className="h-5 w-5" /></div>
                    <h3 className="text-sm font-medium text-white/90">Stock Bajo</h3>
                    <div className="mt-2 text-3xl font-bold">{stats?.lowStock ?? '—'}</div>
                    <p className="text-xs text-white/80 mt-1">Requieren restock urgente</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="p-2 bg-gray-100 rounded-lg text-gray-600 w-fit mb-4"><Package className="h-5 w-5" /></div>
                    <h3 className="text-sm font-medium text-gray-500">Sin Stock</h3>
                    <div className="mt-2 text-3xl font-bold text-gray-900">{stats?.outOfStock ?? '—'}</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="p-2 bg-green-50 rounded-lg text-green-600 w-fit mb-4"><DollarSign className="h-5 w-5" /></div>
                    <h3 className="text-sm font-medium text-gray-500">Valor Inventario</h3>
                    <div className="mt-2 text-3xl font-bold text-gray-900">
                        ${stats?.totalValue?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '—'}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col lg:flex-row gap-4 justify-between items-center">
                <div className="flex bg-gray-100 p-1 rounded-lg w-full lg:w-auto">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                    >Todos</button>
                    <button
                        onClick={() => setFilter('low')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md ${filter === 'low' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                    >Stock Bajo</button>
                </div>
                <div className="flex gap-3 w-full lg:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 text-gray-400 h-5 w-5" />
                        <input
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sonblade-primary outline-none"
                            placeholder="Buscar producto..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Loading / Error */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-sonblade-primary" />
                    <span className="ml-3 text-gray-500">Cargando inventario...</span>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center mb-6">
                    <p className="text-red-700 font-medium">Error: {error}</p>
                    <button onClick={refetch} className="mt-2 text-sm text-red-600 underline">Reintentar</button>
                </div>
            )}

            {/* Table */}
            {!loading && !error && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Categoría</th>
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase w-1/4">Stock</th>
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase">Precios</th>
                                <th className="py-4 px-6 text-xs font-semibold text-gray-500 uppercase text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-gray-500">
                                        No se encontraron productos
                                    </td>
                                </tr>
                            )}
                            {filteredProducts.map((p) => {
                                const pct = getStockPercentage(p);
                                const isLow = ['low', 'critical', 'empty'].includes(p.status);
                                return (
                                    <tr key={p.id} className={`hover:bg-gray-50 ${isLow ? 'bg-yellow-50/30' : ''}`}>
                                        <td className="py-4 px-6">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 ${isLow ? 'bg-yellow-50 text-yellow-500' : 'bg-green-50 text-sonblade-success'} rounded-lg flex items-center justify-center`}>
                                                    {isLow ? <AlertTriangle className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900 text-[15px]">{p.name}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5">SKU: {p.sku}</div>
                                                    {isLow && (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-200 mt-1">
                                                            {p.status === 'empty' ? 'SIN STOCK' : 'STOCK BAJO'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                {p.category}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-baseline gap-2">
                                                    <span className={`text-lg font-bold ${isLow ? 'text-yellow-700' : 'text-gray-900'}`}>{p.stock}</span>
                                                    <span className="text-xs text-gray-500">unidades</span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-2">
                                                    <div className={`${getStockColor(p.status)} h-2 rounded-full`} style={{ width: `${pct}%` }}></div>
                                                </div>
                                                <div className={`text-[11px] font-medium ${isLow ? 'text-red-500' : 'text-gray-500'}`}>
                                                    {pct}% {isLow ? 'crítico' : 'capacidad'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex flex-col">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-500">Costo:</span>
                                                    <span className="font-medium">${p.cost.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm mt-1">
                                                    <span className="text-sonblade-primary font-medium">Venta:</span>
                                                    <span className="font-bold text-sonblade-primary">${p.price.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <button className="text-gray-400 hover:text-gray-600">
                                                <MoreVertical className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal Add Product */}
            {modalOpen && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[600px] max-h-[90vh] flex flex-col">
                        <div className="px-8 pt-6 pb-4 border-b border-gray-100 flex justify-between items-center bg-white rounded-t-2xl z-10">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-50 p-2 rounded-lg"><Plus className="text-sonblade-primary h-6 w-6" /></div>
                                <h2 className="text-xl font-bold text-gray-900">Agregar Nuevo Producto</h2>
                            </div>
                            <button onClick={() => setModalOpen(false)}><X className="text-gray-400 hover:text-gray-600" /></button>
                        </div>
                        <div className="p-8 overflow-y-auto">
                            <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                                <section>
                                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Package className="h-4 w-4" /> Información Básica
                                    </h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Nombre del Producto *</label>
                                            <input
                                                type="text"
                                                required
                                                value={form.name}
                                                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                                placeholder="Ej: Cera Premium"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">SKU (Código) *</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={form.sku}
                                                    onChange={(e) => setForm(f => ({ ...f, sku: e.target.value }))}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                                    placeholder="Ej: CER-001"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Categoría *</label>
                                                <select
                                                    value={form.category}
                                                    onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                                >
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
                                                <label className="block text-sm font-medium text-gray-700">Stock Inicial</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={form.stock}
                                                    onChange={(e) => setForm(f => ({ ...f, stock: Number(e.target.value) }))}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Stock Mínimo</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={form.min_stock}
                                                    onChange={(e) => setForm(f => ({ ...f, min_stock: Number(e.target.value) }))}
                                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>
                                <section>
                                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <DollarSign className="h-4 w-4" /> Precios
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Precio Costo *</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                required
                                                value={form.cost}
                                                onChange={(e) => setForm(f => ({ ...f, cost: Number(e.target.value) }))}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Precio Venta *</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                required
                                                value={form.price}
                                                onChange={(e) => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-sonblade-primary focus:ring focus:ring-sonblade-primary focus:ring-opacity-50 sm:text-sm p-2 border font-bold text-sonblade-primary"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </form>
                        </div>
                        <div className="px-8 py-5 bg-gray-50 border-t border-gray-200 rounded-b-2xl flex justify-end gap-3">
                            <button onClick={() => setModalOpen(false)} className="px-5 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50">Cancelar</button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-5 py-2.5 bg-sonblade-primary border border-transparent rounded-lg text-white font-medium hover:bg-sonblade-dark flex items-center gap-2 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                {saving ? 'Guardando...' : 'Guardar Producto'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Inventory;