'use client';

import React, { useState } from 'react';
import { Save } from 'lucide-react';
import PinConfirm from '@/components/ui/PinConfirm';
import { formatMoney } from '@/lib/utils/money';

export type CashSettingsValues = { float_target: number; reserve_amount: number; reserve_label: string };

/**
 * Ajustes de caja (fondo para el día siguiente y apartado diario). Los cambian el dueño y la
 * gerencia, siempre con su PIN y un comentario (POST /api/cash/settings → set_cash_settings_confirmed).
 */
export default function CashSettingsEditor({ initial, onSaved }: { initial: CashSettingsValues; onSaved?: (values: CashSettingsValues) => void }) {
    const [values, setValues] = useState<CashSettingsValues>(initial);
    const [saved, setSaved] = useState<CashSettingsValues>(initial);
    const [confirming, setConfirming] = useState(false);
    const [message, setMessage] = useState('');
    const changed = values.float_target !== saved.float_target || values.reserve_amount !== saved.reserve_amount || values.reserve_label.trim() !== saved.reserve_label;
    const invalid = !(values.float_target >= 0) || !(values.reserve_amount >= 0) || values.reserve_label.trim().length < 2;

    const label = 'block text-[13px] font-medium text-bos-muted mb-1.5';
    const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';

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
                <button type="button" disabled={!changed || invalid} onClick={() => setConfirming(true)}
                    className="w-full sm:w-auto min-h-[52px] px-6 rounded-xl border border-bos-border text-bos-text text-[15px] font-semibold hover:bg-bos-raised inline-flex items-center justify-center gap-2 disabled:opacity-50">
                    <Save className="h-5 w-5" /> Guardar ajustes de caja
                </button>
            </div>
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
        </div>
    );
}
