'use client';

import React, { useCallback, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import type { Appointment } from '@/types';
import { sentLabel } from '@/lib/notifications/sent-label';
import { HttpError, toUserMessage } from '@/lib/utils/errors';

export type WaKind = 'confirmacion' | 'recordatorio';

export const NO_PHONE_MESSAGE = 'Este cliente no tiene teléfono registrado. Agrégalo (10 dígitos) en su ficha o al reprogramar la cita.';
export const WA_HELP = 'Se abre tu WhatsApp con el mensaje listo; el sistema anota que lo abriste, no puede saber si se envió.';

/**
 * WhatsApp de un clic. Los navegadores del teléfono (Safari de iPhone, Chrome de Android) solo dejan abrir una
 * pestaña si ocurre DENTRO del toque; pero el enlace llega después de preguntarle al servidor. Por eso la pestaña
 * se abre en blanco en el mismo instante del toque y, al llegar la respuesta, se le asigna la dirección de WhatsApp.
 * Si el navegador la bloqueó (o se cerró), queda un enlace «Abrir WhatsApp» visible.
 */
export function useWhatsAppSend(onSent: () => void | Promise<void>) {
    const [busy, setBusy] = useState<WaKind | null>(null);
    const [error, setError] = useState('');
    const [link, setLink] = useState<string | null>(null);

    const send = useCallback(async (appointmentId: string, kind: WaKind): Promise<boolean> => {
        setError('');
        setLink(null);
        let tab: Window | null = null;
        try {
            tab = window.open('', '_blank');
            // Mientras llega la respuesta, la pestaña no se ve vacía.
            tab?.document?.write?.('<p style="font-family:sans-serif;padding:24px">Abriendo WhatsApp…</p>');
        } catch { /* sin pestaña: queda el enlace visible */ }
        setBusy(kind);
        try {
            const res = await fetch(`/api/appointments/${appointmentId}/notifications`, {
                method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }),
            });
            const body = await res.json().catch(() => null) as { url?: string; error?: unknown; code?: string } | null;
            if (!res.ok || !body?.url) {
                try { tab?.close(); } catch { /* ya cerrada */ }
                if (res.status === 422 && body?.code === 'no_phone') setError(NO_PHONE_MESSAGE);
                else setError(toUserMessage(new HttpError(res.status, typeof body?.error === 'string' ? body.error : undefined), 'No se pudo preparar el mensaje.'));
                return false;
            }
            let opened = false;
            try {
                if (tab && !tab.closed) { tab.opener = null; tab.location.href = body.url; opened = true; }
            } catch { opened = false; }
            if (!opened) setLink(body.url);
            await onSent();
            return true;
        } catch (err) {
            try { tab?.close(); } catch { /* ya cerrada */ }
            setError(toUserMessage(err, 'No se pudo preparar el mensaje.'));
            return false;
        } finally {
            setBusy(null);
        }
    }, [onSent]);

    return { send, busy, error, link, clearLink: () => setLink(null) };
}

/** Enlace de respaldo cuando el navegador bloqueó la pestaña. */
export function WaFallbackLink({ href }: { href: string }) {
    return (
        <a href={href} target="_blank" rel="noopener noreferrer" data-testid="wa-fallback"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-bos-accent px-4 text-sm font-bold text-bos-accent-text">
            <MessageCircle aria-hidden="true" className="h-4 w-4" /> Abrir WhatsApp
        </a>
    );
}

const KINDS: { kind: WaKind; field: 'confirmation' | 'reminder'; button: string; noun: string }[] = [
    { kind: 'confirmacion', field: 'confirmation', button: 'Enviar confirmación', noun: 'Confirmación' },
    { kind: 'recordatorio', field: 'reminder', button: 'Enviar recordatorio', noun: 'Recordatorio' },
];

/** ¿Tiene sentido avisarle al cliente? Solo citas que siguen por venir y sin cobrar. */
export const canNotify = (apt: Pick<Appointment, 'status' | 'sale'>) => !apt.sale && (apt.status === 'scheduled' || apt.status === 'confirmed');

interface WhatsAppActionsProps {
    apt: Appointment;
    /** Dueño, gerencia y recepción mandan; el barbero solo ve el estado. */
    canSend: boolean;
    onSent: () => void | Promise<void>;
}

/** Botones «Enviar confirmación» y «Enviar recordatorio» de una cita, con quién y cuándo se abrió cada uno. */
export function WhatsAppActions({ apt, canSend, onSent }: WhatsAppActionsProps) {
    const wa = useWhatsAppSend(onSent);
    const notes = apt.notifications;
    if (!canSend) {
        // El barbero no manda mensajes: solo ve si ya se avisó al cliente (si la API se lo entrega).
        const seen = KINDS.filter((k) => notes?.[k.field]);
        if (seen.length === 0) return null;
        return (
            <div data-testid="wa-status" className="mt-3 space-y-0.5 text-sm text-bos-muted">
                {seen.map((k) => { const text = sentLabel(notes![k.field]!); return <p key={k.kind}>{k.noun}: {text.charAt(0).toLowerCase()}{text.slice(1)}</p>; })}
            </div>
        );
    }
    if (!canNotify(apt)) return null;
    return (
        <section aria-label="Avisar al cliente por WhatsApp" data-testid="wa-actions" className="mt-4 border-t border-bos-border pt-4">
            <p className="text-xs font-medium text-bos-muted">Avisar al cliente por WhatsApp</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {KINDS.map((k) => {
                    const last = notes?.[k.field] ?? null;
                    return (
                        <div key={k.kind}>
                            <Button variant="secondary" size="md" fullWidth data-testid={`wa-${k.kind}`} loading={wa.busy === k.kind} loadingText="Abriendo…"
                                disabled={wa.busy !== null} onClick={() => { void wa.send(apt.id, k.kind); }}>
                                <MessageCircle aria-hidden="true" className="h-5 w-5" /> {k.button}
                            </Button>
                            {last && <p data-testid={`wa-sent-${k.kind}`} className="mt-1.5 text-sm text-bos-muted">{sentLabel(last)}</p>}
                        </div>
                    );
                })}
            </div>
            {wa.error && <p role="alert" data-testid="wa-error" className="mt-3 rounded-xl bg-bos-raised p-3 text-sm font-medium text-bos-danger">{wa.error}</p>}
            {wa.link && (
                <div className="mt-3 space-y-1.5">
                    <p className="text-sm text-bos-muted">Tu navegador bloqueó la ventana. Toca aquí para abrir el mensaje:</p>
                    <WaFallbackLink href={wa.link} />
                </div>
            )}
            <p className="mt-3 text-xs text-bos-muted">{WA_HELP}</p>
        </section>
    );
}
