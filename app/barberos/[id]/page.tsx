'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import DateRangePicker from '@/components/ui/DateRangePicker';

interface Kpis { cuts: number; serviceRevenue: number; productRevenue: number; totalRevenue: number; tips: number; commissionRate: number; totalCommission: number; serviceCommission: number; productCommission: number; }
interface Movement { id: string; date: string; services: string; products: string; payment_method: string; cash_amount: number; card_amount: number; transfer_amount: number; tip: number; total: number; commission: number; }
interface ServiceBreak { name: string; count: number; revenue: number; }

function PaymentDetail({ m }: { m: Movement }) {
    const pill = 'inline-block whitespace-nowrap text-xs font-medium px-2.5 py-0.5 rounded-full border border-bos-border bg-bos-raised text-bos-text';
    const parts: string[] = [];
    if (m.cash_amount > 0) parts.push(`Efect. $${m.cash_amount.toFixed(0)}`);
    if (m.card_amount > 0) parts.push(`Tarj. $${m.card_amount.toFixed(0)}`);
    if (m.transfer_amount > 0) parts.push(`Transf. $${m.transfer_amount.toFixed(0)}`);
    if (parts.length > 1) return <span className={pill}>{parts.join(' / ')}</span>;
    const label = m.payment_method === 'cash' ? 'Efectivo' : m.payment_method === 'card' ? 'Tarjeta' : m.payment_method === 'transfer' ? 'Transferencia' : m.payment_method;
    return <span className={pill}>{label}</span>;
}

