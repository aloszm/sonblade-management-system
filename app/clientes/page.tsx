'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Star, Clock, FileText, Pencil } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { Client } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Field, { FIELD_CLASS } from '@/components/ui/Field';
import Skeleton from '@/components/ui/Skeleton';
import { HttpError, isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';

const EMPTY_FORM = { name: '', phone: '', email: '' };

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    // Fallo al cargar la cartera: se muestra aparte de "no hay clientes".
    const [loadError, setLoadError] = useState<unknown>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);

    // Form state
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    // El barbero registra clientes nuevos, pero no edita ni elimina los existentes.
    // Hasta saber el puesto se asume que no puede (nunca se muestra un botón que luego falla).
    const [canEdit, setCanEdit] = useState(false);
    // La cuenta de consulta no registra ni edita: solo ve la cartera.
    const [readOnly, setReadOnly] = useState(true);

    useEffect(() => {
        fetch('/api/auth/me', { cache: 'no-store' }).then((r) => r.json())
            .then((me) => {
                const ro = !me?.authenticated || Boolean(me.user?.readOnly);
                setReadOnly(ro);
                setCanEdit(Boolean(me?.authenticated) && me.user?.role !== 'barber' && !ro);
            })
            .catch(() => { setCanEdit(false); setReadOnly(true); });
    }, []);

    const fetchClients = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(null);
            setClients(await readJson<Client[]>(await fetch('/api/clients')));
        } catch (e) {
            console.error(e);
            setLoadError(e);
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
                if (!res.ok) throw new HttpError(res.status, (await res.json().catch(() => null))?.error);
            } else {
                // Create mode — POST
                const res = await fetch('/api/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: formData.name, phone: formData.phone, email: formData.email }),
                });
                if (!res.ok) throw new HttpError(res.status, (await res.json().catch(() => null))?.error);
            }
            await fetchClients();
            closeModal();
        } catch (err: unknown) {
            setError(toUserMessage(err, editingClient ? 'No se pudo actualizar el cliente.' : 'No se pudo crear el cliente.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone && c.phone.includes(searchQuery)) ||
        (c.client_number && c.client_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const input = FIELD_CLASS;
    const th = 'px-4 py-3 text-[13px] font-medium';

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Clientes</h1>
                    <p className="text-bos-muted text-sm mt-1">Gestión de clientes y sistema de fidelización</p>
                </div>
                {!readOnly && <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Registrar cliente
                </Button>}
            </header>

            {/* Resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="!p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Total de clientes</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.length}</p>
                </Card>
                <Card className="!p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Clientes con visitas</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.filter(c => (c.visits ?? 0) > 0).length}</p>
                </Card>
                <Card className="!p-5">
                    <p className="text-[13px] font-medium text-bos-muted">Puntos emitidos</p>
                    <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{clients.reduce((acc, c) => acc + (c.points ?? 0), 0)}</p>
                </Card>
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
                    <table className="bos-stack w-full text-left text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={th}>Cliente</th>
                                <th className={th}>Contacto</th>
                                <th className={`${th} text-center`}>Fidelización</th>
                                <th className={`${th} text-right`}>Última visita</th>
                                {canEdit && <th className={`${th} text-center`}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={canEdit ? 5 : 4} className="p-4" role="status" aria-busy="true">
                                        <span className="sr-only">Cargando clientes…</span>
                                        <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                                    </td>
                                </tr>
                            ) : loadError ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={canEdit ? 5 : 4} className="p-4">
                                        <ErrorState title="No se pudieron cargar los clientes" message={toUserMessage(loadError)} offline={isOfflineError(loadError)} onRetry={fetchClients} />
                                    </td>
                                </tr>
                            ) : filteredClients.length === 0 ? (
                                <tr className="border-t border-bos-border">
                                    <td colSpan={canEdit ? 5 : 4}>
                                        <EmptyState title={searchQuery ? 'No se encontraron clientes con tu búsqueda' : 'Todavía no hay clientes registrados'} />
                                    </td>
                                </tr>
                            ) : filteredClients.map(c => (
                                <tr key={c.id} className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                    <td data-label="" className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-bos-raised border border-bos-border flex items-center justify-center font-display font-semibold text-bos-text">
                                                {c.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-semibold">{c.name}</div>
                                                <div className="text-xs text-bos-muted mt-0.5 flex items-center gap-1 whitespace-nowrap">
                                                    <FileText className="h-3 w-3" /> {c.client_number} • Añadido el {formatDate(c.created_at)}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Contacto" className="px-4 py-3 text-bos-muted">
                                        <div className="text-sm font-medium text-bos-text">{c.phone || 'Sin teléfono'}</div>
                                        <div className="text-xs mt-0.5">{c.email || 'Sin email'}</div>
                                    </td>
                                    <td data-label="Fidelización" className="px-4 py-3 text-center">
                                        <div className="flex flex-col items-center justify-center gap-1">
                                            <span className="bg-bos-accent-soft text-bos-accent-text px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
                                                <Star className="h-3.5 w-3.5 fill-current" /> {c.points ?? 0} pts
                                            </span>
                                            <span className="text-xs text-bos-muted">
                                                {c.visits ?? 0} {c.visits === 1 ? 'visita' : 'visitas'}
                                            </span>
                                        </div>
                                    </td>
                                    <td data-label="Última visita" className="px-4 py-3 text-right whitespace-nowrap">
                                        {c.last_visit_at ? (
                                            <div className="flex items-center justify-end gap-1.5 text-sm font-medium">
                                                <Clock className="h-4 w-4 text-bos-muted" />
                                                {formatDateTime(c.last_visit_at, undefined, { year: false })}
                                            </div>
                                        ) : (
                                            <span className="text-xs bg-bos-raised text-bos-muted px-2 py-1 rounded-full font-medium">Nunca</span>
                                        )}
                                    </td>
                                    {canEdit && <td data-label="" className="px-4 py-2 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button
                                                onClick={() => openEdit(c)}
                                                title="Editar cliente"
                                                aria-label={`Editar a ${c.name}`}
                                                className="h-11 w-11 inline-flex items-center justify-center text-bos-muted hover:text-bos-text hover:bg-bos-raised rounded-xl transition-colors"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>}
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
                        <Field
                            id="client-name"
                            label="Nombre completo *"
                            type="text"
                            required
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ej. Juan Pérez"
                        />

                        <Field
                            id="client-phone"
                            label="Teléfono (WhatsApp) *"
                            type="tel"
                            required
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="10 dígitos"
                            minLength={10}
                            maxLength={15}
                        />

                        <Field
                            id="client-email"
                            label="Correo electrónico (opcional)"
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            placeholder="juan@ejemplo.com"
                        />

                        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
                            <Button variant="secondary" onClick={closeModal} className="flex-1">Cancelar</Button>
                            <Button type="submit" loading={isSubmitting} className="flex-1">
                                {editingClient ? 'Guardar cambios' : 'Guardar cliente'}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
