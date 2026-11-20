'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Clock, Receipt } from 'lucide-react';
import { STATUS_LABELS } from '@/lib/appointments/appointments-view';
import { STATUS_STYLE } from '@/app/citas/_components/agenda-ui';
import { PERIOD_LABELS, WEEKDAYS, WEEKDAYS_SHORT, type MyWeek, type TodayAppointment } from '@/lib/barber/my-week';
import { weekLabel } from '@/lib/settlements/week';
import { Delta, card, dayOf, label, moneyC, moneyWhole, plural, sectionTitle, timeOf } from './ui';

interface SectionProps { data: MyWeek; mine: boolean }

const empty = 'rounded-lg bg-bos-raised px-4 py-5 text-center text-[15px] text-bos-muted';
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

// ---------------------------------------------------------------------------------------------
// Hoy
// ---------------------------------------------------------------------------------------------

function untilText(minutes: number, status: TodayAppointment['status']): string {
    if (status === 'in_progress') return 'En servicio ahora';
    if (minutes <= 0) return 'Le toca ahora';
    if (minutes < 60) return `En ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `En ${hours} h${rest ? ` ${rest} min` : ''}`;
}

export function TodaySection({ data, mine }: SectionProps) {
    const { today } = data;
    const tz = data.window.timezone;
    const total = today.appointments.length;
    return (
        <section aria-labelledby="today-title" data-testid="today" className={`${card} space-y-4 p-4 sm:p-6`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 id="today-title" className={sectionTitle}>Hoy</h2>
                    <p className="text-sm text-bos-muted">
                        {total === 0 ? 'Sin citas en tu agenda' : `${plural(today.attended, 'atendida', 'atendidas')} · ${plural(today.pending, 'por atender', 'por atender')}`}
                    </p>
                </div>
                <Link href="/citas" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-bos-accent-text hover:bg-bos-raised">
                    {mine ? 'Mi agenda' : 'Agenda'} <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </Link>
            </div>

            {today.next && today.minutesToNext !== null && (
                <div data-testid="next-appointment" className="rounded-xl border border-bos-accent bg-bos-accent-soft p-4">
                    <p className="text-[13px] font-semibold text-bos-accent-text">{mine ? 'Tu siguiente cita' : 'Siguiente cita'} · {untilText(today.minutesToNext, today.next.status)}</p>
                    <p className="mt-1 font-display text-2xl font-semibold leading-tight">{today.next.client}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-bos-text">
                        <span className="inline-flex items-center gap-1.5 tabular-nums"><Clock aria-hidden="true" className="h-4 w-4" />{timeOf(today.next.start, tz)}</span>
                        {today.next.service && <span>{today.next.service}</span>}
                    </p>
                </div>
            )}

            {total === 0 ? (
                <p className={empty}>No hay citas para hoy.</p>
            ) : (
                <ol className="divide-y divide-bos-border">
                    {today.appointments.map((a) => {
                        const live = a.status !== 'cancelled' && a.status !== 'no_show';
                        return (
                            <li key={a.id} className="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-3 py-3">
                                <span className="pt-0.5 text-[15px] font-semibold tabular-nums">{timeOf(a.start, tz)}</span>
                                <div className="min-w-0">
                                    <p className={`truncate text-[15px] font-semibold ${live ? '' : 'text-bos-muted line-through'}`}>{a.client}</p>
                                    <p className="truncate text-sm text-bos-muted">{a.service ?? (a.walkIn ? 'Sin cita' : 'Sin nota de servicio')}</p>
                                    <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status]}`}>{a.walkIn && a.status === 'completed' ? 'Atendido, sin cita' : STATUS_LABELS[a.status]}</span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------------------------
// Lo que llevo ganado
// ---------------------------------------------------------------------------------------------

const HEADLINE = {
    week: ['Esta semana llevas', 'Esta semana lleva'],
    last_week: ['La semana pasada ganaste', 'La semana pasada ganó'],
    month: ['Este mes llevas', 'Este mes lleva'],
} as const;

function payoutNote(data: MyWeek, mine: boolean): string {
    const { payout, window } = data;
    // Sin permiso para ver recibos (canSeePayReceipts): el aviso no menciona recibos ni números de recibo.
    if (!data.receiptsVisible) {
        if (window.period === 'month') return 'El pago es cada semana, con corte el sábado a las 8:00 p. m.';
        if (payout.status === 'closed') return 'La semana ya cerró. Administración registra el pago.';
        return `Se paga el ${longDay(window.endDay)}, con corte a las 8:00 p. m.`;
    }
    if (window.period === 'month') {
        return payout.paidCents > 0
            ? `Ya pagado este mes: ${moneyC(payout.paidCents)} en ${plural(payout.receipts.length, 'recibo', 'recibos')}. El pago es cada semana, con corte el sábado a las 8:00 p. m.`
            : 'El pago es cada semana, con corte el sábado a las 8:00 p. m.';
    }
    if (payout.status === 'paid') {
        const r = payout.receipts[0];
        const date = r.paidAt ? ` el ${dayOf(r.paidAt, window.timezone)}` : '';
        return `${mine ? 'Ya se te pagó' : 'Ya se le pagó'} ${moneyC(payout.paidCents)}${date}. Recibo ${r.number}.`;
    }
    if (payout.status === 'closed') return 'La semana ya cerró. El recibo aparece cuando administración registra el pago.';
    return `Se paga el ${longDay(window.endDay)}, con corte a las 8:00 p. m.`;
}

