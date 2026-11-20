'use client';

import React, { useState } from 'react';
import { Eye, Receipt } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import DateRangePicker from '@/components/ui/DateRangePicker';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Field, { FIELD_CLASS } from '@/components/ui/Field';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/utils/money';
import { formatDate } from '@/lib/utils/dates';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { endOfMonthKey, startOfMonthKey, startOfWeekKey, addDaysKey, todayInBusiness } from '@/lib/ui/date-picker';
import { getJson } from '@/lib/money/client';
import { paidFromLabel, type Expense, type ExpenseCategory, type ExpenseFilters, type ExpenseTotals, type PaidFrom } from './data';

const money = (n: number) => formatMoney(n, { cents: true });
const th = 'px-4 py-3 text-[13px] font-medium';

type Period = 'week' | 'month' | 'range';

/** Periodo inicial: este mes. */
export function monthFilters(): ExpenseFilters {
    const today = todayInBusiness();
    return { from: startOfMonthKey(today), to: endOfMonthKey(today), categoryId: '', paidFrom: '', status: 'all' };
}

function periodRange(period: 'week' | 'month'): { from: string; to: string } {
    const today = todayInBusiness();
    if (period === 'week') { const start = startOfWeekKey(today); return { from: start, to: addDaysKey(start, 6) }; }
    return { from: startOfMonthKey(today), to: endOfMonthKey(today) };
}

const PAID_FROM_ORDER: PaidFrom[] = ['envelope', 'bank', 'cash_drawer'];
const PAID_FROM_NAMES: Record<PaidFrom, string> = { envelope: 'Sobre', bank: 'Banco', cash_drawer: 'Caja del día' };

