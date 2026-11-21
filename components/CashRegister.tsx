'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Loader2, Lock, Plus, Search, Settings2, TriangleAlert } from 'lucide-react';
import CashFlowPanel from '@/components/cash/CashFlowPanel';
import DaySummaryButton from '@/components/cash/DaySummaryModal';
import EnvelopeNote from '@/app/sobres/_components/EnvelopeNote';
import PinConfirm from '@/components/ui/PinConfirm';
import Modal from '@/components/ui/Modal';
import CashSettingsEditor from '@/components/CashSettingsEditor';
import {
    DIFFERENCE_OTHER, DIFFERENCE_SUGGESTIONS, REASON_MAX, REASON_MIN, closingNeedsReason, closingWarning, differenceNeedsReason, differenceReasonProblem,
    differenceText, isDifferenceReasonError, openingNeedsReason, openingWarning, reasonProblem,
} from '@/lib/cash/reasons';
import type { CashMovement, CashSession } from '@/types';
import { toUiMovement, UNKNOWN_OPENER, type CashMovementRow } from '@/lib/cash/session-view';
import { ReadOnlyNotice, useReadOnly } from '@/lib/auth/read-only';
import { DENOMINATIONS, breakdownTotal, compactBreakdown, proposeSplit, withdrawnFor } from '@/lib/cash/closing';
import { formatMoney } from '@/lib/utils/money';
import { formatDate, formatTime } from '@/lib/utils/dates';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils/payment';

interface CashSettings { float_target: number; reserve_amount: number; reserve_label: string; last_float_left: number | null; can_edit: boolean; can_see_history: boolean; movement_needs_pin?: boolean }
type Movement = CashMovement & { direction: 'in' | 'out' };
type CloseResult = { counted: number; difference: number; float: number; reserve: number; withdrawn: number; deliveredTo: string; differenceReason: string };

const money = (n: number) => formatMoney(n);
const timeOf = (iso: string) => formatTime(iso);
const METHOD_LABELS = PAYMENT_METHOD_LABELS;
const MOVEMENT_TYPES = [
    { id: 'expense', label: 'Gasto', short: 'Pagas algo del negocio', example: 'Agua, basura, insumos, material de limpieza.', affects: true, effect: 'Baja la utilidad: es un costo del negocio.' },
    { id: 'withdrawal', label: 'Retiro', short: 'El dinero cambia de lugar', example: 'Llevar efectivo al banco o a la caja fuerte, entregárselo a la gerencia, pagar comisiones en efectivo.', affects: false, effect: 'No baja la utilidad: el dinero sigue siendo del negocio, solo sale de la caja.' },
    { id: 'deposit', label: 'Entrada', short: 'Metes efectivo a la caja', example: 'Cambio en billetes y monedas, fondo extra.', affects: false, effect: 'No sube la utilidad: no es una venta.' },
] as const;
const TAG_STYLES: Record<NonNullable<CashMovement['tag']>, string> = {
    Venta: 'bg-bos-success-soft text-bos-success',
    Propina: 'bg-bos-success-soft text-bos-success',
    Gasto: 'bg-bos-raised text-bos-danger',
    Retiro: 'bg-bos-raised text-bos-text',
    Entrada: 'bg-bos-raised text-bos-text',
    Reembolso: 'bg-bos-raised text-bos-danger',
    Ajuste: 'bg-bos-raised text-bos-muted',
};

const card = 'rounded-xl border border-bos-border bg-bos-surface';
const label = 'text-[13px] font-medium text-bos-muted';
const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
const primary = 'min-h-[52px] px-5 rounded-xl bg-bos-accent text-bos-on-accent text-[15px] font-bold hover:bg-bos-accent-strong disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';
const secondary = 'min-h-[52px] px-5 rounded-xl border border-bos-border text-bos-text text-[15px] font-semibold hover:bg-bos-raised inline-flex items-center justify-center gap-2';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.detail && /[áéíóúñ¿]|\$/.test(body.detail) ? body.detail : body?.error ?? 'No se pudo completar la operación.');
    return body as T;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    // Modal base: portal, Escape, foco atrapado y devuelto al botón que lo abrió.
    return <Modal title={title} onClose={onClose}>{children}</Modal>;
}

/** Aviso + motivo obligatorio (apertura distinta o cierre con menos del fondo). */
function ReasonBox({ id, warning, value, onChange, placeholder }: { id: string; warning: string; value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
        <div className="space-y-2" data-testid={`${id}-box`}>
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-bos-accent-soft p-3 text-sm text-bos-text">
                <TriangleAlert aria-hidden="true" className="h-4 w-4 mt-0.5 text-bos-accent-text shrink-0" />
                <span>{warning} Se puede, pero escribe por qué.</span>
            </p>
            <label htmlFor={id} className={label}>Motivo (obligatorio)</label>
            <textarea id={id} rows={2} maxLength={REASON_MAX} required value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                className="w-full min-h-[72px] px-3 py-2 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text" />
        </div>
    );
}

/**
 * «Revisa primero»: antes de pedir el motivo de una diferencia, el camino del efectivo a la mano para ver de dónde sale
 * lo que debe haber (un gasto o un pago sin anotar suele explicarla).
 */
