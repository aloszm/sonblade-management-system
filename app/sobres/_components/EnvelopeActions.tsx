'use client';

import React, { useState } from 'react';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import Modal from '@/components/ui/Modal';
import PinConfirm from '@/components/ui/PinConfirm';
import { useToast } from '@/components/ui/Toast';
import { formatMoney } from '@/lib/utils/money';
import { hasValidCents, newIdempotencyKey, parseAmount, sendJson } from '@/lib/money/client';
import type { Envelope } from './data';

const money = (n: number) => formatMoney(n, { cents: true });

interface Props {
    envelope: Envelope;
    onClose: () => void;
    onDone: () => void;
}

/** Texto de la diferencia: "El sistema dice $X, contaste $Y, diferencia $Z". */
export function differenceText(system: number, counted: number): string {
    const diff = Math.round((counted - system) * 100) / 100;
    const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    return `El sistema dice ${money(system)}, contaste ${money(counted)}, diferencia ${sign}${money(Math.abs(diff))}`;
}

/** Ajuste por conteo físico: se manda LO CONTADO (la base calcula la diferencia) y se confirma con PIN. */
export function AdjustEnvelope({ envelope, onClose, onDone }: Props) {
    const toast = useToast();
    // La clave se genera al abrir, no en cada clic: un reintento no duplica el ajuste.
    const [key] = useState(newIdempotencyKey);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [step, setStep] = useState<'form' | 'pin'>('form');
    const counted = parseAmount(text);

    const next = (e: React.FormEvent) => {
        e.preventDefault();
        if (Number.isNaN(counted)) return setError('Escribe lo que contaste en el sobre.');
        if (counted < 0) return setError('El conteo no puede ser negativo.');
        if (counted > 1_000_000) return setError('El conteo no puede pasar de 1,000,000.');
        if (!hasValidCents(counted)) return setError('El conteo lleva máximo 2 decimales.');
        setError('');
        setStep('pin');
    };

    if (step === 'pin') {
        return (
            <PinConfirm title="Confirmar ajuste del sobre" confirmLabel="Ajustar con PIN"
                commentLabel="Comentario: ¿por qué ajustas el sobre?" commentPlaceholder="Ej: Conteo de la semana"
                summary={<p data-testid="adjust-summary">{differenceText(envelope.balance, counted)}</p>}
                onClose={onClose}
                onConfirm={async ({ pin, comment }) => {
                    const { data } = await sendJson<{ balance: number; difference: number | null }>(
                        `/api/envelopes/${envelope.id}/adjust`, 'POST',
                        { counted_balance: counted, comment, pin, idempotency_key: key }, 'No se pudo ajustar el sobre.');
                    toast.success(`Sobre ajustado. Saldo: ${money(data.balance)}.`);
                    onDone();
                }} />
        );
    }
    return (
        <Modal title="Ajustar por conteo" subtitle={`Sobre «${envelope.name}»`} onClose={onClose}>
            <form onSubmit={next} className="space-y-4" noValidate>
                <Field id="adjust-counted" label="Lo que contaste en el sobre ($)" type="text" inputMode="decimal" autoComplete="off"
                    value={text} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder="0.00"
                    error={error} className="font-semibold" hint="Cuenta el efectivo que hay ahora en el sobre." />
                {!Number.isNaN(counted) && hasValidCents(counted) && counted >= 0 && (
                    <p role="status" data-testid="adjust-diff" className="rounded-xl bg-bos-raised px-4 py-3 text-[15px]">{differenceText(envelope.balance, counted)}</p>
                )}
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit">Continuar</Button>
                </div>
            </form>
        </Modal>
    );
}

/** Depósito al banco desde el sobre (sale efectivo del sobre). Con PIN; el servidor responde 409 si no alcanza. */
export function DepositEnvelope({ envelope, onClose, onDone }: Props) {
    const toast = useToast();
    const [key] = useState(newIdempotencyKey);
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [step, setStep] = useState<'form' | 'pin'>('form');
    const amount = parseAmount(text);
    const short = !Number.isNaN(amount) && amount > envelope.balance;

    const next = (e: React.FormEvent) => {
        e.preventDefault();
        if (Number.isNaN(amount) || amount <= 0) return setError('Escribe cuánto vas a depositar (más de $0).');
        if (amount > 1_000_000) return setError('El monto no puede pasar de 1,000,000.');
        if (!hasValidCents(amount)) return setError('El monto lleva máximo 2 decimales.');
        if (amount > envelope.balance) return setError(`No alcanza: el sobre tiene ${money(envelope.balance)}.`);
        setError('');
        setStep('pin');
    };

    if (step === 'pin') {
        return (
            <PinConfirm title="Confirmar depósito al banco" confirmLabel="Depositar con PIN"
                commentLabel="Comentario: ¿a qué cuenta o con qué ficha?" commentPlaceholder="Ej: Depósito semanal, ficha 4521"
                summary={<p>Saldrán <strong>{money(amount)}</strong> del sobre «{envelope.name}» y quedarán {money(envelope.balance - amount)}.</p>}
                onClose={onClose}
                onConfirm={async ({ pin, comment }) => {
                    const { data } = await sendJson<{ balance: number }>(
                        `/api/envelopes/${envelope.id}/deposit`, 'POST',
                        { amount, comment, pin, idempotency_key: key }, 'No se pudo registrar el depósito.');
                    toast.success(`Depósito registrado. Saldo del sobre: ${money(data.balance)}.`);
                    onDone();
                }} />
        );
    }
    return (
        <Modal title="Depositar al banco" subtitle={`Sobre «${envelope.name}» · saldo ${money(envelope.balance)}`} onClose={onClose}>
            <form onSubmit={next} className="space-y-4" noValidate>
                <Field id="deposit-amount" label="Monto a depositar ($)" type="text" inputMode="decimal" autoComplete="off"
                    value={text} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder="0.00"
                    error={error || (short ? `No alcanza: el sobre tiene ${money(envelope.balance)}.` : '')} className="font-semibold"
                    hint="El efectivo sale del sobre y entra al banco." />
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" disabled={short}>Continuar</Button>
                </div>
            </form>
        </Modal>
    );
}
