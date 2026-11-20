'use client';

import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Field, { LABEL_CLASS } from '@/components/ui/Field';
import PinConfirm from '@/components/ui/PinConfirm';
import { useToast } from '@/components/ui/Toast';
import { reasonProblem } from '@/lib/cash/reasons';
import { hasValidCents, newIdempotencyKey, parseAmount, sendJson } from '@/lib/money/client';
import { formatMoney } from '@/lib/utils/money';
import { useEnvelopes } from '@/app/sobres/_components/data';
import { GIVES_MONEY, PAID_FROM_LABELS, TYPE_HELP, TYPE_LABELS, useRefreshLedger, type LedgerPaidFrom, type Loan, type ManualType } from './ledger-data';

const money = (n: number) => formatMoney(n, { cents: true });
const TYPES: ManualType[] = ['advance', 'loan', 'loan_payment', 'deduction'];

export interface Person { id: string; name: string }

interface Props {
    people: Person[];
    /** Si viene, la persona queda fija (ficha de Equipo). */
    employeeId?: string | null;
    loans: Loan[];
    onClose: () => void;
    onDone?: () => void;
}

type Errors = Partial<Record<'person' | 'amount' | 'reason' | 'weekly' | 'loan' | 'paidFrom', string>>;

/** "Se descontará…": el efecto que verá la persona en su recibo. */
export function effectText(type: ManualType, weekly?: number): string {
    if (type === 'loan') return weekly && weekly > 0 ? `Se descontará ${money(weekly)} cada semana en su recibo, hasta saldarlo.` : 'Se descontará en abonos semanales en su recibo.';
    return 'Se descontará en su próximo recibo.';
}

/**
 * Registrar un adelanto, préstamo, abono o descuento. La clave de idempotencia se genera al abrir el formulario
 * (no en cada clic) para que un reintento no registre dos veces. El PIN se pide al confirmar.
 */
