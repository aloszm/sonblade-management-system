'use client';

import React, { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { bookingApi } from '@/lib/booking-ui/api';
import { phoneHref } from '@/lib/booking-ui/business';
import type { BookingError } from '@/lib/booking-ui/errors';
import { formatWait } from '@/lib/booking-ui/errors';
import { validateName, validatePhone } from '@/lib/booking-ui/validation';
import { PRIVACY_NOTICE_VERSION, PRIVACY_SIMPLIFIED } from '@/lib/booking-ui/privacy';
import type { BookingConfig, BookingService, BookingSummary } from '@/lib/booking-ui/types';
import type { Who } from './BarberStep';
import { BottomBar, ErrorNote, LINK, PRIMARY_BTN, StepHeading } from './parts';

export interface Created { token: string; booking: BookingSummary }
export interface ContactForm { name: string; phone: string; accept: boolean }
type FieldErrors = { name?: string; phone?: string; accept?: string };

/** Paso 4: solo nombre y teléfono. Se valida cada campo al salir de él; nada de cuentas. */
export default function DetailsStep({ config, service, who, date, time, form, setForm, summary, onDone, onSlotTaken }: {
    config: BookingConfig; service: BookingService; who: Who; date: string; time: string;
    form: ContactForm; setForm: (f: ContactForm) => void; summary: React.ReactNode;
    onDone: (c: Created) => void; onSlotTaken: (message: string) => void;
}) {
    const [website, setWebsite] = useState('');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<BookingError | null>(null);
    const [busy, setBusy] = useState(false);
    const [waitUntil, setWaitUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!waitUntil) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [waitUntil]);
    const waitLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));
    // El aviso de error queda bajo los campos: se trae a la vista (además de anunciarse con role="alert").
    useEffect(() => { if (formError) document.getElementById('bk-form-error')?.scrollIntoView?.({ block: 'center' }); }, [formError]);

    const check = (field: 'name' | 'phone', value: string) => {
        const r = field === 'name' ? validateName(value) : validatePhone(value);
        setErrors((e) => ({ ...e, [field]: r.ok ? undefined : r.error }));
    };
    // Al escribir solo se quita el error cuando el dato ya es válido; el aviso nuevo llega al salir del campo.
    const change = (field: 'name' | 'phone', value: string) => {
        setForm({ ...form, [field]: value });
        if (errors[field]) {
            const r = field === 'name' ? validateName(value) : validatePhone(value);
            if (r.ok) setErrors((e) => ({ ...e, [field]: undefined }));
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || waitLeft > 0) return;
        const n = validateName(form.name), p = validatePhone(form.phone);
        const next = { name: n.ok ? undefined : n.error, phone: p.ok ? undefined : p.error, accept: form.accept ? undefined : 'Marca la casilla para poder reservar.' };
        setErrors(next);
        setFormError(null);
        if (!n.ok || !p.ok || !form.accept) {
            document.getElementById(!n.ok ? 'bk-name' : !p.ok ? 'bk-phone' : 'bk-accept')?.focus();
            return;
        }
        setBusy(true);
        const r = await bookingApi.create({
            service_id: service.id, barber_id: who === 'any' ? null : who.id,
            date, time, name: n.value, phone: p.value, accept_privacy: true, website,
        });
        setBusy(false);
        if (r.ok) { onDone(r.data); return; }
        const err = r.error;
        if (err.kind === 'slot_taken') { onSlotTaken(err.message); return; }
        if (err.kind === 'rate_limited') { const t = Date.now(); setNow(t); setWaitUntil(t + (err.retryAfter ?? 30) * 1000); }
        if (err.kind === 'validation' && (err.field === 'name' || err.field === 'phone' || err.field === 'accept_privacy')) {
            setErrors({ [err.field === 'accept_privacy' ? 'accept' : err.field]: err.message });
            return;
        }
        setFormError(err);
    };

    const input = (bad?: string) => `block h-14 w-full rounded-xl border bg-bos-surface px-4 text-lg text-bos-text placeholder:text-bos-muted ${bad ? 'border-bos-danger' : 'border-bos-control'}`;
    const fieldErr = (id: string, msg?: string) => msg ? <p id={id} className="mt-1.5 text-base text-bos-danger">{msg}</p> : null;
    const call = (
        <a href={phoneHref(config.business.phone)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-bos-control px-4 text-base font-medium text-bos-text hover:bg-bos-raised">
            <Phone className="h-5 w-5" aria-hidden="true" />Llámanos al {config.business.phone}
        </a>
    );
    const errText = formError?.kind === 'rate_limited'
        ? (waitLeft > 0 ? `Hiciste muchos intentos seguidos. Puedes volver a intentar en ${formatWait(waitLeft)}, o llámanos y te apartamos tu lugar.` : 'Ya puedes volver a intentarlo.')
        : formError?.message;
    const withCall = formError && formError.kind !== 'validation';

    return (
        <section aria-labelledby="gr-step-title">
            <div className="gr-step">
            <StepHeading focusKey="details" hint="Solo tu nombre y tu teléfono. No necesitas crear cuenta.">¿A nombre de quién?</StepHeading>

            <form id="bk-form" onSubmit={submit} noValidate className="space-y-5">
                <div>
                    <label htmlFor="bk-name" className="mb-1.5 block text-base font-medium text-bos-text">Tu nombre</label>
                    <input id="bk-name" name="name" value={form.name} onChange={(e) => change('name', e.target.value)} onBlur={(e) => { if (e.target.value.trim()) check('name', e.target.value); }}
                        autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={80}
                        aria-invalid={!!errors.name} aria-describedby={errors.name ? 'bk-name-err' : undefined} className={input(errors.name)} placeholder="Como te llaman" />
                    <div aria-live="polite">{fieldErr('bk-name-err', errors.name)}</div>
                </div>
                <div>
                    <label htmlFor="bk-phone" className="mb-1.5 block text-base font-medium text-bos-text">Tu teléfono (10 dígitos)</label>
                    <input id="bk-phone" name="tel" type="tel" inputMode="tel" autoComplete="tel-national" enterKeyHint="done" value={form.phone}
                        onChange={(e) => change('phone', e.target.value)} onBlur={(e) => { if (e.target.value.trim()) check('phone', e.target.value); }} maxLength={20}
                        aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'bk-phone-err bk-phone-hint' : 'bk-phone-hint'} className={input(errors.phone)} placeholder="55 1234 5678" />
                    <p id="bk-phone-hint" className="mt-1.5 text-sm text-bos-muted">Solo para tu cita: lo usamos para confirmarla o avisarte de un cambio por WhatsApp.</p>
                    <div aria-live="polite">{fieldErr('bk-phone-err', errors.phone)}</div>
                </div>

                {/* Campo trampa: las personas no lo ven ni lo llenan; los robots sí. */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                    <label>Sitio web<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
                </div>

                <div data-testid="privacy-summary" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-sm text-bos-text">
                    <p>Al reservar aceptas el <a href={config.privacy.url} target="_blank" rel="noopener noreferrer" className={LINK}>aviso de privacidad</a>: usaremos tu nombre y teléfono solo para gestionar tu cita. No usamos tus datos para publicidad.</p>
                    <details className="mt-1">
                        <summary className="min-h-12 cursor-pointer py-3 text-bos-accent-text">Ver resumen del aviso (versión {PRIVACY_NOTICE_VERSION})</summary>
                        <dl className="space-y-2 pb-1 text-sm text-bos-muted">
                            {PRIVACY_SIMPLIFIED.map((r) => (
                                <div key={r.label}><dt className="font-semibold text-bos-text">{r.label}</dt><dd>{r.text}</dd></div>
                            ))}
                        </dl>
                    </details>
                    <label className="mt-1 flex min-h-12 cursor-pointer items-start gap-3 py-1">
                        <input id="bk-accept" type="checkbox" checked={form.accept} onChange={(e) => { setForm({ ...form, accept: e.target.checked }); if (e.target.checked) setErrors((x) => ({ ...x, accept: undefined })); }}
                            aria-invalid={!!errors.accept} aria-describedby={errors.accept ? 'bk-accept-err' : undefined}
                            className="bos-check mt-0.5 h-6 w-6 shrink-0" />
                        <span className="text-base text-bos-text">He leído el <a href={config.privacy.url} target="_blank" rel="noopener noreferrer" className={LINK}>aviso de privacidad</a> (se abre en otra pestaña).</span>
                    </label>
                    <div aria-live="polite">{fieldErr('bk-accept-err', errors.accept)}</div>
                </div>

                {formError && <ErrorNote id="bk-form-error" action={withCall ? call : undefined}>{errText}</ErrorNote>}
            </form>
            </div>

            {/* La barra va fuera del bloque animado: un ancestro con transform la sacaría de su lugar fijo. */}
            <BottomBar summary={summary}>
                <button type="submit" form="bk-form" disabled={busy || waitLeft > 0} className={PRIMARY_BTN}>
                    {busy ? 'Reservando…' : waitLeft > 0 ? `Espera ${formatWait(waitLeft)}` : 'Confirmar cita'}
                </button>
            </BottomBar>
        </section>
    );
}
