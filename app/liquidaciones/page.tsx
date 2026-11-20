'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Loader2, Receipt, Wallet } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import PayBreakdown from '@/components/payroll/PayBreakdown';
import TeamLedger from '@/components/payroll/TeamLedger';
import WeekWages from '@/components/payroll/WeekWages';
import { buildBreakdown, type PayInput } from '@/lib/payroll/breakdown';
import { addDays, weekLabel } from '@/lib/settlements/week';
import { formatMoney } from '@/lib/utils/money';
import { formatDateTime } from '@/lib/utils/dates';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { canSeePayReceipts } from '@/lib/auth/roles';
import { HttpError, isOfflineError, toUserMessage } from '@/lib/utils/errors';

// Los campos de PayInput (bonos, adelantos, préstamos, descuentos, arrastre) son opcionales: la pantalla funciona igual si no llegan.
type Row = PayInput & {
    employee_id: string; name: string; gross_commission: number; deductions: number; tips: number; total_amount: number;
    entry_count: number; can_settle: boolean; reason: string | null; settlement_id: string | null; receipt_number: string | null;
};
type Week = {
    period_start: string; period_end: string; timezone: string; is_latest_closed: boolean; rows: Row[];
};
type HistoryRow = {
    id: string; receipt_number: string; employee_name: string; period_start: string; period_end: string; total_amount: number; paid_at: string | null;
};

const money = (n: number) => formatMoney(n, { cents: true });
const cents = (n: number) => Math.round(n * 100);
/** Lo que ya se restó del pago por adelantos, abonos de préstamo, descuentos y lo que viene de la semana anterior. */
const discounted = (r: PayInput) => Math.round((Number(r.advances ?? 0) + Number(r.loan_payments ?? 0) + Number(r.staff_deductions ?? 0) + Number(r.carryover_in ?? 0)) * 100) / 100;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new HttpError(res.status, body?.error);
    return body as T;
}