export function CheckFirstBox({ sessionId, difference, open, onToggle }: { sessionId: string; difference: number; open: boolean; onToggle: () => void }) {
    return (
        <div data-testid="close-check-first" className="space-y-3 rounded-xl border border-bos-border bg-bos-bg p-3">
            <p className="flex items-start gap-2 text-sm">
                <Search aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-bos-accent-text" />
                <span>
                    <strong className="block text-[15px] text-bos-text">Revisa primero</strong>
                    <span className="text-bos-muted">{differenceText(difference)}. Vuelve a contar y revisa de dónde sale lo que debe haber: un gasto, un retiro o un pago sin anotar suele explicar la diferencia.</span>
                </span>
            </p>
            <button type="button" data-testid="close-check-first-toggle" aria-expanded={open} aria-controls="close-check-flow" onClick={onToggle}
                className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-bos-border bg-bos-surface px-3 text-left text-sm font-semibold text-bos-accent-text hover:bg-bos-raised">
                ¿Cuánto efectivo hay y por qué?
                <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <div id="close-check-flow" className="border-t border-bos-border pt-3"><CashFlowPanel sessionId={sessionId} /></div>}
        </div>
    );
}

/** Motivo obligatorio de la diferencia (sobrante o faltante) al cerrar, con sugerencias de un toque y contador. */
export function DifferenceReasonBox({ difference, value, onChange }: { difference: number; value: string; onChange: (v: string) => void }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const length = value.trim().length;
    const valid = length >= REASON_MIN && length <= REASON_MAX;
    const pick = (text: string) => {
        onChange(text === DIFFERENCE_OTHER ? '' : text);
        // Se puede editar en seguida: el cursor queda al final del texto.
        requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
    };
    return (
        <div data-testid="close-difference-box" className="space-y-3 rounded-xl border border-bos-danger/50 bg-bos-surface p-3">
            <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="close-difference-reason" className="text-[15px] font-semibold text-bos-text">¿Por qué hay diferencia?</label>
                <span data-testid="close-difference-amount" className="shrink-0 font-display text-2xl font-semibold tabular-nums text-bos-danger">{differenceText(difference)}</span>
            </div>
            <p className="text-sm text-bos-muted">Obligatorio para cerrar. Toca una opción y corrígela si hace falta.</p>
            <div role="group" aria-label="Motivos frecuentes" className="flex flex-wrap gap-2">
                {[...DIFFERENCE_SUGGESTIONS, DIFFERENCE_OTHER].map((text) => {
                    const selected = text === DIFFERENCE_OTHER ? false : value.trim() === text;
                    return (
                        <button key={text} type="button" data-testid="close-difference-suggestion" aria-pressed={selected} onClick={() => pick(text)}
                            className={`min-h-10 rounded-full border px-3 text-sm font-medium transition-colors ${selected ? 'border-bos-text bg-bos-raised text-bos-text' : 'border-bos-border text-bos-text hover:bg-bos-raised'}`}>
                            {text}
                        </button>
                    );
                })}
            </div>
            <textarea ref={ref} id="close-difference-reason" rows={2} maxLength={REASON_MAX} required aria-required="true" aria-invalid={!valid}
                aria-describedby="close-difference-count" value={value} onChange={(e) => onChange(e.target.value)}
                placeholder="Ej: Le di $50 de más de cambio a un cliente"
                className="w-full min-h-[72px] px-3 py-2 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text" />
            <p id="close-difference-count" data-testid="close-difference-count" className={`text-right text-[13px] tabular-nums ${valid || length === 0 ? 'text-bos-muted' : 'text-bos-danger'}`}>
                {length}/{REASON_MAX}{length < REASON_MIN ? ` · mínimo ${REASON_MIN} letras` : ''}
            </p>
        </div>
    );
}

