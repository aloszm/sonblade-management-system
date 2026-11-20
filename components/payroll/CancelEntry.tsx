'use client';

import React from 'react';
import PinConfirm from '@/components/ui/PinConfirm';
import { useToast } from '@/components/ui/Toast';
import { sendJson } from '@/lib/money/client';
import { formatMoney } from '@/lib/utils/money';
import { useRefreshLedger, type LedgerEntry } from './ledger-data';

const money = (n: number) => formatMoney(n, { cents: true });

/** A dónde vuelve el dinero según de dónde salió (la base lo decide al cancelar). */
export function returnExplanation(entry: Pick<LedgerEntry, 'paid_from'>): string {
    if (entry.paid_from === 'envelope') return 'El dinero vuelve al sobre.';
    if (entry.paid_from === 'cash_drawer') return 'Si la caja de ese día sigue abierta, el dinero vuelve a la caja; si ya se cerró, vuelve al sobre.';
    if (entry.paid_from === 'bank') return 'Salió del banco: solo se marca como cancelado y no se mueve efectivo.';
    return 'Deja de descontarse del siguiente recibo.';
}

function doneMessage(returnedTo: string, balance: number | null): string {
    if (returnedTo === 'envelope') return `Movimiento cancelado. El dinero volvió al sobre${balance !== null ? ` (saldo ${money(balance)})` : ''}.`;
    if (returnedTo === 'cash_drawer') return 'Movimiento cancelado. El dinero volvió a la caja.';
    return 'Movimiento cancelado. No se movió efectivo.';
}

/** Cancelar un movimiento que aún no entró a un recibo (nunca se borra): motivo + PIN. */
export default function CancelEntry({ entry, onClose, onDone }: { entry: LedgerEntry; onClose: () => void; onDone?: () => void }) {
    const toast = useToast();
    const refresh = useRefreshLedger();
    return (
        <PinConfirm title={`Cancelar ${entry.label.toLowerCase()}`} confirmLabel="Cancelar movimiento con PIN"
            subtitle="El movimiento no se borra: queda tachado con su motivo en la bitácora."
            commentLabel="Motivo de la cancelación" commentPlaceholder="Ej: Se capturó dos veces"
            summary={(
                <div className="space-y-1">
                    <p><strong>{money(entry.amount)}</strong> · {entry.label} · {entry.employee_name} · {entry.reason}</p>
                    <p data-testid="cancel-explanation" className="text-sm text-bos-muted">{returnExplanation(entry)}</p>
                </div>
            )}
            onClose={onClose}
            onConfirm={async ({ pin, comment }) => {
                const { data } = await sendJson<{ returned_to: string; envelope_balance: number | null }>(
                    `/api/employee-ledger/${entry.id}/cancel`, 'POST', { reason: comment, pin }, 'No se pudo cancelar el movimiento.');
                toast.success(doneMessage(data.returned_to, data.envelope_balance ?? null));
                await refresh();
                onDone?.();
                onClose();
            }} />
    );
}