export default function LiquidacionesPage() {
    const router = useRouter();
    const [role, setRole] = useState<'admin' | 'recepcion' | 'barber' | null>(null);
    // Cuenta de consulta: ve la semana y los recibos, pero no registra pagos.
    const [readOnly, setReadOnly] = useState(true);
    const [periodStart, setPeriodStart] = useState<string | null>(null);
    const [week, setWeek] = useState<Week | null>(null);
    // Domingo de la última semana cerrada: se aprende al abrir la pantalla. La semana en curso (la siguiente) también se puede ver.
    const [latestClosed, setLatestClosed] = useState<string | null>(null);
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [historyError, setHistoryError] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<unknown>(null);
    const [paying, setPaying] = useState<Row | null>(null);
    const [cash, setCash] = useState('');
    const [transfer, setTransfer] = useState('');
    const [reference, setReference] = useState('');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const loadHistory = useCallback(async () => {
        setHistoryError(null);
        try { setHistory(await api<HistoryRow[]>('/api/settlements/history')); } catch (e) { console.error(e); setHistoryError(e); }
    }, []);

    const loadWeek = useCallback(async (start: string | null, quiet = false) => {
        if (!quiet) setLoading(true);
        setError(null);
        try {
            const data = await api<Week>(`/api/settlements${start ? `?period_start=${start}` : ''}`);
            setWeek(data); setPeriodStart(data.period_start);
            if (data.is_latest_closed) setLatestClosed(data.period_start);
        } catch (e) { console.error(e); setError(e); }
        finally { setLoading(false); }
    }, []);

    const init = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const me = await api<{ user: { role: 'admin' | 'recepcion' | 'barber'; readOnly?: boolean } }>('/api/auth/me');
            setRole(me.user.role);
            setReadOnly(Boolean(me.user.readOnly));
            // Los recibos de pago solo los ven dueño, gerencia y consulta (decisión temporal del dueño, 20 nov 2026).
            if (!canSeePayReceipts(me.user.role)) { setLoading(false); return; }
            if (me.user.role === 'admin') await loadWeek(null); else setLoading(false);
        } catch (e) { setLoading(false); setError(e); return; }
        loadHistory();
    }, [loadHistory, loadWeek]);

    useEffect(() => { void init(); }, [init]);

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
        } catch (e) { setFormError(toUserMessage(e, 'No se pudo registrar el pago.')); }
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
        if (row.reason === 'nothing_to_pay') return <span className="text-bos-muted">Sin sueldo ni comisiones</span>;
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

    // Sin sesión cargada: cargando o error con Reintentar (nunca una pantalla con tablas vacías que parecen "sin recibos").
    if (role === null) {
        return (
            <div className="max-w-6xl mx-auto space-y-6">
                <h1 className="font-display text-3xl font-semibold tracking-tight">Pago semanal</h1>
                {error
                    ? <ErrorState title="No se pudo cargar la pantalla" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={() => void init()} />
                    : <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-bos-muted" /></div>}
            </div>
        );
    }
    if (!canSeePayReceipts(role)) {
        return (
            <div className="max-w-2xl mx-auto space-y-6">
                <h1 className="font-display text-3xl font-semibold tracking-tight">Pago semanal</h1>
                <div className={card}><EmptyState title="Los recibos de pago los ve la administración"
                    description="Por ahora los recibos de pago semanales solo los consultan la cuenta principal y la gerencia. Tu sueldo, comisiones y propinas siguen en Mi semana." /></div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Pago semanal</h1>
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
                            <button aria-label="Semana siguiente" disabled={!periodStart || !latestClosed || periodStart >= addDays(latestClosed, 7)} onClick={() => periodStart && loadWeek(addDays(periodStart, 7))}
                                className="h-11 w-11 inline-flex items-center justify-center rounded-xl border border-bos-border text-bos-text hover:bg-bos-raised disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {latestClosed && periodStart !== addDays(latestClosed, 7) && <button onClick={() => loadWeek(addDays(latestClosed, 7))} className={chip}>Ver la semana en curso</button>}
                            {week && !week.is_latest_closed && <button onClick={() => loadWeek(null)} className={chip}>Ir a la última semana cerrada</button>}
                        </div>
                    </div>
                    {loading ? (
                        <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-bos-muted" /></div>
                    ) : error ? (
                        <div className="p-4"><ErrorState title="No se pudieron cargar las liquidaciones" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={() => loadWeek(periodStart)} /></div>
                    ) : (
                        <>
                        <p data-testid="entry-count-note" className="px-4 pt-3 text-xs text-bos-muted">«Con comisión» cuenta los servicios y los productos que generaron comisión: cada uno vale 1.</p>
                        <div className="overflow-x-auto">
                            <table className="bos-stack w-full text-left text-sm">
                                <thead className="text-bos-muted">
                                    <tr>
                                        <th className={th}>Persona</th>
                                        <th className={`${th} text-center`} title="Servicios y productos que generaron comisión: cada uno cuenta 1, aunque sea un producto">Con comisión</th>
                                        <th className={`${th} text-right`}>Sueldo</th>
                                        <th className={`${th} text-right`}>Comisión</th>
                                        <th className={`${th} text-right`}>Ajustes</th>
                                        <th className={`${th} text-right`}>Propinas</th>
                                        <th className={`${th} text-right`}>A pagar</th>
                                        <th className={th}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {week?.rows.length === 0 && <tr className="border-t border-bos-border"><td colSpan={8} data-label="" className="p-6 text-center text-bos-muted">No hay barberos activos.</td></tr>}
                                    {week?.rows.map((r) => {
                                        const b = buildBreakdown(r);
                                        const panelId = `breakdown-${r.employee_id}`;
                                        return (
                                        <React.Fragment key={r.employee_id}>
                                        <tr className="border-t border-bos-border hover:bg-bos-raised">
                                            <td data-label="" className="px-4 py-3 font-semibold">
                                                {r.name}
                                                <button type="button" aria-expanded={Boolean(expanded[r.employee_id])} aria-controls={panelId} aria-label={`Ver desglose de ${r.name}`}
                                                    onClick={() => setExpanded((p) => ({ ...p, [r.employee_id]: !p[r.employee_id] }))}
                                                    className="mt-1 flex min-h-11 items-center gap-1.5 text-sm font-medium text-bos-muted hover:text-bos-text">
                                                    <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${expanded[r.employee_id] ? 'rotate-180' : ''}`} /> Ver desglose
                                                </button>
                                            </td>
                                            <td data-label="Con comisión" className="px-4 py-3 text-center text-bos-muted tabular-nums">{r.entry_count}</td>
                                            <td data-label="Sueldo" data-testid="row-wage" className={`px-4 py-3 text-right tabular-nums ${Number(r.wages) > 0 ? '' : 'text-bos-muted'}`}>{Number(r.wages) > 0 ? `+ ${money(Number(r.wages))}` : '—'}</td>
                                            <td data-label="Comisión" className="px-4 py-3 text-right tabular-nums">{money(r.gross_commission)}</td>
                                            <td data-label="Ajustes" className={`px-4 py-3 text-right tabular-nums ${r.deductions > 0 ? 'text-bos-danger' : 'text-bos-muted'}`}>{r.deductions > 0 ? `− ${money(r.deductions)}` : '—'}</td>
                                            <td data-label="Propinas" className={`px-4 py-3 text-right tabular-nums ${Number(r.tips) > 0 ? 'text-bos-success' : 'text-bos-muted'}`}>{Number(r.tips) > 0 ? `+ ${money(Number(r.tips))}` : '—'}</td>
                                            <td data-label="A pagar" className="px-4 py-3 text-right font-display font-semibold tabular-nums max-md:order-first max-md:text-lg">
                                                {money(r.total_amount)}
                                                {discounted(r) > 0 && <span data-testid="row-discounted" className="block text-xs font-medium text-bos-muted">Ya descontado: − {money(discounted(r))}</span>}
                                                {b.pending > 0 && <span className="block text-xs font-medium text-bos-accent-text">Pendiente: {money(b.pending)}</span>}
                                            </td>
                                            <td data-label="" className="px-4 py-2 md:whitespace-nowrap">{statusCell(r)}</td>
                                        </tr>
                                        {expanded[r.employee_id] && (
                                            <tr className="border-t border-bos-border bg-bos-bg">
                                                <td id={panelId} colSpan={8} data-label="" className="px-4 py-3">
                                                    {r.entry_count === 0 && Number(r.total_amount) === 0 && Number(r.wages ?? 0) === 0 && (
                                                        <p data-testid="breakdown-empty" className="mb-2 text-sm text-bos-muted">Sin movimientos en esta semana: no hay servicios, propinas, sueldo ni descuentos.</p>
                                                    )}
                                                    <PayBreakdown data={r} className="max-w-xl" />
                                                </td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </section>
            )}

            {role === 'admin' && periodStart && !loading && !error && (
                <WeekWages periodStart={periodStart} readOnly={readOnly} onChanged={() => loadWeek(periodStart, true)} />
            )}

            <section className={card}>
                <div className="p-4 border-b border-bos-border"><h2 className="font-display font-semibold">{role === 'admin' ? 'Recibos emitidos' : 'Recibos'}</h2></div>
                {historyError ? (
                    <div className="p-4"><ErrorState title="No se pudieron cargar los recibos" message={toUserMessage(historyError)} offline={isOfflineError(historyError)} onRetry={loadHistory} /></div>
                ) : (
                <div className="overflow-x-auto">
                    <table className="bos-stack w-full text-left text-sm">
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
                            {history.length === 0 && <tr className="border-t border-bos-border"><td colSpan={6} data-label="" className="p-6 text-center text-bos-muted">Todavía no hay recibos.</td></tr>}
                            {history.map((h) => (
                                <tr key={h.id} className="border-t border-bos-border hover:bg-bos-raised">
                                    <td data-label="" className="px-4 py-3 font-semibold tabular-nums whitespace-nowrap">{h.receipt_number}</td>
                                    {role === 'admin' && <td data-label="Persona" className="px-4 py-3">{h.employee_name}</td>}
                                    <td data-label="Semana" className="px-4 py-3 text-bos-muted md:whitespace-nowrap">{weekLabel(h.period_start)}</td>
                                    <td data-label="Total" className="px-4 py-3 text-right font-semibold tabular-nums max-md:order-first max-md:text-lg">{money(h.total_amount)}</td>
                                    <td data-label="Pagado" className="px-4 py-3 text-right text-bos-muted md:whitespace-nowrap">{h.paid_at ? formatDateTime(h.paid_at) : '—'}</td>
                                    <td data-label="" className="px-4 py-2 text-center">
                                        <Link href={`/liquidaciones/${h.id}`} className="inline-flex items-center gap-1.5 min-h-11 px-2 text-sm font-semibold text-bos-text hover:underline">
                                            <Receipt className="h-4 w-4" /> Ver
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                )}
            </section>

            {role === 'admin' && (
                <TeamLedger people={(week?.rows ?? []).map((r) => ({ id: r.employee_id, name: r.name }))} readOnly={readOnly} onChanged={() => loadWeek(periodStart)} />
            )}

            {paying && (
                <Modal title={`Pagar a ${paying.name}`} onClose={() => setPaying(null)}>
                    <div className="space-y-4">
                        <PayBreakdown data={paying} expandable={false} />
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
