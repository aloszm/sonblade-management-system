'use client';

import React, { useState } from 'react';
import { Info, Lock, Save } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Field from '@/components/ui/Field';
import PinConfirm from '@/components/ui/PinConfirm';
import Switch from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { sendJson } from '@/lib/money/client';
import { formatDateTime } from '@/lib/utils/dates';
import type { BookingSettingsView } from '@/lib/booking/settings-view';

type Draft = { enabled: boolean; lead_minutes: string; max_days_ahead: string; cancel_hours: string; max_online_per_day: string };

const toDraft = (s: BookingSettingsView): Draft => ({
    enabled: s.enabled,
    lead_minutes: String(s.lead_minutes),
    max_days_ahead: String(s.max_days_ahead),
    cancel_hours: String(s.cancel_hours),
    max_online_per_day: String(s.max_online_per_day),
});

const FIELDS: { key: Exclude<keyof Draft, 'enabled'>; label: string; unit: string; min: number; max: number; hint: string }[] = [
    { key: 'lead_minutes', label: 'Anticipación mínima para reservar (minutos)', unit: 'minutos', min: 0, max: 1440,
        hint: 'Con menos tiempo que este, el cliente ya no puede reservar por la página. De 0 a 1,440 (un día).' },
    { key: 'max_days_ahead', label: 'Días hacia adelante', unit: 'días', min: 1, max: 90,
        hint: 'Hasta cuántos días antes se puede reservar. De 1 a 90.' },
    { key: 'cancel_hours', label: 'Horas mínimas para cancelar', unit: 'horas', min: 0, max: 72,
        hint: 'Pasado este límite, el cliente ya no puede cancelar con su enlace y debe llamar. De 0 a 72.' },
    { key: 'max_online_per_day', label: 'Máximo de reservas en línea por día', unit: 'reservas', min: 1, max: 200,
        hint: 'Tope de reservas que pueden entrar por la página en un mismo día. De 1 a 200.' },
];

/** Valor entero dentro de rango, o null si el campo está vacío, tiene decimales o se sale del rango. */
function parseWhole(text: string, min: number, max: number): number | null {
    if (!/^\d+$/.test(text.trim())) return null;
    const n = Number(text);
    return n >= min && n <= max ? n : null;
}

interface Props {
    settings: BookingSettingsView;
    /** Solo la cuenta principal puede cambiar; gerencia ve todo en solo lectura. */
    canEdit: boolean;
    onSaved: (settings: BookingSettingsView) => void;
}

/**
 * Interruptor de reservas en línea y sus reglas. Guardar pide el PIN de la cuenta principal
 * (PUT /api/booking-settings); la base vuelve a validar quién es y registra el cambio en la bitácora.
 */
