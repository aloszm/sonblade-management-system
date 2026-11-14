'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { weekLabel } from '@/lib/settlements/week';

type Receipt = {
    receipt_number: string;
    status: string;
    business: { name: string; currency: string; timezone: string };
    branch: { name: string; address: string | null; phone: string | null };
    employee: { id: string; display_name: string };
    period_start: string; period_end: string; window_start: string; window_end: string;
    paid_at: string | null; paid_by_name: string | null;
    total_amount: number; gross_commission: number; deductions: number;
    payments: { method: 'cash' | 'card' | 'transfer' | 'other'; amount: number; reference: string | null }[];
    commission_lines: { sale_id: string; sold_at: string; item: string; item_type: 'service' | 'product'; basis_amount: number; percentage: number | null; fixed_amount: number | null; commission_amount: number }[];
    adjustment_lines: { reason: string; amount: number }[];
};

const METHOD_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' };

export default function ReciboPage() {
    const { id } = useParams<{ id: string }>();
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/settlements/${id}/receipt`, { cache: 'no-store' });
                const body = await res.json().catch(() => null);
                if (!res.ok) throw new Error(body?.error ?? 'No se pudo cargar el recibo.');
                setReceipt(body as Receipt);
            } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
        })();
    }, [id]);

    if (error) return <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl border text-red-600" role="alert">{error}</div>;
    if (!receipt) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sonblade-gold" /></div>;

    const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: receipt.business.currency }).format(n);
    const tz = receipt.business.timezone;
    const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('es-MX', { timeZone: tz, dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso)) : '—');
    const day = (iso: string) => new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    const rate = (l: Receipt['commission_lines'][number]) => (l.percentage !== null ? `${Number(l.percentage)}%` : l.fixed_amount !== null ? `${money(Number(l.fixed_amount))} fijo` : '—');

    return (
        <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4 print:hidden">
                <Link href="/liquidaciones" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-black"><ArrowLeft className="h-4 w-4" /> Volver</Link>
                <button onClick={() => window.print()} className="px-4 py-2 bg-black text-white rounded-lg text-sm font-bold inline-flex items-center gap-2 hover:bg-gray-800">
                    <Printer className="h-4 w-4" /> Imprimir o guardar como PDF
                </button>
            </div>

            <article className="bg-white text-gray-900 rounded-2xl shadow-sm border border-gray-100 p-8 print:shadow-none print:border-0 print:p-0 print:rounded-none" data-testid="receipt">
                <header className="flex justify-between items-start border-b-2 border-gray-900 pb-4">
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-wide">{receipt.business.name}</h1>
                        <p className="text-sm text-gray-600">{receipt.branch.name}</p>
                        {receipt.branch.address && <p className="text-sm text-gray-600">{receipt.branch.address}</p>}
                        {receipt.branch.phone && <p className="text-sm text-gray-600">Tel. {receipt.branch.phone}</p>}
                    </div>
                    <div className="text-right">
                        <p className="text-xs uppercase text-gray-500 font-bold">Recibo de pago de comisiones</p>
                        <p className="text-2xl font-mono font-black" data-testid="receipt-number">{receipt.receipt_number}</p>
                        <p className="text-xs text-gray-500 mt-1">Pagado: {when(receipt.paid_at)}</p>
                    </div>
                </header>

                <section className="grid grid-cols-2 gap-4 py-4 text-sm">
                    <div><p className="text-xs uppercase text-gray-500 font-bold">Barbero</p><p className="font-bold text-lg">{receipt.employee.display_name}</p></div>
                    <div className="text-right"><p className="text-xs uppercase text-gray-500 font-bold">Semana</p><p className="font-bold">{weekLabel(receipt.period_start)}</p>
                        <p className="text-xs text-gray-500">Corte: sábado 8:00 pm</p></div>
                </section>

                <table className="w-full text-sm border-t border-gray-200">
                    <thead>
                        <tr className="text-left text-xs uppercase text-gray-500">
                            <th className="py-2">Fecha</th><th className="py-2">Concepto</th>
                            <th className="py-2 text-right">Base</th><th className="py-2 text-right">%</th><th className="py-2 text-right">Comisión</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {receipt.commission_lines.map((l, i) => (
                            <tr key={i}>
                                <td className="py-2 text-gray-500 whitespace-nowrap">{day(l.sold_at)}</td>
                                <td className="py-2">{l.item} <span className="text-xs text-gray-400">{l.item_type === 'product' ? '(producto)' : ''}</span></td>
                                <td className="py-2 text-right">{money(Number(l.basis_amount))}</td>
                                <td className="py-2 text-right">{rate(l)}</td>
                                <td className="py-2 text-right font-medium">{money(Number(l.commission_amount))}</td>
                            </tr>
                        ))}
                        {receipt.adjustment_lines.map((a, i) => (
                            <tr key={`a${i}`} className="text-red-700">
                                <td className="py-2" colSpan={4}>Descuento por ajuste: {a.reason}</td>
                                <td className="py-2 text-right font-medium">− {money(Number(a.amount))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <section className="mt-4 ml-auto w-full max-w-xs text-sm space-y-1">
                    <div className="flex justify-between"><span>Comisiones</span><span>{money(Number(receipt.gross_commission))}</span></div>
                    {Number(receipt.deductions) > 0 && <div className="flex justify-between text-red-700"><span>Descuentos</span><span>− {money(Number(receipt.deductions))}</span></div>}
                    <div className="flex justify-between text-lg font-black border-t-2 border-gray-900 pt-2"><span>TOTAL PAGADO</span><span data-testid="receipt-total">{money(Number(receipt.total_amount))}</span></div>
                </section>

                <section className="mt-6 text-sm">
                    <p className="text-xs uppercase text-gray-500 font-bold mb-1">Forma de pago</p>
                    {receipt.payments.length === 0 ? <p className="text-gray-500">Sin pago (la comisión se compensó con descuentos).</p> : (
                        <ul className="space-y-1">
                            {receipt.payments.map((p, i) => (
                                <li key={i} className="flex justify-between border-b border-gray-100 py-1">
                                    <span>{METHOD_LABELS[p.method] ?? p.method}{p.reference ? ` · ref. ${p.reference}` : ''}</span>
                                    <span className="font-medium">{money(Number(p.amount))}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-xs text-gray-500 mt-2">Pagó: {receipt.paid_by_name ?? '—'}</p>
                </section>

                <footer className="mt-12 grid grid-cols-2 gap-10 text-center text-xs text-gray-500">
                    <div className="border-t border-gray-400 pt-1">Firma de quien paga</div>
                    <div className="border-t border-gray-400 pt-1">Recibí: {receipt.employee.display_name}</div>
                </footer>
            </article>
        </div>
    );
}
