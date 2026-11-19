'use client';

import React, { useState, useEffect } from 'react';
import { ReadOnlyNotice, useReadOnly } from '@/lib/auth/read-only';
import { Plus, Search, Edit2, Check, X } from 'lucide-react';
import { CATEGORY_LABELS, DEFAULT_CATEGORY, DURATION_OPTIONS, SERVICE_CATEGORIES, categoryOf, formatDuration, groupServices, isServiceCategory, type ServiceCategory } from '@/lib/services/categories';
import { formatMoney } from '@/lib/utils/money';
import Button from '@/components/ui/Button';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { HttpError, isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';

interface Service {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
    is_active: boolean;
    /** Precio libre: se escribe al cobrar (p. ej. grecas). */
    variable_price?: boolean;
    category?: string;
    sort_order?: number;
}

interface FormData { name: string; price: number; duration_minutes: number; is_active: boolean; variable_price: boolean; category: ServiceCategory; sort_order: number }
const EMPTY_FORM: FormData = { name: '', price: 0, duration_minutes: 30, is_active: true, variable_price: false, category: DEFAULT_CATEGORY, sort_order: 0 };

export default function ServicesPage() {
    // Cuenta de consulta: ve el catálogo sin crear, editar ni activar/desactivar.
    const readOnly = useReadOnly();
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formError, setFormError] = useState('');
    const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
    // Fallo al cargar el catálogo (distinto de "no hay servicios").
    const [loadError, setLoadError] = useState<unknown>(null);
    // Guardado en curso: evita duplicar con doble clic.
    const [saving, setSaving] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const toast = useToast();

    useEffect(() => {
        fetchServices();
    }, []);

    const fetchServices = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const data = await readJson<unknown>(await fetch('/api/services'));
            setServices(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Error fetching services:', e);
            setLoadError(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (id?: string) => {
        if (saving) return;
        setFormError('');
        setSaving(true);
        try {
            const url = id ? `/api/services/${id}` : '/api/services';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                fetchServices();
                setIsAdding(false);
                setEditingId(null);
                setFormData(EMPTY_FORM);
                toast.success('Servicio guardado.');
            } else {
                const body = await res.json().catch(() => null);
                setFormError(toUserMessage(new HttpError(res.status, body?.error), 'No se pudo guardar el servicio.'));
            }
        } catch (e) {
            console.error('Error saving service:', e);
            setFormError(toUserMessage(e));
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async (service: Service) => {
        if (togglingId) return;
        setFormError('');
        setTogglingId(service.id);
        try {
            const res = await fetch(`/api/services/${service.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...service, is_active: !service.is_active }),
            });
            if (res.ok) fetchServices();
            else {
                const body = await res.json().catch(() => null);
                setFormError(toUserMessage(new HttpError(res.status, body?.error), 'No se pudo cambiar el estado.'));
            }
        } catch (e) {
            console.error('Error toggling service status:', e);
            setFormError(toUserMessage(e));
        } finally {
            setTogglingId(null);
        }
    };

    const groups = groupServices(services.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())));

    const th = 'px-4 py-3 text-[13px] font-medium';
    const cell = 'h-11 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
    const iconBtn = 'h-11 w-11 inline-flex items-center justify-center rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised';

    const nameInput = (
        <input type="text" aria-label="Nombre del servicio" placeholder="Nombre del servicio" className={`${cell} w-full min-w-[10rem]`}
            value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
    );
    const categoryInput = (
        <select aria-label="Categoría" className={`${cell} w-full min-w-[9rem]`} value={formData.category}
            onChange={e => setFormData({ ...formData, category: isServiceCategory(e.target.value) ? e.target.value : DEFAULT_CATEGORY })}>
            {SERVICE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
    );
    const durationInput = (
        <select aria-label="Duración" className={`${cell} w-28 mx-auto block`} value={formData.duration_minutes}
            onChange={e => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}>
            {(DURATION_OPTIONS.includes(formData.duration_minutes) ? DURATION_OPTIONS : [...DURATION_OPTIONS, formData.duration_minutes].sort((a, b) => a - b))
                .map(m => <option key={m} value={m}>{formatDuration(m)}</option>)}
        </select>
    );
    const orderInput = (
        <input type="number" inputMode="numeric" min={0} step={1} aria-label="Orden en la categoría" className={`${cell} w-20 mx-auto block text-center`}
            value={formData.sort_order} onChange={e => setFormData({ ...formData, sort_order: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })} />
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Servicios</h1>
                    <p className="text-bos-muted text-sm mt-1">Administra los servicios ofrecidos en la barbería</p>
                </div>
                {!readOnly && <Button onClick={() => { setIsAdding(true); setFormError(''); setFormData(EMPTY_FORM); }}>
                    <Plus className="h-4 w-4" /> Nuevo servicio
                </Button>}
            </header>
            <ReadOnlyNotice readOnly={readOnly} />

            {formError && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-3 text-sm text-bos-danger">{formError}</p>}

            <div className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                <div className="p-4 border-b border-bos-border">
                    <div className="relative max-w-md">
                        <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-bos-muted" />
                        <input
                            type="text"
                            aria-label="Buscar servicio"
                            placeholder="Buscar servicio..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`${cell} w-full pl-10 pr-4`}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="bos-stack w-full text-left text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={th}>Nombre</th>
                                <th className={th}>Categoría</th>
                                <th className={`${th} text-center`}>Precio</th>
                                <th className={`${th} text-center`}>Duración</th>
                                <th className={`${th} text-center`}>Orden</th>
                                <th className={`${th} text-center`}>Estado</th>
                                <th className={`${th} text-right`}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isAdding && (
                                <tr className="border-t border-bos-border bg-bos-accent-soft">
                                    <td data-label="" className="p-3">{nameInput}</td>
                                    <td data-label="Categoría" className="p-3">{categoryInput}</td>
                                    <td data-label="Precio" className="p-3">
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            aria-label="Precio"
                                            placeholder="Precio"
                                            className={`${cell} w-28 mx-auto block text-center`}
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                        />
                                        <label className="mt-2 flex items-center justify-center gap-2 text-xs text-bos-muted">
                                            <input type="checkbox" checked={formData.variable_price} onChange={e => setFormData({ ...formData, variable_price: e.target.checked })} className="h-4 w-4 accent-[var(--bos-accent)]" />
                                            Precio libre al cobrar
                                        </label>
                                    </td>
                                    <td data-label="Duración" className="p-3">{durationInput}</td>
                                    <td data-label="Orden" className="p-3">{orderInput}</td>
                                    <td data-label="Estado" className="p-3 text-center">
                                        <span className="text-xs text-bos-success font-medium bg-bos-success-soft px-2.5 py-1 rounded-full">Activo</span>
                                    </td>
                                    <td data-label="" className="p-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => setIsAdding(false)} aria-label="Cancelar" className={iconBtn}><X className="h-4 w-4" /></button>
                                            <Button onClick={() => handleSave()} loading={saving} aria-label="Guardar servicio" size="sm" className="h-11 w-11 !min-h-0 !px-0"><Check className="h-4 w-4" /></Button>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {loading ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={7} className="p-4" role="status" aria-busy="true">
                                        <span className="sr-only">Cargando servicios…</span>
                                        <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-full" />)}</div>
                                    </td>
                                </tr>
                            ) : groups.length === 0 ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={7}>
                                        {loadError ? <ErrorState message={toUserMessage(loadError)} offline={isOfflineError(loadError)} onRetry={fetchServices} className="m-4" />
                                            : <EmptyState title="No se encontraron servicios" description={searchTerm ? 'Prueba con otro nombre.' : undefined} />}
                                    </td>
                                </tr>
                            ) : groups.map(group => (
                                <React.Fragment key={group.category}>
                                    <tr className="border-t border-bos-border bg-bos-raised">
                                        <th scope="colgroup" colSpan={7} className="px-4 py-2 text-left">
                                            <h3 className="text-sm font-semibold text-bos-text">{group.label} <span className="font-normal text-bos-muted">· {group.items.length}</span></h3>
                                        </th>
                                    </tr>
                                    {group.items.map(service => (
                                <tr key={service.id} className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                    <td data-label="" className="px-4 py-3">
                                        {editingId === service.id ? nameInput : (
                                            <span className="font-semibold">{service.name}</span>
                                        )}
                                    </td>
                                    <td data-label="Categoría" className="px-4 py-3">
                                        {editingId === service.id ? categoryInput : (
                                            <span className="text-bos-muted">{CATEGORY_LABELS[categoryOf(service.category)]}</span>
                                        )}
                                    </td>
                                    <td data-label="Precio" className="px-4 py-3 text-center">
                                        {editingId === service.id ? (
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                aria-label="Precio"
                                                className={`${cell} w-28 mx-auto block text-center`}
                                                value={formData.price}
                                                onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                            />
                                        ) : null}
                                        {editingId === service.id ? (<>
                                            <label className="mt-2 flex items-center justify-center gap-2 text-xs text-bos-muted">
                                                <input type="checkbox" checked={formData.variable_price} onChange={e => setFormData({ ...formData, variable_price: e.target.checked })} className="h-4 w-4 accent-[var(--bos-accent)]" />
                                                Precio libre al cobrar
                                            </label></>
                                        ) : service.variable_price ? (
                                            <span className="text-sm font-medium text-bos-muted">Precio al cobrar</span>
                                        ) : (
                                            <span className="font-display font-semibold tabular-nums">{formatMoney(Number(service.price), { cents: true })}</span>
                                        )}
                                    </td>
                                    <td data-label="Duración" className="px-4 py-3 text-center">
                                        {editingId === service.id ? durationInput : (
                                            <span className="text-bos-muted tabular-nums">{formatDuration(service.duration_minutes)}</span>
                                        )}
                                    </td>
                                    <td data-label="Orden" className="px-4 py-3 text-center">
                                        {editingId === service.id ? orderInput : (
                                            <span className="text-bos-muted tabular-nums">{service.sort_order ?? 0}</span>
                                        )}
                                    </td>
                                    <td data-label="Estado" className="px-4 py-2 text-center">
                                        <button
                                            disabled={readOnly || togglingId === service.id}
                                            onClick={() => handleToggleStatus(service)}
                                            aria-label={`${service.name}: ${service.is_active ? 'Activo' : 'Inactivo'}. Cambiar estado`}
                                            className={`min-h-11 px-4 rounded-full text-xs font-semibold ${service.is_active
                                                ? 'bg-bos-success-soft text-bos-success'
                                                : 'bg-bos-raised text-bos-muted border border-bos-border'
                                                }`}
                                        >
                                            {service.is_active ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </td>
                                    <td data-label="" className="px-4 py-2 text-right">
                                        <div className="flex justify-end gap-1">
                                            {editingId === service.id ? (
                                                <>
                                                    <button onClick={() => setEditingId(null)} aria-label="Cancelar" className={iconBtn}><X className="h-4 w-4" /></button>
                                                    <Button variant="ghost" onClick={() => handleSave(service.id)} loading={saving} aria-label="Guardar cambios" size="sm" className="h-11 w-11 !min-h-0 !px-0 !text-bos-success"><Check className="h-4 w-4" /></Button>
                                                </>
                                            ) : readOnly ? null : (
                                                <button
                                                    onClick={() => {
                                                        setEditingId(service.id);
                                                        setFormData({ name: service.name, price: Number(service.price), duration_minutes: service.duration_minutes, is_active: service.is_active, variable_price: !!service.variable_price, category: categoryOf(service.category), sort_order: service.sort_order ?? 0 });
                                                    }}
                                                    aria-label="Editar servicio"
                                                    className={iconBtn}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
