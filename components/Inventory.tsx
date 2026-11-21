'use client';

import React, { useState } from 'react';
import { ReadOnlyNotice, useReadOnly } from '@/lib/auth/read-only';
import { Package, Download, Plus, Search, AlertTriangle, CheckCircle, Edit2, Trash2, PackagePlus } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import PinConfirm from '@/components/ui/PinConfirm';
import { useSupabase } from '@/hooks/useSupabase';
import type { Product, CreateProduct } from '@/types';
import { downloadCsv } from '@/lib/utils/csv';
import { localDateKey } from '@/lib/utils/dates';
import { formatMoney } from '@/lib/utils/money';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { HttpError, MSG_OFFLINE, readJson, toUserMessage } from '@/lib/utils/errors';
import Field from '@/components/ui/Field';
import { useNavUser } from '@/hooks/useNavUser';
import { RECEIVE_COMMENT_MAX, RECEIVE_MAX, receiveCommentProblem, receiveQuantityProblem } from '@/lib/inventory/receive';
import { DEFAULT_PRODUCT_CATEGORY, PRODUCT_COST_HELP, productCategoryOptions, productCostProblem, productFormProblems, productsWithoutCost, type ProductFormProblems } from '@/lib/inventory/products-view';

/** Resumen de /api/products/stats. El valor a costo solo llega a quien puede ver costos (dueño, gerencia, consulta). */
type InventoryStats = { total: number; lowStock: number; outOfStock: number; totalValue: number; totalCost?: number };
const EMPTY_FORM: CreateProduct = { name: '', sku: '', category: DEFAULT_PRODUCT_CATEGORY, stock: 0, min_stock: 5, cost: 0, price: 0 };

