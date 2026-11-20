'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Footprints, Info, Pencil, Plus, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import { formatMoney } from '@/lib/utils/money';
import {
    heroMessage, heroTone, learningText, monthName, paceMessage, per100Money, per100Rows, periodText, progressText, projectionText,
    ringFraction, type BreakEvenData, type Bucket,
} from '@/lib/break-even/model';

/** Prefiere menos movimiento (se lee una vez al montar). */
function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }, []);
    return reduced;
}

/** Conteo ascendente del número principal (sin animación si la persona pide menos movimiento). */
function useCountUp(target: number, duration = 1000): number {
    const reduced = usePrefersReducedMotion();
    const [value, setValue] = useState(target);
    useEffect(() => {
        if (reduced || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') { setValue(target); return; }
        let frame = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            setValue(target * (1 - Math.pow(1 - t, 3)));
            if (t < 1) frame = window.requestAnimationFrame(tick);
        };
        setValue(0);
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [target, duration, reduced]);
    return value;
}

/** true un instante después de montar: las barras parten de 0 y crecen (transform). */
function useEntered(): boolean {
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        const id = window.setTimeout(() => setEntered(true), 60);
        return () => window.clearTimeout(id);
    }, []);
    return entered;
}

const TONE_RING: Record<string, string> = {
    accent: 'var(--bos-accent)',
    success: 'var(--bos-success)',
    attention: 'var(--bos-warn)',
};

function Ring({ data }: { data: BreakEvenData }) {
    const tone = heroTone(data);
    const fraction = ringFraction(data.derived.progress_pct);
    const pct = data.derived.progress_pct ?? 0;
    const counted = useCountUp(pct);
    const shown = data.derived.covered ? `${Math.floor(counted)}` : progressText(counted).replace(' %', '').replace('menos del 1', '<1');
    const r = 52;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative mx-auto h-44 w-44 shrink-0 sm:h-52 sm:w-52" data-testid="be-ring">
            {data.derived.covered && (
                <div aria-hidden="true" className="be-glow pointer-events-none absolute -inset-6 rounded-full"
                    style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--bos-accent) 55%, transparent) 0%, transparent 68%)' }} />
            )}
            <svg viewBox="0 0 120 120" className="relative h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="60" cy="60" r={r} fill="none" stroke="var(--bos-raised)" strokeWidth="10" />
                <g className="be-ring-in" style={{ transformOrigin: '60px 60px' }}>
                    <circle cx="60" cy="60" r={r} fill="none" stroke={TONE_RING[tone]} strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={`${c * fraction} ${c}`} />
                </g>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="gi-serif text-5xl font-bold leading-none text-bos-text sm:text-6xl" data-testid="be-ring-value">
                    {shown}<span className="text-2xl sm:text-3xl"> %</span>
                </span>
                <span className="mt-1 text-xs font-medium text-bos-muted">{data.derived.covered ? 'del mes, cubierto' : 'del mes cubierto'}</span>
            </div>
        </div>
    );
}

