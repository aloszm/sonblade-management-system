'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Eye, FileText, Maximize2, Minimize2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import ErrorState from '@/components/ui/ErrorState';
import { formatMoney } from '@/lib/utils/money';
import { formatDate } from '@/lib/utils/dates';
import { toUserMessage } from '@/lib/utils/errors';
import { getJson } from '@/lib/money/client';
import type { Expense } from './data';

/** Lo que el visor necesita saber del gasto (todo viene ya en la lista). */
export type ReceiptExpense = Pick<Expense, 'id' | 'description' | 'amount' | 'incurred_at' | 'created_by_name' | 'vendor'>;

type Kind = 'image' | 'pdf' | 'other';
type State =
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'unreadable' }
    | { phase: 'ready'; kind: Kind; blobUrl: string; fileName: string; size: number; imageChecked: boolean };

/** Nombre del archivo a partir del enlace firmado (…/expense-receipts/negocio/sucursal/2026-11/abc.pdf?token=…). */
function fileNameOf(signedUrl: string): string {
    try {
        const last = new URL(signedUrl).pathname.split('/').filter(Boolean).pop() ?? '';
        return decodeURIComponent(last) || 'comprobante';
    } catch {
        return 'comprobante';
    }
}

function kindOf(type: string, fileName: string): Kind {
    const t = type.toLowerCase();
    if (t.startsWith('image/')) return 'image';
    if (t === 'application/pdf' || (!t && /\.pdf$/i.test(fileName))) return 'pdf';
    return 'other';
}