export default function BookingSettingsForm({ settings, canEdit, onSaved }: Props) {
    const toast = useToast();
    const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
    const [confirming, setConfirming] = useState(false);
    const [touched, setTouched] = useState(false);

    const saved = toDraft(settings);
    const changed = (Object.keys(saved) as (keyof Draft)[]).some((k) => draft[k] !== saved[k]);
    const parsed = FIELDS.map((f) => ({ f, value: parseWhole(draft[f.key], f.min, f.max) }));
    const invalid = parsed.some((p) => p.value === null);
    const update = (patch: Partial<Draft>) => { setTouched(false); setDraft((d) => ({ ...d, ...patch })); };

    const startSave = () => {
        setTouched(true);
        if (!invalid) setConfirming(true);
    };

    const confirm = async ({ pin, comment }: { pin: string; comment: string }) => {
        const body = {
            enabled: draft.enabled,
            lead_minutes: Number(draft.lead_minutes),
            max_days_ahead: Number(draft.max_days_ahead),
            cancel_hours: Number(draft.cancel_hours),
            max_online_per_day: Number(draft.max_online_per_day),
            comment, pin,
        };
        const { data } = await sendJson<{ settings: BookingSettingsView }>('/api/booking-settings', 'PUT', body, 'No se pudo guardar el cambio.');
        setConfirming(false);
        toast.success(data.settings.enabled ? 'Reservas en línea encendidas.' : 'Reservas en línea apagadas.');
        onSaved(data.settings);
        setDraft(toDraft(data.settings));
    };

    const summary = (
        <dl className="space-y-1">
            {draft.enabled !== saved.enabled && (
                <div className="flex justify-between gap-3"><dt className="text-bos-muted">Reservas en línea</dt>
                    <dd><strong>{saved.enabled ? 'Encendidas' : 'Apagadas'} → {draft.enabled ? 'Encendidas' : 'Apagadas'}</strong></dd></div>
            )}
            {FIELDS.filter((f) => draft[f.key] !== saved[f.key]).map((f) => (
                <div key={f.key} className="flex justify-between gap-3"><dt className="text-bos-muted">{f.label.replace(/ \(minutos\)$/, '')}</dt>
                    <dd className="tabular-nums">{saved[f.key]} → <strong>{draft[f.key]}</strong></dd></div>
            ))}
        </dl>
    );

    const lastChange = settings.last_changed_at
        ? `Último cambio: ${settings.last_changed_by ?? 'alguien del equipo'} · ${formatDateTime(settings.last_changed_at)}`
        : 'Todavía no se ha cambiado desde que se instaló esta función.';

    return (
        <div className="space-y-6">
            {!canEdit && (
                <p role="status" data-testid="booking-readonly" className="flex items-start gap-3 rounded-xl border border-bos-border bg-bos-surface px-4 py-3 text-sm text-bos-muted">
                    <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span><strong className="text-bos-text">Solo la cuenta principal puede cambiar esto.</strong> Aquí puedes ver cómo están las reservas en línea, sin modificarlas.</span>
                </p>
            )}

            <Card as="section" aria-labelledby="booking-switch-title" className="space-y-4">
                <h2 id="booking-switch-title" className="font-display text-lg font-semibold">
                    Reservas en línea: <span data-testid="booking-state">{draft.enabled ? 'encendidas' : 'apagadas'}</span>
                </h2>
                <Switch id="booking-enabled" label="Reservas en línea" checked={draft.enabled} disabled={!canEdit}
                    stateText={draft.enabled ? 'Encendidas' : 'Apagadas'} aria-describedby="booking-switch-help"
                    onChange={(enabled) => update({ enabled })} />
                <p id="booking-switch-help" className="flex items-start gap-2 text-sm text-bos-muted">
                    <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Apagadas, la página pública no deja reservar y en su lugar aparece «Agenda por WhatsApp». Puede tardar hasta 5 minutos en reflejarse en la portada. Las citas que ya existen no se tocan.</span>
                </p>
                <p data-testid="booking-last-change" className="text-sm text-bos-muted">{lastChange}</p>
            </Card>

            <Card as="section" aria-labelledby="booking-rules-title" className="space-y-5">
                <h2 id="booking-rules-title" className="font-display text-lg font-semibold">Reglas de la reserva</h2>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {parsed.map(({ f, value }) => (
                        <Field key={f.key} id={`booking-${f.key}`} label={f.label} type="number" inputMode="numeric" min={f.min} max={f.max} step={1}
                            value={draft[f.key]} disabled={!canEdit} hint={f.hint}
                            error={touched && value === null ? `Escribe un número entero de ${f.min} a ${f.max}.` : undefined}
                            onChange={(e) => update({ [f.key]: e.target.value } as Partial<Draft>)} className="font-semibold tabular-nums" />
                    ))}
                </div>
            </Card>

            {canEdit && (
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                    {changed && <p role="status" className="text-sm text-bos-muted sm:mr-auto">Tienes cambios sin guardar.</p>}
                    <Button onClick={startSave} disabled={!changed} className="sm:min-w-56">
                        <Save aria-hidden="true" className="h-5 w-5" /> Guardar cambios
                    </Button>
                </div>
            )}

            {confirming && (
                <PinConfirm title="Cambiar las reservas en línea" confirmLabel="Guardar con PIN" summary={summary}
                    commentPlaceholder="Ej: Apagamos las reservas por el evento del sábado"
                    onClose={() => setConfirming(false)} onConfirm={confirm} />
            )}
        </div>
    );
}