function Hero({ data }: { data: BreakEvenData }) {
    const msg = heroMessage(data);
    const tone = heroTone(data);
    const d = data.derived;
    return (
        <section aria-labelledby="be-hero-title" className="relative overflow-hidden rounded-2xl border border-bos-border bg-bos-surface p-5 sm:p-8">
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:gap-10">
                <Ring data={data} />
                <div className="min-w-0 flex-1 text-center md:text-left">
                    {d.covered && (
                        <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-bos-success-soft px-3 py-1 text-xs font-semibold text-bos-success">
                            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Meta del mes cumplida
                        </p>
                    )}
                    <h2 id="be-hero-title" className="gi-serif text-balance text-[1.75rem] font-semibold leading-tight text-bos-text sm:text-4xl" data-testid="be-hero-title">
                        {msg.title}
                    </h2>
                    {msg.detail && <p className={`mt-2 text-base sm:text-lg ${tone === 'attention' ? 'text-bos-text' : 'text-bos-muted'}`} data-testid="be-hero-detail">{msg.detail}</p>}
                    {msg.learning && !data.needs_setup && (
                        <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-bos-accent-soft px-3 py-2 text-left text-sm text-bos-text" data-testid="be-learning">
                            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-bos-accent-text" /> {learningText(data)}
                        </p>
                    )}
                    <dl className="mt-5 grid grid-cols-2 gap-3 text-left sm:grid-cols-3">
                        <div className="rounded-xl bg-bos-raised px-3 py-2.5">
                            <dt className="text-xs text-bos-muted">Gastos fijos del mes</dt>
                            <dd className="gi-serif text-xl font-semibold text-bos-text">{formatMoney(data.fixed.total)}</dd>
                        </div>
                        <div className="rounded-xl bg-bos-raised px-3 py-2.5">
                            <dt className="text-xs text-bos-muted">{data.status === 'past' ? 'Margen del mes' : 'Margen hasta hoy'}</dt>
                            <dd className="gi-serif text-xl font-semibold text-bos-text">{formatMoney(Math.max(0, data.month_to_date.margin))}</dd>
                        </div>
                        {d.goal_revenue !== null && (
                            <div className="col-span-2 rounded-xl bg-bos-raised px-3 py-2.5 sm:col-span-1">
                                <dt className="text-xs text-bos-muted">Ventas para cubrirlo (aprox.)</dt>
                                <dd className="gi-serif text-xl font-semibold text-bos-text">{formatMoney(Math.round(d.goal_revenue))}</dd>
                            </div>
                        )}
                    </dl>
                </div>
            </div>
        </section>
    );
}

function BucketRow({ bucket, index, count, canEdit, entered, onEdit, onMove }: {
    bucket: Bucket; index: number; count: number; canEdit: boolean; entered: boolean;
    onEdit?: (b: Bucket) => void; onMove?: (b: Bucket, delta: -1 | 1) => void;
}) {
    const isTemplate = bucket.kind === 'template';
    const fill = Math.max(0, Math.min(1, bucket.pct / 100));
    return (
        <li className="py-4 first:pt-0 last:pb-0" data-testid="be-bucket">
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${bucket.complete ? 'border-bos-success bg-bos-success-soft text-bos-success' : 'border-bos-border text-bos-muted'}`}>
                    {bucket.complete ? <Check className="h-4 w-4" /> : <span className="text-xs font-semibold">{index + 1}</span>}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="flex min-w-0 flex-wrap items-center gap-2 font-semibold text-bos-text">
                            <span className="truncate">{bucket.name}</span>
                            {bucket.complete && <span className="sr-only">(cubierto)</span>}
                            {bucket.is_estimate && <span className="rounded-full border border-bos-border px-2 py-0.5 text-[11px] font-medium text-bos-muted">estimado</span>}
                        </p>
                        <p className="gi-serif text-lg font-semibold text-bos-text">{formatMoney(bucket.amount)}</p>
                    </div>
                    <p className="text-xs text-bos-muted">{periodText(bucket)}</p>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-bos-raised" role="progressbar" aria-label={`${bucket.name}: cubierto`}
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bucket.pct)}>
                        <div className={`be-fill h-full rounded-full ${bucket.complete ? 'bg-bos-success' : 'bg-bos-accent'}`}
                            style={{ transform: `scaleX(${entered ? fill : 0})` }} />
                    </div>
                    <p className="mt-1 text-xs text-bos-muted">
                        {bucket.complete ? 'Cubierto' : bucket.filled > 0 ? `Llevas ${formatMoney(bucket.filled)} (${Math.floor(bucket.pct)} %)` : 'Sigue en la fila'}
                    </p>
                </div>
            </div>
            {canEdit && isTemplate && (
                <div className="mt-2 flex items-center justify-end gap-1 pl-10">
                    <button type="button" onClick={() => onMove?.(bucket, -1)} disabled={index === 0}
                        aria-label={`Subir ${bucket.name}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-bos-muted hover:bg-bos-raised hover:text-bos-text disabled:opacity-40">
                        <ArrowUp aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onMove?.(bucket, 1)} disabled={index >= count - 1}
                        aria-label={`Bajar ${bucket.name}`} className="flex h-11 w-11 items-center justify-center rounded-xl text-bos-muted hover:bg-bos-raised hover:text-bos-text disabled:opacity-40">
                        <ArrowDown aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onEdit?.(bucket)} aria-label={`Editar ${bucket.name}`}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-bos-accent-text hover:bg-bos-raised">
                        <Pencil aria-hidden="true" className="h-4 w-4" /> Editar
                    </button>
                </div>
            )}
        </li>
    );
}

