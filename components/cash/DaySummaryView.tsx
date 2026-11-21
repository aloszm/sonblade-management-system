'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardCopy, FileDown, FileSpreadsheet, MessageCircle, Printer } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import Button from '@/components/ui/Button';
import DatePicker from '@/components/ui/DatePicker';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Skeleton from '@/components/ui/Skeleton';
import CashFlowView, { CashFlowDayTotal } from '@/components/cash/CashFlowView';
import type { CashFlow, OtherExpenses } from '@/lib/cash/cash-flow';
import type { DaySummaryPayload } from '@/lib/cash/day-summary';
import {
    addDay, buildWhatsAppText, longDayLabel, money, summaryFileName, summaryTitle, whatsAppUrl,
} from '@/lib/cash/day-summary-text';
import { todayInBusiness } from '@/lib/ui/date-picker';
import { formatTime } from '@/lib/utils/dates';
import { HttpError, isOfflineError, toUserMessage } from '@/lib/utils/errors';

const card = 'rounded-xl border border-bos-border bg-bos-surface print:break-inside-avoid';
const sectionTitle = 'font-display text-lg font-semibold print:text-base';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function saveFile(bytes: Uint8Array, filename: string, mime: string) {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

async function logoDataUrl(): Promise<string | null> {
    try {
        const res = await fetch('/logo-light.png', { cache: 'force-cache' });
        if (!res.ok) return null;
        const blob = await res.blob();
        // Se reduce a 160 px: el logo original es grande y haría pesado el PDF.
        const bitmap = await createImageBitmap(blob);
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = Math.round((bitmap.height / bitmap.width) * size);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    } catch { return null; }
}

/** Carga el resumen de un día desde la ruta de datos (la única fuente: ventana y página la comparten). */
export function useDaySummary(day: string) {
    const [data, setData] = useState<DaySummaryPayload | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [loading, setLoading] = useState(true);
    const seq = useRef(0);

    const load = useCallback(async () => {
        const mine = ++seq.current;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/cash/day-summary?date=${encodeURIComponent(day)}`, { cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new HttpError(res.status, typeof body?.error === 'string' ? body.error : undefined);
            if (mine === seq.current) setData(body as DaySummaryPayload);
        } catch (e) {
            if (mine === seq.current) { setData(null); setError(e); }
        } finally {
            if (mine === seq.current) setLoading(false);
        }
    }, [day]);

    useEffect(() => { void load(); }, [load]);
    return { data, error, loading, reload: load };
}

function Stat({ title, value, hint, testId }: { title: string; value: string; hint?: string; testId?: string }) {
    return (
        <div className="min-w-0 rounded-lg bg-bos-raised p-3 print:p-2">
            <p className="text-[13px] font-medium text-bos-muted">{title}</p>
            <p data-testid={testId} className="font-display text-xl font-semibold tabular-nums">{value}</p>
            {hint && <p className="text-[13px] text-bos-muted">{hint}</p>}
        </div>
    );
}

/** Una caja del día: encabezado y su camino del efectivo; con varias cajas, cada una se pliega. */
function SessionCard({ s, index, many, collapsedByDefault, tz, otherExpenses }: {
    s: CashFlow; index: number; many: boolean; collapsedByDefault: boolean; tz: string; otherExpenses: OtherExpenses | null;
}) {
    const [open, setOpen] = useState(!collapsedByDefault);
    const title = `${many ? `Caja ${index + 1} · ` : ''}${s.open ? 'Abierta' : 'Cerrada'}`;
    const panelId = `cash-session-${s.id}`;
    return (
        <article data-testid="cash-session" className="space-y-3 rounded-lg border border-bos-border p-3 sm:p-4 print:break-inside-avoid">
            <header>
                {many ? (
                    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)} data-testid="cash-session-toggle"
                        className="flex w-full items-center justify-between gap-2 text-left">
                        <h4 className="font-semibold">{title}</h4>
                        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-bos-muted transition-transform print:hidden ${open ? 'rotate-180' : ''}`} />
                    </button>
                ) : <h4 className="font-semibold">{title}</h4>}
                <p className="text-sm text-bos-muted">
                    Abrió {s.openedBy} a las {formatTime(s.openedAt, tz)}
                    {s.closedAt && <> · Cerró {s.closedBy ?? 'alguien'} a las {formatTime(s.closedAt, tz)}</>}
                </p>
            </header>
            {s.open && <p role="status" className="rounded-lg bg-bos-accent-soft p-2 text-sm font-semibold">Caja abierta: el resumen puede cambiar.</p>}
            <div id={panelId} className={`${open ? 'block' : 'hidden'} print:block`}>
                <CashFlowView flow={s} timezone={tz} otherExpenses={otherExpenses} omitOtherExpenses={many} idPrefix={`ds${index}`} />
            </div>
        </article>
    );
}

