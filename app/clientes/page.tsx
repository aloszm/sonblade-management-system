'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Loader2, Star, Clock, FileText, Pencil, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { Client } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const EMPTY_FORM = { name: '', phone: '', email: '' };

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);

    // Form state
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [listError, setListError] = useState('');

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/clients');
            if (!res.ok) throw new Error('Error al obtener clientes');
            setClients(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchClients(); }, [fetchClients]);

    const openCreate = () => {
        setEditingClient(null);
        setFormData(EMPTY_FORM);
        setError('');
        setShowModal(true);
    };

    const openEdit = (c: Client) => {
        setEditingClient(c);
        setFormData({ name: c.name, phone: c.phone || '', email: c.email || '' });
        setError('');
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingClient(null);
        setFormData(EMPTY_FORM);
        setError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        try {
            if (editingClient) {
                // Edit mode — PATCH
                const body: Record<string, string> = {
                    name: formData.name,
                    phone: formData.phone,
                    email: formData.email,
                };

                const res = await fetch(`/api/clients/${editingClient.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error((await res.json()).error || 'Error al actualizar');
            } else {
                // Create mode — POST
                const res = await fetch('/api/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: formData.name, phone: formData.phone, email: formData.email }),
                });
                if (!res.ok) throw new Error((await res.json()).error || 'Error al crear cliente');
            }
            await fetchClients();
            closeModal();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (c: Client) => {
        if (!window.confirm(`¿Eliminar a ${c.name}? Esta acción no se puede deshacer.`)) return;
        setListError('');
        try {
            const res = await fetch(`/api/clients/${c.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error || 'Error al eliminar');
            await fetchClients();
        } catch (err: unknown) {
            setListError(err instanceof Error ? err.message : 'Error al eliminar');
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone && c.phone.includes(searchQuery)) ||
        (c.client_number && c.client_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const input = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const th = 'px-4 py-3 text-[13px] font-medium';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Cartera de clientes</h1>
                    <p className="text-bos-muted text-sm mt-1">Gestión de clientes y sistema de fidelización</p>
                </div>
                <button
                    onClick={openCreate}
                    className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold hover:opacity-90 flex items-center justify-center gap-2"
                >
                    <Plus className="h-4 w-4" /> Registrar cliente
                </button>
            </header>

            {listError && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-3 text-sm text-bos-danger">{listError}</p>}

            {/* Resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-bos-border bg-bos-surface p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Total de clientes</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.length}</p>
                </div>
                <div className="rounded-xl border border-bos-border bg-bos-surface p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Clientes con visitas</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.filter(c => (c.visits ?? 0) > 0).length}</p>
                </div>
                <div className="rounded-xl border border-bos-border bg-bos-surface p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Puntos emitidos</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.reduce((acc, c) => acc + (c.points ?? 0), 0)}</p>
                </div>
            </div>

            {/* Búsqueda */}
            <div className="relative">
                <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-bos-muted" />
                <input
                    type="text"
                    aria-label="Buscar clientes"
                    placeholder="Buscar por nombre, teléfono o email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`${input} pl-11`}
                />
            </div>

            {/* Tabla */}
            <div className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={th}>Cliente</th>
                                <th className={th}>Contacto</th>
                                <th className={`${th} text-center`}>Fidelización</th>
                                <th className={`${th} text-right`}>Última visita</th>
                                <th className={`${th} text-center`}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={5} className="p-8 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-bos-muted" />
                                    </td>
                                </tr>
                            ) : filteredClients.length === 0 ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={5} className="p-8 text-center text-bos-muted">
                                        {searchQuery ? 'No se encontraron clientes coincidiendo con tu búsqueda' : 'No hay clientes registrados en el sistema'}
                                    </td>
                                </tr>
                            ) : filteredClients.map(c => (
                                <tr key={c.id} className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-bos-raised border border-bos-border flex items-center justify-center font-display font-semibold text-bos-text">
                                                {c.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-semibold">{c.name}</div>
                                                <div className="text-xs text-bos-muted mt-0.5 flex items-center gap-1 whitespace-nowrap">
                                                    <FileText className="h-3 w-3" /> {c.client_number} • Añadido el {format(new Date(c.created_at), 'dd MMM yyyy', { locale: es })}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-bos-muted">
                                        <div className="text-sm font-medium text-bos-text">{c.phone || 'Sin teléfono'}</div>
                                        <div className="text-xs mt-0.5">{c.email || 'Sin email'}</div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex flex-col items-center justify-center gap-1">
                                            <span className="bg-bos-accent-soft text-bos-accent-text px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
                                                <Star className="h-3.5 w-3.5 fill-current" /> {c.points ?? 0} pts
                                            </span>
                                            <span className="text-xs text-bos-muted">
                                                {c.visits ?? 0} {c.visits === 1 ? 'visita' : 'visitas'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                        {c.last_visit_at ? (
                                            <div className="flex items-center justify-end gap-1.5 text-sm font-medium">
                                                <Clock className="h-4 w-4 text-bos-muted" />
                                                {format(new Date(c.last_visit_at), 'dd MMM, HH:mm', { locale: es })}
                                            </div>
                                        ) : (
                                            <span className="text-xs bg-bos-raised text-bos-muted px-2 py-1 rounded-full font-medium">Nunca</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => openEdit(c)}
                                                title="Editar cliente"
                                                aria-label={`Editar a ${c.name}`}
                                                className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-text hover:bg-bos-raised rounded-xl transition-colors"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(c)}
                                                title="Eliminar cliente"
                                                aria-label={`Eliminar a ${c.name}`}
                                                className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-danger hover:bg-bos-raised rounded-xl transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Ventana: registrar o editar cliente */}
            {showModal && (
                <Modal title={editingClient ? 'Editar cliente' : 'Registrar nuevo cliente'} onClose={closeModal}>
                    {error && <p role="alert" className="mb-4 p-3 rounded-xl border border-bos-border bg-bos-bg text-bos-danger text-sm font-medium">{error}</p>}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="client-name" className={label}>Nombre completo <span className="text-bos-danger">*</span></label>
                            <input
                                id="client-name"
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className={input}
                                placeholder="Ej. Juan Pérez"
                            />
                        </div>

                        <div>
                            <label htmlFor="client-phone" className={label}>Teléfono (WhatsApp) <span className="text-bos-danger">*</span></label>
                            <input
                                id="client-phone"
                                type="tel"
                                required
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                className={input}
                                placeholder="10 dígitos"
                                minLength={10}
                                maxLength={15}
                            />
                        </div>

                        <div>
                            <label htmlFor="client-email" className={label}>Correo electrónico (opcional)</label>
                            <input
                                id="client-email"
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className={input}
                                placeholder="juan@ejemplo.com"
                            />
                        </div>

                        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="flex-1 min-h-[52px] px-5 border border-bos-border text-bos-text font-semibold rounded-xl hover:bg-bos-raised transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editingClient ? 'Guardar cambios' : 'Guardar cliente'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