export default function BarberProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [barber, setBarber] = useState<{ id: string; name: string; status: string; commission_type: string } | null>(null);
    const [kpis, setKpis] = useState<Kpis | null>(null);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [serviceBreakdown, setServiceBreakdown] = useState<ServiceBreak[]>([]);
    const [period, setPeriod] = useState('week');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    const [loading, setLoading] = useState(true);



    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            let url = `/api/barbers/${id}/stats?period=${period}`;
            if (dateRange.from && dateRange.to) url = `/api/barbers/${id}/stats?from=${dateRange.from}&to=${dateRange.to}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setBarber(data.barber);
                setKpis(data.kpis);
                setMovements(data.movements);
                setServiceBreakdown(data.serviceBreakdown || []);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [id, period, dateRange]);

    useEffect(() => { fetchStats(); }, [fetchStats]);


    if (loading && !barber) return <div className="flex justify-center items-center h-full min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>;

    const svcTotal = serviceBreakdown.reduce((s, b) => s + b.revenue, 0);
    const card = 'rounded-xl border border-bos-border bg-bos-surface';
    const th = 'px-4 py-3 text-[13px] font-medium';
    const dateField = 'h-11 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text focus-visible:border-bos-accent-text';

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Encabezado */}
            <header className="flex items-center gap-4">
                <Link href="/equipo" aria-label="Volver al equipo" className="h-11 w-11 shrink-0 inline-flex items-center justify-center border border-bos-border rounded-xl text-bos-muted hover:text-bos-text hover:bg-bos-raised"><ArrowLeft className="h-5 w-5" /></Link>
                <div className="flex items-center gap-3 min-w-0">
                    <div aria-hidden="true" className="w-14 h-14 shrink-0 bg-bos-raised border border-bos-border rounded-full flex items-center justify-center font-display text-2xl font-semibold">
                        {barber?.name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                        <h1 className="font-display text-3xl font-semibold tracking-tight truncate">{barber?.name}</h1>
                        <span className={`inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full ${barber?.status === 'active' ? 'bg-bos-success-soft text-bos-success' : 'bg-bos-raised text-bos-muted border border-bos-border'}`}>{barber?.status === 'active' ? 'Activo' : 'Inactivo'}</span>
                    </div>
                </div>
            </header>

            {/* Periodo y fechas */}
            <div className="flex flex-wrap items-center gap-2">
                {['today', 'week', 'month'].map(p => {
                    const selected = period === p && !dateRange.from;
                    return (
                        <button key={p} type="button" aria-pressed={selected} onClick={() => { setPeriod(p); setDateRange({ from: '', to: '' }); }}
                            className={`min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${selected ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:text-bos-text'}`}>
                            {p === 'today' ? 'Hoy' : p === 'week' ? 'Semana' : 'Mes'}
                        </button>
                    );
                })}
                <div className="flex items-center gap-2 sm:ml-auto w-full sm:w-auto">
                    <DateRangePicker aria-label="Periodo" shortcuts={false} value={dateRange} onChange={(r) => setDateRange(r)} className={`${dateField} flex-1 min-w-0 sm:min-w-64`} />
                </div>
            </div>

            {/* Cifras */}
            {kpis && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className={`${card} p-4`}>
                            <span className="text-[13px] font-medium text-bos-muted">Cortes</span>
                            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">${kpis.serviceRevenue.toFixed(2)}</p>
                            <p className="text-xs text-bos-muted">{kpis.cuts} servicios realizados</p>
                        </div>
                        <div className={`${card} p-4`}>
                            <span className="text-[13px] font-medium text-bos-muted">Comisión</span>
                            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">${kpis.serviceCommission.toFixed(2)}</p>
                            <p className="text-xs text-bos-muted">{kpis.commissionRate}% de servicios</p>
                        </div>
                        <div className={`${card} p-4`}>
                            <span className="text-[13px] font-medium text-bos-muted">Propina</span>
                            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">${kpis.tips.toFixed(2)}</p>
                            <p className="text-xs text-bos-muted">100% para el barbero</p>
                        </div>
                        <div className={`${card} p-4 border-bos-accent`}>
                            <span className="text-[13px] font-medium text-bos-muted">Total a recibir</span>
                            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-bos-accent-text">${kpis.totalCommission.toFixed(2)}</p>
                            {kpis.productCommission > 0 && <p className="text-xs text-bos-muted">Incluye ${kpis.productCommission.toFixed(2)} por productos</p>}
                        </div>
                    </div>

                    <div className={`${card} p-5`}>
                        <h3 className="font-display font-semibold mb-1">Comisión del periodo — {kpis.cuts} cortes</h3>
                        <p className="text-sm text-bos-muted">
                            Tasa vigente: <strong className="text-bos-text">{kpis.commissionRate}%</strong> sobre el precio de lista de cada servicio con regla de comisión.
                        </p>
                    </div>
                </div>
            )}

            {/* Resumen de servicios */}
            {serviceBreakdown.length > 0 && (
                <div className={`${card} overflow-hidden`}>
                    <div className="px-5 py-4 border-b border-bos-border">
                        <h3 className="font-display font-semibold">Resumen de servicios</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-bos-muted">
                                <tr>
                                    <th className={`${th} text-left`}>Tipo de servicio</th>
                                    <th className={`${th} text-center`}>Cantidad</th>
                                    <th className={`${th} text-right`}>Ingresos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {serviceBreakdown.map(s => (
                                    <tr key={s.name} className="border-t border-bos-border hover:bg-bos-raised">
                                        <td className="px-4 py-3 font-medium">{s.name}</td>
                                        <td className="px-4 py-3 text-center font-semibold tabular-nums">{s.count}</td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums">${s.revenue.toFixed(2)}</td>
                                    </tr>
                                ))}
                                <tr className="border-t border-bos-border bg-bos-raised font-semibold">
                                    <td className="px-4 py-3">Total</td>
                                    <td className="px-4 py-3 text-center tabular-nums">{serviceBreakdown.reduce((s, b) => s + b.count, 0)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">${svcTotal.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Movimientos */}
            <div className={`${card} overflow-hidden`}>
                <div className="px-5 py-4 border-b border-bos-border">
                    <h3 className="font-display font-semibold">Movimientos ({movements.length})</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={`${th} text-left`}>Fecha</th>
                                <th className={`${th} text-left`}>Hora</th>
                                <th className={`${th} text-left`}>Servicio</th>
                                <th className={`${th} text-left`}>Producto</th>
                                <th className={`${th} text-left`}>Pago</th>
                                <th className={`${th} text-right`}>Propina</th>
                                <th className={`${th} text-right`}>Total</th>
                                <th className={`${th} text-right`}>Comisión</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr className="border-t border-bos-border"><td colSpan={8} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-bos-muted" /></td></tr>
                            ) : movements.length === 0 ? (
                                <tr className="border-t border-bos-border"><td colSpan={8} className="p-8 text-center text-bos-muted">Sin movimientos en este período</td></tr>
                            ) : movements.map(m => {
                                const d = new Date(m.date);
                                return (
                                    <tr key={m.id} className="border-t border-bos-border hover:bg-bos-raised">
                                        <td className="px-4 py-3 font-medium whitespace-nowrap">{format(d, 'MMM dd')}</td>
                                        <td className="px-4 py-3 text-bos-muted whitespace-nowrap">{format(d, 'hh:mm a')}</td>
                                        <td className="px-4 py-3">{m.services}</td>
                                        <td className="px-4 py-3 text-bos-muted">{m.products}</td>
                                        <td className="px-4 py-3"><PaymentDetail m={m} /></td>
                                        <td className="px-4 py-3 text-right tabular-nums">${m.tip.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums">${m.total.toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-bos-accent-text">${m.commission.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
