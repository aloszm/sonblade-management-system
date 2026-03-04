'use client';

import React, { useState, useEffect } from 'react';
import { UserPlus, Search, Loader2, Calendar, Phone, Mail, History, ExternalLink } from 'lucide-react';

interface Client {
    name: string;
    lastVisit: string;
    totalAppointments: number;
    frequentService?: string;
}

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchClients();
    }, []);

    const fetchClients = async () => {
        setLoading(true);
        try {
            // Fetching from appointments to get client names and visit info
            const res = await fetch('/api/clients');
            if (res.ok) {
                const data = await res.json();
                setClients(data);
            }
        } catch (e) {
            console.error('Error fetching clients:', e);
        } finally {
            setLoading(false);
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <UserPlus className="text-sonblade-gold h-6 w-6" />
                        Cartera de Clientes
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Directorio de clientes y su historial de visitas</p>
                </div>
                <button
                    className="bg-black text-sonblade-gold px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-800 transition-all shadow-lg"
                    onClick={() => alert('Función de "Nuevo Cliente" estará disponible pronto con el módulo CRM completo.')}
                >
                    <UserPlus className="h-4 w-4" /> Registrar Nuevo
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
                        <Search className="h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o teléfono..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 outline-none text-sm"
                        />
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-gray-500 border-b">
                                        <th className="p-4 font-bold uppercase text-[10px]">Cliente</th>
                                        <th className="p-4 font-bold uppercase text-[10px] text-center">N° Visitas</th>
                                        <th className="p-4 font-bold uppercase text-[10px] text-center">Última Visita</th>
                                        <th className="p-4 font-bold uppercase text-[10px] text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        <tr><td colSpan={4} className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sonblade-gold" /></td></tr>
                                    ) : filteredClients.length === 0 ? (
                                        <tr><td colSpan={4} className="p-10 text-center text-gray-400 italic">No se encontraron clientes</td></tr>
                                    ) : filteredClients.map((client, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 group-hover:bg-sonblade-gold group-hover:text-black transition-colors">
                                                        {client.name.charAt(0)}
                                                    </div>
                                                    <span className="font-bold text-gray-900">{client.name}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full text-xs">{client.totalAppointments}</span>
                                            </td>
                                            <td className="p-4 text-center text-gray-500 font-medium">
                                                {client.lastVisit}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button className="text-gray-400 hover:text-sonblade-gold">
                                                    <ExternalLink className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-gradient-to-br from-black to-gray-800 rounded-3xl p-6 text-white shadow-xl">
                        <h3 className="text-lg font-bold mb-4">Métricas CRM</h3>
                        <div className="space-y-4">
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                <p className="text-xs text-gray-400 uppercase font-black">Total Clientes</p>
                                <p className="text-3xl font-black mt-1 text-sonblade-gold">{clients.length}</p>
                            </div>
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                <p className="text-xs text-gray-400 uppercase font-black">Nuevos este Mes</p>
                                <p className="text-3xl font-black mt-1 text-green-400">--</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-50 rounded-3xl p-6 border border-amber-100">
                        <h3 className="text-amber-800 font-bold mb-2 flex items-center gap-2">
                            <History className="h-4 w-4" /> Próximas Citas
                        </h3>
                        <p className="text-xs text-amber-700 mb-4">Recordatorios pendientes de enviar hoy.</p>
                        <div className="space-y-3">
                            <div className="p-3 bg-white rounded-xl border border-amber-200 text-xs">
                                <p className="font-bold text-gray-900">Eduardo Sanchez</p>
                                <p className="text-gray-500">Hoy 16:30 - Corte & Barba</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
