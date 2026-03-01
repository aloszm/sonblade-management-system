'use client';

import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit2, UserX, UserCheck, Scissors, DollarSign } from 'lucide-react';
import type { Barber } from '@/types';

export default function TeamPage() {
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBarber, setEditingBarber] = useState<Barber | null>(null);

    // Form state
    const [formData, setFormData] = useState({ name: '', commission_rate: 40, status: 'active' });

    useEffect(() => {
        fetchBarbers();
    }, []);

    const fetchBarbers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/barbers');
            if (res.ok) setBarbers(await res.json());
        } catch (error) {
            console.error('Failed to fetch barbers', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const method = editingBarber ? 'PATCH' : 'POST';
            const url = editingBarber ? `/api/barbers/${editingBarber.id}` : '/api/barbers';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                setIsModalOpen(false);
                fetchBarbers();
            } else {
                alert('Error al guardar el barbero');
            }
        } catch (error) {
            console.error(error);
        }
    };

    const toggleStatus = async (barber: Barber) => {
        const newStatus = barber.status === 'active' ? 'off' : 'active';
        try {
            await fetch(`/api/barbers/${barber.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            fetchBarbers();
        } catch (error) {
            console.error(error);
        }
    };

    const openModal = (barber?: Barber) => {
        if (barber) {
            setEditingBarber(barber);
            setFormData({ name: barber.name, commission_rate: barber.commission_rate, status: barber.status });
        } else {
            setEditingBarber(null);
            setFormData({ name: '', commission_rate: 40, status: 'active' });
        }
        setIsModalOpen(true);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sonblade-primary"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Gestión de Equipo</h1>
                    <p className="text-sm text-gray-500">Administra a los barberos y sus comisiones.</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="bg-sonblade-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center shadow-md transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nuevo Barbero
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {barbers.map(barber => (
                    <div key={barber.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col relative overflow-hidden group">
                        {/* Status indicator line */}
                        <div className={`absolute top-0 left-0 w-full h-1 ${barber.status === 'active' ? 'bg-green-500' : barber.status === 'busy' ? 'bg-orange-500' : 'bg-red-500'}`}></div>

                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-xl font-bold text-gray-600 border-2 border-white shadow-sm">
                                    {barber.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-lg leading-tight">{barber.name}</h3>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider
                                        ${barber.status === 'active' ? 'bg-green-100 text-green-700' :
                                            barber.status === 'busy' ? 'bg-orange-100 text-orange-700' :
                                                'bg-red-100 text-red-700'}`}
                                    >
                                        {barber.status}
                                    </span>
                                </div>
                            </div>

                            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openModal(barber)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded bg-gray-50 hover:bg-blue-50 mr-1">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => toggleStatus(barber)} className={`p-1.5 rounded ${barber.status === 'active' ? 'text-gray-400 hover:text-red-600 bg-gray-50 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 bg-gray-50 hover:bg-green-50'}`}>
                                    {barber.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-gray-50">
                            <div className="bg-gray-50 p-3 rounded-lg">
                                <div className="flex items-center text-gray-500 text-xs mb-1">
                                    <Scissors className="w-3 h-3 mr-1" />
                                    Cortes Totales
                                </div>
                                <div className="font-bold text-gray-900">{barber.total_cuts}</div>
                            </div>
                            <div className="bg-blue-50/50 p-3 rounded-lg">
                                <div className="flex items-center text-blue-600 text-xs mb-1">
                                    <DollarSign className="w-3 h-3 mr-1" />
                                    Comisión
                                </div>
                                <div className="font-bold text-blue-700">{barber.commission_rate}%</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900">{editingBarber ? 'Editar Barbero' : 'Nuevo Barbero'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-sonblade-primary focus:border-sonblade-primary outline-none transition-all"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Porcentaje de Comisión (%)</label>
                                <input
                                    type="number"
                                    value={formData.commission_rate}
                                    onChange={e => setFormData({ ...formData, commission_rate: Number(e.target.value) })}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-sonblade-primary focus:border-sonblade-primary outline-none transition-all"
                                    min="0" max="100" required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                                <select
                                    value={formData.status}
                                    onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-sonblade-primary focus:border-sonblade-primary outline-none transition-all"
                                >
                                    <option value="active">Activo</option>
                                    <option value="busy">Ocupado</option>
                                    <option value="off">Inactivo</option>
                                </select>
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                                <button type="submit" className="px-5 py-2.5 bg-sonblade-primary text-white rounded-lg hover:bg-blue-700 shadow-md font-medium transition-colors">
                                    {editingBarber ? 'Guardar Cambios' : 'Crear Barbero'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