export function SummaryBody({ data }: { data: DaySummaryPayload }) {
    const { summary, cash } = data;
    const t = summary.totals;
    const empty = summary.sales.paidCount === 0;
    return (
        <div className="space-y-4 print:space-y-2">
            {empty ? (
                <section className={card}>
                    <EmptyState title="No hubo cobros este día"
                        description={summary.sales.voidedCount ? `Hubo ${plural(summary.sales.voidedCount, 'venta anulada', 'ventas anuladas')} (${money(summary.sales.voidedCents)}); no cuentan.` : 'No hay ventas cobradas en este día.'} />
                </section>
            ) : (
                <>
                    <section aria-labelledby="ds-total" className={`${card} space-y-3 p-4 sm:p-5 print:space-y-2 print:p-3`}>
                        <div>
                            <h3 id="ds-total" className="text-[13px] font-medium text-bos-muted">Total cobrado</h3>
                            <p data-testid="ds-grand-total" className="font-display text-4xl print:text-3xl font-semibold tabular-nums leading-tight text-bos-accent-text">{money(t.grandTotalCents)}</p>
                            <p className="text-sm text-bos-muted">{plural(summary.sales.paidCount, 'venta cobrada', 'ventas cobradas')}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <Stat title="Servicios" value={money(t.servicesCents)} testId="ds-services" hint={`${plural(t.serviceCount, 'servicio', 'servicios')}${t.cutCount ? `, de los cuales ${plural(t.cutCount, 'corte', 'cortes')}` : ''}`} />
                            <Stat title="Productos" value={money(t.productsCents)} testId="ds-products" hint={plural(t.productUnits, 'pieza', 'piezas')} />
                            <Stat title="Propinas" value={money(t.tipsCents)} testId="ds-tips" hint="Son del equipo" />
                        </div>
                        <p className="text-sm text-bos-muted">
                            Ingreso de la barbería (servicios + productos): <strong data-testid="ds-income" className="tabular-nums text-bos-text">{money(t.businessIncomeCents)}</strong>.
                            Las propinas son del equipo y no cuentan como ingreso.
                        </p>
                        {summary.sales.voidedCount > 0 && (
                            <p data-testid="ds-voided" className="text-sm text-bos-muted">
                                {plural(summary.sales.voidedCount, 'venta anulada', 'ventas anuladas')} ({money(summary.sales.voidedCents)}): no cuentan en estos totales.
                            </p>
                        )}
                        {!summary.check.ok && (
                            <p role="alert" className="rounded-lg border border-bos-danger p-2 text-sm font-semibold text-bos-danger">
                                Atención: los repartos no suman el total (formas de pago {money(summary.check.methodsDiffCents)}, personas {money(summary.check.peopleDiffCents)}). Avisa a la cuenta principal.
                            </p>
                        )}
                    </section>

                    <section aria-labelledby="ds-methods" className={`${card} space-y-3 p-4 sm:p-5 print:space-y-2 print:p-3`}>
                        <h3 id="ds-methods" className={sectionTitle}>Por forma de pago</h3>
                        <ul className="divide-y divide-bos-border">
                            {summary.methods.map((m) => (
                                <li key={m.method} data-testid="ds-method" className="flex items-start justify-between gap-3 py-2.5 print:py-1">
                                    <div className="min-w-0">
                                        <p className="font-semibold">{m.label}</p>
                                        <p className="text-sm text-bos-muted">
                                            Ventas {money(m.salesCents)} · Propinas {money(m.tipsCents)} · {plural(m.payments, 'cobro', 'cobros')}
                                        </p>
                                    </div>
                                    <p className="font-display text-lg font-semibold tabular-nums">{money(m.totalCents)}</p>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section aria-labelledby="ds-people" className={`${card} space-y-3 p-4 sm:p-5 print:space-y-2 print:p-3`}>
                        <h3 id="ds-people" className={sectionTitle}>Quién atendió</h3>
                        <div className="overflow-hidden rounded-lg border border-bos-border">
                            <table className="bos-stack w-full text-[15px]">
                                <thead>
                                    <tr className="bg-bos-raised text-left text-[13px] text-bos-muted">
                                        <th scope="col" className="px-3 py-2 font-medium">Persona</th>
                                        <th scope="col" className="px-3 py-2 text-right font-medium">Servicios</th>
                                        <th scope="col" className="px-3 py-2 text-right font-medium">Productos</th>
                                        <th scope="col" className="px-3 py-2 text-right font-medium">Propinas</th>
                                        <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-bos-border">
                                    {summary.people.map((p) => (
                                        <tr key={p.employeeId ?? 'none'} data-testid="ds-person">
                                            <td data-label="" className="px-3 py-2.5 print:py-1 print:py-1 font-semibold">{p.name}</td>
                                            <td data-label="Servicios" className="px-3 py-2.5 print:py-1 text-right tabular-nums">
                                                {p.serviceCount} · {money(p.servicesCents)}
                                                {p.cutCount > 0 && <span className="block text-[13px] text-bos-muted">de los cuales {plural(p.cutCount, 'corte', 'cortes')}</span>}
                                            </td>
                                            <td data-label="Productos" className="px-3 py-2.5 print:py-1 text-right tabular-nums">
                                                {money(p.productsCents)}{p.productUnits > 0 && <span className="block text-[13px] text-bos-muted">{plural(p.productUnits, 'pieza', 'piezas')}</span>}
                                            </td>
                                            <td data-label="Propinas" className="px-3 py-2.5 print:py-1 text-right tabular-nums">{money(p.tipsCents)}</td>
                                            <td data-label="Total" className="px-3 py-2.5 print:py-1 text-right font-semibold tabular-nums max-md:order-first">{money(p.totalCents)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[13px] text-bos-muted">El servicio se apunta a quien lo hizo y el producto a quien lo vendió.</p>
                    </section>
                </>
            )}

            <section aria-labelledby="ds-cash" className={`${card} space-y-3 p-4 sm:p-5 print:space-y-2 print:p-3`}>
                <h3 id="ds-cash" className={sectionTitle}>Caja del día · el camino del efectivo</h3>
                {cash.sessions.length === 0
                    ? <p data-testid="ds-no-cash" className="text-sm text-bos-muted">No hubo caja abierta este día.</p>
                    : (
                        <>
                            {cash.sessions.length > 1 && <CashFlowDayTotal total={cash.total} otherExpenses={cash.otherExpenses} />}
                            {cash.sessions.map((s, i) => (
                                <SessionCard key={s.id} s={s} index={i} many={cash.sessions.length > 1} collapsedByDefault={cash.sessions.length > 3 && !s.open}
                                    tz={data.timezone} otherExpenses={cash.otherExpenses} />
                            ))}
                        </>
                    )}
            </section>
        </div>
    );
}

type Busy = 'xlsx' | 'pdf' | null;

export interface DaySummaryViewProps {
    /** Nivel del encabezado con la fecha: 'h1' en la página, 'h2' dentro de la ventana. */
    headingAs?: 'h1' | 'h2';
    /** Día con el que abre (AAAA-MM-DD); por omisión, hoy. */
    initialDay?: string;
    /** Dentro de la ventana, «Imprimir» abre la página dedicada (la ventana no se imprime bien). */
    printViaPage?: boolean;
    /** Imprime solo al cargar (la página abierta desde la ventana). */
    autoPrint?: boolean;
}

/** El resumen completo con selector de día y acciones. Lo usan la página /caja/resumen y la ventana de Caja y Panel. */
export default function DaySummaryView({ headingAs = 'h1', initialDay, printViaPage = false, autoPrint = false }: DaySummaryViewProps) {
    const [day, setDay] = useState(initialDay ?? todayInBusiness());
    const { data, error, loading, reload } = useDaySummary(day);
    const [busy, setBusy] = useState<Busy>(null);
    const [actionError, setActionError] = useState<{ kind: 'xlsx' | 'pdf'; message: string } | null>(null);
    const [notice, setNotice] = useState('');
    const [waLink, setWaLink] = useState<string | null>(null);
    const printed = useRef(false);

    const today = data?.today ?? todayInBusiness();
    const min = data?.minDay ?? undefined;
    const prevDisabled = Boolean(min) && day <= (min as string);
    const nextDisabled = day >= today;
    const Heading = headingAs;

    const text = useMemo(() => (data ? buildWhatsAppText(data.date, data.summary, data.cash) : ''), [data]);

    useEffect(() => {
        if (autoPrint && data && !printed.current) { printed.current = true; setTimeout(() => window.print(), 300); }
    }, [autoPrint, data]);

    const go = (next: string) => { setNotice(''); setWaLink(null); setActionError(null); setDay(next); };

    const sendWhatsApp = () => {
        if (!data) return;
        const url = whatsAppUrl(text);
        // Se abre dentro del toque para que el navegador no la bloquee.
        const tab = window.open(url, '_blank', 'noopener');
        if (!tab) setWaLink(url); else setWaLink(null);
        setNotice(tab ? 'Se abrió WhatsApp: elige el contacto o el grupo.' : '');
    };

    const copy = async () => {
        if (!data) return;
        try {
            await navigator.clipboard.writeText(text);
            setNotice('Resumen copiado. Pégalo donde lo necesites.');
        } catch {
            try {
                const area = document.createElement('textarea');
                area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
                document.body.appendChild(area); area.select();
                const ok = document.execCommand('copy');
                area.remove();
                setNotice(ok ? 'Resumen copiado. Pégalo donde lo necesites.' : 'No se pudo copiar. Selecciona el texto de abajo y cópialo.');
            } catch { setNotice('No se pudo copiar. Selecciona el texto de abajo y cópialo.'); }
        }
    };

    const print = () => {
        if (printViaPage) window.open(`/caja/resumen?fecha=${day}&imprimir=1`, '_blank');
        else window.print();
    };

    const download = async (kind: 'xlsx' | 'pdf') => {
        if (!data || busy) return;
        setBusy(kind); setActionError(null); setNotice('');
        try {
            const name = summaryFileName(data.date);
            if (kind === 'xlsx') {
                const bytes = await (await import('@/lib/cash/day-summary-xlsx')).buildDaySummaryXlsx(data);
                saveFile(bytes, `${name}.xlsx`, XLSX_MIME);
            } else {
                const bytes = await (await import('@/lib/cash/day-summary-pdf')).buildDaySummaryPdf(data, { logo: await logoDataUrl() });
                saveFile(bytes, `${name}.pdf`, 'application/pdf');
            }
            setNotice(kind === 'xlsx' ? 'Excel descargado.' : 'PDF descargado.');
        } catch (e) {
            console.error(e);
            setActionError({ kind, message: `No se pudo generar el ${kind === 'xlsx' ? 'Excel' : 'PDF'}. Inténtalo de nuevo.` });
        } finally { setBusy(null); }
    };

    const status = error instanceof HttpError ? error.status : 0;
    const dayChip = day === today ? 'Hoy' : day === addDay(today, -1) ? 'Ayer' : null;

    return (
        <div className="space-y-4 print:space-y-2" data-testid="day-summary">
            <BrandLogo alt="" className="hidden h-12 w-auto print:block" />
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <Heading data-testid="ds-title" className={`font-display font-semibold ${headingAs === 'h1' ? 'text-2xl sm:text-3xl print:text-xl' : 'text-xl'}`}>
                        {summaryTitle(day)}
                    </Heading>
                    {dayChip && <span className="mt-1 inline-block print:hidden rounded-full bg-bos-accent-soft px-2.5 py-0.5 text-[13px] font-semibold">{dayChip}</span>}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Elegir día">
                <Button variant="secondary" size="sm" onClick={() => go(addDay(day, -1))} disabled={prevDisabled} aria-label="Día anterior"><ChevronLeft aria-hidden="true" className="h-4 w-4" /> Anterior</Button>
                <Button variant="secondary" size="sm" onClick={() => go(addDay(day, 1))} disabled={nextDisabled} aria-label="Día siguiente">Siguiente <ChevronRight aria-hidden="true" className="h-4 w-4" /></Button>
                <Button variant="secondary" size="sm" onClick={() => go(today)} disabled={day === today}>Hoy</Button>
                <div className="w-full sm:w-56">
                    <DatePicker value={day} min={min} max={today} aria-label="Elegir fecha" onChange={(v) => v && go(v)} />
                </div>
            </div>

            {loading && !data && (
                <div aria-busy="true" aria-label="Cargando el resumen" className="space-y-3">
                    <Skeleton className="h-36 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-40 w-full" />
                </div>
            )}

            {error != null && !loading && (
                status === 403
                    ? <div className={card}><EmptyState title="No puedes ver este día" description={error instanceof HttpError && error.serverMessage ? error.serverMessage : 'Tu puesto puede ver el resumen de hoy y de ayer.'}
                        action={<Button variant="secondary" size="sm" onClick={() => go(today)}>Ver hoy</Button>} /></div>
                    : <ErrorState title="No se pudo cargar el resumen" message={toUserMessage(error)} offline={isOfflineError(error)} onRetry={reload} />
            )}

            {data && (
                <div className={loading ? 'opacity-60' : ''} aria-busy={loading}>
                    <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Enviar o descargar el resumen">
                        <Button size="sm" onClick={sendWhatsApp} data-testid="ds-whatsapp"><MessageCircle aria-hidden="true" className="h-4 w-4" /> Enviar por WhatsApp</Button>
                        <Button size="sm" variant="secondary" onClick={copy} data-testid="ds-copy"><ClipboardCopy aria-hidden="true" className="h-4 w-4" /> Copiar resumen</Button>
                        <Button size="sm" variant="secondary" onClick={() => download('pdf')} loading={busy === 'pdf'} loadingText="Generando…" data-testid="ds-pdf"><FileDown aria-hidden="true" className="h-4 w-4" /> Descargar PDF</Button>
                        <Button size="sm" variant="secondary" onClick={() => download('xlsx')} loading={busy === 'xlsx'} loadingText="Generando…" data-testid="ds-xlsx"><FileSpreadsheet aria-hidden="true" className="h-4 w-4" /> Descargar Excel</Button>
                        <Button size="sm" variant="secondary" onClick={print} data-testid="ds-print"><Printer aria-hidden="true" className="h-4 w-4" /> Imprimir</Button>
                    </div>
                    <div aria-live="polite" className="print:hidden">
                        {notice && <p data-testid="ds-notice" className="mb-3 text-sm font-medium text-bos-success">{notice}</p>}
                        {waLink && (
                            <p className="mb-3 text-sm">
                                El navegador bloqueó la ventana. <a href={waLink} target="_blank" rel="noopener noreferrer" data-testid="ds-wa-fallback" className="font-semibold text-bos-accent-text underline">Abrir WhatsApp</a>
                            </p>
                        )}
                        {actionError && (
                            <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-bos-danger p-2 text-sm">
                                <span className="text-bos-danger font-semibold">{actionError.message}</span>
                                <Button size="sm" variant="secondary" onClick={() => download(actionError.kind)}>Reintentar</Button>
                            </div>
                        )}
                    </div>
                    <SummaryBody data={data} />
                    <p className="mt-3 hidden text-xs text-bos-muted print:block">{data.businessName} · {longDayLabel(data.date)}</p>
                </div>
            )}
        </div>
    );
}
