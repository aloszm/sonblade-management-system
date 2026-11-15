'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Search, Loader2, Info } from 'lucide-react';
import Modal from '@/components/ui/Modal';

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
    const [formError, setFormError] = useState('');

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
        setFormError('');
        try {
            // Un gasto sale de la caja: necesita una caja abierta.
            const session = await fetch('/api/cash/session', { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
            if (!session?.id) {
                setFormError('Abre la caja para registrar un gasto.');
                return;
            }
            const res = await fetch('/api/cash/movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cash_session_id: session.id,
                    movement_type: 'expense',
                    method: newGasto.payment_method,
                    amount: Number(newGasto.amount),
                    description: newGasto.description,
                })
            });

            if (res.ok) {
                setShowAddModal(false);
                setNewGasto({ description: '', amount: '', payment_method: 'cash' });
                fetchGastos();
            } else {
                const body = await res.json().catch(() => null);
                setFormError(body?.detail ? `${body.error} (${body.detail})` : body?.error || 'No se pudo registrar el gasto');
            }
        } catch (e) {
            console.error(e);
            setFormError('No se pudo registrar el gasto');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalGastos = gastos.reduce((acc, g) => acc + Number(g.amount), 0);
    const METHOD_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' };
    const filteredGastos = gastos.filter(g =>
        g.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const th = 'px-4 py-3 text-[13px] font-medium';

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Gastos e insumos</h1>
                    <p className="text-bos-muted text-sm mt-1">Control de egresos y compras de la barbería</p>
                </div>
                <button
                    onClick={() => { setFormError(''); setShowAddModal(true); }}
                    className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold flex items-center justify-center gap-2 hover:bg-bos-accent-strong transition-opacity"
                >
                    <Plus className="h-4 w-4" /> Registrar gasto
                </button>
            </header>

            {/* Explicación para recepción */}
            <section aria-labelledby="gasto-vs-retiro" className="rounded-xl border border-bos-border bg-bos-surface p-5">
                <h2 id="gasto-vs-retiro" className="flex items-center gap-2 font-display font-semibold"><Info className="h-4 w-4 text-bos-muted" /> ¿Gasto, retiro o entrada?</h2>
                <ul className="mt-3 space-y-2 text-sm text-bos-muted leading-relaxed">
                    <li><strong className="text-bos-text">Gasto:</strong> sale dinero de la caja para PAGAR algo del negocio (agua, basura, insumos, una reparación). Baja la utilidad.</li>
                    <li><strong className="text-bos-text">Retiro</strong> (se hace en la pantalla Caja): el dinero solo CAMBIA DE LUGAR, por ejemplo al banco, a la caja fuerte, al dueño o para pagar comisiones en efectivo. No baja la utilidad.</li>
                    <li><strong className="text-bos-text">Entrada:</strong> metes efectivo a la caja, por ejemplo para tener cambio.</li>
                </ul>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-1">
                    <div className="rounded-xl border border-bos-border bg-bos-surface p-6 text-center">
                        <p className="text-[13px] font-medium text-bos-muted mb-2">Total del periodo</p>
                        <p className="font-display text-4xl font-semibold tabular-nums">${totalGastos.toFixed(2)}</p>
                        <div className="mt-4 pt-4 border-t border-bos-border">
                            <p className="text-xs text-bos-muted">{gastos.length} comprobantes registrados</p>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-3 space-y-4">
                    <div className="relative">
                        <Search aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-bos-muted" />
                        <input
                            type="text"
                            aria-label="Buscar por descripción"
                            placeholder="Buscar por descripción..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`${field} pl-11`}
                        />
                    </div>

                    <div className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-bos-muted">
                                    <tr>
                                        <th className={th}>Fecha</th>
                                        <th className={th}>Descripción</th>
                                        <th className={th}>Método</th>
                                        <th className={`${th} text-right`}>Monto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr className="border-t border-bos-border"><td colSpan={4} className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-bos-muted" /></td></tr>
                                    ) : filteredGastos.length === 0 ? (
                                        <tr className="border-t border-bos-border"><td colSpan={4} className="p-10 text-center text-bos-muted">No hay gastos registrados</td></tr>
                                    ) : filteredGastos.map((gasto) => (
                                        <tr key={gasto.id} className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                            <td className="px-4 py-3 text-bos-muted whitespace-nowrap">
                                                {new Date(gasto.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 font-semibold">{gasto.description}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-medium text-bos-muted border border-bos-border px-2.5 py-0.5 rounded-full">
                                                    {METHOD_LABELS[gasto.payment_method] ?? gasto.payment_method}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums text-bos-danger whitespace-nowrap">
                                                -${Number(gasto.amount).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {showAddModal && (
                <Modal title="Registrar nuevo gasto" subtitle="Completa los datos del egreso" onClose={() => setShowAddModal(false)}>
                    <form onSubmit={handleAddGasto} className="space-y-4">
                        <div>
                            <label htmlFor="gasto-description" className={label}>Descripción</label>
                            <input
                                id="gasto-description"
                                required
                                type="text"
                                value={newGasto.description}
                                onChange={e => setNewGasto({ ...newGasto, description: e.target.value })}
                                placeholder="Ej: Pago de luz local"
                                className={field}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="gasto-amount" className={label}>Monto ($)</label>
                                <input
                                    id="gasto-amount"
                                    required
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    value={newGasto.amount}
                                    onChange={e => setNewGasto({ ...newGasto, amount: e.target.value })}
                                    placeholder="0.00"
                                    className={`${field} font-semibold`}
                                />
                            </div>
                            <div>
                                <label htmlFor="gasto-method" className={label}>Método</label>
                                <select
                                    id="gasto-method"
                                    value={newGasto.payment_method}
                                    onChange={e => setNewGasto({ ...newGasto, payment_method: e.target.value })}
                                    className={field}
                                >
                                    <option value="cash">Efectivo</option>
                                    <option value="card">Tarjeta</option>
                                    <option value="transfer">Transferencia</option>
                                </select>
                            </div>
                        </div>
                        {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="flex-1 min-h-[52px] px-5 border border-bos-border rounded-xl text-bos-text font-semibold hover:bg-bos-raised"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold hover:bg-bos-accent-strong disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                Confirmar
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
