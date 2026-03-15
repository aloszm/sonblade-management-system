'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Users, Search, Loader2, Star, Clock, FileText, Pencil, Trash2 } from 'lucide-react';
import type { Client } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const EMPTY_FORM = { name: '', phone: '', email: '', pin: '', changePin: false };

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
        setFormData({ name: c.name, phone: c.phone || '', email: c.email || '', pin: '', changePin: false });
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
                if (formData.changePin && formData.pin) body.pin = formData.pin;

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
                    body: JSON.stringify(formData),
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
        try {
            const res = await fetch(`/api/clients/${c.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error || 'Error al eliminar');
            await fetchClients();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Error al eliminar');
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone && c.phone.includes(searchQuery)) ||
        (c.client_number && c.client_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Users className="text-sonblade-gold h-6 w-6" />Cartera de Clientes (CRM)
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gestión de clientes y sistema de fidelización</p>
                </div>
                <button
                    onClick={openCreate}
                    className="bg-sonblade-gold text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-yellow-500 flex items-center justify-center gap-2 shadow-sm"
                >
                    <Plus className="h-4 w-4" /> Registrar Cliente
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-black">
                    <p className="text-xs font-bold text-gray-500 uppercase">Total Clientes</p>
                    <p className="text-3xl font-bold">{clients.length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-sonblade-gold">
                    <p className="text-xs font-bold text-gray-500 uppercase">Clientes con Visitas</p>
                    <p className="text-3xl font-bold">{clients.filter(c => c.visits > 0).length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-purple-500">
                    <p className="text-xs font-bold text-gray-500 uppercase">Puntos Emitidos</p>
                    <p className="text-3xl font-bold text-purple-600">{clients.reduce((acc, c) => acc + c.points, 0)}</p>
                </div>
            </div>

            {/* Search */}
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
                <div className="pl-3"><Search className="h-5 w-5 text-gray-400" /></div>
                <input
                    type="text"
                    placeholder="Buscar por nombre, teléfono o email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 outline-none"
                />
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="p-4 font-semibold uppercase text-xs">Cliente</th>
                                <th className="p-4 font-semibold uppercase text-xs">Contacto</th>
                                <th className="p-4 font-semibold uppercase text-xs text-center">Fidelización</th>
                                <th className="p-4 font-semibold uppercase text-xs text-right">Última Visita</th>
                                <th className="p-4 font-semibold uppercase text-xs text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-sonblade-gold" />
                                    </td>
                                </tr>
                            ) : filteredClients.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-400">
                                        {searchQuery ? 'No se encontraron clientes coincidiendo con tu búsqueda' : 'No hay clientes registrados en el sistema'}
                                    </td>
                                </tr>
                            ) : filteredClients.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50 group transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-600 group-hover:bg-sonblade-gold group-hover:text-black group-hover:border-transparent transition-all">
                                                {c.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900">{c.name}</div>
                                                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                                                    <FileText className="h-3 w-3" /> {c.client_number} • Añadido el {format(new Date(c.created_at), 'dd MMM yyyy', { locale: es })}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-500">
                                        <div className="text-sm font-medium text-gray-700">{c.phone || 'Sin teléfono'}</div>
                                        <div className="text-xs mt-0.5">{c.email || 'Sin email'}</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex flex-col items-center justify-center gap-1.5">
                                            <span className="bg-purple-100 text-purple-700 px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 shadow-sm">
                                                <Star className="h-3.5 w-3.5 fill-current" /> {c.points} pts
                                            </span>
                                            <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                                                {c.visits} {c.visits === 1 ? 'visita' : 'visitas'}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        {c.last_visit_at ? (
                                            <div className="flex items-center justify-end gap-1.5 text-sm font-medium text-gray-700">
                                                <Clock className="h-4 w-4 text-gray-400" />
                                                {format(new Date(c.last_visit_at), 'dd MMM, HH:mm', { locale: es })}
                                            </div>
                                        ) : (
                                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded font-medium">Nunca</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => openEdit(c)}
                                                title="Editar cliente"
                                                className="p-1.5 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(c)}
                                                title="Eliminar cliente"
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

            {/* Create / Edit Client Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Users className="h-5 w-5 text-sonblade-gold" />
                                {editingClient ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
                            </h2>
                            <button onClick={closeModal} className="text-gray-400 hover:text-gray-900 bg-gray-100 rounded-full p-1.5 transition-colors">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 font-medium">{error}</div>}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Nombre Completo <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all text-sm font-medium"
                                    placeholder="Ej. Juan Pérez"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Teléfono (WhatsApp) <span className="text-red-500">*</span></label>
                                <input
                                    type="tel"
                                    required
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all text-sm font-medium"
                                    placeholder="10 dígitos"
                                    minLength={10}
                                    maxLength={15}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1.5">Correo Electrónico (Opcional)</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all text-sm font-medium"
                                    placeholder="juan@ejemplo.com"
                                />
                            </div>

                            {/* PIN: always required on create; optional toggle on edit */}
                            {!editingClient ? (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1.5">PIN de Seguridad (4 dígitos) <span className="text-red-500">*</span></label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        required
                                        value={formData.pin}
                                        onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all text-sm font-medium text-center tracking-[0.5em]"
                                        placeholder="••••"
                                        minLength={4}
                                        maxLength={4}
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="flex items-center gap-2 cursor-pointer select-none mb-2">
                                        <input
                                            type="checkbox"
                                            checked={formData.changePin}
                                            onChange={e => setFormData({ ...formData, changePin: e.target.checked, pin: '' })}
                                            className="rounded"
                                        />
                                        <span className="text-sm font-bold text-gray-700">Cambiar PIN de seguridad</span>
                                    </label>
                                    {formData.changePin && (
                                        <input
                                            type="password"
                                            inputMode="numeric"
                                            required
                                            value={formData.pin}
                                            onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all text-sm font-medium text-center tracking-[0.5em]"
                                            placeholder="Nuevo PIN ••••"
                                            minLength={4}
                                            maxLength={4}
                                        />
                                    )}
                                </div>
                            )}

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 px-4 py-2.5 bg-black text-sonblade-gold font-bold text-sm rounded-xl hover:bg-gray-900 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editingClient ? 'Guardar Cambios' : 'Guardar Cliente'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