function Buckets({ data, canEdit, onEdit, onMove, onAdd }: {
    data: BreakEvenData; canEdit: boolean; onEdit?: (b: Bucket) => void; onMove?: (b: Bucket, delta: -1 | 1) => void; onAdd?: () => void;
}) {
    const entered = useEntered();
    const templates = data.buckets.filter((b) => b.kind === 'template').length;
    return (
        <section aria-labelledby="be-buckets-title" className="rounded-2xl border border-bos-border bg-bos-surface p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h2 id="be-buckets-title" className="font-display text-lg font-semibold">Tus gastos fijos, uno por uno</h2>
                    <p className="text-sm text-bos-muted">Lo que deja cada servicio va llenando estas cubetas en orden.</p>
                </div>
                {data.fixed.has_estimates && <p className="text-xs text-bos-muted">«estimado»: monto aproximado, edítalo cuando quieras.</p>}
            </div>
            <ol className="divide-y divide-bos-border">
                {data.buckets.map((b, i) => (
                    <BucketRow key={b.key} bucket={b} index={i} count={templates} canEdit={canEdit} entered={entered} onEdit={onEdit} onMove={onMove} />
                ))}
            </ol>
            <div className="mt-5 flex flex-wrap items-center gap-3">
                {canEdit && (
                    <Button variant="secondary" size="sm" onClick={onAdd}><Plus aria-hidden="true" className="h-4 w-4" /> Agregar gasto fijo</Button>
                )}
                <Link href="/gastos" className="inline-flex min-h-11 items-center text-sm font-semibold text-bos-accent-text underline-offset-2 hover:underline">
                    Registrar los pagos en Gastos
                </Link>
            </div>
            {data.fixed.wages.total > 0 && (
                <p className="mt-3 text-xs text-bos-muted">
                    Sueldos: {data.fixed.wages.paid_days} {data.fixed.wages.paid_days === 1 ? 'día' : 'días'} ya trabajados y {data.fixed.wages.projected_days} por venir
                    según el horario fijo de recepción ({formatMoney(data.fixed.wages.to_date)} + {formatMoney(data.fixed.wages.projected)}).
                </p>
            )}
        </section>
    );
}

// Bronce y grises de la marca, con contraste suficiente en claro y oscuro; la leyenda en texto dice qué es cada uno.
const SEGMENT_COLORS = [
    'var(--bos-accent)',
    'var(--bos-control)',
    'color-mix(in srgb, var(--bos-accent) 60%, var(--bos-text))',
    'color-mix(in srgb, var(--bos-accent) 60%, var(--bos-control))',
    'color-mix(in srgb, var(--bos-text) 65%, var(--bos-control))',
    'color-mix(in srgb, var(--bos-muted) 85%, var(--bos-accent))',
    'color-mix(in srgb, var(--bos-accent) 80%, var(--bos-muted))',
];

