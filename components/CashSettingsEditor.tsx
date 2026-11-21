'use client';

import React, { useEffect, useState } from 'react';
import { HandCoins, Save } from 'lucide-react';
import PinConfirm from '@/components/ui/PinConfirm';
import { formatMoney } from '@/lib/utils/money';

export type CashSettingsValues = { float_target: number; reserve_amount: number; reserve_label: string };
export type WithdrawalRecipientValue = { user_id: string; name: string } | null;
type Candidate = { userId: string; name: string };

/**
 * Ajustes de caja (fondo para el día siguiente y apartado diario). Los cambian el dueño y la
 * gerencia, siempre con su PIN y un comentario (POST /api/cash/settings → set_cash_settings_confirmed).
 *
 * También muestra a quién se entrega el retiro del cierre. Eso solo lo cambia la cuenta principal, con su PIN
 * (POST /api/cash/settings/withdrawal-recipient → set_cash_withdrawal_recipient); los demás solo lo leen.
 */
export default function CashSettingsEditor({ initial, onSaved, recipient = null, canSetRecipient = false, onRecipientSaved }: {
    initial: CashSettingsValues;
    onSaved?: (values: CashSettingsValues) => void;
    recipient?: WithdrawalRecipientValue;
    canSetRecipient?: boolean;
    onRecipientSaved?: (recipient: WithdrawalRecipientValue) => void;
}) {
    const [values, setValues] = useState<CashSettingsValues>(initial);
    const [saved, setSaved] = useState<CashSettingsValues>(initial);
    const [confirming, setConfirming] = useState(false);
    const [message, setMessage] = useState('');
    const changed = values.float_target !== saved.float_target || values.reserve_amount !== saved.reserve_amount || values.reserve_label.trim() !== saved.reserve_label;
    const invalid = !(values.float_target >= 0) || !(values.reserve_amount >= 0) || values.reserve_label.trim().length < 2;

    const [currentRecipient, setCurrentRecipient] = useState<WithdrawalRecipientValue>(recipient);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [candidatesError, setCandidatesError] = useState('');
    const [pickedRecipient, setPickedRecipient] = useState<string>(recipient?.user_id ?? '');
    const [confirmingRecipient, setConfirmingRecipient] = useState(false);
    const [recipientMessage, setRecipientMessage] = useState('');

    // Solo la cuenta principal elige: la lista son las personas de gerencia o cuenta principal con acceso activo.
    useEffect(() => {
        if (!canSetRecipient) return;
        let alive = true;
        fetch('/api/accounts', { cache: 'no-store' })
            .then(async (res) => {
                const body = await res.json().catch(() => null);
                if (!res.ok) throw new Error(body?.error ?? 'No se pudo cargar la lista de personas.');
                const list = ((body?.accounts ?? []) as { userId: string; name: string; role: string; isActive: boolean }[])
                    .filter((a) => a.isActive && (a.role === 'owner' || a.role === 'admin'))
                    .map((a) => ({ userId: a.userId, name: a.name }));
                if (alive) setCandidates(list);
            })
            .catch((error: unknown) => { if (alive) setCandidatesError(error instanceof Error ? error.message : 'No se pudo cargar la lista de personas.'); });
        return () => { alive = false; };
    }, [canSetRecipient]);

    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
    const button = 'w-full sm:w-auto min-h-[52px] px-6 rounded-xl border border-bos-border text-bos-text text-[15px] font-semibold hover:bg-bos-raised inline-flex items-center justify-center gap-2 disabled:opacity-50';

    const confirm = async ({ pin, comment }: { pin: string; comment: string }) => {
        const res = await fetch('/api/cash/settings', {
            method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...values, reserve_label: values.reserve_label.trim(), pin, comment }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? 'No se pudieron guardar los ajustes de caja.');
        const next = { ...values, reserve_label: values.reserve_label.trim() };
        setSaved(next);
        setConfirming(false);
        setMessage('Ajustes de caja guardados.');
        onSaved?.(next);
    };

    const pickedName = candidates.find((c) => c.userId === pickedRecipient)?.name ?? '';
    const recipientChanged = pickedRecipient !== (currentRecipient?.user_id ?? '');
    const confirmRecipient = async ({ pin, comment }: { pin: string; comment: string }) => {
        const res = await fetch('/api/cash/settings/withdrawal-recipient', {
            method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: pickedRecipient || null, pin, comment }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? 'No se pudo cambiar quién recibe el retiro.');
        const next: WithdrawalRecipientValue = pickedRecipient ? { user_id: pickedRecipient, name: (body?.withdrawal_recipient?.name as string | undefined) ?? pickedName } : null;
        setCurrentRecipient(next);
        setConfirmingRecipient(false);
        setRecipientMessage(next ? `El retiro se entrega a ${next.name}.` : 'El retiro ya no tiene una persona fija.');
        onRecipientSaved?.(next);
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                    <label htmlFor="cash-float" className={label}>Fondo para el día siguiente ($)</label>
                    <input id="cash-float" type="number" inputMode="decimal" min={0} step={50} required value={values.float_target}
                        onChange={(e) => { setMessage(''); setValues({ ...values, float_target: Number(e.target.value) }); }} className={field} />
                </div>
                <div>
                    <label htmlFor="cash-reserve" className={label}>Apartado diario ($)</label>
                    <input id="cash-reserve" type="number" inputMode="decimal" min={0} step={50} required value={values.reserve_amount}
                        onChange={(e) => { setMessage(''); setValues({ ...values, reserve_amount: Number(e.target.value) }); }} className={field} />
                </div>
                <div>
                    <label htmlFor="cash-reserve-label" className={label}>¿Para qué es el apartado?</label>
                    <input id="cash-reserve-label" type="text" minLength={2} maxLength={60} required value={values.reserve_label}
                        onChange={(e) => { setMessage(''); setValues({ ...values, reserve_label: e.target.value }); }} className={field} />
                </div>
            </div>
            {message && <p role="status" className="text-sm text-bos-success">{message}</p>}
            <div className="flex justify-end">
                <button type="button" disabled={!changed || invalid} onClick={() => setConfirming(true)} className={button}>
                    <Save className="h-5 w-5" /> Guardar ajustes de caja
                </button>
            </div>

            <section aria-labelledby="cash-recipient-title" data-testid="cash-recipient" className="border-t border-bos-border pt-4 space-y-3">
                <h3 id="cash-recipient-title" className="flex items-center gap-2 text-[15px] font-semibold text-bos-text">
                    <HandCoins aria-hidden="true" className="h-5 w-5 text-bos-accent-text" /> ¿A quién se entrega el retiro?
                </h3>
                <p className="text-sm text-bos-muted">
                    Al cerrar la caja, primero se deja el fondo y se aparta lo del sobre; lo que sobra es el retiro y se le entrega a esta persona. Queda anotado en cada cierre.
                </p>
                {canSetRecipient ? (
                    <>
                        <div>
                            <label htmlFor="cash-recipient-select" className={label}>Persona que recibe el retiro</label>
                            <select id="cash-recipient-select" value={pickedRecipient} onChange={(e) => { setRecipientMessage(''); setPickedRecipient(e.target.value); }} className={field}>
                                <option value="">Sin persona fija (se escribe al cerrar)</option>
                                {/* Si la persona guardada no viene en la lista (aún cargando), se conserva su opción. */}
                                {currentRecipient && !candidates.some((c) => c.userId === currentRecipient.user_id) && <option value={currentRecipient.user_id}>{currentRecipient.name}</option>}
                                {candidates.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
                            </select>
                            <p className="mt-1.5 text-xs text-bos-muted">Solo gerencia o la cuenta principal pueden recibirlo. Se cambia con tu PIN y un comentario.</p>
                        </div>
                        {candidatesError && <p role="alert" className="text-sm text-bos-danger">{candidatesError}</p>}
                        {recipientMessage && <p role="status" className="text-sm text-bos-success">{recipientMessage}</p>}
                        <div className="flex justify-end">
                            <button type="button" disabled={!recipientChanged} onClick={() => setConfirmingRecipient(true)} className={button}>
                                <Save className="h-5 w-5" /> Guardar quién recibe el retiro
                            </button>
                        </div>
                    </>
                ) : (
                    <p className="text-[15px] text-bos-text">
                        {currentRecipient ? <>Se entrega a <strong>{currentRecipient.name}</strong>.</> : 'Todavía no hay una persona fija: se escribe al cerrar.'}{' '}
                        <span className="text-bos-muted">Solo la cuenta principal lo cambia.</span>
                    </p>
                )}
            </section>

            {confirming && (
                <PinConfirm title="Cambiar ajustes de caja" onClose={() => setConfirming(false)} onConfirm={confirm}
                    commentPlaceholder="Ej: Alonso pidió subir el fondo por la temporada"
                    summary={(
                        <dl className="space-y-1">
                            <div className="flex justify-between gap-3"><dt className="text-bos-muted">Fondo para mañana</dt><dd className="tabular-nums">{formatMoney(saved.float_target)} → <strong>{formatMoney(values.float_target)}</strong></dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-bos-muted">Apartado diario</dt><dd className="tabular-nums">{formatMoney(saved.reserve_amount)} → <strong>{formatMoney(values.reserve_amount)}</strong></dd></div>
                        </dl>
                    )} />
            )}
            {confirmingRecipient && (
                <PinConfirm title="Cambiar quién recibe el retiro" onClose={() => setConfirmingRecipient(false)} onConfirm={confirmRecipient}
                    commentPlaceholder="Ej: El sobrante de cada cierre se entrega a Sonia"
                    summary={(
                        <dl className="space-y-1">
                            <div className="flex justify-between gap-3"><dt className="text-bos-muted">Recibe el retiro</dt><dd>{currentRecipient?.name ?? 'Sin persona fija'} → <strong>{pickedRecipient ? pickedName || currentRecipient?.name : 'Sin persona fija'}</strong></dd></div>
                        </dl>
                    )} />
            )}
        </div>
    );
}
