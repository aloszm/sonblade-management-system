'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronLeft, ChevronRight, Loader2, Receipt, Wallet } from 'lucide-react';
import Modal from '@/components/ui/Modal';
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
    // Cuenta de consulta: ve la semana y los recibos, pero no registra pagos.
    const [readOnly, setReadOnly] = useState(true);
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
                const me = await api<{ user: { role: 'admin' | 'recepcion' | 'barber'; readOnly?: boolean } }>('/api/auth/me');
                setRole(me.user.role);
                setReadOnly(Boolean(me.user.readOnly));
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
                <Link href={`/liquidaciones/${row.settlement_id}`} className="inline-flex items-center gap-1.5 min-h-11 text-bos-success font-semibold hover:underline">
                    <CheckCircle className="h-4 w-4" /> Pagada · {row.receipt_number}
                </Link>
            );
        }
        if (row.reason === 'week_not_closed') return <span className="text-bos-accent-text font-medium">Cierra el sábado a las 8:00 pm</span>;
        if (row.reason === 'nothing_to_pay') return <span className="text-bos-muted">Sin comisiones</span>;
        if (readOnly) return <span className="text-bos-muted font-medium">Pendiente de pago</span>;
        return (
            <button onClick={() => openPay(row)} className="min-h-11 px-4 rounded-xl bg-bos-accent text-bos-on-accent text-sm font-bold hover:bg-bos-accent-strong inline-flex items-center gap-1.5">
                <Wallet className="h-4 w-4" /> Pagar
            </button>
        );
    };

    const card = 'rounded-xl border border-bos-border bg-bos-surface overflow-hidden';
    const th = 'px-4 py-3 text-[13px] font-medium';
    const input = 'mt-1.5 w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
    const chip = 'min-h-11 px-4 rounded-full border border-bos-border text-sm font-semibold text-bos-muted hover:text-bos-text hover:bg-bos-raised';

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">{role === 'admin' ? 'Pago semanal' : 'Mis recibos de pago'}</h1>
                {role === 'admin' && <p className="text-bos-muted text-sm mt-1">Cada semana va de domingo a sábado y cierra el sábado a las 8:00 pm.</p>}
            </header>

            {role === 'admin' && (
                <section className={card}>
                    <div className="p-4 border-b border-bos-border flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <button aria-label="Semana anterior" disabled={!periodStart} onClick={() => periodStart && loadWeek(addDays(periodStart, -7))}
                                className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-bos-border text-bos-text hover:bg-bos-raised disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                            <h2 className="font-display font-semibold text-center sm:min-w-[16rem] px-1" data-testid="week-label">
                                {periodStart ? `Semana del ${weekLabel(periodStart)}` : 'Cargando…'}
                            </h2>
                            <button aria-label="Semana siguiente" disabled={!periodStart || (week?.is_latest_closed ?? false)} onClick={() => periodStart && loadWeek(addDays(periodStart, 7))}
                                className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-bos-border text-bos-text hover:bg-bos-raised disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                        {week && !week.is_latest_closed && <button onClick={() => loadWeek(null)} className={chip}>Ir a la última semana cerrada</button>}
                    </div>
                    {loading ? (
                        <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-bos-muted" /></div>
                    ) : error ? (
                        <div className="p-6 text-bos-danger" role="alert">{error}</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="text-bos-muted">
                                    <tr>
                                        <th className={th}>Persona</th>
                                        <th className={`${th} text-center`}>Servicios</th>
                                        <th className={`${th} text-right`}>Comisión</th>
                                        <th className={`${th} text-right`}>Ajustes</th>
                                        <th className={`${th} text-right`}>Propinas</th>
                                        <th className={`${th} text-right`}>A pagar</th>
                                        <th className={th}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {week?.rows.length === 0 && <tr className="border-t border-bos-border"><td colSpan={7} className="p-6 text-center text-bos-muted">No hay barberos activos.</td></tr>}
                                    {week?.rows.map((r) => (
                                        <tr key={r.employee_id} className="border-t border-bos-border hover:bg-bos-raised">
                                            <td className="px-4 py-3 font-semibold">{r.name}</td>
                                            <td className="px-4 py-3 text-center text-bos-muted tabular-nums">{r.entry_count}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">{money(r.gross_commission)}</td>
                                            <td className={`px-4 py-3 text-right tabular-nums ${r.deductions > 0 ? 'text-bos-danger' : 'text-bos-muted'}`}>{r.deductions > 0 ? `− ${money(r.deductions)}` : '—'}</td>
                                            <td className={`px-4 py-3 text-right tabular-nums ${Number(r.tips) > 0 ? 'text-bos-success' : 'text-bos-muted'}`}>{Number(r.tips) > 0 ? `+ ${money(Number(r.tips))}` : '—'}</td>
                                            <td className="px-4 py-3 text-right font-display font-semibold tabular-nums">{money(r.total_amount)}</td>
                                            <td className="px-4 py-2 whitespace-nowrap">{statusCell(r)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            <section className={card}>
                <div className="p-4 border-b border-bos-border"><h2 className="font-display font-semibold">{role === 'admin' ? 'Recibos emitidos' : 'Recibos'}</h2></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-bos-muted">
                            <tr>
                                <th className={th}>Folio</th>
                                {role === 'admin' && <th className={th}>Persona</th>}
                                <th className={th}>Semana</th>
                                <th className={`${th} text-right`}>Total</th>
                                <th className={`${th} text-right`}>Pagado</th>
                                <th className={`${th} text-center`}>Recibo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 && <tr className="border-t border-bos-border"><td colSpan={6} className="p-6 text-center text-bos-muted">Todavía no hay recibos.</td></tr>}
                            {history.map((h) => (
                                <tr key={h.id} className="border-t border-bos-border hover:bg-bos-raised">
                                    <td className="px-4 py-3 font-semibold tabular-nums whitespace-nowrap">{h.receipt_number}</td>
                                    {role === 'admin' && <td className="px-4 py-3">{h.employee_name}</td>}
                                    <td className="px-4 py-3 text-bos-muted whitespace-nowrap">{weekLabel(h.period_start)}</td>
                                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(h.total_amount)}</td>
                                    <td className="px-4 py-3 text-right text-bos-muted whitespace-nowrap">{h.paid_at ? new Date(h.paid_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                                    <td className="px-4 py-2 text-center">
                                        <Link href={`/liquidaciones/${h.id}`} className="inline-flex items-center gap-1.5 min-h-11 px-2 text-sm font-semibold text-bos-text hover:underline">
                                            <Receipt className="h-4 w-4" /> Ver
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {paying && (
                <Modal title={`Pagar a ${paying.name}`} onClose={() => setPaying(null)}>
                    <div className="space-y-4">
                        <div className="flex justify-between items-end">
                            <span className="text-sm text-bos-muted">Total a pagar</span>
                            <span className="font-display text-3xl font-semibold tabular-nums text-bos-accent-text">{money(paying.total_amount)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => { setCash(String(paying.total_amount)); setTransfer(''); }} className={chip}>Todo en efectivo</button>
                            <button type="button" onClick={() => { setCash(''); setTransfer(String(paying.total_amount)); }} className={chip}>Todo por transferencia</button>
                        </div>
                        <label className="block text-[13px] font-medium text-bos-muted">Efectivo
                            <input type="number" inputMode="decimal" min="0" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} aria-label="Monto en efectivo" className={input} />
                        </label>
                        <label className="block text-[13px] font-medium text-bos-muted">Transferencia
                            <input type="number" inputMode="decimal" min="0" step="0.01" value={transfer} onChange={(e) => setTransfer(e.target.value)} aria-label="Monto por transferencia" className={input} />
                        </label>
                        {transferNum > 0 && (
                            <label className="block text-[13px] font-medium text-bos-muted">Referencia de la transferencia (opcional)
                                <input type="text" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Referencia de la transferencia" className={input} />
                            </label>
                        )}
                        <p className={`text-sm font-medium ${cents(remaining) === 0 ? 'text-bos-success' : 'text-bos-accent-text'}`}>
                            {cents(remaining) === 0 ? 'Los montos coinciden con el total.' : `Falta repartir ${money(remaining)}.`}
                        </p>
                        {cashNum > 0 && <p className="text-xs text-bos-muted">El efectivo sale de la caja abierta de hoy; si no hay caja abierta, el sistema no lo permitirá.</p>}
                        {formError && <p className="text-sm text-bos-danger" role="alert">{formError}</p>}
                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                            <button onClick={() => setPaying(null)} className="min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text font-semibold hover:bg-bos-raised">Cancelar</button>
                            <button onClick={submit} disabled={saving || cents(remaining) !== 0}
                                className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Registrar pago y generar recibo
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
