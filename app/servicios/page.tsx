'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Search, Loader2, Edit2, Check, X } from 'lucide-react';

interface Service {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
    is_active: boolean;
    /** Precio libre: se escribe al cobrar (p. ej. grecas). */
    variable_price?: boolean;
}

export default function ServicesPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formError, setFormError] = useState('');
    const [formData, setFormData] = useState({ name: '', price: 0, duration_minutes: 30, is_active: true, variable_price: false });

    useEffect(() => {
        fetchServices();
    }, []);

    const fetchServices = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/services');
            if (res.ok) {
                const data = await res.json();
                setServices(data);
            }
        } catch (e) {
            console.error('Error fetching services:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (id?: string) => {
        setFormError('');
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
                setFormData({ name: '', price: 0, duration_minutes: 30, is_active: true, variable_price: false });
            } else {
                const body = await res.json().catch(() => null);
                setFormError(body?.error || 'No se pudo guardar el servicio');
            }
        } catch (e) {
            console.error('Error saving service:', e);
        }
    };

    const handleToggleStatus = async (service: Service) => {
        setFormError('');
        try {
            const res = await fetch(`/api/services/${service.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...service, is_active: !service.is_active }),
            });
            if (res.ok) fetchServices();
            else setFormError((await res.json().catch(() => null))?.error || 'No se pudo cambiar el estado');
        } catch (e) {
            console.error('Error toggling service status:', e);
        }
    };

    const filteredServices = services.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const th = 'px-4 py-3 text-[13px] font-medium';
    const cell = 'h-11 px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
    const iconBtn = 'h-11 w-11 inline-flex items-center justify-center rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised';

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Catálogo de servicios</h1>
                    <p className="text-bos-muted text-sm mt-1">Administra los servicios ofrecidos en la barbería</p>
                </div>
                <button
                    onClick={() => { setIsAdding(true); setFormError(''); setFormData({ name: '', price: 0, duration_minutes: 30, is_active: true, variable_price: false }); }}
                    className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                    <Plus className="h-4 w-4" /> Nuevo servicio
                </button>
            </header>

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
                    <table className="w-full text-left text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={th}>Nombre</th>
                                <th className={`${th} text-center`}>Precio</th>
                                <th className={`${th} text-center`}>Duración</th>
                                <th className={`${th} text-center`}>Estado</th>
                                <th className={`${th} text-right`}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isAdding && (
                                <tr className="border-t border-bos-border bg-bos-accent-soft">
                                    <td className="p-3">
                                        <input
                                            type="text"
                                            aria-label="Nombre del servicio"
                                            placeholder="Nombre del servicio"
                                            className={`${cell} w-full min-w-[10rem]`}
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </td>
                                    <td className="p-3">
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
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            aria-label="Duración en minutos"
                                            placeholder="Min"
                                            className={`${cell} w-24 mx-auto block text-center`}
                                            value={formData.duration_minutes}
                                            onChange={e => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                                        />
                                    </td>
                                    <td className="p-3 text-center">
                                        <span className="text-xs text-bos-success font-medium bg-bos-success-soft px-2.5 py-1 rounded-full">Activo</span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex justify-end gap-1">
                                            <button onClick={() => setIsAdding(false)} aria-label="Cancelar" className={iconBtn}><X className="h-4 w-4" /></button>
                                            <button onClick={() => handleSave()} aria-label="Guardar servicio" className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-bos-accent text-bos-on-accent"><Check className="h-4 w-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {loading ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={5} className="p-10 text-center text-bos-muted">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                        Cargando servicios...
                                    </td>
                                </tr>
                            ) : filteredServices.length === 0 ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={5} className="p-10 text-center text-bos-muted">No se encontraron servicios</td>
                                </tr>
                            ) : filteredServices.map(service => (
                                <tr key={service.id} className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                    <td className="px-4 py-3">
                                        {editingId === service.id ? (
                                            <input
                                                type="text"
                                                aria-label="Nombre del servicio"
                                                className={`${cell} w-full min-w-[10rem]`}
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            />
                                        ) : (
                                            <span className="font-semibold">{service.name}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
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
                                            <span className="font-display font-semibold tabular-nums">${Number(service.price).toFixed(2)}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {editingId === service.id ? (
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                aria-label="Duración en minutos"
                                                className={`${cell} w-24 mx-auto block text-center`}
                                                value={formData.duration_minutes}
                                                onChange={e => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                                            />
                                        ) : (
                                            <span className="text-bos-muted tabular-nums">{service.duration_minutes} min</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <button
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
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex justify-end gap-1">
                                            {editingId === service.id ? (
                                                <>
                                                    <button onClick={() => setEditingId(null)} aria-label="Cancelar" className={iconBtn}><X className="h-4 w-4" /></button>
                                                    <button onClick={() => handleSave(service.id)} aria-label="Guardar cambios" className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-bos-success hover:bg-bos-raised"><Check className="h-4 w-4" /></button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setEditingId(service.id);
                                                        setFormData({ name: service.name, price: Number(service.price), duration_minutes: service.duration_minutes, is_active: service.is_active, variable_price: !!service.variable_price });
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
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
