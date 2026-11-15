'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import type { Ticket } from '@/lib/sales/ticket';
import { SYSTEM_NAME } from '@/lib/brand';

type TicketData = Ticket & {
    business: { name: string; currency: string; timezone: string };
    branch: { name: string; address: string | null; phone: string | null };
};

const METHOD_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' };

export default function TicketPage() {
    const { id } = useParams<{ id: string }>();
    const [ticket, setTicket] = useState<TicketData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/sales/${id}`, { cache: 'no-store' });
                const body = await res.json().catch(() => null);
                if (!res.ok) throw new Error(body?.error ?? 'No se pudo cargar el ticket.');
                setTicket(body as TicketData);
            } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar el ticket.'); }
        })();
    }, [id]);

    if (error) return <div className="max-w-md mx-auto bg-white p-8 rounded-2xl border text-red-600" role="alert">{error}</div>;
    if (!ticket) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sonblade-gold" /></div>;

    const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: ticket.business.currency }).format(n);
    const when = new Intl.DateTimeFormat('es-MX', { timeZone: ticket.business.timezone, dateStyle: 'long', timeStyle: 'short' }).format(new Date(ticket.created_at));

    return (
        <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-4 print:hidden">
                <Link href="/pos" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-black"><ArrowLeft className="h-4 w-4" /> Volver al cobro</Link>
                <button onClick={() => window.print()} className="px-4 py-2 bg-black text-white rounded-lg text-sm font-bold inline-flex items-center gap-2 hover:bg-gray-800">
                    <Printer className="h-4 w-4" /> Imprimir o guardar como PDF
                </button>
            </div>

            <article data-testid="ticket" className="bg-white text-gray-900 rounded-2xl border border-gray-200 p-6 print:border-0 print:rounded-none print:p-0">
                <header className="text-center border-b border-dashed border-gray-300 pb-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="" className="h-16 w-16 object-contain mx-auto mb-2" />
                    <h1 className="text-xl font-black uppercase tracking-wide">{ticket.business.name}</h1>
                    {ticket.branch.address && <p className="text-xs text-gray-500">{ticket.branch.address}</p>}
                    {ticket.branch.phone && <p className="text-xs text-gray-500">Tel. {ticket.branch.phone}</p>}
                </header>

                {ticket.cancelled && (
                    <p role="status" className="mt-4 text-center text-sm font-black text-red-700 border-2 border-red-700 rounded-lg py-1">VENTA ANULADA</p>
                )}

                <section className="text-sm py-4 border-b border-dashed border-gray-300 space-y-1">
                    <div className="flex justify-between"><span className="text-gray-500">Folio</span><span className="font-bold" data-testid="ticket-folio">{ticket.folio}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Fecha</span><span>{when}</span></div>
                    {ticket.client_name && <div className="flex justify-between"><span className="text-gray-500">Cliente</span><span>{ticket.client_name}</span></div>}
                    {ticket.attended_by.length > 0 && <div className="flex justify-between"><span className="text-gray-500">Te atendió</span><span>{ticket.attended_by.join(', ')}</span></div>}
                    {ticket.cashier_name && <div className="flex justify-between"><span className="text-gray-500">Cobró</span><span>{ticket.cashier_name}</span></div>}
                </section>

                <table className="w-full text-sm my-4">
                    <thead>
                        <tr className="text-left text-xs uppercase text-gray-500">
                            <th className="pb-2 font-semibold">Concepto</th>
                            <th className="pb-2 font-semibold text-right">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ticket.lines.map((line, i) => (
                            <tr key={i} className="align-top">
                                <td className="py-1.5">
                                    {line.name}
                                    <span className="block text-xs text-gray-500">
                                        {line.quantity} × {money(line.unit_price)}{line.discount > 0 ? ` · descuento ${money(line.discount)}` : ''}
                                    </span>
                                </td>
                                <td className="py-1.5 text-right font-medium">{money(line.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <section className="text-sm border-t border-dashed border-gray-300 pt-3 space-y-1">
                    <div className="flex justify-between"><span>Subtotal</span><span>{money(ticket.subtotal)}</span></div>
                    {ticket.discount > 0 && <div className="flex justify-between"><span>Descuento</span><span>− {money(ticket.discount)}</span></div>}
                    <div className="flex justify-between font-bold"><span>Total de la venta</span><span data-testid="ticket-total">{money(ticket.total)}</span></div>
                    {ticket.tip > 0 && <div className="flex justify-between"><span>Propina</span><span data-testid="ticket-tip">{money(ticket.tip)}</span></div>}
                    <div className="flex justify-between text-lg font-black border-t-2 border-gray-900 pt-2 mt-2"><span>TOTAL PAGADO</span><span data-testid="ticket-grand-total">{money(ticket.cancelled ? 0 : ticket.grand_total)}</span></div>
                </section>

                {ticket.payments.length > 0 && (
                    <section className="text-sm mt-4">
                        <p className="text-xs uppercase text-gray-500 font-bold mb-1">Forma de pago</p>
                        {ticket.payments.map((p, i) => (
                            <div key={i} className="flex justify-between"><span>{METHOD_LABELS[p.method] ?? p.method}</span><span>{money(p.amount)}</span></div>
                        ))}
                    </section>
                )}

                <footer className="text-center text-xs text-gray-500 mt-6 pt-4 border-t border-dashed border-gray-300">
                    <p className="font-semibold text-gray-700">¡Gracias por tu visita!</p>
                    <p className="mt-1">Este ticket no es un comprobante fiscal. · {SYSTEM_NAME}</p>
                </footer>
            </article>
        </div>
    );
}
