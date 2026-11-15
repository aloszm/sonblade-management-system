'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Plus, Minus, Search, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
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
    const idempotencyKey = useRef(crypto.randomUUID());
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedServices, setSelectedServices] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);
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
        if (Math.round((cashAmount + cardAmount + transferAmount) * 100) !== Math.round(total * 100)) {
            setError('Los pagos deben coincidir con el total de la venta.'); return;
        }
        setError('');
        setSubmitting(true);
        try {
            const body = {
                idempotency_key: idempotencyKey.current,
                client_id: clientId || null,
                notes,
                items: selectedServices.map(s => ({
                    item_type: 'service' as const,
                    catalog_id: s.id,
                    quantity: s.qty,
                    employee_id: barberId,
                })),
                payments: [
                    ...(cashAmount > 0 ? [{ method: 'cash' as const, amount: cashAmount }] : []),
                    ...(cardAmount > 0 ? [{ method: 'card' as const, amount: cardAmount }] : []),
                    ...(transferAmount > 0 ? [{ method: 'transfer' as const, amount: transferAmount }] : []),
                ],
            };
            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) { const payload = await res.json(); throw new Error(payload.error || 'Error al crear venta'); }
            // Reset
            setBarberId(''); setClientId(''); setSelectedServices([]); setPaymentMethod('cash'); setNotes(''); idempotencyKey.current = crypto.randomUUID();
            onCreated();
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Error al crear venta.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const field = 'w-full h-11 px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';

    return (
        <Modal title="Crear venta manual" subtitle="Registra una venta desde el historial" onClose={onClose} size="lg">
            <div className="space-y-5">
                {error && <p role="alert" className="rounded-xl border border-bos-border bg-bos-bg px-4 py-2.5 text-sm font-medium text-bos-danger">{error}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Barbero */}
                    <div>
                        <label htmlFor="sale-barber" className={label}>Barbero *</label>
                        <select id="sale-barber" value={barberId} onChange={e => setBarberId(e.target.value)} className={field}>
                            <option value="">Seleccionar barbero...</option>
                            {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>

                    {/* Cliente */}
                    <div>
                        <label htmlFor="sale-client" className={label}>Cliente (CRM)</label>
                        <div className="relative">
                            {clientId ? (() => {
                                const c = clients.find(cl => cl.id === clientId);
                                return (
                                    <div className="flex items-center justify-between h-11 pl-3 pr-1 border border-bos-border bg-bos-raised rounded-xl">
                                        <span className="font-semibold text-sm">{c?.name || 'Cliente'}</span>
                                        <button
                                            type="button"
                                            aria-label="Quitar cliente"
                                            onClick={() => { setClientId(''); setClientSearch(''); }}
                                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-bos-muted hover:text-bos-danger"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                );
                            })() : (
                                <>
                                    <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bos-muted" />
                                    <input
                                        id="sale-client"
                                        type="text"
                                        placeholder="Buscar cliente..."
                                        value={clientSearch}
                                        onChange={(e) => setClientSearch(e.target.value)}
                                        className={`${field} pl-9`}
                                    />
                                    {clientSearch && filteredClients.length > 0 && (
                                        <div className="absolute top-12 left-0 right-0 bg-bos-surface border border-bos-border rounded-xl overflow-hidden z-20 shadow-lg">
                                            {filteredClients.map((c: Client) => (
                                                <button
                                                    type="button"
                                                    key={c.id}
                                                    onClick={() => { setClientId(c.id); setClientSearch(''); }}
                                                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-bos-raised border-b border-bos-border last:border-0"
                                                >
                                                    <div className="font-semibold">{c.name}</div>
                                                    <div className="text-xs text-bos-muted">{c.client_number} {c.phone ? `| ${c.phone}` : ''}</div>
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
                    <label htmlFor="sale-service" className={label}>Servicios *</label>
                    <select id="sale-service" onChange={e => { addService(e.target.value); e.target.value = ''; }} className={`${field} mb-2`}>
                        <option value="">Agregar servicio...</option>
                        {services.map(s => <option key={s.id} value={s.id}>{s.name} — ${s.price}</option>)}
                    </select>
                    {selectedServices.length > 0 && (
                        <div className="space-y-2">
                            {selectedServices.map(s => (
                                <div key={s.id} className="flex items-center justify-between gap-2 bg-bos-bg rounded-xl pl-3 pr-1 py-1 border border-bos-border">
                                    <span className="font-medium text-sm min-w-0 truncate">{s.name}</span>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="text-sm text-bos-muted tabular-nums">${s.price} × {s.qty}</span>
                                        <span className="font-semibold text-sm tabular-nums">${(s.price * s.qty).toFixed(2)}</span>
                                        <button type="button" aria-label={`Quitar ${s.name}`} onClick={() => removeService(s.id)} className="h-11 w-11 inline-flex items-center justify-center rounded-xl text-bos-muted hover:text-bos-danger"><Minus className="h-4 w-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Método de pago */}
                <div>
                    <p className={label}>Método de pago</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(['cash', 'card', 'transfer', 'mixed'] as const).map(m => (
                            <button type="button" key={m} aria-pressed={paymentMethod === m} onClick={() => setPaymentMethod(m)}
                                className={`min-h-11 px-3 rounded-xl text-sm font-semibold border transition-colors ${paymentMethod === m ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:text-bos-text'}`}>
                                {m === 'cash' ? 'Efectivo' : m === 'card' ? 'Tarjeta' : m === 'transfer' ? 'Transf.' : 'Mixto'}
                            </button>
                        ))}
                    </div>
                </div>

                {paymentMethod === 'mixed' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label htmlFor="sale-cash" className={label}>Efectivo</label>
                            <input id="sale-cash" type="number" inputMode="decimal" value={cashAmount} onChange={e => setCashAmount(Number(e.target.value))} className={field} />
                        </div>
                        <div>
                            <label htmlFor="sale-card" className={label}>Tarjeta</label>
                            <input id="sale-card" type="number" inputMode="decimal" value={cardAmount} onChange={e => setCardAmount(Number(e.target.value))} className={field} />
                        </div>
                        <div>
                            <label htmlFor="sale-transfer" className={label}>Transferencia</label>
                            <input id="sale-transfer" type="number" inputMode="decimal" value={transferAmount} onChange={e => setTransferAmount(Number(e.target.value))} className={field} />
                        </div>
                    </div>
                )}

                {/* Notas */}
                <div>
                    <label htmlFor="sale-notes" className={label}>Notas</label>
                    <textarea id="sale-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text placeholder:text-bos-muted outline-none focus:border-bos-accent resize-none" placeholder="Opcional..." />
                </div>

                {/* Total */}
                <div className="rounded-xl p-4 border border-bos-border bg-bos-bg flex justify-between items-center">
                    <span className="font-medium text-bos-muted">Total</span>
                    <span className="font-display text-2xl font-semibold tabular-nums text-bos-accent-text">${total.toFixed(2)}</span>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                    <button type="button" onClick={onClose} className="min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text font-semibold hover:bg-bos-raised">Cancelar</button>
                    <button type="button" onClick={handleSubmit} disabled={submitting} className="min-h-[52px] px-6 rounded-xl bg-bos-accent text-bos-on-accent font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {submitting ? 'Creando...' : 'Crear venta'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