export default function LedgerForm({ people, employeeId, loans, onClose, onDone }: Props) {
    const toast = useToast();
    const refresh = useRefreshLedger();
    const envelopesQ = useEnvelopes();
    const [key] = useState(newIdempotencyKey);

    const [type, setType] = useState<ManualType>('advance');
    const [person, setPerson] = useState(employeeId ?? '');
    const [amountText, setAmountText] = useState('');
    const [reason, setReason] = useState('');
    const [paidFrom, setPaidFrom] = useState<LedgerPaidFrom>('envelope');
    const [weeklyText, setWeeklyText] = useState('');
    const [loanId, setLoanId] = useState('');
    const [errors, setErrors] = useState<Errors>({});
    const [step, setStep] = useState<'form' | 'pin'>('form');

    const envelopes = envelopesQ.data?.envelopes ?? [];
    const envelope = envelopes.find((e) => e.is_default) ?? envelopes[0] ?? null;
    const amount = parseAmount(amountText);
    const weekly = parseAmount(weeklyText);
    const givesMoney = GIVES_MONEY[type];
    const personLoans = loans.filter((l) => l.employee_id === person && l.status === 'active' && l.outstanding > 0);
    const chosenLoan = personLoans.find((l) => l.id === loanId) ?? null;
    const personName = people.find((p) => p.id === person)?.name ?? '';

    const validate = (): Errors => {
        const e: Errors = {};
        if (!person) e.person = 'Elige a la persona.';
        if (Number.isNaN(amount) || amount <= 0) e.amount = 'Escribe el monto (más de $0).';
        else if (amount > 1_000_000) e.amount = 'El monto no puede pasar de 1,000,000.';
        else if (!hasValidCents(amount)) e.amount = 'El monto lleva máximo 2 decimales.';
        else if (givesMoney && paidFrom === 'envelope' && envelope && amount > envelope.balance) e.amount = `No alcanza: el sobre tiene ${money(envelope.balance)}. Elige otra salida o baja el monto.`;
        else if (type === 'loan_payment' && chosenLoan && amount > chosenLoan.outstanding) e.amount = `El préstamo solo debe ${money(chosenLoan.outstanding)}.`;
        const problem = reasonProblem(reason, 'el motivo');
        if (problem) e.reason = problem;
        if (type === 'loan') {
            if (Number.isNaN(weekly) || weekly <= 0) e.weekly = 'Escribe cuánto se abona por semana.';
            else if (!hasValidCents(weekly)) e.weekly = 'El abono lleva máximo 2 decimales.';
            else if (!Number.isNaN(amount) && weekly > amount) e.weekly = 'El abono por semana no puede ser mayor que el préstamo.';
        }
        if (type === 'loan_payment' && !loanId) e.loan = personLoans.length === 0 ? 'Esta persona no tiene préstamos con saldo.' : 'Elige el préstamo al que se abona.';
        return e;
    };

    const next = (ev: React.FormEvent) => {
        ev.preventDefault();
        const found = validate();
        setErrors(found);
        if (Object.keys(found).length === 0) setStep('pin');
    };

    const clear = (k: keyof Errors) => setErrors((p) => ({ ...p, [k]: undefined }));
    const radio = (on: boolean) => `flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 ${on ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border'}`;

    return (
        <Card as="section" aria-labelledby="ledger-form-title" data-testid="ledger-form" className="space-y-4">
            <div>
                <h3 id="ledger-form-title" className="font-display text-lg font-semibold">Registrar</h3>
                <p className="text-sm text-bos-muted">Todo movimiento queda en la bitácora con tu nombre y se confirma con tu PIN.</p>
            </div>
            <form onSubmit={next} noValidate className="space-y-4">
                <fieldset className="space-y-2">
                    <legend className={LABEL_CLASS}>Tipo de movimiento</legend>
                    {TYPES.map((t) => (
                        <label key={t} className={radio(type === t)}>
                            <input type="radio" name="ledger-type" checked={type === t} className="mt-1 h-5 w-5 accent-[var(--bos-accent)]"
                                onChange={() => { setType(t); setErrors({}); setLoanId(''); }} />
                            <span className="min-w-0">
                                <span className="block font-semibold">{TYPE_LABELS[t]}</span>
                                <span className="block text-sm text-bos-muted">{TYPE_HELP[t]}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field id="ledger-person" label="Persona" error={errors.person}>
                        {(c) => (
                            <select {...c} value={person} disabled={Boolean(employeeId)}
                                onChange={(e) => { setPerson(e.target.value); setLoanId(''); clear('person'); }}>
                                <option value="">Elige a la persona</option>
                                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        )}
                    </Field>
                    <Field id="ledger-amount" label="Monto ($)" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
                        value={amountText} onChange={(e) => { setAmountText(e.target.value); clear('amount'); }} error={errors.amount} className="font-semibold" />
                </div>

                {type === 'loan' && (
                    <Field id="ledger-weekly" label="Abono por semana ($)" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00"
                        hint="Lo que se le descuenta cada semana en su recibo, hasta saldar el préstamo."
                        value={weeklyText} onChange={(e) => { setWeeklyText(e.target.value); clear('weekly'); }} error={errors.weekly} />
                )}

                {type === 'loan_payment' && (
                    <Field id="ledger-loan" label="Préstamo" error={errors.loan}>
                        {(c) => (
                            <select {...c} value={loanId} onChange={(e) => { setLoanId(e.target.value); clear('loan'); }}>
                                <option value="">{person ? 'Elige el préstamo' : 'Primero elige a la persona'}</option>
                                {personLoans.map((l) => <option key={l.id} value={l.id}>{`${l.reason} · debe ${money(l.outstanding)}`}</option>)}
                            </select>
                        )}
                    </Field>
                )}

                <Field id="ledger-reason" label="Motivo (obligatorio)" type="text" maxLength={320} placeholder={type === 'deduction' ? 'Ej: Se llevó una pomada' : 'Ej: Gastos médicos'}
                    value={reason} onChange={(e) => { setReason(e.target.value); clear('reason'); }} error={errors.reason} />

                {givesMoney && (
                    <fieldset className="space-y-2">
                        <legend className={LABEL_CLASS}>Sale de</legend>
                        <label className={radio(paidFrom === 'envelope')}>
                            <input type="radio" name="ledger-from" checked={paidFrom === 'envelope'} onChange={() => { setPaidFrom('envelope'); clear('amount'); }} className="mt-1 h-5 w-5 accent-[var(--bos-accent)]" />
                            <span className="min-w-0">
                                <span className="block font-semibold">{PAID_FROM_LABELS.envelope}</span>
                                <span className="block text-sm text-bos-muted" data-testid="ledger-envelope-balance">
                                    {envelope ? `Saldo disponible: ${money(envelope.balance)}` : envelopesQ.isLoading ? 'Consultando saldo…' : 'No se pudo consultar el saldo del sobre.'}
                                </span>
                            </span>
                        </label>
                        <label className={radio(paidFrom === 'cash_drawer')}>
                            <input type="radio" name="ledger-from" checked={paidFrom === 'cash_drawer'} onChange={() => { setPaidFrom('cash_drawer'); clear('amount'); }} className="mt-1 h-5 w-5 accent-[var(--bos-accent)]" />
                            <span className="min-w-0">
                                <span className="block font-semibold">{PAID_FROM_LABELS.cash_drawer}</span>
                                <span className="block text-sm text-bos-muted">Requiere la caja de hoy abierta y efectivo suficiente en ella.</span>
                            </span>
                        </label>
                        <label className={radio(paidFrom === 'bank')}>
                            <input type="radio" name="ledger-from" checked={paidFrom === 'bank'} onChange={() => { setPaidFrom('bank'); clear('amount'); }} className="mt-1 h-5 w-5 accent-[var(--bos-accent)]" />
                            <span className="min-w-0">
                                <span className="block font-semibold">{PAID_FROM_LABELS.bank}</span>
                                <span className="block text-sm text-bos-muted">Sale del banco; no mueve el efectivo.</span>
                            </span>
                        </label>
                    </fieldset>
                )}

                <p data-testid="ledger-effect" className="rounded-xl bg-bos-raised px-4 py-3 text-sm text-bos-text">
                    {effectText(type, Number.isNaN(weekly) ? undefined : weekly)}
                </p>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">Continuar</Button>
                </div>
            </form>

            {step === 'pin' && (
                <PinConfirm title={`Confirmar ${TYPE_LABELS[type].toLowerCase()}`} confirmLabel="Registrar con PIN" fixedComment={reason.trim()}
                    summary={(
                        <div className="space-y-1" data-testid="ledger-summary">
                            <p><strong>{TYPE_LABELS[type]}</strong> · {money(amount)} · {personName}{givesMoney ? ` · sale de ${PAID_FROM_LABELS[paidFrom].toLowerCase()}` : ''}</p>
                            <p className="text-sm text-bos-muted">{effectText(type, Number.isNaN(weekly) ? undefined : weekly)}</p>
                        </div>
                    )}
                    onClose={() => setStep('form')}
                    onConfirm={async ({ pin }) => {
                        const body: Record<string, unknown> = {
                            employee_id: person, entry_type: type, amount, reason: reason.trim(),
                            paid_from: givesMoney ? paidFrom : null, idempotency_key: key, pin,
                        };
                        if (givesMoney && paidFrom === 'bank') body.method = 'transfer';
                        if (givesMoney && paidFrom === 'envelope' && envelope) body.envelope_id = envelope.id;
                        if (type === 'loan') body.weekly_amount = weekly;
                        if (type === 'loan_payment') body.loan_id = loanId;
                        const { status, data } = await sendJson<{ envelope_balance: number | null }>('/api/employee-ledger', 'POST', body, 'No se pudo registrar el movimiento.');
                        const left = givesMoney && paidFrom === 'envelope' && data.envelope_balance !== null && data.envelope_balance !== undefined ? ` Saldo del sobre: ${money(data.envelope_balance)}.` : '';
                        toast.success(status === 200 ? 'Este movimiento ya estaba registrado; no se duplicó.' : `${TYPE_LABELS[type]} registrado. ${effectText(type, Number.isNaN(weekly) ? undefined : weekly)}${left}`);
                        await refresh();
                        onDone?.();
                    }} />
            )}
        </Card>
    );
}
