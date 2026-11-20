'use client';

import React from 'react';
import PinConfirm from '@/components/ui/PinConfirm';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/utils/money';
import { sendJson } from '@/lib/money/client';
import { paidFromLabel, type Expense, type PaidFrom } from './data';

const money = (n: number) => formatMoney(n, { cents: true });

/** A dónde vuelve el dinero según de dónde salió (la base lo decide al cancelar). */
export function returnExplanation(paidFrom: PaidFrom): string {
    if (paidFrom === 'envelope') return 'El dinero vuelve al sobre.';
    if (paidFrom === 'bank') return 'Salió del banco: el gasto solo se marca como cancelado y no se mueve efectivo.';
    return 'Si la caja de ese día sigue abierta, el dinero vuelve a la caja; si ya se cerró, vuelve al sobre.';
}

function doneMessage(returnedTo: string, balance: number | null): string {
    if (returnedTo === 'envelope') return `Gasto cancelado. El dinero volvió al sobre${balance !== null ? ` (saldo ${money(balance)})` : ''}.`;
    if (returnedTo === 'cash_drawer') return 'Gasto cancelado. El dinero volvió a la caja.';
    return 'Gasto cancelado. No se movió efectivo.';
}

/** Cancelar un gasto (nunca se borra): motivo + PIN, explicando a dónde vuelve el dinero. */
export default function CancelExpense({ expense, onClose, onDone }: { expense: Expense; onClose: () => void; onDone: () => void }) {
    const toast = useToast();
    return (
        <PinConfirm title="Cancelar gasto" confirmLabel="Cancelar gasto con PIN"
            subtitle="El gasto no se borra: queda tachado con su motivo en la bitácora."
            commentLabel="Motivo de la cancelación" commentPlaceholder="Ej: Se capturó dos veces"
            summary={(
                <div className="space-y-1">
                    <p><strong>{money(expense.amount)}</strong> · {expense.description} · {paidFromLabel(expense.paid_from, expense.method)}</p>
                    <p data-testid="cancel-explanation" className="text-sm text-bos-muted">{returnExplanation(expense.paid_from)}</p>
                </div>
            )}
            onClose={onClose}
            onConfirm={async ({ pin, comment }) => {
                const { data } = await sendJson<{ returned_to: string; envelope_balance: number | null }>(
                    `/api/expenses/${expense.id}/cancel`, 'POST', { reason: comment, pin }, 'No se pudo cancelar el gasto.');
                toast.success(doneMessage(data.returned_to, data.envelope_balance ?? null));
                onDone();
            }} />
    );
}
