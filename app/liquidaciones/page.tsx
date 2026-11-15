'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronLeft, ChevronRight, Loader2, Receipt, Wallet, X } from 'lucide-react';
import { addDays, weekLabel } from '@/lib/settlements/week';

type Row = {
    employee_id: string; name: string; gross_commission: number; deductions: number; tips: number; total_amount: number;
    entry_count: number; can_settle: boolean; reason: string | null; settlement_id: string | null; receipt_number: string | null;
};
type Week = {
    period_start: string; period_end: string; timezone: string; is_latest_closed: boolean; rows: Row[];
};
type HistoryRow = {
    id: string; receipt_number: string; employee_name: string; period_start: string; period_end: string; total_amount: number; paid_at: string | null;
};

const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const cents = (n: number) => Math.round(n * 100);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.detail ? `${body.error} (${body.detail})` : body?.error ?? 'No se pudo completar la operación.');
    return body as T;
}

export default function LiquidacionesPage() {
    const router = useRouter();
    const [role, setRole] = useState<'admin' | 'recepcion' | 'barber' | null>(null);
    const [periodStart, setPeriodStart] = useState<string | null>(null);
    const [week, setWeek] = useState<Week | null>(null);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [paying, setPaying] = useState<Row | null>(null);
    const [cash, setCash] = useState('');
    const [transfer, setTransfer] = useState('');
    const [reference, setReference] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const loadHistory = useCallback(async () => {
        try { setHistory(await api<HistoryRow[]>('/api/settlements/history')); } catch { /* se muestra vacío */ }
    }, []);

    const loadWeek = useCallback(async (start: string | null) => {
        setLoading(true); setError(null);
        try {
            const data = await api<Week>(`/api/settlements${start ? `?period_start=${start}` : ''}`);
            setWeek(data); setPeriodStart(data.period_start);
        } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const me = await api<{ user: { role: 'admin' | 'recepcion' | 'barber' } }>('/api/auth/me');
                setRole(me.user.role);
                if (me.user.role === 'admin') await loadWeek(null); else setLoading(false);
            } catch { setLoading(false); setError('No se pudo identificar tu sesión.'); }
            loadHistory();
        })();
    }, [loadHistory, loadWeek]);

    const openPay = (row: Row) => {
        setPaying(row); setCash(String(row.total_amount)); setTransfer(''); setReference(''); setFormError(null);
    };

    const cashNum = Number(cash) || 0;
    const transferNum = Number(transfer) || 0;
    const remaining = paying ? (cents(paying.total_amount) - cents(cashNum) - cents(transferNum)) / 100 : 0;

    const submit = async () => {
        if (!paying || !week) return;
        if (cents(cashNum) + cents(transferNum) !== cents(paying.total_amount)) {
            setFormError(`Efectivo + transferencia debe sumar ${money(paying.total_amount)}.`); return;
        }
        const payments: { method: string; amount: number; reference?: string }[] = [];
        if (cashNum > 0) payments.push({ method: 'cash', amount: cashNum });
        if (transferNum > 0) payments.push({ method: 'transfer', amount: transferNum, ...(reference.trim() ? { reference: reference.trim() } : {}) });
        setSaving(true); setFormError(null);
        try {
            const result = await api<{ settlement_id: string }>('/api/settlements', {
                method: 'POST',
                body: JSON.stringify({ employee_id: paying.employee_id, period_start: week.period_start, payments }),
            });
            router.push(`/liquidaciones/${result.settlement_id}`);
        } catch (e) { setFormError(e instanceof Error ? e.message : 'No se pudo registrar el pago.'); }
        finally { setSaving(false); }
    };

    const statusCell = (row: Row) => {
        if (row.reason === 'already_settled' && row.settlement_id) {
            return (
                <Link href={`/liquidaciones/${row.settlement_id}`} className="inline-flex items-center gap-1 text-green-700 font-bold hover:underline">
                    <CheckCircle className="h-4 w-4" /> Pagada · {row.receipt_number}
                </Link>
            );
        }
        if (row.reason === 'week_not_closed') return <span className="text-amber-600 font-medium">Cierra el sábado a las 8:00 pm</span>;
        if (row.reason === 'nothing_to_pay') return <span className="text-gray-400">Sin comisiones</span>;
        return (
            <button onClick={() => openPay(row)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 inline-flex items-center gap-1">
                <Wallet className="h-3.5 w-3.5" /> Pagar
            </button>
        );
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Wallet className="text-sonblade-gold h-6 w-6" /> {role === 'admin' ? 'Pago semanal' : 'Mis recibos de pago'}
                </h1>
                {role === 'admin' && <p className="text-gray-500 text-sm mt-1">Cada semana va de domingo a sábado y cierra el sábado a las 8:00 pm.</p>}
            </div>

            {role === 'admin' && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-5 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <button aria-label="Semana anterior" disabled={!periodStart} onClick={() => periodStart && loadWeek(addDays(periodStart, -7))}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                            <h2 className="font-bold text-gray-900 min-w-[16rem] text-center" data-testid="week-label">
                                {periodStart ? `Semana del ${weekLabel(periodStart)}` : 'Cargando…'}
                            </h2>
                            <button aria-label="Semana siguiente" disabled={!periodStart || (week?.is_latest_closed ?? false)} onClick={() => periodStart && loadWeek(addDays(periodStart, 7))}
                                className="p-2 rounded-lg border border-gray-200 hover:bg-white disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                        {week && !week.is_latest_closed && <button onClick={() => loadWeek(null)} className="text-sm font-semibold text-gray-600 hover:text-gray-900">Ir a la última semana cerrada</button>}
                    </div>
                    {loading ? (
                        <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-sonblade-gold" /></div>
                    ) : error ? (
                        <div className="p-6 text-red-600" role="alert">{error}</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-gray-500 border-b">
                                    <tr>
                                        <th className="p-4 text-xs uppercase">Persona</th>
                                        <th className="p-4 text-xs uppercase text-center">Servicios</th>
                                        <th className="p-4 text-xs uppercase text-right">Comisión</th>
                                        <th className="p-4 text-xs uppercase text-right">Ajustes</th>
                                        <th className="p-4 text-xs uppercase text-right">Propinas</th>
                                        <th className="p-4 text-xs uppercase text-right">A pagar</th>
                                        <th className="p-4 text-xs uppercase">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {week?.rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-gray-400">No hay barberos activos.</td></tr>}
                                    {week?.rows.map((r) => (
                                        <tr key={r.employee_id} className="hover:bg-gray-50">
                                            <td className="p-4 font-bold text-gray-900">{r.name}</td>
                                            <td className="p-4 text-center text-gray-500">{r.entry_count}</td>
                                            <td className="p-4 text-right">{money(r.gross_commission)}</td>
                                            <td className="p-4 text-right text-red-600">{r.deductions > 0 ? `− ${money(r.deductions)}` : '—'}</td>
                                            <td className="p-4 text-right text-green-700">{Number(r.tips) > 0 ? `+ ${money(Number(r.tips))}` : '—'}</td>
                                            <td className="p-4 text-right font-black text-gray-900">{money(r.total_amount)}</td>
                                            <td className="p-4">{statusCell(r)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 bg-gray-50 border-b border-gray-100"><h2 className="font-bold text-gray-900">{role === 'admin' ? 'Recibos emitidos' : 'Recibos'}</h2></div>
                <table className="w-full text-left text-sm">
                    <thead className="text-gray-500 border-b">
                        <tr>
                            <th className="p-4 text-xs uppercase">Folio</th>
                            {role === 'admin' && <th className="p-4 text-xs uppercase">Persona</th>}
                            <th className="p-4 text-xs uppercase">Semana</th>
                            <th className="p-4 text-xs uppercase text-right">Total</th>
                            <th className="p-4 text-xs uppercase text-right">Pagado</th>
                            <th className="p-4 text-xs uppercase text-center">Recibo</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {history.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-gray-400">Todavía no hay recibos.</td></tr>}
                        {history.map((h) => (
                            <tr key={h.id} className="hover:bg-gray-50">
                                <td className="p-4 font-mono font-bold">{h.receipt_number}</td>
                                {role === 'admin' && <td className="p-4">{h.employee_name}</td>}
                                <td className="p-4 text-gray-500">{weekLabel(h.period_start)}</td>
                                <td className="p-4 text-right font-bold">{money(h.total_amount)}</td>
                                <td className="p-4 text-right text-gray-500">{h.paid_at ? new Date(h.paid_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                                <td className="p-4 text-center">
                                    <Link href={`/liquidaciones/${h.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700 hover:text-black">
                                        <Receipt className="h-4 w-4" /> Ver
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {paying && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Pagar a ${paying.name}`}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                        <div className="p-5 border-b flex items-center justify-between">
                            <h3 className="font-bold text-lg">Pagar a {paying.name}</h3>
                            <button aria-label="Cerrar" onClick={() => setPaying(null)} className="p-1 text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex justify-between items-end">
                                <span className="text-sm text-gray-500">Total a pagar</span>
                                <span className="text-3xl font-black">{money(paying.total_amount)}</span>
                            </div>
                            <div className="flex gap-2 text-xs">
                                <button type="button" onClick={() => { setCash(String(paying.total_amount)); setTransfer(''); }} className="px-2 py-1 border rounded-md hover:bg-gray-50">Todo en efectivo</button>
                                <button type="button" onClick={() => { setCash(''); setTransfer(String(paying.total_amount)); }} className="px-2 py-1 border rounded-md hover:bg-gray-50">Todo por transferencia</button>
                            </div>
                            <label className="block text-sm font-medium text-gray-700">Efectivo
                                <input type="number" min="0" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} aria-label="Monto en efectivo"
                                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2" />
                            </label>
                            <label className="block text-sm font-medium text-gray-700">Transferencia
                                <input type="number" min="0" step="0.01" value={transfer} onChange={(e) => setTransfer(e.target.value)} aria-label="Monto por transferencia"
                                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2" />
                            </label>
                            {transferNum > 0 && (
                                <label className="block text-sm font-medium text-gray-700">Referencia de la transferencia (opcional)
                                    <input type="text" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Referencia de la transferencia"
                                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2" />
                                </label>
                            )}
                            <p className={`text-sm font-medium ${cents(remaining) === 0 ? 'text-green-700' : 'text-amber-600'}`}>
                                {cents(remaining) === 0 ? 'Los montos coinciden con el total.' : `Falta repartir ${money(remaining)}.`}
                            </p>
                            {cashNum > 0 && <p className="text-xs text-gray-500">El efectivo sale de la caja abierta de hoy; si no hay caja abierta, el sistema no lo permitirá.</p>}
                            {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
                        </div>
                        <div className="p-5 border-t flex justify-end gap-2">
                            <button onClick={() => setPaying(null)} className="px-4 py-2 rounded-lg border text-sm font-semibold">Cancelar</button>
                            <button onClick={submit} disabled={saving || cents(remaining) !== 0}
                                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Registrar pago y generar recibo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
