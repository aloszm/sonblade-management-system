'use client';

import React, { useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, HelpCircle, Lightbulb, MessageCircle, ShieldAlert } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { FIELD_CLASS, LABEL_CLASS } from '@/components/ui/Field';
import { sendJson } from '@/lib/money/client';
import {
    BODY_MAX, BODY_MIN, FEEDBACK_HREF, FEEDBACK_KINDS, KIND_LABELS, PRIVACY_NOTE,
    type FeedbackDevice, type FeedbackItem, type FeedbackKind,
} from '@/lib/feedback/model';

const KIND_ICONS: Record<FeedbackKind, React.ElementType> = {
    idea: Lightbulb,
    falla: AlertTriangle,
    duda: HelpCircle,
    otro: MessageCircle,
};

interface Props {
    /** Pantalla desde la que se abrió (ya sin datos: '/clientes/[id]'); null si no se reconoce. */
    screen: { path: string; title: string } | null;
    device: FeedbackDevice | null;
    onClose: () => void;
    onSent?: (item: FeedbackItem) => void;
}

/**
 * Ventana "¿Qué mejorarías?": tipo (cuatro botones grandes), texto, aviso de privacidad y Enviar. La pantalla de
 * origen y el dispositivo se mandan solos y se muestran ("Sobre: Agenda"). Al enviar, confirma en la misma ventana.
 */
export default function FeedbackComposer({ screen, device, onClose, onSent }: Props) {
    const [kind, setKind] = useState<FeedbackKind | null>(null);
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);
    const textId = useId();
    const hintId = useId();
    const kindLabelId = useId();

    const length = body.trim().length;
    const tooShort = length < BODY_MIN;
    const tooLong = length > BODY_MAX;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!kind) { setError('Elige qué tipo de comentario es.'); return; }
        if (tooShort) { setError(`Escribe un poco más (mínimo ${BODY_MIN} caracteres).`); return; }
        if (tooLong) { setError(`El comentario es muy largo (máximo ${BODY_MAX.toLocaleString('es-MX')} caracteres).`); return; }
        setSending(true);
        setError(null);
        try {
            const { data } = await sendJson<{ item: FeedbackItem }>('/api/feedback', 'POST',
                { kind, body: body.trim(), screen_path: screen?.path ?? null, device }, 'No se pudo enviar tu comentario. Inténtalo de nuevo.');
            setSent(true);
            onSent?.(data.item);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo enviar tu comentario.');
        } finally {
            setSending(false);
        }
    };

    if (sent) {
        return (
            <Modal title="¡Gracias!" onClose={onClose} testId="feedback-composer">
                <div role="status" className="flex flex-col items-center gap-3 text-center">
                    <CheckCircle2 aria-hidden="true" className="h-12 w-12 text-bos-success" />
                    <p className="text-base font-semibold">Tu comentario quedó enviado.</p>
                    <p className="text-sm text-bos-muted">Lo lee la cuenta principal. Cuando te responda o cambie su estado, verás un aviso en «Mis comentarios».</p>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <Link href={FEEDBACK_HREF} onClick={onClose}
                        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-bos-control px-5 text-[15px] font-semibold text-bos-text hover:bg-bos-raised">
                        Ver mis comentarios
                    </Link>
                    <Button size="md" onClick={onClose}>Seguir trabajando</Button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal title="¿Qué mejorarías?" subtitle={screen ? `Sobre: ${screen.title}` : 'Sobre: la aplicación en general'} onClose={onClose} testId="feedback-composer">
            <form onSubmit={submit} noValidate className="space-y-5">
                <fieldset>
                    <legend id={kindLabelId} className={LABEL_CLASS}>¿Qué es?</legend>
                    <div role="radiogroup" aria-labelledby={kindLabelId} className="grid grid-cols-2 gap-2.5">
                        {FEEDBACK_KINDS.map((k) => {
                            const Icon = KIND_ICONS[k];
                            const on = kind === k;
                            return (
                                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => { setKind(k); setError(null); }}
                                    className={`flex min-h-[72px] flex-col items-start justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${on
                                        ? 'border-bos-accent bg-bos-accent-soft text-bos-text'
                                        : 'border-bos-border bg-bos-bg text-bos-text hover:bg-bos-raised'}`}>
                                    <Icon aria-hidden="true" className={`h-5 w-5 ${on ? 'text-bos-accent-text' : 'text-bos-muted'}`} />
                                    <span className="leading-tight">{KIND_LABELS[k]}</span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                <div>
                    <label htmlFor={textId} className={LABEL_CLASS}>Cuéntanos</label>
                    <textarea id={textId} value={body} onChange={(e) => { setBody(e.target.value); setError(null); }} rows={5} maxLength={BODY_MAX + 50}
                        aria-describedby={hintId} aria-invalid={tooLong || undefined}
                        placeholder="Por ejemplo: en la Agenda me gustaría ver el teléfono más grande."
                        className={`${FIELD_CLASS} h-auto min-h-32 py-2.5 leading-relaxed resize-y`} />
                    <div id={hintId} className="mt-1.5 flex items-start justify-between gap-3 text-xs text-bos-muted">
                        <span className="flex items-start gap-1.5">
                            <ShieldAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                            {PRIVACY_NOTE}
                        </span>
                        <span className={`shrink-0 tabular-nums ${tooLong ? 'font-semibold text-bos-danger' : ''}`}>{length.toLocaleString('es-MX')}/{BODY_MAX.toLocaleString('es-MX')}</span>
                    </div>
                </div>

                {error && <p role="alert" className="text-sm font-medium text-bos-danger">{error}</p>}

                <Button type="submit" fullWidth loading={sending} loadingText="Enviando…">Enviar</Button>
            </form>
        </Modal>
    );
}
