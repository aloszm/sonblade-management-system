'use client';

import React from 'react';
import { ArrowDownToLine, ClipboardCheck, HandCoins } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { formatMoney } from '@/lib/utils/money';
import { formatDateTime } from '@/lib/utils/dates';
import type { Envelope } from './data';

const money = (n: number) => formatMoney(n, { cents: true });

interface Props {
    envelope: Envelope;
    selected: boolean;
    canEdit: boolean;
    showSelect: boolean;
    onSelect: () => void;
    onAdjust: () => void;
    onDeposit: () => void;
}

/** Saldo del sobre, grande y claro, con lo que ha entrado y salido y las acciones con PIN (solo quien puede editar). */
export default function EnvelopeCard({ envelope, selected, canEdit, showSelect, onSelect, onAdjust, onDeposit }: Props) {
    return (
        <Card as="section" aria-label={`Sobre ${envelope.name}`} data-testid="envelope-card"
            className={selected ? 'border-bos-accent' : ''}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                        <HandCoins aria-hidden="true" className="h-5 w-5 text-bos-accent-text" /> <span className="truncate">{envelope.name}</span>
                    </h2>
                    <p className="text-sm text-bos-muted">Efectivo apartado en el sobre</p>
                </div>
                {showSelect && !selected && (
                    <Button variant="secondary" size="sm" onClick={onSelect}>Ver movimientos</Button>
                )}
            </div>
            <p className="mt-5 text-[13px] font-medium text-bos-muted">Saldo del sobre</p>
            <p data-testid="envelope-balance" className="font-display text-5xl font-semibold tabular-nums tracking-tight">{money(envelope.balance)}</p>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-bos-border pt-4 text-sm">
                <div>
                    <dt className="text-bos-muted">Ha entrado</dt>
                    <dd data-testid="envelope-total-in" className="font-semibold tabular-nums text-bos-success">{money(envelope.total_in)}</dd>
                </div>
                <div>
                    <dt className="text-bos-muted">Ha salido</dt>
                    <dd data-testid="envelope-total-out" className="font-semibold tabular-nums text-bos-danger">{money(envelope.total_out)}</dd>
                </div>
            </dl>
            <p className="mt-3 text-xs text-bos-muted">
                {envelope.last_movement_at ? `Último movimiento: ${formatDateTime(envelope.last_movement_at)}` : 'Sin movimientos todavía.'}
            </p>
            {canEdit && (
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Button variant="secondary" onClick={onAdjust}><ClipboardCheck aria-hidden="true" className="h-4 w-4" /> Ajustar por conteo</Button>
                    <Button variant="secondary" onClick={onDeposit}><ArrowDownToLine aria-hidden="true" className="h-4 w-4" /> Depositar al banco</Button>
                </div>
            )}
        </Card>
    );
}