const Inventory: React.FC = () => {
    // Cuenta de consulta: ve existencias y exporta, sin agregar, editar ni dar de baja.
    const readOnly = useReadOnly();
    // Quién es: recepción y caja solo registran ENTRADAS (con su PIN); no ven costos ni editan productos.
    // Mientras se sabe, no se muestran los controles de gerencia (la API los rechazaría igual).
    const me = useNavUser();
    const frontDesk = me?.role === 'recepcion';
    const writer = Boolean(me) && !readOnly && !me?.readOnly;
    const canManage = writer && me?.role === 'admin';
    const canReceive = writer && (frontDesk || me?.role === 'admin');
    const [modalOpen, setModalOpen] = useState(false);
    const [filter, setFilter] = useState<'all' | 'low' | 'nocost'>('all');
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saveError, setSaveError] = useState('');
    // Costo obligatorio: se avisa junto al campo antes de mandar nada.
    const [costError, setCostError] = useState('');
    const [listError, setListError] = useState('');
    // Baja de producto pendiente de confirmar (reemplaza a window.confirm).
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    // Entradas, salidas y mínimo: se confirman con PIN y comentario (dueño y gerencia).
    const [stockPin, setStockPin] = useState(false);
    // Entrada de mercancía: cantidad y comentario, después el PIN de quien la registra.
    const [receiveTarget, setReceiveTarget] = useState<Product | null>(null);
    const [receiveQty, setReceiveQty] = useState('');
    const [receiveComment, setReceiveComment] = useState('');
    const [receiveErrors, setReceiveErrors] = useState<{ quantity?: string; comment?: string }>({});
    const [receivePin, setReceivePin] = useState(false);
    const [notice, setNotice] = useState('');

    // Producto en captura. El código (SKU) es opcional: los productos reales no lo tienen.
    const [form, setForm] = useState<CreateProduct>(EMPTY_FORM);
    // Avisos propios junto a cada campo (en español), en vez del globo del navegador.
    const [fieldErrors, setFieldErrors] = useState<ProductFormProblems>({});

    // Fetch data from API routes
    // El error que llega a la pantalla ya es un mensaje en español (nunca "Failed to fetch").
    const load = async <T,>(url: string, fallback: string): Promise<T> => {
        try {
            return await readJson<T>(await fetch(url));
        } catch (e) {
            throw new Error(toUserMessage(e, fallback));
        }
    };
    const fetchProducts = () => load<Product[]>('/api/products', 'No se pudieron cargar los productos.');
    const fetchStats = () => load<InventoryStats>('/api/products/stats', 'No se pudieron cargar las métricas.');

    const { data: products, loading, error, refetch } = useSupabase<Product[]>(fetchProducts);
    const { data: stats, refetch: refetchStats } = useSupabase<InventoryStats>(fetchStats);

    // Filter & search
    // Productos sin costo: solo los ve quien recibe el costo de la API (gerencia y consulta); recepción no.
    const missingCost = frontDesk ? [] : productsWithoutCost(products || []);
    const filteredProducts = (products || [])
        .filter(p => filter === 'all'
            || (filter === 'low' && ['low', 'critical', 'empty'].includes(p.status))
            || (filter === 'nocost' && missingCost.includes(p)))
        .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

    const editingProduct = editingId ? (products || []).find((p) => p.id === editingId) : undefined;
    const stockChange = editingProduct ? Number(form.stock) - editingProduct.stock : 0;
    const minChanged = editingProduct ? Number(form.min_stock) !== editingProduct.min_stock : false;

    const saveProduct = async (confirm?: { pin: string; comment: string }) => {
        const url = editingId ? `/api/products/${editingId}` : '/api/products';
        const payload = { ...form, name: form.name.trim(), sku: form.sku.trim(), category: form.category.trim() || DEFAULT_PRODUCT_CATEGORY };
        const method = editingId ? 'PATCH' : 'POST';
        let res: Response;
        try {
            res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(confirm ? { ...payload, ...confirm } : payload)
            });
        } catch (e) {
            throw new Error(toUserMessage(e));
        }
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            const text = body?.error ? (body.detail && !body.pin_error ? `${body.error} (${body.detail})` : body.error) : undefined;
            throw new Error(toUserMessage(new HttpError(res.status, text), 'No se pudo guardar el producto.'));
        }
        setStockPin(false);
        setModalOpen(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        refetch();
        refetchStats();
    };

    const handleSave = async () => {
        setSaveError('');
        const problems = productFormProblems(form);
        setFieldErrors(problems);
        const costProblem = productCostProblem(form.cost);
        setCostError(costProblem ?? '');
        if (Object.keys(problems).length > 0 || costProblem) return;
        if (editingProduct && (stockChange !== 0 || minChanged)) { setStockPin(true); return; }
        setSaving(true);
        try {
            await saveProduct();
        } catch (err) {
            console.error('Error saving product:', err);
            setSaveError(toUserMessage(err, 'No se pudo guardar el producto.'));
        } finally {
            setSaving(false);
        }
    };

    const clearFieldError = (key: keyof ProductFormProblems) => setFieldErrors((current) => {
        if (!current[key]) return current;
        const next = { ...current };
        delete next[key];
        return next;
    });

    const handleEditClick = (p: Product) => {
        setForm({
            name: p.name,
            sku: p.sku,
            category: p.category,
            stock: p.stock,
            min_stock: p.min_stock,
            cost: p.cost,
            price: p.price,
        });
        setEditingId(p.id);
        setSaveError('');
        setCostError('');
        setFieldErrors({});
        setModalOpen(true);
    };

    const handleDelete = async ({ id }: { id: string; name: string }) => {
        setListError('');
        setDeleting(true);
        try {
            const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new HttpError(res.status);
            refetch();
            refetchStats();
        } catch (e) {
            console.error(e);
            setListError(toUserMessage(e, 'No se pudo dar de baja el producto.'));
        } finally {
            setDeleting(false);
            setDeleteTarget(null);
        }
    };

    const openReceive = (p: Product) => {
        setReceiveTarget(p);
        setReceiveQty('');
        setReceiveComment('');
        setReceiveErrors({});
        setReceivePin(false);
        setNotice('');
    };
    const closeReceive = () => { setReceiveTarget(null); setReceivePin(false); };
    const receiveQuantity = receiveQty.trim() === '' ? NaN : Number(receiveQty);

    const continueReceive = () => {
        const errors = { quantity: receiveQuantityProblem(receiveQuantity) ?? undefined, comment: receiveCommentProblem(receiveComment) ?? undefined };
        setReceiveErrors(errors);
        if (errors.quantity || errors.comment) return;
        setReceivePin(true);
    };

    const submitReceive = async ({ pin }: { pin: string; comment: string }) => {
        if (!receiveTarget) return;
        let res: Response;
        try {
            res = await fetch(`/api/products/${receiveTarget.id}/receive`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: receiveQuantity, comment: receiveComment.trim(), pin }),
            });
        } catch (e) {
            throw new Error(toUserMessage(e));
        }
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(toUserMessage(new HttpError(res.status, body?.error), 'No se pudo registrar la entrada.'));
        setNotice(`Entrada registrada: ${receiveQuantity} de ${receiveTarget.name}. Ahora hay ${body?.stock ?? receiveTarget.stock + receiveQuantity}.`);
        closeReceive();
        refetch();
        refetchStats();
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
                    <p className="text-sm text-bos-muted mt-1">{frontDesk ? 'Existencias y entradas de mercancía' : 'Gestión general de productos y stock'}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => {
                        const label: Record<Product['status'], string> = { ok: 'Normal', low: 'Bajo', critical: 'Crítico', empty: 'Agotado' };
                        const file = `inventario_${localDateKey(new Date())}.csv`;
                        if (frontDesk) {
                            downloadCsv(file, ['SKU', 'Producto', 'Categoría', 'Existencias', 'Mínimo', 'Precio', 'Estado'],
                                (products || []).map(p => [p.sku, p.name, p.category, p.stock, p.min_stock, p.price, label[p.status]]));
                            return;
                        }
                        downloadCsv(file,
                            ['SKU', 'Producto', 'Categoría', 'Existencias', 'Mínimo', 'Costo', 'Precio', 'Valor a costo', 'Valor a precio de venta', 'Estado'],
                            (products || []).map(p => [p.sku, p.name, p.category, p.stock, p.min_stock, p.cost, p.price, p.cost * p.stock, p.price * p.stock, label[p.status]]));
                    }} className="min-h-[52px] flex items-center gap-2 px-5 border border-bos-border rounded-xl font-semibold text-bos-text hover:bg-bos-raised transition-colors">
                        <Download className="h-4 w-4" /> Exportar
                    </button>
                    {canManage && <button onClick={() => {
                        setEditingId(null);
                        setSaveError('');
                        setCostError('');
                        setFieldErrors({});
                        setForm(EMPTY_FORM);
                        setModalOpen(true);
                    }} className="min-h-[52px] flex items-center gap-2 px-5 bg-bos-accent text-bos-on-accent rounded-xl font-bold hover:bg-bos-accent-strong transition-opacity">
                        <Plus className="h-5 w-5" /> Agregar producto
                    </button>}
                </div>
            </header>
            <ReadOnlyNotice readOnly={readOnly} />

            {listError && <p role="alert" className={`${card} p-3 text-sm text-bos-danger`}>{listError}</p>}
            {missingCost.length > 0 && (
                <div role="alert" data-testid="inventory-missing-cost" className={`${card} p-4 flex flex-col sm:flex-row sm:items-center gap-3 border-bos-danger`}>
                    <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-danger" />
                    <p className="text-sm flex-1">
                        <strong>{missingCost.length === 1 ? '1 producto sin costo' : `${missingCost.length} productos sin costo`}</strong>: la utilidad no es confiable hasta capturarlo.
                        {' '}<span className="text-bos-muted">{missingCost.slice(0, 3).map((p) => p.name).join(', ')}{missingCost.length > 3 ? '…' : ''}</span>
                    </p>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setFilter('nocost')}>Ver cuáles</Button>
                        {canManage && (
                            <Button size="sm" onClick={() => handleEditClick(missingCost[0])}>
                                {missingCost.length === 1 ? 'Capturar costo' : `Capturar costo de «${missingCost[0].name}»`}
                            </Button>
                        )}
                    </div>
                </div>
            )}
            {notice && <p role="status" className={`${card} p-3 text-sm text-bos-text`}>{notice}</p>}

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
                <div data-testid="inventory-value" className={`${card} p-5`}>
                    <h3 className="text-[13px] font-medium text-bos-muted">Valor del inventario</h3>
                    <div className="mt-1 font-display text-3xl font-semibold tabular-nums text-bos-accent-text">
                        {stats?.totalValue != null ? formatMoney(stats.totalValue, { cents: true }) : '—'}
                    </div>
                    <p className="text-xs text-bos-muted mt-1">A precio de venta: lo que entraría si se vende todo.</p>
                    {!frontDesk && stats?.totalCost != null && (
                        <p data-testid="inventory-value-cost" className="text-xs text-bos-muted mt-1">
                            A costo: <span className="font-semibold tabular-nums text-bos-text">{formatMoney(stats.totalCost, { cents: true })}</span> (lo que pagaste por él).
                        </p>
                    )}
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
                <div role="group" aria-label="Filtro de stock" className="flex gap-2">
                    {([['all', 'Todos'], ['low', 'Stock bajo'], ...(missingCost.length > 0 ? [['nocost', 'Sin costo']] as const : [])] as const).map(([key, text]) => (
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
                <div role="status" aria-busy="true" className="space-y-3 py-4">
                    <span className="sr-only">Cargando inventario…</span>
                    {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
            )}

            {error && (
                <ErrorState title="No se pudo cargar el inventario" message={error} offline={error === MSG_OFFLINE} onRetry={refetch} />
            )}

            {/* Tabla */}
            {!loading && !error && (
                <div className={`${card} overflow-hidden`}>
                    <div className="overflow-x-auto">
                        <table className="bos-stack w-full text-left border-collapse">
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
                                            <td data-label="" className="px-5 py-4">
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${isLow ? 'bg-bos-accent-soft text-bos-accent-text' : 'bg-bos-raised text-bos-muted'}`}>
                                                        {isLow ? <AlertTriangle className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-[15px]">{p.name}</div>
                                                        {p.sku && <div className="text-xs text-bos-muted mt-0.5">Código: {p.sku}</div>}
                                                        {isLow && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-bos-accent-soft text-bos-accent-text border border-bos-border mt-1">
                                                                {p.status === 'empty' ? 'Sin stock' : 'Stock bajo'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="Categoría" className="px-5 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-bos-raised text-bos-text border border-bos-border">
                                                    {p.category}
                                                </span>
                                            </td>
                                            <td data-label="Existencias" className="px-5 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-baseline gap-2">
                                                        <span className={`font-display text-lg font-semibold tabular-nums ${isLow ? 'text-bos-accent-text' : ''}`}>{p.stock}</span>
                                                        <span className="text-xs text-bos-muted">unidades</span>
                                                    </div>
                                                    <div className="w-full bg-bos-raised rounded-full h-2">
                                                        <div className={`${getStockColor(p.status)} h-2 rounded-full`} style={{ width: `${pct}%` }}></div>
                                                    </div>
                                                    <div className={`text-xs ${isLow ? 'text-bos-danger font-medium' : 'text-bos-muted'}`}>
                                                        {p.min_stock > 0 ? `Mínimo: ${p.min_stock}` : 'Sin mínimo definido'}{isLow ? (p.status === 'empty' ? ' · agotado' : ' · hay que surtir') : ''}
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="Precios" className="px-5 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    {!frontDesk && <div className="flex justify-between gap-4 text-sm mb-1">
                                                        <span className="text-bos-muted">Costo:</span>
                                                        <span className="font-medium tabular-nums">{formatMoney(p.cost, { cents: true })}</span>
                                                    </div>}
                                                    <div className="flex justify-between gap-4 text-sm">
                                                        <span className="text-bos-muted">Venta:</span>
                                                        <span className="font-semibold tabular-nums">{formatMoney(p.price, { cents: true })}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td data-label="" className="px-5 py-2 text-right">
                                                <div className="flex justify-end items-center gap-1">
                                                    {canReceive && (
                                                        <Button variant="secondary" size="sm" onClick={() => openReceive(p)} aria-label={`Registrar entrada de ${p.name}`}>
                                                            <PackagePlus aria-hidden="true" className="h-4 w-4" /> Registrar entrada
                                                        </Button>
                                                    )}
                                                    {canManage && <>
                                                    <button onClick={() => handleEditClick(p)} className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-text hover:bg-bos-raised rounded-xl transition-colors" title="Editar / Ajustar Stock" aria-label={`Editar ${p.name}`}>
                                                        <Edit2 className="h-4 w-4" />
                                                    </button>
                                                    <button onClick={() => setDeleteTarget({ id: p.id, name: p.name })} className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-danger hover:bg-bos-raised rounded-xl transition-colors" title="Dar de baja" aria-label={`Dar de baja ${p.name}`}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                    </>}
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
                    <form className="space-y-6" noValidate onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                        <section>
                            <h3 className={sectionTitle}>Información básica</h3>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="p-name" className={label}>Nombre del producto *</label>
                                    <input id="p-name" type="text" required value={form.name}
                                        aria-invalid={fieldErrors.name ? true : undefined} aria-describedby={fieldErrors.name ? 'p-name-error' : undefined}
                                        onChange={(e) => { clearFieldError('name'); setForm(f => ({ ...f, name: e.target.value })); }}
                                        className={field} placeholder="Ej: Cera Premium" />
                                    {fieldErrors.name && <p id="p-name-error" role="alert" className="text-xs text-bos-danger mt-1">{fieldErrors.name}</p>}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="p-sku" className={label}>Código o SKU (opcional)</label>
                                        <input id="p-sku" type="text" value={form.sku} maxLength={60}
                                            aria-invalid={fieldErrors.sku ? true : undefined} aria-describedby={fieldErrors.sku ? 'p-sku-help p-sku-error' : 'p-sku-help'}
                                            onChange={(e) => { clearFieldError('sku'); setForm(f => ({ ...f, sku: e.target.value })); }}
                                            className={field} placeholder="Ej: CER-001" />
                                        <p id="p-sku-help" className="text-xs text-bos-muted mt-1.5">Si el producto no trae código, déjalo vacío.</p>
                                        {fieldErrors.sku && <p id="p-sku-error" role="alert" className="text-xs text-bos-danger mt-1">{fieldErrors.sku}</p>}
                                    </div>
                                    <div>
                                        <label htmlFor="p-category" className={label}>Categoría</label>
                                        {/* La categoría guardada del producto siempre está en la lista: abrir y guardar no la cambia. */}
                                        <select id="p-category" value={form.category}
                                            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                                            className={field}>
                                            {productCategoryOptions(form.category).map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="p-stock" className={label}>{editingId ? 'Existencias' : 'Existencias iniciales'}</label>
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
                                    <input id="p-cost" type="number" inputMode="decimal" step="0.01" min="0.01" required
                                        value={form.cost > 0 ? form.cost : ''} placeholder="Ej: 85.00"
                                        aria-invalid={costError ? true : undefined} aria-describedby={costError ? 'p-cost-help p-cost-error' : 'p-cost-help'}
                                        onChange={(e) => { setCostError(''); setForm(f => ({ ...f, cost: e.target.value === '' ? 0 : Number(e.target.value) })); }} className={field} />
                                    <p id="p-cost-help" className="text-xs text-bos-muted mt-1.5">{PRODUCT_COST_HELP}</p>
                                    {costError && <p id="p-cost-error" role="alert" className="text-xs text-bos-danger mt-1">{costError}</p>}
                                </div>
                                <div>
                                    <label htmlFor="p-price" className={label}>Precio venta *</label>
                                    <input id="p-price" type="number" inputMode="decimal" step="0.01" min="0" required value={Number.isFinite(form.price) ? form.price : ''}
                                        aria-invalid={fieldErrors.price ? true : undefined} aria-describedby={fieldErrors.price ? 'p-price-error' : undefined}
                                        onChange={(e) => { clearFieldError('price'); setForm(f => ({ ...f, price: e.target.value === '' ? NaN : Number(e.target.value) })); }} className={`${field} font-semibold`} />
                                    {fieldErrors.price && <p id="p-price-error" role="alert" className="text-xs text-bos-danger mt-1">{fieldErrors.price}</p>}
                                </div>
                            </div>
                        </section>
                        {saveError && <p role="alert" className="text-sm text-bos-danger">{saveError}</p>}
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSave} loading={saving} loadingText="Guardando...">
                                <CheckCircle className="h-4 w-4" />
                                Guardar producto
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}
            {deleteTarget && (
                <ConfirmDialog
                    title="Dar de baja producto"
                    message={<><p>¿Dar de baja el producto «{deleteTarget.name}»?</p><p className="mt-2 text-bos-muted">Ya no aparecerá para vender; su historial se conserva.</p></>}
                    confirmLabel="Dar de baja"
                    variant="danger"
                    loading={deleting}
                    onConfirm={() => handleDelete(deleteTarget)}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
            {receiveTarget && !receivePin && (
                <Modal title="Registrar entrada" subtitle="Solo suma existencias. Se confirma con tu PIN." onClose={closeReceive} testId="receive-stock">
                    <form className="space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); continueReceive(); }}>
                        <div className="rounded-xl bg-bos-raised px-4 py-3 text-[15px]">
                            <p className="font-semibold">{receiveTarget.name}</p>
                            <p className="text-bos-muted">Existencias actuales: <span className="tabular-nums text-bos-text">{receiveTarget.stock}</span></p>
                        </div>
                        <Field label="¿Cuántas piezas llegaron?" type="number" inputMode="numeric" min={1} max={RECEIVE_MAX} step={1}
                            value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)} error={receiveErrors.quantity}
                            hint={`De 1 a ${RECEIVE_MAX} por entrada.`} />
                        <Field label="Comentario" error={receiveErrors.comment} hint="Por ejemplo, de qué proveedor o pedido.">
                            {(control) => (
                                <textarea {...control} rows={3} maxLength={RECEIVE_COMMENT_MAX} value={receiveComment}
                                    onChange={(e) => setReceiveComment(e.target.value)} placeholder="Ej: Llegó el pedido del proveedor"
                                    className={`${control.className} h-auto min-h-[88px] py-2`} />
                            )}
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Button variant="secondary" onClick={closeReceive}>Cancelar</Button>
                            <Button type="submit">Continuar</Button>
                        </div>
                    </form>
                </Modal>
            )}
            {receiveTarget && receivePin && (
                <PinConfirm title="Confirmar entrada de mercancía" fixedComment={receiveComment.trim()} confirmLabel="Registrar con PIN"
                    onClose={() => setReceivePin(false)} onConfirm={submitReceive}
                    summary={(
                        <div className="space-y-1">
                            <p className="font-semibold">{receiveTarget.name}</p>
                            <p>Entrada de {receiveQuantity} · existencias {receiveTarget.stock} → <strong>{receiveTarget.stock + receiveQuantity}</strong></p>
                        </div>
                    )} />
            )}
            {stockPin && editingProduct && (
                <PinConfirm title="Confirmar cambio de inventario" onClose={() => setStockPin(false)} onConfirm={saveProduct}
                    commentPlaceholder={stockChange > 0 ? 'Ej: Llegó el pedido del proveedor' : 'Ej: Se rompió un frasco'}
                    summary={(
                        <div className="space-y-1">
                            <p className="font-semibold">{editingProduct.name}</p>
                            {stockChange !== 0 && <p>{stockChange > 0 ? `Entrada de ${stockChange}` : `Salida de ${-stockChange}`} · existencias {editingProduct.stock} → <strong>{Number(form.stock)}</strong></p>}
                            {minChanged && <p>Mínimo {editingProduct.min_stock} → <strong>{Number(form.min_stock)}</strong></p>}
                        </div>
                    )} />
            )}
        </div>
    );
};

export default Inventory;
