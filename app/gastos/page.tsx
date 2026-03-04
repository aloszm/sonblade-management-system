'use client';

import React, { useState, useEffect } from 'react';
import { TrendingDown, Plus, Search, Loader2, Calendar, FileText, Trash2, Tag } from 'lucide-react';

interface Gasto {
    id: string;
    description: string;
    amount: number;
    created_at: string;
    payment_method: string;
}

export default function GastosPage() {
    const [gastos, setGastos] = useState<Gasto[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newGasto, setNewGasto] = useState({ description: '', amount: '', payment_method: 'cash' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchGastos();
    }, []);

    const fetchGastos = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/cash/movements?type=expense');
            if (res.ok) {
                const data = await res.json();
                setGastos(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddGasto = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const res = await fetch('/api/cash/movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newGasto,
                    amount: Number(newGasto.amount),
                    type: 'expense',
                    status: 'confirmed'
                })
            });

            if (res.ok) {
                setShowAddModal(false);
                setNewGasto({ description: '', amount: '', payment_method: 'cash' });
                fetchGastos();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalGastos = gastos.reduce((acc, g) => acc + Number(g.amount), 0);
    const filteredGastos = gastos.filter(g =>
        g.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <TrendingDown className="text-red-500 h-6 w-6" />
                        Gastos e Insumos
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Control de egresos y compras de la barbería</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-black text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-800 transition-all shadow-lg"
                >
                    <Plus className="h-4 w-4" /> Registrar Gasto
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1 space-y-4">
                    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm text-center">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Total del Período</p>
                        <p className="text-4xl font-black text-red-600">${totalGastos.toFixed(2)}</p>
                        <div className="mt-4 pt-4 border-t border-gray-50">
                            <p className="text-xs text-gray-500 font-medium">{gastos.length} comprobantes registrados</p>
                        </div>
                    </div>

                    <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-xl">
                        <h3 className="text-sm font-bold mb-4 flex items-center gap-2 text-sonblade-gold">
                            <Tag className="h-4 w-4" /> Categorías Comunes
                        </h3>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-400">Renta</span><span>$0.00</span></div>
                            <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-400">Luz / Agua</span><span>$0.00</span></div>
                            <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-400">Insumos (Geles, Navajas)</span><span>$0.00</span></div>
                            <div className="flex justify-between py-1"><span className="text-gray-400">Otros</span><span>$0.00</span></div>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-3 space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-4">
                        <Search className="h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por descripción..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 outline-none text-sm"
                        />
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="bg-gray-50 text-gray-500 border-b">
                                    <th className="p-4 font-bold uppercase text-[10px]">Fecha</th>
                                    <th className="p-4 font-bold uppercase text-[10px]">Descripción</th>
                                    <th className="p-4 font-bold uppercase text-[10px]">Método</th>
                                    <th className="p-4 font-bold uppercase text-[10px] text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr><td colSpan={4} className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-sonblade-gold" /></td></tr>
                                ) : filteredGastos.length === 0 ? (
                                    <tr><td colSpan={4} className="p-10 text-center text-gray-400 italic">No hay gastos registrados</td></tr>
                                ) : filteredGastos.map((gasto) => (
                                    <tr key={gasto.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4 text-gray-500">
                                            {new Date(gasto.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 font-bold text-gray-900">{gasto.description}</td>
                                        <td className="p-4">
                                            <span className="text-[10px] font-black uppercase text-gray-400 border border-gray-200 px-2 py-0.5 rounded">
                                                {gasto.payment_method}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-black text-red-600">
                                            -${Number(gasto.amount).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-gray-100">
                            <h2 className="text-xl font-black text-gray-900">Registrar Nuevo Gasto</h2>
                            <p className="text-sm text-gray-500 mt-1">Completa los datos del egreso</p>
                        </div>
                        <form onSubmit={handleAddGasto} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black text-gray-400 uppercase mb-2">Descripción</label>
                                <input
                                    required
                                    type="text"
                                    value={newGasto.description}
                                    onChange={e => setNewGasto({ ...newGasto, description: e.target.value })}
                                    placeholder="Ej: Pago de luz local"
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-1 focus:ring-black outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase mb-2">Monto ($)</label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        value={newGasto.amount}
                                        onChange={e => setNewGasto({ ...newGasto, amount: e.target.value })}
                                        placeholder="0.00"
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-1 focus:ring-black outline-none font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-gray-400 uppercase mb-2">Método</label>
                                    <select
                                        value={newGasto.payment_method}
                                        onChange={e => setNewGasto({ ...newGasto, payment_method: e.target.value })}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-1 focus:ring-black outline-none font-bold"
                                    >
                                        <option value="cash">Efectivo</option>
                                        <option value="card">Tarjeta</option>
                                        <option value="transfer">Transferencia</option>
                                    </select>
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 py-3 text-gray-500 font-bold hover:text-gray-900"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-1 py-3 bg-red-600 text-white font-black rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
                                    Confirmar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
