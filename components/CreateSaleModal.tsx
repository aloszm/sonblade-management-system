'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Plus, Minus, UserSearch, Search, Trash2 } from 'lucide-react';
import type { Barber, Service, Client } from '@/types';

interface CreateSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    barbers: Barber[];
    services: Service[];
}

export default function CreateSaleModal({ isOpen, onClose, onCreated, barbers, services }: CreateSaleModalProps) {
    const [barberId, setBarberId] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedServices, setSelectedServices] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);
    const [tip, setTip] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'mixed'>('cash');
    const [cashAmount, setCashAmount] = useState(0);
    const [cardAmount, setCardAmount] = useState(0);
    const [transferAmount, setTransferAmount] = useState(0);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const total = selectedServices.reduce((s, sv) => s + sv.price * sv.qty, 0);

    useEffect(() => {
        if (paymentMethod !== 'mixed') {
            setCashAmount(paymentMethod === 'cash' ? total : 0);
            setCardAmount(paymentMethod === 'card' ? total : 0);
            setTransferAmount(paymentMethod === 'transfer' ? total : 0);
        }
    }, [paymentMethod, total]);

    useEffect(() => {
        if (isOpen) {
            fetch('/api/clients').then(res => res.json()).then(data => setClients(data));
        }
    }, [isOpen]);

    const filteredClients = useMemo(() => {
        if (!clientSearch) return [];
        const t = clientSearch.toLowerCase();
        return clients.filter(c =>
            c.name.toLowerCase().includes(t) ||
            (c.phone && c.phone.includes(t)) ||
            (c.client_number && c.client_number.toLowerCase().includes(t))
        ).slice(0, 5);
    }, [clients, clientSearch]);

    const addService = (serviceId: string) => {
        const svc = services.find(s => s.id === serviceId);
        if (!svc) return;
        const existing = selectedServices.find(s => s.id === serviceId);
        if (existing) {
            setSelectedServices(prev => prev.map(s => s.id === serviceId ? { ...s, qty: s.qty + 1 } : s));
        } else {
            setSelectedServices(prev => [...prev, { id: svc.id, name: svc.name, price: svc.price, qty: 1 }]);
        }
    };

    const removeService = (serviceId: string) => {
        setSelectedServices(prev => prev.filter(s => s.id !== serviceId));
    };

    const handleSubmit = async () => {
        if (!barberId) { setError('Selecciona un barbero'); return; }
        if (selectedServices.length === 0) { setError('Agrega al menos un servicio'); return; }
        setError('');
        setSubmitting(true);
        try {
            const body = {
                barber_id: barberId,
                client_id: clientId || null,
                total,
                tip,
                cash_amount: cashAmount,
                card_amount: cardAmount,
                transfer_amount: transferAmount,
                payment_method: paymentMethod,
                notes,
                items: selectedServices.map(s => ({
                    item_type: 'service' as const,
                    item_name: s.name,
                    item_price: s.price,
                    quantity: s.qty,
                    service_id: s.id,
                })),
            };
            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Error al crear venta');
            // Reset
            setBarberId(''); setClientId(''); setSelectedServices([]); setTip(0); setPaymentMethod('cash'); setNotes('');
            onCreated();
            onClose();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Crear Venta Manual</h2>
                        <p className="text-sm text-gray-500">Registra una venta desde el historial</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto scrollbar-sonblade-light space-y-5">
                    {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-medium">{error}</div>}

                    <div className="grid grid-cols-2 gap-4">
                        {/* Barbero */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Barbero *</label>
                            <select value={barberId} onChange={e => setBarberId(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                <option value="">Seleccionar barbero...</option>
                                {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>

                        {/* Cliente */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Cliente (CRM)</label>
                            <div className="relative">
                                {clientId ? (() => {
                                    const c = clients.find(cl => cl.id === clientId);
                                    return (
                                        <div className="flex items-center justify-between p-2 border border-blue-200 bg-blue-50 rounded-lg">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-sm text-blue-900">{c?.name || 'Cliente'}</span>
                                            </div>
                                            <button
                                                onClick={() => { setClientId(''); setClientSearch(''); }}
                                                className="text-blue-500 hover:text-blue-700 p-1"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })() : (
                                    <>
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar cliente..."
                                            value={clientSearch}
                                            onChange={(e) => setClientSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                        />
                                        {clientSearch && filteredClients.length > 0 && (
                                            <div className="absolute top-10 left-0 right-0 bg-white border border-gray-100 shadow-md rounded-lg overflow-hidden z-20">
                                                {filteredClients.map((c: Client) => (
                                                    <button
                                                        key={c.id}
                                                        onClick={() => { setClientId(c.id); setClientSearch(''); }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                                                    >
                                                        <div className="font-bold">{c.name}</div>
                                                        <div className="text-xs text-gray-500">{c.client_number} {c.phone ? `| ${c.phone}` : ''}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Servicios */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Servicios *</label>
                        <select onChange={e => { addService(e.target.value); e.target.value = ''; }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm mb-2">
                            <option value="">Agregar servicio...</option>
                            {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>)}
                        </select>
                        {selectedServices.length > 0 && (
                            <div className="space-y-2">
                                {selectedServices.map(s => (
                                    <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                                        <span className="font-medium text-sm">{s.name}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm text-gray-500">${s.price} × {s.qty}</span>
                                            <span className="font-bold text-sm">${(s.price * s.qty).toFixed(2)}</span>
                                            <button onClick={() => removeService(s.id)} className="text-red-400 hover:text-red-600"><Minus className="h-4 w-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Propina */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Propina</label>
                        <input type="number" value={tip} onChange={e => setTip(Number(e.target.value))} min={0} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" placeholder="0" />
                    </div>

                    {/* Método de pago */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Método de Pago</label>
                        <div className="grid grid-cols-4 gap-2">
                            {(['cash', 'card', 'transfer', 'mixed'] as const).map(m => (
                                <button key={m} onClick={() => setPaymentMethod(m)}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${paymentMethod === m ? 'bg-black text-sonblade-gold border-sonblade-gold' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                                    {m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : m === 'transfer' ? 'Transf.' : 'Mixto'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {paymentMethod === 'mixed' && (
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Efectivo</label>
                                <input type="number" value={cashAmount} onChange={e => setCashAmount(Number(e.target.value))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Tarjeta</label>
                                <input type="number" value={cardAmount} onChange={e => setCardAmount(Number(e.target.value))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Transferencia</label>
                                <input type="number" value={transferAmount} onChange={e => setTransferAmount(Number(e.target.value))} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm" />
                            </div>
                        </div>
                    )}

                    {/* Notas */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Notas</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm resize-none" placeholder="Opcional..." />
                    </div>

                    {/* Total */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex justify-between items-center">
                        <span className="font-bold text-gray-700">TOTAL</span>
                        <span className="text-2xl font-black text-gray-900">${total.toFixed(2)}</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-2xl flex justify-between">
                    <button onClick={onClose} className="px-5 py-2 text-gray-600 font-medium hover:text-gray-900">Cancelar</button>
                    <button onClick={handleSubmit} disabled={submitting} className="px-6 py-2.5 bg-black text-sonblade-gold font-bold rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {submitting ? 'Creando...' : 'Crear Venta'}
                    </button>
                </div>
            </div>
        </div>
    );
}