function PastClosings({ sessions, reserveLabel }: { sessions: CashSession[]; reserveLabel: string }) {
    // Cada cierre se puede abrir para ver su camino del efectivo completo (se pide al abrirlo).
    const [openId, setOpenId] = useState<string | null>(null);
    if (sessions.length === 0) return null;
    const day = (iso: string | null) => (iso ? formatDate(iso, undefined, { year: false }) : '—');
    const value = (n: number | null | undefined) => (n === null || n === undefined ? '—' : money(n));
    return (
        <section aria-labelledby="past-closings" className="space-y-3">
            <h2 id="past-closings" className={label}>Cierres anteriores</h2>
            <div className={`${card} overflow-x-auto`}>
                <table className="bos-stack w-full text-[15px]">
                    <thead>
                        <tr className="text-left text-[13px] text-bos-muted">
                            <th className="px-4 py-3 font-semibold">Día</th>
                            <th className="px-4 py-3 font-semibold text-right">Vendido</th>
                            <th className="px-4 py-3 font-semibold text-right">Contado</th>
                            <th className="px-4 py-3 font-semibold text-right">Diferencia</th>
                            <th className="px-4 py-3 font-semibold text-right">Fondo</th>
                            <th className="px-4 py-3 font-semibold text-right">{reserveLabel}</th>
                            <th className="px-4 py-3 font-semibold text-right">Retiro</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions.map((s) => (
                            <React.Fragment key={s.id}>
                            <tr className="border-t border-bos-border tabular-nums">
                                <td data-label="" className="px-4 py-3 font-semibold first-letter:uppercase max-md:order-first">
                                    {day(s.closed_at)}
                                    {s.closed_by && <span className="block text-xs font-normal text-bos-muted">cerró {s.closed_by}</span>}
                                    <button type="button" data-testid="past-flow-toggle" aria-expanded={openId === s.id} aria-controls={`past-flow-${s.id}`}
                                        onClick={() => setOpenId(openId === s.id ? null : s.id)}
                                        className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-md text-left text-sm font-semibold text-bos-accent-text underline-offset-2 hover:underline">
                                        {openId === s.id ? 'Ocultar el efectivo' : 'Ver el efectivo'}
                                        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${openId === s.id ? 'rotate-180' : ''}`} />
                                    </button>
                                </td>
                                <td data-label="Vendido" className="px-4 py-3 text-right">{money(s.total_sales)}</td>
                                <td data-label="Contado" className="px-4 py-3 text-right">{value(s.physical_count)}</td>
                                <td data-label="Diferencia" className={`px-4 py-3 text-right font-semibold max-md:order-first ${s.difference === 0 ? 'text-bos-success' : 'text-bos-danger'}`}>
                                    {s.difference === null ? '—' : s.difference === 0 ? 'Cuadra' : `${s.difference > 0 ? '+' : '−'}${money(Math.abs(s.difference))}`}
                                </td>
                                <td data-label="Fondo" className="px-4 py-3 text-right">{value(s.float_left)}</td>
                                <td data-label={reserveLabel} className="px-4 py-3 text-right">{value(s.reserve_amount)}</td>
                                <td data-label="Retiro" className="px-4 py-3 text-right">
                                    {value(s.withdrawn_amount)}
                                    {s.withdrawal_delivered_to && <span className="block text-xs text-bos-muted">a {s.withdrawal_delivered_to}</span>}
                                </td>
                            </tr>
                            {openId === s.id && (
                                <tr id={`past-flow-${s.id}`} data-testid="past-flow" className="bg-bos-bg">
                                    <td data-label="" colSpan={7} className="px-4 py-4 text-left">
                                        <CashFlowPanel sessionId={s.id} />
                                    </td>
                                </tr>
                            )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function CashRegister() {
    // Cuenta de consulta: ve el estado y el historial, sin abrir, cerrar ni registrar movimientos.
    const readOnly = useReadOnly();
    const [session, setSession] = useState<CashSession | null>(null);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [settings, setSettings] = useState<CashSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    // Cierres anteriores: solo dueño y administración; a los demás ni se les pide.
    const [history, setHistory] = useState<CashSession[]>([]);
    const loadHistory = useCallback(() => {
        api<CashSession[]>('/api/cash/history').then((rows) => { if (Array.isArray(rows)) setHistory(rows); }).catch(() => {});
    }, []);

    // Lo que acaba de entrar: se anima una sola vez.
    const seen = useRef<Set<string> | null>(null);
    const lastSales = useRef<number | null>(null);
    const [fresh, setFresh] = useState<Set<string>>(new Set());
    const [gain, setGain] = useState<{ amount: number; key: number } | null>(null);

    const [openAmount, setOpenAmount] = useState('');
    const [openReason, setOpenReason] = useState('');
    const [opening, setOpening] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [movementPin, setMovementPin] = useState(false);
    const [formError, setFormError] = useState('');

    const [flowOpen, setFlowOpen] = useState(false);
    const [movementOpen, setMovementOpen] = useState(false);
    const [movementType, setMovementType] = useState<(typeof MOVEMENT_TYPES)[number]['id']>('expense');
    const [movementConcept, setMovementConcept] = useState('');
    const [movementAmount, setMovementAmount] = useState('');
    const [saving, setSaving] = useState(false);

    const [closeStep, setCloseStep] = useState<0 | 1 | 2>(0); // 0 = cerrado, 1 = contar, 2 = repartir
    const [byDenomination, setByDenomination] = useState(true);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [countedTotal, setCountedTotal] = useState('');
    const [floatLeft, setFloatLeft] = useState('');
    const [reserve, setReserve] = useState('');
    const [deliveredTo, setDeliveredTo] = useState('');
    const [shortReason, setShortReason] = useState('');
    const [diffReason, setDiffReason] = useState('');
    const [checkOpen, setCheckOpen] = useState(false);
    const [closeResult, setCloseResult] = useState<CloseResult | null>(null);

    const load = useCallback(async (silent = false) => {
        try {
            const current = await api<CashSession | null>('/api/cash/session');
            setSession(current);
            if (current) {
                const rows = await api<(CashMovementRow & { id: string })[]>(`/api/cash/movements?session_id=${current.id}`);
                const list: Movement[] = rows.map((row) => ({ ...toUiMovement(row), direction: row.direction }));
                // Solo se anima lo que llega después de la primera carga.
                if (seen.current) {
                    const added = list.filter((m) => !seen.current!.has(m.id)).map((m) => m.id);
                    if (added.length) {
                        setFresh(new Set(added));
                        setTimeout(() => setFresh(new Set()), 2400);
                    }
                    if (lastSales.current !== null && current.total_sales > lastSales.current) {
                        setGain({ amount: Math.round((current.total_sales - lastSales.current) * 100) / 100, key: Date.now() });
                    }
                }
                seen.current = new Set(list.map((m) => m.id));
                lastSales.current = current.total_sales;
                setMovements(list);
            } else {
                seen.current = null;
                lastSales.current = null;
                setMovements([]);
            }
            setLoadError('');
        } catch (e) {
            if (!silent) setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la caja.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        api<CashSettings>('/api/cash/settings').then((s) => {
            setSettings(s);
            setOpenAmount(String(s.last_float_left ?? s.float_target));
            if (s.can_see_history) loadHistory();
        }).catch(() => {});
        // Los cobros hechos en otra pantalla aparecen aquí solos.
        const timer = setInterval(() => load(true), 15_000);
        return () => clearInterval(timer);
    }, [load, loadHistory]);

    const expected = session?.expected_cash ?? 0;
    const counted = byDenomination ? breakdownTotal(counts) : Number(countedTotal) || 0;
    const difference = Math.round((counted - expected) * 100) / 100;
    const withdrawn = withdrawnFor(counted, Number(floatLeft) || 0, Number(reserve) || 0);
    const floatTarget = settings?.float_target ?? 0;
    const closeShort = settings !== null && closingNeedsReason(Number(floatLeft) || 0, floatTarget);
    // Sobrante o faltante: el cierre pide el motivo (la base vuelve a contar y es la que manda).
    const needsDiffReason = differenceNeedsReason(difference);
    const diffProblem = differenceReasonProblem(difference, diffReason);
    const openDiffers = settings !== null && openAmount !== '' && openingNeedsReason(Number(openAmount) || 0, settings.last_float_left, floatTarget);

    const handleOpen = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (openDiffers) {
            const problem = reasonProblem(openReason);
            if (problem) { setFormError(problem); return; }
        }
        setOpening(true);
        try {
            await api('/api/cash/session', { method: 'POST', body: JSON.stringify({ opening_cash: Number(openAmount) || 0, ...(openDiffers ? { opening_reason: openReason.trim() } : {}) }) });
            setOpenReason('');
            setCloseResult(null);
            await load();
        } catch (err) { setFormError(err instanceof Error ? err.message : 'No se pudo abrir la caja.'); }
        finally { setOpening(false); }
    };

    const handleMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session) return;
        setFormError('');
        if (movementConcept.trim().length < 2) { setFormError('Escribe el concepto.'); return; }
        if (!(Number(movementAmount) > 0)) { setFormError('Escribe una cantidad mayor a cero.'); return; }
        // Gerencia confirma con su PIN; el concepto es el comentario.
        if (settings?.movement_needs_pin) { setMovementPin(true); return; }
        setSaving(true);
        try {
            await postMovement();
        } catch (err) { setFormError(err instanceof Error ? err.message : 'No se pudo registrar.'); }
        finally { setSaving(false); }
    };
    const postMovement = async (pin?: string) => {
        if (!session) return;
        await api('/api/cash/movements', {
            method: 'POST',
            body: JSON.stringify({ cash_session_id: session.id, movement_type: movementType, method: 'cash', amount: Number(movementAmount), description: movementConcept.trim(), ...(pin ? { pin } : {}) }),
        });
        setMovementPin(false); setMovementOpen(false); setMovementConcept(''); setMovementAmount('');
        await load();
    };

    const startClose = () => {
        setFormError(''); setCounts({}); setCountedTotal(''); setByDenomination(true); setDiffReason(''); setCheckOpen(false); setCloseStep(1);
    };
    const toSplit = () => {
        const split = proposeSplit(counted, settings?.float_target ?? 0, settings?.reserve_amount ?? 0);
        setFloatLeft(String(split.float)); setReserve(String(split.reserve)); setFormError(''); setCloseStep(2);
    };
    const handleClose = async () => {
        if (!session || withdrawn === null) return;
        setFormError('');
        if (diffProblem) { setFormError(diffProblem); return; }
        if (closeShort) {
            const problem = reasonProblem(shortReason);
            if (problem) { setFormError(problem); return; }
        }
        setSaving(true);
        try {
            await api('/api/cash/session/close', {
                method: 'POST',
                body: JSON.stringify({
                    session_id: session.id, physical_count: counted,
                    ...(byDenomination ? { breakdown: compactBreakdown(counts) } : {}),
                    float_left: Number(floatLeft) || 0, reserve_amount: Number(reserve) || 0,
                    ...(withdrawn > 0 && deliveredTo.trim() ? { withdrawal_delivered_to: deliveredTo.trim() } : {}),
                    ...(closeShort ? { short_float_reason: shortReason.trim() } : {}),
                    // Siempre se manda (vacío si cuadra): así la ruta sabe que esta pantalla sí pide el motivo.
                    difference_reason: needsDiffReason ? diffReason.trim() : '',
                }),
            });
            setCloseResult({ counted, difference, float: Number(floatLeft) || 0, reserve: Number(reserve) || 0, withdrawn, deliveredTo: withdrawn > 0 ? deliveredTo.trim() : '', differenceReason: needsDiffReason ? diffReason.trim() : '' });
            setDiffReason('');
            setDeliveredTo('');
            setShortReason('');
            setCloseStep(0);
            setOpenAmount(String(Number(floatLeft) || 0));
            setSettings((s) => (s ? { ...s, last_float_left: Number(floatLeft) || 0 } : s));
            if (settings?.can_see_history) loadHistory();
            await load();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'No se pudo cerrar la caja.';
            setFormError(message);
            // La base encontró una diferencia que la pantalla no veía (entró un cobro mientras se contaba): se recarga lo esperado
            // y aparece el campo del motivo con la cifra correcta.
            if (isDifferenceReasonError(message)) await load(true);
        }
        finally { setSaving(false); }
    };

    const settingsDialog = settingsOpen && settings ? (
        <Dialog title="Ajustes de caja" onClose={() => setSettingsOpen(false)}>
            <p className="text-sm text-bos-muted mb-4">Fondo que se recomienda dejar para el día siguiente y apartado diario. Se cambian con tu PIN y un comentario.</p>
            <CashSettingsEditor initial={{ float_target: settings.float_target, reserve_amount: settings.reserve_amount, reserve_label: settings.reserve_label }}
                onSaved={(v) => setSettings((s) => (s ? { ...s, ...v } : s))} />
        </Dialog>
    ) : null;

    if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>;

    // ───────────────────────── Caja cerrada
    if (!session) {
        const left = settings?.last_float_left ?? null;
        return (
            <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex justify-end"><DaySummaryButton variant="primary" /></div>
                {loadError && <p role="alert" className="rounded-xl border border-bos-danger/40 bg-bos-surface p-4 text-bos-danger">{loadError}</p>}

                {closeResult && (
                    <section role="status" data-testid="close-summary" className={`${card} p-6 space-y-4`}>
                        <div className="flex items-center gap-3">
                            <span aria-hidden="true" className="bos-pop h-11 w-11 rounded-full bg-bos-success inline-flex items-center justify-center"><Check className="h-6 w-6 text-bos-bg" /></span>
                            <h2 className="font-display text-xl font-semibold">Caja cerrada</h2>
                        </div>
                        <dl className="space-y-2 text-[15px]">
                            <div className="flex justify-between"><dt className="text-bos-muted">Efectivo contado</dt><dd className="font-semibold tabular-nums">{money(closeResult.counted)}</dd></div>
                            <div className="flex justify-between"><dt className="text-bos-muted">Se queda de fondo para mañana</dt><dd className="font-semibold tabular-nums">{money(closeResult.float)}</dd></div>
                            <div className="flex justify-between"><dt className="text-bos-muted">Apartado · {settings?.reserve_label ?? 'Apartado'}</dt><dd className="font-semibold tabular-nums">{money(closeResult.reserve)}</dd></div>
                            <div className="flex justify-between"><dt className="text-bos-muted">Retiro{closeResult.deliveredTo ? ` · entregado a ${closeResult.deliveredTo}` : ''}</dt><dd className="font-semibold tabular-nums">{money(closeResult.withdrawn)}</dd></div>
                            <div className="flex justify-between pt-2 border-t border-bos-border">
                                <dt className="text-bos-muted">Diferencia contra lo esperado</dt>
                                <dd className={`font-semibold tabular-nums ${closeResult.difference === 0 ? 'text-bos-success' : 'text-bos-danger'}`}>
                                    {differenceText(closeResult.difference)}
                                </dd>
                            </div>
                            {closeResult.differenceReason && (
                                <div data-testid="close-summary-reason" className="flex justify-between gap-4"><dt className="text-bos-muted">Motivo</dt><dd className="min-w-0 text-right break-words">{closeResult.differenceReason}</dd></div>
                            )}
                        </dl>
                        {closeResult.reserve > 0 && <EnvelopeNote />}
                    </section>
                )}

                {readOnly ? (
                    <section className={`${card} p-6 space-y-4`}>
                        <div className="flex items-center gap-3">
                            <span aria-hidden="true" className="h-11 w-11 rounded-full bg-bos-raised inline-flex items-center justify-center"><Lock className="h-5 w-5 text-bos-muted" /></span>
                            <h1 className="font-display text-2xl font-semibold">La caja está cerrada</h1>
                        </div>
                        <ReadOnlyNotice readOnly>Ves el estado y los cierres anteriores, pero no abres ni cierras la caja.</ReadOnlyNotice>
                    </section>
                ) : (
                <form onSubmit={handleOpen} className={`${card} p-6 space-y-5`}>
                    <div className="flex items-center gap-3">
                        <span aria-hidden="true" className="h-11 w-11 rounded-full bg-bos-raised inline-flex items-center justify-center"><Lock className="h-5 w-5 text-bos-muted" /></span>
                        <div>
                            <h1 className="font-display text-2xl font-semibold">La caja está cerrada</h1>
                            <p className="text-sm text-bos-muted">Ábrela para empezar a cobrar.</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="open-amount" className={label}>Efectivo con el que abre</label>
                        <input id="open-amount" type="number" min={0} step="0.5" inputMode="decimal" required value={openAmount}
                            onChange={(e) => setOpenAmount(e.target.value)} className={`${field} h-14 text-2xl font-display font-semibold`} />
                        <p className="text-sm text-bos-muted">
                            {left !== null ? `En el último cierre se dejaron ${money(left)}.` : `El fondo habitual es de ${money(settings?.float_target ?? 0)}.`}
                        </p>
                    </div>
                    {openDiffers && settings && (
                        <ReasonBox id="open-reason" warning={openingWarning(Number(openAmount) || 0, settings.last_float_left, floatTarget)}
                            value={openReason} onChange={setOpenReason} placeholder="Ej: Dago se llevó $50 de cambio al banco" />
                    )}
                    {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                    <button type="submit" disabled={opening} className={`${primary} w-full`}>
                        {opening ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Abrir caja
                    </button>
                </form>
                )}
                {settings?.can_edit && !readOnly && (
                    <button type="button" onClick={() => setSettingsOpen(true)} className={`${secondary} w-full`}><Settings2 className="h-5 w-5" /> Ajustes de caja (fondo y apartado)</button>
                )}
                <PastClosings sessions={history} reserveLabel={settings?.reserve_label ?? 'Apartado'} />
                {settingsDialog}
            </div>
        );
    }

    // ───────────────────────── Caja abierta
    const openingMismatch = session.opening_expected !== null && session.opening_expected !== undefined && session.opening_expected !== session.initial_amount;
    const nonCash = Math.round((session.total_card + session.total_transfer) * 100) / 100;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold">Caja abierta</h1>
                    <p className="text-sm text-bos-muted">Abierta {session.opened_by !== UNKNOWN_OPENER ? `por ${session.opened_by} ` : ''}a las {timeOf(session.opened_at)}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <DaySummaryButton variant="outline" />
                    {!readOnly && <>
                    {settings?.can_edit && <button type="button" onClick={() => setSettingsOpen(true)} className={secondary}><Settings2 className="h-5 w-5" /> Ajustes de caja</button>}
                    <button type="button" onClick={() => { setFormError(''); setMovementOpen(true); }} className={secondary}><Plus className="h-5 w-5" /> Gasto, retiro o entrada</button>
                    <button type="button" onClick={startClose} className={primary}>Cerrar caja</button>
                    </>}
                </div>
            </header>
            <ReadOnlyNotice readOnly={readOnly}>Ves la caja en vivo, pero no registras movimientos ni la cierras.</ReadOnlyNotice>

            {loadError && <p role="alert" className="rounded-xl border border-bos-danger/40 bg-bos-surface p-4 text-bos-danger">{loadError}</p>}
            {openingMismatch && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-bos-accent-soft p-4 text-sm">
                    <TriangleAlert aria-hidden="true" className="h-4 w-4 mt-0.5 text-bos-accent-text shrink-0" />
                    Esta caja abrió con {money(session.initial_amount)}, pero en el cierre anterior se dejaron {money(session.opening_expected ?? 0)}.
                </p>
            )}

            <section aria-label="Totales del turno" className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <div className={`${card} p-5 col-span-2 lg:col-span-1 relative`}>
                    <p className={label}>Efectivo en caja</p>
                    <p data-testid="cash-expected" className="mt-2 font-display text-4xl font-semibold tabular-nums">{money(expected)}</p>
                    <p className="mt-1 text-sm text-bos-muted">Fondo inicial {money(session.initial_amount)}</p>
                </div>
                <div className={`${card} p-5 relative overflow-hidden`}>
                    <p className={label}>Vendido</p>
                    <p data-testid="cash-sold" className="mt-2 font-display text-3xl font-semibold tabular-nums">{money(session.total_sales)}</p>
                    {gain && (
                        <span key={gain.key} aria-hidden="true" data-testid="cash-gain" className="bos-float absolute right-4 top-4 font-display text-2xl font-semibold text-bos-success">+{money(gain.amount)}</span>
                    )}
                </div>
                <div className={`${card} p-5`}>
                    <p className={label}>Tarjeta y transferencia</p>
                    <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{money(nonCash)}</p>
                </div>
                <div className={`${card} p-5`}>
                    <p className={label}>Propinas de barberos</p>
                    <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-bos-accent-text">{money(session.total_tips ?? 0)}</p>
                </div>
            </section>

            <section aria-label="El camino del efectivo" className={`${card} p-4 sm:p-5`}>
                <button type="button" data-testid="cash-flow-toggle" aria-expanded={flowOpen} aria-controls="cash-flow-panel" onClick={() => setFlowOpen(!flowOpen)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
                    <span>
                        <span className="block font-display text-lg font-semibold">¿Cuánto efectivo hay y por qué?</span>
                        <span className="block text-sm text-bos-muted">Fondo + entradas − salidas, con cada gasto y cada pago.</span>
                    </span>
                    <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-bos-muted transition-transform ${flowOpen ? 'rotate-180' : ''}`} />
                </button>
                {flowOpen && (
                    <div id="cash-flow-panel" className="mt-4 border-t border-bos-border pt-4">
                        <CashFlowPanel sessionId={session.id} refreshKey={`${movements.length}:${session.expected_cash ?? ''}`} />
                    </div>
                )}
            </section>

            <section aria-labelledby="cash-movements" className="space-y-3">
                <h2 id="cash-movements" className={label}>Movimientos del turno</h2>
                {movements.length === 0 ? (
                    <p className={`${card} p-8 text-center text-bos-muted`}>Todavía no hay movimientos. Los cobros aparecerán aquí.</p>
                ) : (
                    <ul className="space-y-2">
                        {movements.map((m) => {
                            const incoming = m.direction === 'in';
                            const isNew = fresh.has(m.id);
                            return (
                                <li key={m.id} data-testid="cash-movement"
                                    className={`${card} px-4 py-3 flex items-center gap-4 transition-colors ${isNew ? 'bos-rise border-bos-success' : ''}`}>
                                    <span aria-hidden="true" className={`h-10 w-10 rounded-full inline-flex items-center justify-center shrink-0 ${incoming ? 'bg-bos-success-soft text-bos-success' : 'bg-bos-raised text-bos-danger'}`}>
                                        {incoming ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] font-medium truncate">{m.description}</p>
                                        <p className="text-sm text-bos-muted flex flex-wrap items-center gap-x-2">
                                            {m.tag && <span data-testid="movement-tag" className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold ${TAG_STYLES[m.tag]}`}>{m.tag}</span>}
                                            <span>{timeOf(m.created_at)} · {METHOD_LABELS[m.payment_method] ?? m.payment_method}</span>
                                        </p>
                                    </div>
                                    <span className={`font-display text-lg font-semibold tabular-nums ${incoming ? 'text-bos-success' : 'text-bos-danger'}`}>
                                        {incoming ? '+' : '−'}{money(m.amount)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <PastClosings sessions={history} reserveLabel={settings?.reserve_label ?? 'Apartado'} />

            {/* Gasto, retiro o entrada */}
            {movementOpen && (
                <Dialog title="Registrar movimiento" onClose={() => setMovementOpen(false)}>
                    <form onSubmit={handleMovement} className="space-y-5">
                        <div role="group" aria-label="Tipo de movimiento" className="grid gap-2">
                            {MOVEMENT_TYPES.map((t) => {
                                const selected = movementType === t.id;
                                return (
                                    <button key={t.id} type="button" aria-pressed={selected} onClick={() => setMovementType(t.id)}
                                        className={`text-left rounded-xl border px-4 py-3 transition-colors ${selected ? 'border-bos-text bg-bos-raised' : 'border-bos-border hover:bg-bos-raised'}`}>
                                        <span className="flex items-center justify-between gap-3">
                                            <span className="font-semibold text-[15px]">{t.label}</span>
                                            <span className={`text-xs font-medium ${t.affects ? 'text-bos-danger' : 'text-bos-muted'}`}>Afecta la utilidad: {t.affects ? 'sí' : 'no'}</span>
                                        </span>
                                        <span className="block text-sm text-bos-muted">{t.short}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {(() => {
                            const t = MOVEMENT_TYPES.find((x) => x.id === movementType)!;
                            return (
                                <div data-testid="movement-explain" className="rounded-xl bg-bos-raised px-4 py-3 text-sm space-y-1">
                                    <p><span className="font-semibold">Ejemplos:</span> <span className="text-bos-muted">{t.example}</span></p>
                                    <p className="text-bos-muted">{t.effect}</p>
                                </div>
                            );
                        })()}
                        <div className="space-y-2">
                            <label htmlFor="movement-concept" className={label}>Concepto</label>
                            <input id="movement-concept" type="text" maxLength={300} placeholder="Ej. Agua, basura, cambio" value={movementConcept}
                                onChange={(e) => setMovementConcept(e.target.value)} className={field} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="movement-amount" className={label}>Cantidad en efectivo</label>
                            <input id="movement-amount" type="number" min={0} step="0.5" inputMode="decimal" placeholder="0" value={movementAmount}
                                onChange={(e) => setMovementAmount(e.target.value)} className={field} />
                            {movementType !== 'deposit' && <p className="text-sm text-bos-muted">Hay {money(expected)} en caja.</p>}
                        </div>
                        {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                        <button type="submit" disabled={saving} className={`${primary} w-full`}>{saving && <Loader2 className="h-5 w-5 animate-spin" />} Registrar</button>
                    </form>
                </Dialog>
            )}

            {/* Cierre guiado · paso 1: contar */}
            {closeStep === 1 && (
                <Dialog title="Cerrar caja · 1 de 2: contar" onClose={() => setCloseStep(0)}>
                    <div className="space-y-5">
                        <div role="group" aria-label="Forma de contar" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-bos-raised">
                            <button type="button" aria-pressed={byDenomination} onClick={() => setByDenomination(true)}
                                className={`h-11 rounded-lg text-sm font-semibold ${byDenomination ? 'bg-bos-surface shadow-sm' : 'text-bos-muted'}`}>Por billetes y monedas</button>
                            <button type="button" aria-pressed={!byDenomination} onClick={() => setByDenomination(false)}
                                className={`h-11 rounded-lg text-sm font-semibold ${!byDenomination ? 'bg-bos-surface shadow-sm' : 'text-bos-muted'}`}>Solo el total</button>
                        </div>

                        {byDenomination ? (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                {DENOMINATIONS.map((d) => (
                                    <label key={d.value} className="flex items-center justify-between gap-3">
                                        <span className="text-[15px]"><span className="font-semibold tabular-nums">{money(d.value)}</span> <span className="text-sm text-bos-muted">{d.kind === 'bill' ? 'billete' : 'moneda'}</span></span>
                                        <input type="number" min={0} step="1" inputMode="numeric" placeholder="0" aria-label={`Cantidad de ${d.kind === 'bill' ? 'billetes' : 'monedas'} de ${d.value}`}
                                            value={counts[String(d.value)] ? counts[String(d.value)] : ''}
                                            onChange={(e) => setCounts({ ...counts, [String(d.value)]: Math.max(Math.trunc(Number(e.target.value) || 0), 0) })}
                                            className="w-20 h-11 px-2 rounded-lg bg-bos-bg border border-bos-control text-center text-base focus-visible:border-bos-accent-text" />
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label htmlFor="counted-total" className={label}>Efectivo contado</label>
                                <input id="counted-total" type="number" min={0} step="0.5" inputMode="decimal" placeholder="0" value={countedTotal}
                                    onChange={(e) => setCountedTotal(e.target.value)} className={`${field} h-14 text-2xl font-display font-semibold`} />
                            </div>
                        )}

                        <dl className="rounded-2xl bg-bos-raised p-4 space-y-2 text-[15px]">
                            <div className="flex justify-between"><dt className="text-bos-muted">Contado</dt><dd data-testid="close-counted" className="font-display text-2xl font-semibold tabular-nums">{money(counted)}</dd></div>
                            <div className="flex justify-between"><dt className="text-bos-muted">Debería haber</dt><dd className="font-semibold tabular-nums">{money(expected)}</dd></div>
                            <div className="flex justify-between">
                                <dt className="text-bos-muted">Diferencia</dt>
                                <dd data-testid="close-difference" className={`font-semibold tabular-nums ${difference === 0 ? 'text-bos-success' : 'text-bos-danger'}`}>
                                    {differenceText(difference)}
                                </dd>
                            </div>
                        </dl>
                        {needsDiffReason && counted > 0 && (
                            <CheckFirstBox sessionId={session.id} difference={difference} open={checkOpen} onToggle={() => setCheckOpen(!checkOpen)} />
                        )}
                        <button type="button" onClick={toSplit} className={`${primary} w-full`}>Continuar</button>
                    </div>
                </Dialog>
            )}

            {/* Cierre guiado · paso 2: repartir */}
            {closeStep === 2 && (
                <Dialog title="Cerrar caja · 2 de 2: repartir" onClose={() => setCloseStep(0)}>
                    <div className="space-y-5">
                        {needsDiffReason && (
                            <>
                                <DifferenceReasonBox difference={difference} value={diffReason} onChange={setDiffReason} />
                                <button type="button" data-testid="close-review" onClick={() => { setCheckOpen(true); setCloseStep(1); }}
                                    className="-mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-bos-accent-text underline-offset-2 hover:underline">
                                    <Search aria-hidden="true" className="h-4 w-4" /> Revisar: ¿cuánto efectivo hay y por qué?
                                </button>
                            </>
                        )}
                        <p className="text-[15px] text-bos-muted">Se contaron <strong className="text-bos-text">{money(counted)}</strong>. Así se reparte:</p>
                        <div className="space-y-2">
                            <label htmlFor="close-float" className={label}>Se queda de fondo para mañana</label>
                            <input id="close-float" type="number" min={0} step="0.5" inputMode="decimal" value={floatLeft} onChange={(e) => setFloatLeft(e.target.value)} className={field} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="close-reserve" className={label}>Apartado · {settings?.reserve_label ?? 'Apartado'}</label>
                            <input id="close-reserve" type="number" min={0} step="0.5" inputMode="decimal" value={reserve} onChange={(e) => setReserve(e.target.value)} className={field} />
                            {(Number(reserve) || 0) > 0 && <EnvelopeNote />}
                        </div>
                        <div className="rounded-2xl bg-bos-raised p-4 flex items-baseline justify-between">
                            <span className="text-[15px] text-bos-muted">Retiro (lo que sobra)</span>
                            <span data-testid="close-withdrawn" className={`font-display text-3xl font-semibold tabular-nums ${withdrawn === null ? 'text-bos-danger' : 'text-bos-accent-text'}`}>{withdrawn === null ? 'No alcanza' : money(withdrawn)}</span>
                        </div>
                        {withdrawn !== null && withdrawn > 0 && (
                            <div className="space-y-2">
                                <label htmlFor="close-delivered-to" className={label}>¿A quién se entrega el retiro? (opcional)</label>
                                <input id="close-delivered-to" type="text" maxLength={120} autoComplete="off" value={deliveredTo} onChange={(e) => setDeliveredTo(e.target.value)} placeholder="Ej: Gerente, depósito al banco" className={field} />
                            </div>
                        )}
                        {closeShort && settings && (
                            <ReasonBox id="close-reason" warning={closingWarning(Number(floatLeft) || 0, floatTarget)}
                                value={shortReason} onChange={setShortReason} placeholder="Ej: Se pagó al proveedor en efectivo y no alcanzó" />
                        )}
                        {withdrawn === null && <p role="alert" className="text-sm text-bos-danger">El fondo más el apartado no pueden ser más que lo contado.</p>}
                        {formError && <p role="alert" className="text-sm text-bos-danger">{formError}</p>}
                        {diffProblem && (
                            <p id="close-blocked" data-testid="close-blocked" className="flex items-start gap-2 text-sm text-bos-muted">
                                <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                Para cerrar, escribe por qué {difference > 0 ? 'sobran' : 'faltan'} {money(Math.abs(difference))} (de {REASON_MIN} a {REASON_MAX} letras).
                            </p>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setCloseStep(1)} className={secondary}>Volver a contar</button>
                            <button type="button" data-testid="close-submit" onClick={handleClose} disabled={saving || withdrawn === null || Boolean(diffProblem)}
                                aria-describedby={diffProblem ? 'close-blocked' : undefined} className={primary}>{saving && <Loader2 className="h-5 w-5 animate-spin" />} Cerrar caja</button>
                        </div>
                    </div>
                </Dialog>
            )}
            {movementPin && (
                <PinConfirm title={`Registrar ${MOVEMENT_TYPES.find((t) => t.id === movementType)?.label.toLowerCase() ?? 'movimiento'}`}
                    fixedComment={movementConcept.trim()} confirmLabel="Registrar con PIN"
                    summary={<p><strong className="tabular-nums">{money(Number(movementAmount) || 0)}</strong> en efectivo</p>}
                    onClose={() => setMovementPin(false)} onConfirm={({ pin }) => postMovement(pin)} />
            )}
            {settingsDialog}
        </div>
    );
}
