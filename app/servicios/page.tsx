'use client';

import React, { useState, useEffect } from 'react';
import { Scissors, Plus, Search, Loader2, Edit2, Trash2, Check, X } from 'lucide-react';

interface Service {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
    is_active: boolean;
}

export default function ServicesPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', price: 0, duration_minutes: 30, is_active: true });

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
                setFormData({ name: '', price: 0, duration_minutes: 30, is_active: true });
            }
        } catch (e) {
            console.error('Error saving service:', e);
        }
    };

    const handleToggleStatus = async (service: Service) => {
        try {
            const res = await fetch(`/api/services/${service.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...service, is_active: !service.is_active }),
            });
            if (res.ok) fetchServices();
        } catch (e) {
            console.error('Error toggling service status:', e);
        }
    };

    const filteredServices = services.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <Scissors className="text-sonblade-gold h-6 w-6" />
                        Catálogo de Servicios
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Administra los servicios ofrecidos en la barbería</p>
                </div>
                <button
                    onClick={() => { setIsAdding(true); setFormData({ name: '', price: 0, duration_minutes: 30, is_active: true }); }}
                    className="bg-black text-sonblade-gold px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-800 transition-all shadow-lg shadow-sonblade-gold/10"
                >
                    <Plus className="h-4 w-4" /> Nuevo Servicio
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar servicio..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-1 focus:ring-sonblade-gold outline-none"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                                <th className="p-4 font-bold uppercase text-[10px] tracking-wider">Nombre</th>
                                <th className="p-4 font-bold uppercase text-[10px] tracking-wider text-center">Precio</th>
                                <th className="p-4 font-bold uppercase text-[10px] tracking-wider text-center">Duración</th>
                                <th className="p-4 font-bold uppercase text-[10px] tracking-wider text-center">Estado</th>
                                <th className="p-4 font-bold uppercase text-[10px] tracking-wider text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isAdding && (
                                <tr className="bg-sonblade-gold/5">
                                    <td className="p-3">
                                        <input
                                            type="text"
                                            placeholder="Nombre del servicio"
                                            className="w-full p-2 border border-sonblade-gold/30 rounded-lg outline-none"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                    </td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            placeholder="Precio"
                                            className="w-24 p-2 border border-sonblade-gold/30 rounded-lg outline-none mx-auto block text-center"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                        />
                                    </td>
                                    <td className="p-3">
                                        <input
                                            type="number"
                                            placeholder="Min"
                                            className="w-20 p-2 border border-sonblade-gold/30 rounded-lg outline-none mx-auto block text-center"
                                            value={formData.duration_minutes}
                                            onChange={e => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                                        />
                                    </td>
                                    <td className="p-3 text-center">
                                        <span className="text-xs text-green-600 font-bold bg-green-100 px-2 py-1 rounded">Activo</span>
                                    </td>
                                    <td className="p-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setIsAdding(false)} className="p-2 text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                                            <button onClick={() => handleSave()} className="p-2 bg-black text-sonblade-gold rounded-lg"><Check className="h-4 w-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-gray-400">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-sonblade-gold" />
                                        Cargando servicios...
                                    </td>
                                </tr>
                            ) : filteredServices.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-gray-400 italic">No se encontraron servicios</td>
                                </tr>
                            ) : filteredServices.map(service => (
                                <tr key={service.id} className="hover:bg-gray-50/80 transition-colors">
                                    <td className="p-4">
                                        {editingId === service.id ? (
                                            <input
                                                type="text"
                                                className="w-full p-1 border border-sonblade-gold/30 rounded outline-none"
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            />
                                        ) : (
                                            <span className="font-bold text-gray-900">{service.name}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        {editingId === service.id ? (
                                            <input
                                                type="number"
                                                className="w-20 p-1 border border-sonblade-gold/30 rounded outline-none text-center"
                                                value={formData.price}
                                                onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                            />
                                        ) : (
                                            <span className="font-black text-gray-900 font-mono">${Number(service.price).toFixed(2)}</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        {editingId === service.id ? (
                                            <input
                                                type="number"
                                                className="w-16 p-1 border border-sonblade-gold/30 rounded outline-none text-center"
                                                value={formData.duration_minutes}
                                                onChange={e => setFormData({ ...formData, duration_minutes: Number(e.target.value) })}
                                            />
                                        ) : (
                                            <span className="text-gray-500">{service.duration_minutes} min</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => handleToggleStatus(service)}
                                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${service.is_active
                                                    ? 'bg-green-100 text-green-700'
                                                    : 'bg-red-100 text-red-700'
                                                }`}
                                        >
                                            {service.is_active ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {editingId === service.id ? (
                                                <>
                                                    <button onClick={() => setEditingId(null)} className="p-2 text-gray-400"><X className="h-4 w-4" /></button>
                                                    <button onClick={() => handleSave(service.id)} className="p-2 text-green-600"><Check className="h-4 w-4" /></button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setEditingId(service.id);
                                                        setFormData({ name: service.name, price: Number(service.price), duration_minutes: service.duration_minutes, is_active: service.is_active });
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
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
