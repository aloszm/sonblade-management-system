'use client';

import React, { useEffect, useState } from 'react';
import { bookingApi } from '@/lib/booking-ui/api';
import type { BookingError } from '@/lib/booking-ui/errors';
import { formatWait } from '@/lib/booking-ui/errors';
import { validateName, validatePhone } from '@/lib/booking-ui/validation';
import { PRIVACY_NOTICE_VERSION, PRIVACY_SIMPLIFIED } from '@/lib/booking-ui/privacy';
import type { BookingConfig, BookingService, BookingSummary } from '@/lib/booking-ui/types';
import BookingCard from './BookingCard';
import type { Selection } from './WhenStep';
import { BackButton, ErrorNote, PRIMARY_BTN, StepHeading, StickyBar } from './parts';

export interface Created { token: string; booking: BookingSummary }

export default function DetailsStep({ config, service, sel, onBack, onDone, onSlotTaken }: {
    config: BookingConfig; service: BookingService; sel: Selection;
    onBack: () => void; onDone: (c: Created) => void; onSlotTaken: (message: string) => void;
}) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [accept, setAccept] = useState(false);
    const [website, setWebsite] = useState('');
    const [errors, setErrors] = useState<{ name?: string; phone?: string; accept?: string }>({});
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

    const barberName = sel.barber === 'any' || !sel.barber ? 'Cualquiera libre' : sel.barber.name;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy || waitLeft > 0 || !sel.date || !sel.time) return;
        const n = validateName(name), p = validatePhone(phone);
        const next = { name: n.ok ? undefined : n.error, phone: p.ok ? undefined : p.error, accept: accept ? undefined : 'Marca la casilla para poder reservar.' };
        setErrors(next);
        setFormError(null);
        if (!n.ok || !p.ok || !accept) {
            document.getElementById(!n.ok ? 'bk-name' : !p.ok ? 'bk-phone' : 'bk-accept')?.focus();
            return;
        }
        setBusy(true);
        const r = await bookingApi.create({
            service_id: service.id, barber_id: sel.barber && sel.barber !== 'any' ? sel.barber.id : null,
            date: sel.date, time: sel.time, name: n.value, phone: p.value, accept_privacy: true, website,
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

    const input = (bad?: string) => `block h-12 w-full rounded-xl border bg-bos-surface px-3 text-base text-bos-text placeholder:text-bos-muted ${bad ? 'border-bos-danger' : 'border-bos-control'}`;
    const fieldErr = (id: string, msg?: string) => msg ? <p id={id} role="alert" className="mt-1 text-sm text-bos-danger">{msg}</p> : null;
    const rateMsg = formError?.kind === 'rate_limited' && waitLeft > 0
        ? `Hiciste muchos intentos seguidos. Puedes volver a intentar en ${formatWait(waitLeft)}.` : formError?.message;

    return (
        <section aria-label="Tus datos">
            <BackButton onClick={onBack} />
            <StepHeading focusKey="details" hint="Con tu nombre y teléfono te guardamos la cita. No necesitas cuenta.">Tus datos</StepHeading>

            <div className="mb-5">
                <BookingCard thisYear={config.today.slice(0, 4)} d={{
                    service: service.name, price: service.price, variable: service.variable_price, duration: service.duration_minutes,
                    barber: barberName, date: sel.date ?? '', label: sel.label ?? '',
                }} />
            </div>

            <form onSubmit={submit} noValidate className="space-y-4">
                <div>
                    <label htmlFor="bk-name" className="mb-1 block text-sm font-medium text-bos-text">Tu nombre</label>
                    <input id="bk-name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80}
                        aria-invalid={!!errors.name} aria-describedby={errors.name ? 'bk-name-err' : undefined} className={input(errors.name)} placeholder="Como te llaman" />
                    {fieldErr('bk-name-err', errors.name)}
                </div>
                <div>
                    <label htmlFor="bk-phone" className="mb-1 block text-sm font-medium text-bos-text">Tu teléfono (10 dígitos)</label>
                    <input id="bk-phone" name="tel" type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20}
                        aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'bk-phone-err' : 'bk-phone-hint'} className={input(errors.phone)} placeholder="55 1234 5678" />
                    <p id="bk-phone-hint" className="mt-1 text-xs text-bos-muted">Solo lo usamos para gestionar tu cita (confirmación y recordatorio por WhatsApp).</p>
                    {fieldErr('bk-phone-err', errors.phone)}
                </div>

                {/* Campo trampa: las personas no lo ven ni lo llenan; los robots sí. */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
                    <label>Sitio web<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
                </div>

                <div data-testid="privacy-summary" className="rounded-xl border border-bos-border bg-bos-surface p-3 text-sm text-bos-text">
                    <p>Al reservar aceptas el <a href={config.privacy.url} target="_blank" rel="noopener noreferrer" className="font-medium text-bos-accent-text underline underline-offset-2">aviso de privacidad</a>: usaremos tu nombre y teléfono solo para gestionar tu cita. No usamos tus datos para publicidad.</p>
                    <details className="mt-2">
                        <summary className="min-h-11 cursor-pointer py-2 text-bos-accent-text">Ver resumen del aviso (versión {PRIVACY_NOTICE_VERSION})</summary>
                        <dl className="space-y-2 pb-1 text-xs text-bos-muted">
                            {PRIVACY_SIMPLIFIED.map((r) => (
                                <div key={r.label}><dt className="font-semibold text-bos-text">{r.label}</dt><dd>{r.text}</dd></div>
                            ))}
                        </dl>
                    </details>
                </div>

                <div>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
                        <input id="bk-accept" type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)}
                            aria-invalid={!!errors.accept} aria-describedby={errors.accept ? 'bk-accept-err' : undefined}
                            className="bos-check mt-0.5 h-6 w-6 shrink-0" />
                        <span className="text-sm text-bos-text">He leído el <a href={config.privacy.url} target="_blank" rel="noopener noreferrer" className="font-medium text-bos-accent-text underline underline-offset-2">aviso de privacidad</a> (se abre en otra pestaña).</span>
                    </label>
                    {fieldErr('bk-accept-err', errors.accept)}
                </div>

                {formError && <ErrorNote>{rateMsg}</ErrorNote>}

                <StickyBar>
                    <button type="submit" disabled={busy || waitLeft > 0} className={PRIMARY_BTN}>
                        {busy ? 'Reservando...' : waitLeft > 0 ? `Espera ${formatWait(waitLeft)}` : 'Confirmar reserva'}
                    </button>
                </StickyBar>
            </form>
        </section>
    );
}
