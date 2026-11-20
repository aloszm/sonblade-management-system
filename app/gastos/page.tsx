'use client';

import React, { useState, useEffect } from 'react';
import { ReadOnlyNotice, useReadOnly } from '@/lib/auth/read-only';
import { Plus, Search, Info } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { formatMoney } from '@/lib/utils/money';
import { formatDate } from '@/lib/utils/dates';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Field, { FIELD_CLASS } from '@/components/ui/Field';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { HttpError, MSG_OFFLINE, isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils/payment';

interface Gasto {
    id: string;
    description: string;
    amount: number;
    created_at: string;
    payment_method: string;
}

export default function GastosPage() {
    // Cuenta de consulta: ve los gastos sin registrar nuevos.
    const readOnly = useReadOnly();
    const [gastos, setGastos] = useState<Gasto[]>([]);
    const [loading, setLoading] = useState(true);
    // Fallo al cargar: se distingue de "no hay gastos".
    const [loadError, setLoadError] = useState<unknown>(null);
    const toast = useToast();
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
        setLoadError(null);
        try {
            setGastos(await readJson<Gasto[]>(await fetch('/api/cash/movements?type=expense')));
        } catch (e) {
            console.error(e);
            setLoadError(e);
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
                toast.success('Gasto registrado.');
            } else {
                const body = await res.json().catch(() => null);
                setFormError(toUserMessage(new HttpError(res.status, body?.error), 'No se pudo registrar el gasto.'));
            }
        } catch (e) {
            console.error(e);
            setFormError(isOfflineError(e) ? MSG_OFFLINE : 'No se pudo registrar el gasto.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalGastos = gastos.reduce((acc, g) => acc + Number(g.amount), 0);
    const METHOD_LABELS = PAYMENT_METHOD_LABELS;
    const filteredGastos = gastos.filter(g =>
        g.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const field = FIELD_CLASS;
    const th = 'px-4 py-3 text-[13px] font-medium';

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Gastos</h1>
                    <p className="text-bos-muted text-sm mt-1">Control de egresos y compras de la barbería</p>
                </div>
                {!readOnly && <Button onClick={() => { setFormError(''); setShowAddModal(true); }}>
                    <Plus className="h-4 w-4" /> Registrar gasto
                </Button>}
            </header>
            <ReadOnlyNotice readOnly={readOnly} />

            {/* Explicación para recepción */}
            <Card as="section" aria-labelledby="gasto-vs-retiro" className="!p-5">
                <h2 id="gasto-vs-retiro" className="flex items-center gap-2 font-display font-semibold"><Info className="h-4 w-4 text-bos-muted" /> ¿Gasto, retiro o entrada?</h2>
                <ul className="mt-3 space-y-2 text-sm text-bos-muted leading-relaxed">
                    <li><strong className="text-bos-text">Gasto:</strong> sale dinero de la caja para pagar algo del negocio (agua, insumos, una reparación). Baja la utilidad.</li>
                    <li><strong className="text-bos-text">Retiro</strong> (en Caja): el dinero solo cambia de lugar, por ejemplo al banco o a la caja fuerte. No baja la utilidad.</li>
                    <li><strong className="text-bos-text">Entrada:</strong> metes efectivo a la caja, por ejemplo para dar cambio.</li>
                </ul>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-1">
                    <div className="rounded-xl border border-bos-border bg-bos-surface p-6 text-center">
                        <p className="text-[13px] font-medium text-bos-muted mb-2">Total del periodo</p>
                        <p className="font-display text-4xl font-semibold tabular-nums">{formatMoney(totalGastos, { cents: true })}</p>
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
                            <table className="bos-stack w-full text-left text-sm">
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
                                        <tr className="border-t border-bos-border"><td colSpan={4} data-label="" className="p-4" role="status" aria-busy="true">
                                            <span className="sr-only">Cargando gastos…</span>
                                            <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                                        </td></tr>
                                    ) : loadError ? (
                                        <tr className="border-t border-bos-border"><td colSpan={4} data-label="" className="p-4">
                                            <ErrorState title="No se pudieron cargar los gastos" message={toUserMessage(loadError)} offline={isOfflineError(loadError)} onRetry={fetchGastos} />
                                        </td></tr>
                                    ) : filteredGastos.length === 0 ? (
                                        <tr className="border-t border-bos-border"><td colSpan={4} data-label=""><EmptyState title="No hay gastos registrados" /></td></tr>
                                    ) : filteredGastos.map((gasto) => (
                                        <tr key={gasto.id} className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                            <td data-label="" className="px-4 py-3 text-bos-muted whitespace-nowrap max-md:order-first">
                                                {formatDate(gasto.created_at)}
                                            </td>
                                            <td data-label="" className="px-4 py-3 font-semibold max-md:order-first">{gasto.description}</td>
                                            <td data-label="Método" className="px-4 py-3">
                                                <span className="text-xs font-medium text-bos-muted border border-bos-border px-2.5 py-0.5 rounded-full">
                                                    {METHOD_LABELS[gasto.payment_method] ?? gasto.payment_method}
                                                </span>
                                            </td>
                                            <td data-label="Monto" className="px-4 py-3 text-right font-semibold tabular-nums text-bos-danger whitespace-nowrap max-md:order-first max-md:text-lg">
                                                -{formatMoney(Number(gasto.amount), { cents: true })}
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
                        <Field
                            id="gasto-description"
                            label="Descripción"
                            required
                            type="text"
                            value={newGasto.description}
                            onChange={e => setNewGasto({ ...newGasto, description: e.target.value })}
                            placeholder="Ej: Pago de luz local"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field
                                id="gasto-amount"
                                label="Monto ($)"
                                required
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                value={newGasto.amount}
                                onChange={e => setNewGasto({ ...newGasto, amount: e.target.value })}
                                placeholder="0.00"
                                className="font-semibold"
                            />
                            <Field id="gasto-method" label="Método">
                                {(c) => (
                                    <select
                                        {...c}
                                        value={newGasto.payment_method}
                                        onChange={e => setNewGasto({ ...newGasto, payment_method: e.target.value })}
                                    >
                                        <option value="cash">Efectivo</option>
                                        <option value="card">Tarjeta</option>
                                        <option value="transfer">Transferencia</option>
                                    </select>
                                )}
                            </Field>
                        </div>
                        {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
                            <Button variant="secondary" onClick={() => setShowAddModal(false)} className="flex-1">Cancelar</Button>
                            <Button type="submit" loading={isSubmitting} className="flex-1">Confirmar</Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