function sizeLabel(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const money = (n: number) => formatMoney(n, { cents: true });
const LINK_BTN = 'inline-flex min-h-11 items-center gap-2 rounded-xl border border-bos-control px-4 text-sm font-semibold text-bos-text hover:bg-bos-raised';

/**
 * Visor del comprobante de un gasto, dentro de la aplicación. Cada vez que se abre (o se reintenta) pide un enlace
 * firmado NUEVO, descarga el archivo con fetch (connect-src de la política de seguridad lo permite) y lo muestra
 * como blob: (img-src ya lo permite). Así se puede medir el tamaño real y detectar archivos vacíos, y no hay
 * pestañas en blanco ni enlaces que caduquen mientras se mira. Nunca queda una pantalla vacía: siempre hay
 * cargando, error con Reintentar, archivo ilegible o el contenido.
 */
export default function ReceiptViewer({ expense, onClose }: { expense: ReceiptExpense; onClose: () => void }) {
    const [state, setState] = useState<State>({ phase: 'loading' });
    const [full, setFull] = useState(false);
    const [busy, setBusy] = useState(false);
    const [openError, setOpenError] = useState('');
    const attempt = useRef(0);
    const blobRef = useRef<string | null>(null);

    const load = useCallback(async () => {
        const mine = ++attempt.current;
        const alive = () => attempt.current === mine;
        if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null; }
        setState({ phase: 'loading' });
        setFull(false);
        setOpenError('');
        try {
            // Enlace firmado nuevo en este momento (caduca en 60 s: no se reutiliza uno viejo).
            const { url } = await getJson<{ url: string }>(`/api/expenses/${expense.id}/receipt`);
            if (!alive()) return;
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`archivo ${res.status}`);
            const blob = await res.blob();
            if (!alive()) return;
            if (blob.size === 0) { setState({ phase: 'unreadable' }); return; }
            const fileName = fileNameOf(url);
            const kind = kindOf(blob.type || res.headers.get('content-type') || '', fileName);
            const blobUrl = URL.createObjectURL(blob);
            blobRef.current = blobUrl;
            setState({ phase: 'ready', kind, blobUrl, fileName, size: blob.size, imageChecked: kind !== 'image' });
        } catch (e) {
            if (!alive()) return;
            setState({ phase: 'error', message: toUserMessage(e, 'Revisa tu conexión e inténtalo de nuevo.') });
        }
    }, [expense.id]);

    useEffect(() => {
        void load();
        const counter = attempt;
        const blobs = blobRef;
        return () => {
            counter.current++; // cancela lo que siga en vuelo
            if (blobs.current) { URL.revokeObjectURL(blobs.current); blobs.current = null; }
        };
    }, [load]);

    /** "Abrir PDF": pide un enlace nuevo en este clic (el de la carga ya pudo caducar) y lo abre en otra pestaña. */
    const openPdf = async () => {
        // La pestaña se abre en el clic (los navegadores bloquean ventanas abiertas después de esperar).
        const tab = window.open('about:blank', '_blank');
        if (tab) tab.opener = null;
        setBusy(true);
        setOpenError('');
        try {
            const { url } = await getJson<{ url: string }>(`/api/expenses/${expense.id}/receipt`);
            if (tab) tab.location.href = url; else window.open(url, '_blank', 'noopener');
        } catch (e) {
            tab?.close();
            setOpenError(toUserMessage(e, 'No se pudo abrir el PDF. Inténtalo de nuevo.'));
        } finally {
            setBusy(false);
        }
    };

    const ready = state.phase === 'ready' ? state : null;
    const checkingImage = ready !== null && ready.kind === 'image' && !ready.imageChecked;

    return (
        <Modal title="Comprobante" subtitle={expense.description} onClose={onClose} size="lg" testId="receipt-viewer">
            <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-bos-border bg-bos-raised p-3 text-sm sm:grid-cols-4" data-testid="receipt-info">
                <div><dt className="text-xs text-bos-muted">Monto</dt><dd className="font-semibold tabular-nums">{money(expense.amount)}</dd></div>
                <div><dt className="text-xs text-bos-muted">Fecha</dt><dd className="font-semibold">{formatDate(expense.incurred_at)}</dd></div>
                <div><dt className="text-xs text-bos-muted">Registró</dt><dd className="font-semibold">{expense.created_by_name ?? '—'}</dd></div>
                <div><dt className="text-xs text-bos-muted">Proveedor</dt><dd className="font-semibold">{expense.vendor || '—'}</dd></div>
            </dl>

            {(state.phase === 'loading' || checkingImage) && (
                <p role="status" aria-busy="true" data-testid="receipt-loading" className="py-16 text-center text-sm text-bos-muted">Cargando comprobante…</p>
            )}

            {state.phase === 'error' && (
                <div data-testid="receipt-error">
                    <ErrorState title="No se pudo abrir el comprobante" message={state.message} onRetry={() => void load()} />
                </div>
            )}

            {state.phase === 'unreadable' && (
                <div role="alert" data-testid="receipt-unreadable" className="flex flex-col items-center gap-3 rounded-xl border border-bos-danger bg-bos-danger-soft px-4 py-8 text-center">
                    <p className="font-display text-base font-semibold">No se puede mostrar el comprobante</p>
                    <p className="max-w-sm text-sm">El archivo existe pero no se puede mostrar. Vuelve a subir el comprobante.</p>
                    <Button variant="secondary" size="sm" onClick={() => void load()}>Reintentar</Button>
                </div>
            )}

            {/* La imagen se carga oculta hasta comprobar que tiene dimensiones reales. */}
            {ready && ready.kind === 'image' && (
                <div className={ready.imageChecked ? '' : 'hidden'}>
                    <div data-testid="receipt-image-box" className={`flex justify-center rounded-xl border border-bos-border bg-bos-bg p-2 ${full ? 'max-h-[65dvh] overflow-auto' : ''}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- es un blob: local; next/image no aplica */}
                        <img src={ready.blobUrl} alt={`Comprobante: ${expense.description}`} data-testid="receipt-image"
                            onLoad={(e) => {
                                const img = e.currentTarget;
                                // Una imagen de 1-2 px es un archivo de prueba o dañado: no es un comprobante legible.
                                if (img.naturalWidth <= 2 || img.naturalHeight <= 2) { setState({ phase: 'unreadable' }); return; }
                                setState((s) => (s.phase === 'ready' ? { ...s, imageChecked: true } : s));
                            }}
                            onError={() => setState({ phase: 'error', message: 'El archivo no se pudo leer como imagen. Inténtalo de nuevo.' })}
                            className={full ? 'max-w-none' : 'max-h-[50dvh] w-auto max-w-full object-contain'} />
                    </div>
                    {ready.imageChecked && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setFull((v) => !v)} aria-pressed={full}>
                                {full ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
                                {full ? 'Ajustar a la pantalla' : 'Tamaño completo'}
                            </Button>
                            <a href={ready.blobUrl} target="_blank" rel="noopener noreferrer" data-testid="receipt-newtab" className={LINK_BTN}>
                                <ExternalLink aria-hidden="true" className="h-4 w-4" /> Abrir en otra pestaña
                            </a>
                            <a href={ready.blobUrl} download={ready.fileName} data-testid="receipt-download" className={LINK_BTN}>
                                <Download aria-hidden="true" className="h-4 w-4" /> Descargar
                            </a>
                        </div>
                    )}
                </div>
            )}

            {/* PDF: la política de seguridad no permite incrustarlo (object-src 'none', frame-src cae en 'self') y en iPhone suele fallar; siempre botón. */}
            {ready && ready.kind === 'pdf' && (
                <div data-testid="receipt-pdf" className="flex flex-col items-center gap-3 rounded-xl border border-bos-border bg-bos-bg px-4 py-8 text-center">
                    <FileText aria-hidden="true" className="h-10 w-10 text-bos-muted" />
                    <p className="break-all font-semibold">{ready.fileName}</p>
                    <p className="text-sm text-bos-muted">Comprobante en PDF · {sizeLabel(ready.size)}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button onClick={() => void openPdf()} loading={busy}><Eye aria-hidden="true" className="h-4 w-4" /> Abrir PDF</Button>
                        <a href={ready.blobUrl} download={ready.fileName} data-testid="receipt-download" className={LINK_BTN}>
                            <Download aria-hidden="true" className="h-4 w-4" /> Descargar
                        </a>
                    </div>
                    {openError && <p role="alert" className="text-sm font-medium text-bos-danger">{openError}</p>}
                </div>
            )}

            {ready && ready.kind === 'other' && (
                <div data-testid="receipt-other" className="flex flex-col items-center gap-3 rounded-xl border border-bos-border bg-bos-bg px-4 py-8 text-center">
                    <FileText aria-hidden="true" className="h-10 w-10 text-bos-muted" />
                    <p className="break-all font-semibold">{ready.fileName}</p>
                    <p className="text-sm text-bos-muted">Este tipo de archivo no se puede mostrar aquí ({sizeLabel(ready.size)}).</p>
                    <a href={ready.blobUrl} download={ready.fileName} data-testid="receipt-download"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-bos-accent px-4 text-sm font-bold text-bos-on-accent hover:bg-bos-accent-strong">
                        <Download aria-hidden="true" className="h-4 w-4" /> Descargar
                    </a>
                </div>
            )}
        </Modal>
    );
}