export function EarningsSection({ data, mine }: SectionProps) {
    const { earnings: e, window } = data;
    const nothing = e.totalCents === 0 && data.services.count === 0;
    const maxDay = Math.max(0, ...e.byWeekday.map((d) => d.totalCents));
    const periodName = PERIOD_LABELS[window.period].toLowerCase();
    const versus = window.period === 'month' ? 'que el mes pasado' : window.period === 'week' ? 'que la semana pasada' : 'que la semana anterior';

    return (
        <section aria-labelledby="earned-title" className={`${card} space-y-5 p-4 sm:p-6`}>
            <div>
                <p id="earned-title" className={label}>{HEADLINE[window.period][mine ? 0 : 1]}</p>
                <p data-testid="week-earned" className="mt-1 font-display text-5xl font-semibold tabular-nums text-bos-accent-text">{moneyC(e.totalCents)}</p>
                <p className="mt-1 text-sm text-bos-muted">Estimado a recibir: comisiones y propinas. Puede cambiar si se anula una venta.</p>
                {!nothing && (e.previousTotalCents > 0
                    ? <Delta value={e.deltaCents} text={`${e.deltaCents >= 0 ? '+' : '-'}${moneyC(Math.abs(e.deltaCents))}${e.deltaPct !== null ? ` (${e.deltaPct > 0 ? '+' : ''}${e.deltaPct} %)` : ''}`} versus={versus} />
                    : <p className="text-sm text-bos-muted">Sin datos para comparar con {window.period === 'month' ? 'el mes pasado' : 'la semana anterior'}.</p>)}
            </div>

            <p className="rounded-lg bg-bos-raised px-4 py-3 text-sm text-bos-text">{payoutNote(data, mine)}</p>

            {nothing ? (
                <p className={empty}>{mine ? `Aún no tienes servicios ${window.period === 'month' ? 'este mes' : window.period === 'week' ? 'esta semana' : 'esa semana'}.` : 'Aún no hay servicios en este periodo.'}</p>
            ) : (
                <>
                    <dl className="space-y-2 border-t border-bos-border pt-4 text-[15px]">
                        <div className="flex justify-between gap-4"><dt className="text-bos-muted">Comisión de servicios ({data.serviceRatePct} %)</dt><dd className="font-semibold tabular-nums">{moneyC(e.serviceCents)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-bos-muted">Comisión de productos</dt><dd className="font-semibold tabular-nums">{moneyC(e.productCents)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-bos-muted">{mine ? 'Propinas (100 % tuyas)' : 'Propinas (100 % suyas)'}</dt><dd className="font-semibold tabular-nums">{moneyC(e.tipsCents)}</dd></div>
                    </dl>

                    <div className="border-t border-bos-border pt-4">
                        <p className={label}>{window.period === 'month' ? 'Por día de la semana (suma del mes)' : 'Por día'}</p>
                        <ul data-testid="weekday-bars" className="mt-3 grid grid-cols-7 gap-1.5">
                            {e.byWeekday.map((d) => {
                                const height = maxDay > 0 ? Math.max(d.totalCents > 0 ? 6 : 0, Math.round((d.totalCents / maxDay) * 100)) : 0;
                                const best = e.bestDay?.dow === d.dow;
                                return (
                                    <li key={d.dow} className="flex min-w-0 flex-col items-center gap-1.5">
                                        <span className="text-[11px] font-medium tabular-nums text-bos-muted" aria-hidden="true">{d.totalCents > 0 ? moneyWhole(d.totalCents) : ''}</span>
                                        <span aria-hidden="true" className="flex h-24 w-full items-end overflow-hidden rounded-md bg-bos-raised">
                                            <span className={`bos-grow block w-full rounded-md ${best ? 'bg-bos-accent' : 'bg-bos-muted'}`} style={{ height: `${height}%` }} />
                                        </span>
                                        <span className={`text-xs ${best ? 'font-semibold text-bos-text' : 'text-bos-muted'}`}>{WEEKDAYS_SHORT[d.dow]}</span>
                                        <span className="sr-only">{`${WEEKDAYS[d.dow]}: ${moneyC(d.totalCents)}, ${plural(d.services, 'servicio', 'servicios')}`}</span>
                                    </li>
                                );
                            })}
                        </ul>
                        {e.bestDay && <p className="mt-3 text-sm text-bos-muted">{window.period === 'month' ? 'Tu mejor día del mes' : `Tu mejor día ${periodName === 'esta semana' ? 'de esta semana' : 'de esa semana'}`}: <span className="font-semibold text-bos-text">{WEEKDAYS[e.bestDay.dow]}</span> ({plural(e.bestDay.services, 'servicio', 'servicios')}).</p>}
                    </div>
                </>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------------------------
// Mis servicios
// ---------------------------------------------------------------------------------------------

export function ServicesSection({ data, mine }: SectionProps) {
    const s = data.services;
    const versus = data.window.period === 'month' ? 'que el mes pasado' : 'que la semana anterior';
    const diff = s.count - s.previousCount;
    const topMax = Math.max(1, ...s.top.map((t) => t.count));
    return (
        <section aria-labelledby="services-title" className={`${card} space-y-4 p-4 sm:p-6`}>
            <h2 id="services-title" className={sectionTitle}>{mine ? 'Mis servicios' : 'Servicios'}</h2>
            {s.count === 0 && s.products.lines === 0 ? (
                <p className={empty}>{mine ? 'Aún no tienes servicios en este periodo.' : 'Aún no hay servicios en este periodo.'}</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-bos-raised p-3">
                            <p className={label}>{PERIOD_LABELS[data.window.period]}</p>
                            <p data-testid="week-cuts" className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{s.count}</p>
                            <Delta value={diff} text={`${diff > 0 ? '+' : ''}${diff}`} versus={versus} />
                        </div>
                        <div className="rounded-lg bg-bos-raised p-3">
                            <p className={label}>Ticket promedio</p>
                            <p className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{moneyC(s.avgTicketCents)}</p>
                            <p className="text-sm text-bos-muted">por servicio</p>
                        </div>
                    </div>
                    <p className="text-sm text-bos-muted">Esta semana: <span className="font-semibold text-bos-text tabular-nums">{s.weekCount}</span> · Este mes: <span className="font-semibold text-bos-text tabular-nums">{s.monthCount}</span></p>

                    {s.top.length > 0 && (
                        <div className="border-t border-bos-border pt-4">
                            <p className={label}>Los que más haces</p>
                            <ol className="mt-3 space-y-2.5">
                                {s.top.map((t, i) => (
                                    <li key={t.name} className="grid grid-cols-[20px_minmax(0,1fr)_28px] items-center gap-x-3 gap-y-1 text-[15px]">
                                        <span className="font-display font-semibold text-bos-muted">{i + 1}</span>
                                        <span className="truncate">{t.name}</span>
                                        <span className="text-right font-semibold tabular-nums">{t.count}</span>
                                        <span aria-hidden="true" className="col-start-2 col-end-4 h-1.5 overflow-hidden rounded-full bg-bos-raised">
                                            <span className="block h-full rounded-full bg-bos-accent" style={{ width: `${Math.round((t.count / topMax) * 100)}%` }} />
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}

                    <div className="border-t border-bos-border pt-4">
                        <p className={label}>Productos que vendiste</p>
                        {s.products.lines === 0 ? (
                            <p className="mt-2 text-[15px] text-bos-muted">Ninguno en este periodo.</p>
                        ) : (
                            <>
                                <p className="mt-1 text-[15px]"><span className="font-semibold tabular-nums">{s.products.lines}</span> {s.products.lines === 1 ? 'producto' : 'productos'} · {moneyC(s.products.revenueCents)} vendidos</p>
                                <ul className="mt-2 space-y-1 text-sm text-bos-muted">
                                    {s.products.items.slice(0, 4).map((p) => <li key={p.name} className="flex justify-between gap-3"><span className="truncate">{p.name}</span><span className="tabular-nums">{p.count}</span></li>)}
                                </ul>
                            </>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------------------------
// Mis clientes
// ---------------------------------------------------------------------------------------------

export function ClientsSection({ data, mine }: SectionProps) {
    const c = data.clients;
    const tz = data.window.timezone;
    return (
        <section aria-labelledby="clients-title" className={`${card} space-y-4 p-4 sm:p-6`}>
            <h2 id="clients-title" className={sectionTitle}>{mine ? 'Mis clientes' : 'Clientes'}</h2>
            {c.visits === 0 ? (
                <p className={empty}>{mine ? 'Aún no has atendido clientes en este periodo.' : 'Aún no hay clientes atendidos en este periodo.'}</p>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-bos-raised p-3"><p className={label}>Atendidos</p><p className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{c.visits}</p></div>
                        <div className="rounded-lg bg-bos-raised p-3"><p className={label}>Distintos</p><p className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{c.unique}</p></div>
                        <div className="rounded-lg bg-bos-raised p-3"><p className={label}>Repiten</p><p className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{c.repeat}</p></div>
                    </div>
                    <p className="text-sm text-bos-muted">Repiten: clientes que ya habían venido contigo en los últimos 3 meses.{c.unregistered > 0 ? ` ${plural(c.unregistered, 'visita', 'visitas')} sin cliente registrado.` : ''}</p>
                    <div className="border-t border-bos-border pt-4">
                        <p className={label}>Últimos clientes</p>
                        <ul className="mt-2 divide-y divide-bos-border">
                            {c.recent.map((r) => (
                                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                                    <div className="min-w-0">
                                        <p className="truncate text-[15px] font-semibold">{r.name}</p>
                                        <p className="truncate text-sm text-bos-muted">{r.service ?? 'Sin nota de servicio'}</p>
                                    </div>
                                    <span className="shrink-0 text-sm tabular-nums text-bos-muted">{dayOf(r.at, tz)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------------------------
// Propinas
// ---------------------------------------------------------------------------------------------

export function TipsSection({ data, mine }: SectionProps) {
    const t = data.tips;
    const versus = data.window.period === 'month' ? 'que el mes pasado' : 'que la semana anterior';
    const diff = t.totalCents - t.previousTotalCents;
    return (
        <section aria-labelledby="tips-title" className={`${card} space-y-4 p-4 sm:p-6`}>
            <div>
                <h2 id="tips-title" className={sectionTitle}>Propinas</h2>
                <p className="text-sm text-bos-muted">{mine ? 'Son 100 % tuyas y van en tu recibo semanal.' : 'Son 100 % del barbero y van en su recibo semanal.'}</p>
            </div>
            {t.count === 0 ? (
                <p className={empty}>Aún no hay propinas en este periodo.</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-bos-raised p-3"><p className={label}>Total</p><p className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{moneyC(t.totalCents)}</p></div>
                        <div className="rounded-lg bg-bos-raised p-3"><p className={label}>Promedio</p><p className="mt-0.5 font-display text-3xl font-semibold tabular-nums">{moneyC(t.avgCents)}</p></div>
                    </div>
                    <p className="text-[15px]"><span className="font-semibold tabular-nums">{t.salesWithTip}</span> de <span className="tabular-nums">{t.services}</span> {t.services === 1 ? 'servicio dejó' : 'servicios dejaron'} propina.</p>
                    {t.previousTotalCents > 0 && <Delta value={diff} text={`${diff >= 0 ? '+' : '-'}${moneyC(Math.abs(diff))}`} versus={versus} />}
                </>
            )}
        </section>
    );
}

// ---------------------------------------------------------------------------------------------
// Mis recibos
// ---------------------------------------------------------------------------------------------

export function ReceiptsSection({ data, mine }: SectionProps) {
    // Decisión temporal del dueño (20 nov 2026): barbero y recepción no ven recibos de pago; la sección ni se dibuja.
    if (!data.receiptsVisible) return null;
    const tz = data.window.timezone;
    return (
        <section aria-labelledby="receipts-title" className={`${card} space-y-3 p-4 sm:p-6`}>
            <h2 id="receipts-title" className={sectionTitle}>{mine ? 'Mis recibos de pago' : 'Recibos de pago'}</h2>
            {data.receipts.length === 0 ? (
                <p className={empty}>Aún no hay recibos pagados.</p>
            ) : (
                <ul className="divide-y divide-bos-border">
                    {data.receipts.map((r) => (
                        <li key={r.id}>
                            <Link href={`/liquidaciones/${r.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:bg-bos-raised">
                                <span className="flex min-w-0 items-center gap-3">
                                    <Receipt aria-hidden="true" className="h-5 w-5 shrink-0 text-bos-muted" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[15px] font-semibold">Semana del {weekLabel(r.weekStart)}</span>
                                        <span className="block truncate text-sm text-bos-muted">Recibo {r.number}{r.paidAt ? ` · pagado ${dayOf(r.paidAt, tz)}` : ''}</span>
                                    </span>
                                </span>
                                <span className="shrink-0 font-display text-lg font-semibold tabular-nums">{moneyC(r.totalCents)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            <Link href="/liquidaciones" className="flex min-h-12 items-center justify-between rounded-xl border border-bos-border px-4 text-[15px] font-semibold hover:bg-bos-raised">
                {mine ? 'Ver todos mis recibos' : 'Ver recibos'} <ChevronRight aria-hidden="true" className="h-5 w-5 text-bos-muted" />
            </Link>
        </section>
    );
}
