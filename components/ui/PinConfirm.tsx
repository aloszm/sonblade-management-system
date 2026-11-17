'use client';

import React, { useId, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { REASON_MAX, reasonProblem } from '@/lib/cash/reasons';

export interface PinConfirmProps {
    /** Qué se va a confirmar, en pocas palabras: "Cambiar ajustes de caja". */
    title: string;
    /** Resumen del cambio para que la persona sepa qué está firmando. */
    summary?: React.ReactNode;
    /**
     * Comentario ya escrito en el formulario (p. ej. el concepto de un retiro). Si viene, se muestra
     * y no se pide otro. Si no, el comentario es obligatorio (5 a 300 letras).
     */
    fixedComment?: string;
    commentLabel?: string;
    commentPlaceholder?: string;
    confirmLabel?: string;
    /** Hace el cambio en el servidor; si falla, lanza un Error con el mensaje para la persona. */
    onConfirm: (input: { pin: string; comment: string }) => Promise<void>;
    onClose: () => void;
}

/**
 * Confirmación con PIN + comentario para cambios sensibles (caja, inventario, movimientos de
 * gerencia). El PIN va enmascarado, nunca se guarda en el navegador y se borra si falla. El
 * servidor lo verifica y hace el cambio en la misma petición.
 */
export default function PinConfirm({ title, summary, fixedComment, commentLabel = 'Comentario: ¿por qué haces este cambio?', commentPlaceholder = 'Ej: Llegó el pedido del proveedor', confirmLabel = 'Confirmar con PIN', onConfirm, onClose }: PinConfirmProps) {
    const pinId = useId();
    const commentId = useId();
    const errorId = useId();
    const [pin, setPin] = useState('');
    const [comment, setComment] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Se dibuja en un portal, pero React sube el evento por el árbol: que no envíe el formulario de atrás.
        e.stopPropagation();
        setError('');
        const finalComment = (fixedComment ?? comment).trim();
        if (fixedComment === undefined) {
            const problem = reasonProblem(finalComment, 'un comentario');
            if (problem) { setError(problem); return; }
        }
        if (!/^\d{6}$/.test(pin)) { setError('Escribe tu PIN de 6 números.'); return; }
        setBusy(true);
        try {
            await onConfirm({ pin, comment: finalComment });
        } catch (err) {
            setPin('');
            setError(err instanceof Error ? err.message : 'No se pudo confirmar.');
        } finally {
            setBusy(false);
        }
    };

    const field = 'w-full px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
    return (
        <Modal title={title} subtitle="Se confirma con tu PIN y queda en la bitácora." onClose={busy ? () => undefined : onClose} testId="pin-confirm">
            <form onSubmit={submit} className="space-y-5" noValidate>
                {summary && <div className="rounded-xl bg-bos-raised px-4 py-3 text-[15px]">{summary}</div>}
                {fixedComment !== undefined ? (
                    <p className="text-sm text-bos-muted">Comentario: <span className="text-bos-text">{fixedComment}</span></p>
                ) : (
                    <div className="space-y-2">
                        <label htmlFor={commentId} className="text-[13px] font-medium text-bos-muted">{commentLabel}</label>
                        <textarea id={commentId} required minLength={5} maxLength={REASON_MAX} rows={3} value={comment}
                            onChange={(e) => setComment(e.target.value)} placeholder={commentPlaceholder}
                            className={`${field} py-2 min-h-[88px]`} />
                    </div>
                )}
                <div className="space-y-2">
                    <label htmlFor={pinId} className="text-[13px] font-medium text-bos-muted">Tu PIN (6 números)</label>
                    <div className="relative">
                        <KeyRound aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-bos-muted" />
                        <input id={pinId} type="password" inputMode="numeric" autoComplete="off" pattern="\d{6}" maxLength={6} required
                            aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
                            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className={`${field} h-14 pl-11 text-2xl tracking-[0.5em] font-semibold`} />
                    </div>
                </div>
                {error && <p id={errorId} role="alert" className="text-sm text-bos-danger">{error}</p>}
                <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={onClose} disabled={busy}
                        className="min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text text-[15px] font-semibold hover:bg-bos-raised disabled:opacity-50">Cancelar</button>
                    <button type="submit" disabled={busy}
                        className="min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent text-[15px] font-bold hover:bg-bos-accent-strong disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {busy && <Loader2 className="h-5 w-5 animate-spin" />} {confirmLabel}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