export function Filters({ filters, onChange, categories }: { filters: ExpenseFilters; onChange: (f: ExpenseFilters) => void; categories: ExpenseCategory[] }) {
    const [period, setPeriod] = useState<Period>('month');
    const chip = (p: Period, label: string) => (
        <button key={p} type="button" aria-pressed={period === p}
            onClick={() => {
                setPeriod(p);
                if (p !== 'range') onChange({ ...filters, ...periodRange(p) });
            }}
            className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${period === p ? 'border-bos-accent bg-bos-accent-soft text-bos-text' : 'border-bos-control text-bos-muted hover:bg-bos-raised'}`}>
            {label}
        </button>
    );
    return (
        <Card as="section" aria-label="Filtros" className="space-y-4 !p-4">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periodo">
                {chip('week', 'Esta semana')}
                {chip('month', 'Este mes')}
                {chip('range', 'Rango')}
                {period === 'range' && (
                    <DateRangePicker aria-label="Rango de fechas" shortcuts={false} value={{ from: filters.from, to: filters.to }}
                        onChange={(r) => onChange({ ...filters, from: r.from, to: r.to })} className={`${FIELD_CLASS} text-left sm:min-w-64`} />
                )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field id="f-category" label="Categoría">
                    {(c) => (
                        <select {...c} value={filters.categoryId} onChange={(e) => onChange({ ...filters, categoryId: e.target.value })}>
                            <option value="">Todas</option>
                            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}{cat.is_active ? '' : ' (desactivada)'}</option>)}
                        </select>
                    )}
                </Field>
                <Field id="f-paid" label="Pagado desde">
                    {(c) => (
                        <select {...c} value={filters.paidFrom} onChange={(e) => onChange({ ...filters, paidFrom: e.target.value as ExpenseFilters['paidFrom'] })}>
                            <option value="">Todos</option>
                            {PAID_FROM_ORDER.map((p) => <option key={p} value={p}>{PAID_FROM_NAMES[p]}</option>)}
                        </select>
                    )}
                </Field>
                <Field id="f-status" label="Estado">
                    {(c) => (
                        <select {...c} value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value as ExpenseFilters['status'] })}>
                            <option value="all">Todos</option>
                            <option value="posted">Vigentes</option>
                            <option value="cancelled">Cancelados</option>
                        </select>
                    )}
                </Field>
            </div>
        </Card>
    );
}

export function Totals({ totals }: { totals: ExpenseTotals }) {
    return (
        <Card as="section" aria-label="Totales del periodo" data-testid="expense-totals">
            <p className="text-[13px] font-medium text-bos-muted">Total del periodo</p>
            <p data-testid="total-posted" className="font-display text-4xl font-semibold tabular-nums">{money(totals.posted)}</p>
            <dl className="mt-4 space-y-2 border-t border-bos-border pt-4 text-sm">
                {PAID_FROM_ORDER.map((p) => (
                    <div key={p} className="flex justify-between gap-3">
                        <dt className="text-bos-muted">{PAID_FROM_NAMES[p]}</dt>
                        <dd data-testid={`total-${p}`} className="font-semibold tabular-nums">{money(totals.by_paid_from?.[p] ?? 0)}</dd>
                    </div>
                ))}
            </dl>
            {totals.cancelled > 0 && <p className="mt-3 text-xs text-bos-muted">Cancelados (no cuentan): {money(totals.cancelled)}</p>}
        </Card>
    );
}

/** Abre el comprobante (enlace firmado de 60 s) en una pestaña nueva. */
function ReceiptButton({ expenseId }: { expenseId: string }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const open = async () => {
        // La pestaña se abre en el clic (los navegadores bloquean ventanas abiertas después de esperar).
        const tab = window.open('about:blank', '_blank');
        if (tab) tab.opener = null;
        setBusy(true);
        try {
            const { url } = await getJson<{ url: string }>(`/api/expenses/${expenseId}/receipt`);
            if (tab) tab.location.href = url; else window.open(url, '_blank', 'noopener');
        } catch (e) {
            tab?.close();
            toast.error(toUserMessage(e, 'No se pudo abrir el comprobante.'));
        } finally {
            setBusy(false);
        }
    };
    return (
        <Button variant="secondary" size="sm" onClick={open} loading={busy} aria-label="Ver comprobante">
            <Eye aria-hidden="true" className="h-4 w-4" /> Ver
        </Button>
    );
}

interface ListProps {
    expenses: Expense[] | undefined;
    loading: boolean;
    error: unknown;
    canEdit: boolean;
    filtered: boolean;
    onRetry: () => void;
    onCancel: (e: Expense) => void;
}

export function ExpenseTable({ expenses, loading, error, canEdit, filtered, onRetry, onCancel }: ListProps) {
    if (loading) {
        return (
            <div role="status" aria-busy="true" className="space-y-3">
                <span className="sr-only">Cargando gastos…</span>
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
        );
    }
    if (error) return <ErrorState title="No se pudieron cargar los gastos" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={onRetry} />;
    if (!expenses || expenses.length === 0) {
        return <Card padded={false}><EmptyState icon={<Receipt className="h-8 w-8" />} title="No hay gastos en este periodo"
            description={filtered ? 'Prueba con otro periodo o quita algún filtro.' : 'Cuando registres un gasto aparecerá aquí.'} /></Card>;
    }
    return (
        <Card padded={false} className="overflow-hidden">
            <div className="overflow-x-auto">
                <table className="bos-stack w-full text-left text-sm" data-testid="expense-table">
                    <thead className="text-bos-muted">
                        <tr>
                            <th className={th}>Fecha</th>
                            <th className={th}>Concepto</th>
                            <th className={th}>Categoría</th>
                            <th className={th}>Proveedor</th>
                            <th className={th}>Pagado desde</th>
                            <th className={`${th} text-right`}>Monto</th>
                            <th className={th}>Registró</th>
                            <th className={th}>Comprobante</th>
                            <th className={th}>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expenses.map((x) => {
                            const cancelled = x.status === 'cancelled';
                            return (
                                <tr key={x.id} data-testid="expense-row" className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                    <td data-label="" className="px-4 py-3 text-bos-muted whitespace-nowrap max-md:order-last max-md:text-xs">{formatDate(x.incurred_at)}</td>
                                    <td data-label="" className="px-4 py-3 max-md:order-first">
                                        <span className={`font-semibold ${cancelled ? 'line-through text-bos-muted' : ''}`}>{x.description}</span>
                                    </td>
                                    <td data-label="Categoría" className="px-4 py-3">{x.category}</td>
                                    <td data-label="Proveedor" className="px-4 py-3 text-bos-muted">{x.vendor || '—'}</td>
                                    <td data-label="Pagado desde" className="px-4 py-3">
                                        <span className="whitespace-nowrap rounded-full border border-bos-border px-2.5 py-0.5 text-xs font-medium text-bos-muted">{paidFromLabel(x.paid_from, x.method)}</span>
                                    </td>
                                    <td data-label="Monto" className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap max-md:order-first max-md:text-lg ${cancelled ? 'line-through text-bos-muted' : 'text-bos-danger'}`}>
                                        -{money(x.amount)}
                                    </td>
                                    <td data-label="Registró" className="px-4 py-3 text-bos-muted">{x.created_by_name ?? '—'}</td>
                                    <td data-label="Comprobante" className="px-4 py-3">
                                        {x.has_receipt ? <ReceiptButton expenseId={x.id} /> : <span className="text-bos-muted">—</span>}
                                    </td>
                                    <td data-label="Estado" className="px-4 py-3">
                                        {cancelled ? (
                                            <div>
                                                <span className="font-semibold text-bos-danger">Cancelado</span>
                                                {x.cancel_reason && <span className="block text-xs text-bos-muted">Motivo: {x.cancel_reason}</span>}
                                            </div>
                                        ) : canEdit ? (
                                            <Button variant="ghost" size="sm" onClick={() => onCancel(x)} aria-label={`Cancelar gasto ${x.description}`}>Cancelar</Button>
                                        ) : <span className="text-bos-muted">Vigente</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