function Per100({ data }: { data: BreakEvenData }) {
    const entered = useEntered();
    const per = per100Rows(data);
    if (!per) return null;
    const total = per.rows.reduce((s, r) => s + r.share, 0) + per.left;
    const segments = [
        ...per.rows.map((r, i) => ({ key: r.key, label: r.label, amount: r.share, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] })),
        ...(per.left > 0 ? [{ key: 'left', label: 'Te queda', amount: per.left, color: 'var(--bos-success)' }] : []),
    ];
    return (
        <section aria-labelledby="be-per100-title" className="rounded-2xl border border-bos-border bg-bos-surface p-5 sm:p-6">
            <h2 id="be-per100-title" className="font-display text-lg font-semibold">De cada $100 que entran</h2>
            <p className="text-sm text-bos-muted">
                {data.per_100?.source === 'reference' ? 'Con tu ritmo de las últimas semanas, en un mes normal.' : data.status === 'past' ? 'Así se repartió lo que entró este mes.' : 'Con lo que va del mes, llevado al mes completo.'}
            </p>
            <div className="mt-4 h-5 overflow-hidden rounded-full bg-bos-raised" aria-hidden="true">
                <div className="be-fill flex h-full w-full" style={{ transform: `scaleX(${entered ? 1 : 0})` }}>
                    {segments.map((s) => (
                        <div key={s.key} className="h-full border-r border-bos-surface last:border-r-0" style={{ width: `${(s.amount / Math.max(total, 100)) * 100}%`, background: s.color }} />
                    ))}
                </div>
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-1" data-testid="be-per100">
                {segments.map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                            <span className={`truncate ${s.key === 'left' ? 'font-semibold text-bos-text' : 'text-bos-text'}`}>{s.label}</span>
                        </span>
                        <span className={`tabular-nums ${s.key === 'left' ? 'font-semibold text-bos-success' : 'text-bos-muted'}`}>{per100Money(s.amount)}</span>
                    </li>
                ))}
            </ul>
            {per.short > 0 && (
                <p className="mt-3 text-sm text-bos-muted">
                    Por ahora lo que entra no alcanza a cubrir todos los fijos (faltan {per100Money(per.short)} de cada $100); cada servicio de más acerca la meta.
                </p>
            )}
        </section>
    );
}

function Pace({ data }: { data: BreakEvenData }) {
    const pace = paceMessage(data);
    const projection = projectionText(data);
    const avg = data.derived.services_per_day_reference;
    if (!pace && !projection) return null;
    return (
        <section aria-labelledby="be-pace-title" className="rounded-2xl border border-bos-border bg-bos-surface p-5 sm:p-6">
            <h2 id="be-pace-title" className="flex items-center gap-2 font-display text-lg font-semibold">
                <Footprints aria-hidden="true" className="h-5 w-5 text-bos-accent-text" /> Tu ritmo
            </h2>
            {pace && <p className="mt-2 text-base text-bos-text" data-testid="be-pace">{pace.text}</p>}
            {pace?.ahead && <p className="mt-1 text-sm font-medium text-bos-success">Vas por encima de lo que hace falta.</p>}
            {avg !== null && <p className="mt-1 text-sm text-bos-muted">Tu promedio de las últimas semanas: {avg.toLocaleString('es-MX', { maximumFractionDigits: 1 })} servicios al día.</p>}
            {projection && <p className="mt-2 text-sm text-bos-text">{projection}</p>}
        </section>
    );
}

export interface BreakEvenViewProps {
    data: BreakEvenData;
    canEdit: boolean;
    practice?: boolean;
    canGoNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    onEdit?: (bucket: Bucket) => void;
    onMove?: (bucket: Bucket, delta: -1 | 1) => void;
    onAdd?: () => void;
}

