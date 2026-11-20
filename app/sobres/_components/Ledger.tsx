'use client';

import React from 'react';
import { Wallet } from 'lucide-react';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import { formatMoney } from '@/lib/utils/money';
import { formatDateTime } from '@/lib/utils/dates';
import { isOfflineError, toUserMessage } from '@/lib/utils/errors';
import { sourceLabel, type EnvelopeMovement } from './data';

const money = (n: number) => formatMoney(n, { cents: true });
const th = 'px-4 py-3 text-[13px] font-medium';

interface Props {
    movements: EnvelopeMovement[] | undefined;
    loading: boolean;
    error: unknown;
    filtered: boolean;
    onRetry: () => void;
}

/** Libro de movimientos del sobre con el saldo corrido (del más reciente al más antiguo). */
export default function Ledger({ movements, loading, error, filtered, onRetry }: Props) {
    if (loading) {
        return (
            <div role="status" aria-busy="true" className="space-y-3">
                <span className="sr-only">Cargando movimientos…</span>
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
        );
    }
    if (error) {
        return <ErrorState title="No se pudieron cargar los movimientos" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={onRetry} />;
    }
    if (!movements || movements.length === 0) {
        return (
            <Card padded={false}>
                <EmptyState icon={<Wallet className="h-8 w-8" />}
                    title={filtered ? 'No hay movimientos en esas fechas' : 'Aún no hay apartados'}
                    description={filtered ? 'Prueba con otro periodo o quita el filtro.' : 'Aún no hay apartados. El primero entrará cuando cierres una caja con apartado.'} />
            </Card>
        );
    }
    return (
        <Card padded={false} className="overflow-hidden">
            <div className="overflow-x-auto">
                <table className="bos-stack w-full text-left text-sm" data-testid="ledger">
                    <thead className="text-bos-muted">
                        <tr>
                            <th className={th}>Fecha</th>
                            <th className={th}>Concepto</th>
                            <th className={th}>Quién</th>
                            <th className={`${th} text-right`}>Entrada</th>
                            <th className={`${th} text-right`}>Salida</th>
                            <th className={`${th} text-right`}>Saldo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {movements.map((m, i) => (
                            <tr key={m.id ?? `${m.created_at}-${i}`} data-testid="ledger-row" className="border-t border-bos-border hover:bg-bos-raised transition-colors">
                                <td data-label="" className="px-4 py-3 text-bos-muted whitespace-nowrap max-md:order-last max-md:text-xs">{formatDateTime(m.created_at)}</td>
                                <td data-label="" className="px-4 py-3 max-md:order-first">
                                    <span className="font-semibold">{sourceLabel(m.source)}</span>
                                    {m.reason && <span className="block text-xs text-bos-muted">{m.reason}</span>}
                                </td>
                                <td data-label="Quién" className="px-4 py-3 text-bos-muted">{m.created_by_name ?? '—'}</td>
                                <td data-label="Entrada" className="px-4 py-3 text-right tabular-nums font-semibold text-bos-success whitespace-nowrap">
                                    {m.direction === 'in' ? `+${money(m.amount)}` : ''}
                                </td>
                                <td data-label="Salida" className="px-4 py-3 text-right tabular-nums font-semibold text-bos-danger whitespace-nowrap">
                                    {m.direction === 'out' ? `-${money(m.amount)}` : ''}
                                </td>
                                <td data-label="Saldo" className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap">{money(m.balance_after)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
