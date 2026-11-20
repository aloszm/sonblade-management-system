'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/utils/dates';
import { isOfflineError, readJson, toUserMessage } from '@/lib/utils/errors';
import { formatMoney } from '@/lib/utils/money';
import type { PersonLineApi, PersonWeekApi } from '@/lib/team/person-week';
import { kindSentence, weekCaption, type WeekWindowApi } from '@/components/team/WeekSummary';

interface Response { timezone: string; window: WeekWindowApi; summary: PersonWeekApi; lines: PersonLineApi[] }

const percentFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });
const KIND_LABEL: Record<PersonLineApi['kind'], string> = { service: 'Servicio', product: 'Producto', tip: 'Propina' };

function LineItem({ line, timezone }: { line: PersonLineApi; timezone: string }) {
    const hasCommission = line.base !== null;
    return (
        <li data-testid="week-line" className="space-y-1 rounded-xl border border-bos-border bg-bos-surface p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-semibold">{line.concept}{line.quantity > 1 ? ` × ${line.quantity}` : ''} <span className="font-normal text-bos-muted">· {KIND_LABEL[line.kind]}</span></p>
                    <p className="text-xs text-bos-muted">{line.paidAt ? formatDateTime(line.paidAt, timezone, { year: false }) : 'Sin fecha'}{line.folio ? ` · Folio ${line.folio}` : ''}</p>
                </div>
                <Link href={`/ticket/${line.saleId}`} aria-label={`Ver venta ${line.folio ?? ''} de ${line.concept}`.replace(/\s+/g, ' ')}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-bos-control px-3 text-sm font-semibold text-bos-text hover:bg-bos-raised">
                    Ver venta
                </Link>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums sm:grid-cols-4">
                {line.kind !== 'tip' && <div><dt className="text-xs text-bos-muted">Cobrado</dt><dd>{formatMoney(line.revenue)}</dd></div>}
                {line.kind !== 'tip' && <div><dt className="text-xs text-bos-muted">Base de comisión</dt><dd>{hasCommission ? formatMoney(line.base) : '—'}</dd></div>}
                {line.kind !== 'tip' && <div><dt className="text-xs text-bos-muted">%</dt><dd>{line.percent === null ? '—' : `${percentFormat.format(line.percent)} %`}</dd></div>}
                {line.kind !== 'tip' && <div><dt className="text-xs text-bos-muted">Comisión</dt><dd className="font-semibold">{line.courtesy ? <span data-testid="week-line-courtesy">Cortesía · sin comisión</span> : formatMoney(line.commission)}</dd></div>}
                <div><dt className="text-xs text-bos-muted">Propina</dt><dd>{line.tip > 0 ? formatMoney(line.tip) : '—'}</dd></div>
            </dl>
        </li>
    );
}

/**
 * Desglose de la semana de una persona (ventana de Equipo): cada venta con fecha, folio, base, %, comisión y propina,
 * un enlace al ticket completo y, al pie, los mismos totales que su tarjeta (los entrega el servidor, no se suman aquí).
 */
export default function WeekBreakdown({ employeeId, name }: { employeeId: string; name: string }) {
    const [data, setData] = useState<Response | null>(null);
    const [error, setError] = useState<unknown>(null);

    const load = useCallback(async () => {
        setError(null);
        setData(null);
        try {
            setData(await readJson<Response>(await fetch(`/api/team-week/${employeeId}`, { cache: 'no-store' })));
        } catch (e) { console.error('No se pudo cargar el desglose de la semana', e); setError(e); }
    }, [employeeId]);

    useEffect(() => { void load(); }, [load]);

    if (error) return <ErrorState title="No se pudo cargar el desglose" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={load} />;
    if (!data) {
        return (
            <div aria-busy="true" aria-label="Cargando el desglose de la semana" className="space-y-3">
                <Skeleton className="h-4 w-48" /><Skeleton className="h-24" /><Skeleton className="h-24" />
            </div>
        );
    }
    const { summary, lines, window, timezone } = data;
    return (
        <div data-testid="week-breakdown" className="space-y-4">
            <p className="text-sm text-bos-muted">{weekCaption(window)} · ventas de {name}</p>
            {lines.length === 0 ? (
                <div className="rounded-xl border border-bos-border bg-bos-surface"><EmptyState title="Sin ventas esta semana" description={`${name} no tiene servicios, productos ni propinas cobrados en esta semana.`} /></div>
            ) : (
                <>
                    <ul className="space-y-2">{lines.map((l) => <LineItem key={l.key} line={l} timezone={timezone} />)}</ul>
                    <section data-testid="week-totals" aria-label="Totales de la semana" className="space-y-1 rounded-xl border border-bos-border bg-bos-raised p-3 text-sm">
                        <h3 className="font-display text-base font-semibold">Totales de la semana</h3>
                        {summary.services.count > 0 || summary.services.commission > 0 ? <p data-testid="totals-services">{kindSentence('Servicios', summary.services)}</p> : null}
                        {summary.products.count > 0 || summary.products.commission > 0 ? <p data-testid="totals-products">{kindSentence('Productos', summary.products)}</p> : null}
                        <p data-testid="totals-tips">Propinas: {formatMoney(summary.tips)}</p>
                        <p className="flex flex-wrap items-baseline gap-x-3 font-display text-base font-semibold tabular-nums">
                            <span data-testid="totals-revenue">Ventas: {formatMoney(summary.revenue)}</span>
                            <span data-testid="totals-earned" className="text-bos-accent-text">Gana: {formatMoney(summary.earned)}</span>
                        </p>
                        <p className="text-xs text-bos-muted">Gana = comisión de servicios y productos + propinas. No incluye el sueldo por día.</p>
                    </section>
                </>
            )}
        </div>
    );
}