export function MonthNav({ month, onPrev, onNext, canGoNext, disabled }: { month: string; onPrev: () => void; onNext: () => void; canGoNext: boolean; disabled?: boolean }) {
    return (
        <div role="group" aria-label="Mes" className="inline-flex items-center gap-1 rounded-xl bg-bos-raised p-1">
            <button type="button" onClick={onPrev} disabled={disabled} aria-label="Mes anterior"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-bos-muted hover:bg-bos-surface hover:text-bos-text disabled:opacity-40">
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <span className="min-w-36 px-2 text-center text-sm font-semibold capitalize text-bos-text" aria-live="polite" data-testid="be-month">{monthName(month)}</span>
            <button type="button" onClick={onNext} disabled={disabled || !canGoNext} aria-label="Mes siguiente"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-bos-muted hover:bg-bos-surface hover:text-bos-text disabled:opacity-40">
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
        </div>
    );
}

export function Header({ practice, nav }: { practice?: boolean; nav?: React.ReactNode }) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <h1 className="font-display text-3xl font-semibold tracking-tight">Punto de equilibrio</h1>
                <p className="mt-1 max-w-xl text-sm text-bos-muted">Cuánto falta para cubrir los gastos fijos del mes, y desde cuándo todo es ganancia.</p>
                {practice && (
                    <p className="mt-2 inline-flex rounded-full border border-bos-warn px-2.5 py-0.5 text-xs font-semibold text-bos-text" data-testid="be-practice">
                        Datos de ensayo
                    </p>
                )}
            </div>
            {nav}
        </header>
    );
}

export function HonestNote() {
    return (
        <aside className="rounded-xl px-1 text-xs leading-relaxed text-bos-muted" data-testid="be-note">
            <p>
                Es una estimación: cada servicio deja distinto. Los gastos que no son fijos (compras, limpieza) no entran en esta meta,
                sí en la utilidad de <Link href="/administracion" className="underline underline-offset-2">Finanzas</Link>.
                El margen es lo que queda de cada venta después de comisiones y costo de producto (las propinas son del equipo).
            </p>
        </aside>
    );
}

/** La pantalla completa con datos ya cargados (sin red): la usa la página y se puede montar sola para revisarla. */
export default function BreakEvenView({ data, canEdit, practice, canGoNext, onPrev, onNext, onEdit, onMove, onAdd }: BreakEvenViewProps) {
    return (
        <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
            <Header practice={practice} nav={<MonthNav month={data.month} onPrev={onPrev} onNext={onNext} canGoNext={canGoNext} />} />
            {data.needs_setup ? (
                <section className="rounded-2xl border border-bos-border bg-bos-surface" data-testid="be-setup">
                    <EmptyState title="Captura tus gastos fijos para empezar"
                        description="Renta, luz, internet… Con eso calculamos cuánto falta para cubrir el mes y desde cuándo todo es ganancia."
                        action={canEdit ? <Button onClick={onAdd}><Plus aria-hidden="true" className="h-4 w-4" /> Agregar gasto fijo</Button>
                            : <p className="text-sm text-bos-muted">Pídele a la cuenta principal que los capture.</p>} />
                </section>
            ) : (
                <>
                    <Hero data={data} />
                    {data.month_to_date.sales === 0 && data.status !== 'future' && (
                        <p className="rounded-xl border border-bos-border bg-bos-surface px-4 py-3 text-sm text-bos-muted" data-testid="be-no-sales">
                            {data.status === 'past' ? 'Ese mes no tuvo ventas registradas.' : 'Todavía no hay ventas este mes. En cuanto entre la primera, las cubetas empiezan a llenarse.'}
                        </p>
                    )}
                    <div className="grid gap-5 sm:gap-6 lg:grid-cols-[1.15fr_1fr]">
                        <Buckets data={data} canEdit={canEdit} onEdit={onEdit} onMove={onMove} onAdd={onAdd} />
                        <div className="space-y-5 sm:space-y-6">
                            <Pace data={data} />
                            <Per100 data={data} />
                        </div>
                    </div>
                </>
            )}
            <HonestNote />
        </div>
    );
}
