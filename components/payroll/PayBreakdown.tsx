'use client';

import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { buildBreakdown, type PayInput } from '@/lib/payroll/breakdown';
import { formatMoney } from '@/lib/utils/money';

const money = (n: number) => formatMoney(n, { cents: true });

interface Props {
    data: PayInput;
    /** true: cada línea se abre y se cierra (pantalla). false: todo visible (recibo impreso). */
    expandable?: boolean;
    variant?: 'preview' | 'receipt';
    className?: string;
}

/**
 * Desglose del pago semanal: Comisiones, Propinas, Bonos (solo con metas activas), Adelantos, Abono a préstamo,
 * Descuentos, Ajustes por anulaciones, Viene de la semana anterior y = Neto a pagar. Cada renglón lleva su signo (+ o −)
 * en texto, no solo en color, para que se lea igual impreso en blanco y negro.
 */
export default function PayBreakdown({ data, expandable = true, variant = 'preview', className = '' }: Props) {
    const b = buildBreakdown(data);
    const uid = useId();
    const [open, setOpen] = useState<Record<string, boolean>>({});

    return (
        <div className={className} data-testid="pay-breakdown">
            <ul className="divide-y divide-bos-border text-sm">
                {b.lines.map((line) => {
                    const canExpand = line.details.length > 0;
                    const shown = !expandable || Boolean(open[line.key]);
                    const panelId = `${uid}-${line.key}`;
                    const sign = line.sign > 0 ? '+' : '−';
                    return (
                        <li key={line.key} data-testid={`line-${line.key}`} className="py-1.5">
                            <div className="flex items-center justify-between gap-3">
                                {canExpand && expandable ? (
                                    <button type="button" aria-expanded={shown} aria-controls={panelId}
                                        onClick={() => setOpen((p) => ({ ...p, [line.key]: !p[line.key] }))}
                                        className="min-h-11 inline-flex items-center gap-1.5 text-left font-medium text-bos-text hover:underline">
                                        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${shown ? 'rotate-180' : ''}`} />
                                        {line.label}
                                        <span className="text-xs font-normal text-bos-muted">({line.details.length})</span>
                                    </button>
                                ) : (
                                    <span className="font-medium text-bos-text">{line.label}</span>
                                )}
                                <span className="tabular-nums font-semibold whitespace-nowrap">{sign} {money(line.amount)}</span>
                            </div>
                            {canExpand && (
                                <ul id={panelId} hidden={!shown} className="mt-1 mb-1 space-y-1 border-l-2 border-bos-border pl-3 text-[13px] text-bos-muted">
                                    {line.details.map((d) => (
                                        <li key={d.key} className="flex justify-between gap-3">
                                            <span className="min-w-0 break-words">{d.text}</span>
                                            {d.amount !== undefined && <span className="tabular-nums whitespace-nowrap">{money(d.amount)}</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t-2 border-bos-text pt-2">
                <span className="font-display text-base font-semibold">= {variant === 'receipt' ? 'Total pagado' : 'Neto a pagar'}</span>
                <span className="font-display text-xl font-semibold tabular-nums" data-testid="breakdown-net">{money(variant === 'receipt' ? b.paid : b.net)}</span>
            </div>
            {b.negative && b.pending > 0 && (
                <p data-testid="breakdown-negative" role="status" className="mt-2 rounded-xl border border-bos-text bg-bos-raised p-3 text-sm font-medium text-bos-text print:rounded-none print:bg-white">
                    {variant === 'receipt'
                        ? `Queda pendiente para la próxima semana: ${money(b.pending)}`
                        : `Se paga $0. Quedan ${money(b.pending)} pendientes para la próxima semana.`}
                </p>
            )}
            {b.waiting.map((w, i) => (
                <p key={i} data-testid="loan-waiting" role="status" className="mt-2 text-sm text-bos-muted">{w}</p>
            ))}
        </div>
    );
}
