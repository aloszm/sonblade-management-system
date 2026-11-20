'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { weekLabel } from '@/lib/settlements/week';
import PayBreakdown from '@/components/payroll/PayBreakdown';
import type { PayInput } from '@/lib/payroll/breakdown';
import BrandLogo from '@/components/BrandLogo';
import PracticePrintMark from '@/components/PracticePrintMark';
import ErrorState from '@/components/ui/ErrorState';
import { HttpError, isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils/payment';

// Los campos de PayInput (bonos, adelantos, préstamos, descuentos, arrastre, carryover_next) son opcionales.
type Receipt = PayInput & {
    receipt_number: string;
    status: string;
    business: { name: string; currency: string; timezone: string };
    branch: { name: string; address: string | null; phone: string | null };
    employee: { id: string; display_name: string };
    period_start: string; period_end: string; window_start: string; window_end: string;
    paid_at: string | null; paid_by_name: string | null;
    total_amount: number; gross_commission: number; deductions: number;
    tips_total?: number;
    tip_lines?: { sale_id: string; received_at: string; method: 'cash' | 'card' | 'transfer' | 'other'; amount: number }[];
    payments: { method: 'cash' | 'card' | 'transfer' | 'other'; amount: number; reference: string | null }[];
    commission_lines: { sale_id: string; sold_at: string; item: string; item_type: 'service' | 'product'; basis_amount: number; percentage: number | null; fixed_amount: number | null; commission_amount: number }[];
    adjustment_lines: { reason: string; amount: number }[];
};

const METHOD_LABELS = PAYMENT_METHOD_LABELS;

export default function ReciboPage() {
    const { id } = useParams<{ id: string }>();
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [error, setError] = useState<unknown>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(`/api/settlements/${id}/receipt`, { cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new HttpError(res.status, body?.error);
            setReceipt(body as Receipt);
        } catch (e) { console.error(e); setError(e); }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    if (error) return <div className="max-w-2xl mx-auto"><ErrorState title="No se pudo cargar el recibo" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={load} /></div>;
    if (!receipt) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>;

    const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: receipt.business.currency }).format(n);
    const tz = receipt.business.timezone;
    const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es-MX', { timeZone: tz, dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso)) : '—');
    const day = (iso: string) => new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    const rate = (l: Receipt['commission_lines'][number]) => (l.percentage !== null ? `${Number(l.percentage)}%` : l.fixed_amount !== null ? `${money(Number(l.fixed_amount))} fijo` : '—');

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4 print:hidden">
                <Link href="/liquidaciones" className="inline-flex items-center gap-2 text-sm font-semibold text-bos-muted hover:text-bos-text min-h-11"><ArrowLeft className="h-4 w-4" /> Volver</Link>
                <button onClick={() => window.print()} className="min-h-11 px-4 rounded-xl border border-bos-border text-bos-text text-sm font-semibold inline-flex items-center gap-2 hover:bg-bos-raised">
                    <Printer className="h-4 w-4" /> Imprimir o guardar como PDF
                </button>
            </div>

            <article className="bg-bos-surface text-bos-text rounded-xl border border-bos-border p-5 sm:p-8 print:bg-white print:text-black print:border-0 print:p-0 print:rounded-none" data-testid="receipt">
                <PracticePrintMark />
                <header className="flex flex-wrap justify-between items-start gap-3 border-b-2 border-bos-text pb-4">
                    <div>
                        <BrandLogo alt="" className="h-16 w-auto mb-2 print:h-14" />
                        <h1 className="font-display text-2xl font-semibold tracking-tight">{receipt.business.name}</h1>
                        <p className="text-sm text-bos-muted">{receipt.branch.name}</p>
                        {receipt.branch.address && <p className="text-sm text-bos-muted">{receipt.branch.address}</p>}
                        {receipt.branch.phone && <p className="text-sm text-bos-muted">Tel. {receipt.branch.phone}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-[13px] font-medium text-bos-muted">Recibo de pago de comisiones</p>
                        <p className="font-display text-2xl font-semibold tabular-nums" data-testid="receipt-number">{receipt.receipt_number}</p>
                        <p className="text-xs text-bos-muted mt-1">Pagado: {when(receipt.paid_at)}</p>
                    </div>
                </header>

                <section className="grid grid-cols-2 gap-4 py-4 text-sm">
                    <div><p className="text-[13px] font-medium text-bos-muted">Barbero</p><p className="font-semibold text-lg">{receipt.employee.display_name}</p></div>
                    <div className="text-right"><p className="text-[13px] font-medium text-bos-muted">Semana</p><p className="font-bold">{weekLabel(receipt.period_start)}</p>
                        <p className="text-xs text-bos-muted">Corte: sábado 8:00 pm</p></div>
                </section>

                <div className="overflow-x-auto"><table className="w-full min-w-[34rem] text-sm border-t border-bos-border">
                    <thead>
                        <tr className="text-left text-[13px] font-medium text-bos-muted">
                            <th className="py-2">Fecha</th><th className="py-2">Concepto</th>
                            <th className="py-2 text-right">Base</th><th className="py-2 text-right">%</th><th className="py-2 text-right">Comisión</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-bos-border">
                        {receipt.commission_lines.map((l, i) => (
                            <tr key={i}>
                                <td className="py-2 text-bos-muted whitespace-nowrap">{day(l.sold_at)}</td>
                                <td className="py-2">{l.item} <span className="text-xs text-bos-muted">{l.item_type === 'product' ? '(producto)' : ''}</span></td>
                                <td className="py-2 text-right">{money(Number(l.basis_amount))}</td>
                                <td className="py-2 text-right">{rate(l)}</td>
                                <td className="py-2 text-right font-medium">{money(Number(l.commission_amount))}</td>
                            </tr>
                        ))}
                        {receipt.adjustment_lines.map((a, i) => (
                            <tr key={`a${i}`} className="text-bos-danger">
                                <td className="py-2" colSpan={4}>Ajuste: {a.reason}</td>
                                <td className="py-2 text-right font-medium">− {money(Number(a.amount))}</td>
                            </tr>
                        ))}
                        {(receipt.tip_lines ?? []).map((t, i) => (
                            <tr key={`t${i}`} className="text-bos-success" data-testid="receipt-tip-line">
                                <td className="py-2 text-bos-muted whitespace-nowrap">{day(t.received_at)}</td>
                                <td className="py-2" colSpan={3}>Propina recibida ({(METHOD_LABELS[t.method] ?? t.method).toLowerCase()})</td>
                                <td className="py-2 text-right font-medium">{money(Number(t.amount))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table></div>

                <section className="mt-4 ml-auto w-full max-w-sm text-sm" aria-label="Desglose del pago">
                    <PayBreakdown data={{ ...receipt, adjustment_lines: receipt.adjustment_lines }} expandable={false} variant="receipt" />
                </section>

                <section className="mt-6 text-sm">
                    <p className="text-[13px] font-medium text-bos-muted mb-1">Forma de pago</p>
                    {receipt.payments.length === 0 ? <p className="text-bos-muted">Sin pago en efectivo ni transferencia: los descuentos y ajustes cubrieron el total.</p> : (
                        <ul className="space-y-1">
                            {receipt.payments.map((p, i) => (
                                <li key={i} className="flex justify-between border-b border-bos-border py-1">
                                    <span>{METHOD_LABELS[p.method] ?? p.method}{p.reference ? ` · ref. ${p.reference}` : ''}</span>
                                    <span className="font-medium">{money(Number(p.amount))}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-xs text-bos-muted mt-2">Pagó: {receipt.paid_by_name ?? '—'}</p>
                </section>

                <footer className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-bos-muted">
                    <div className="border-t border-bos-muted pt-1">Firma de quien paga</div>
                    <div className="border-t border-bos-muted pt-1">Recibí: {receipt.employee.display_name}</div>
                </footer>
            </article>
        </div>
    );
}
