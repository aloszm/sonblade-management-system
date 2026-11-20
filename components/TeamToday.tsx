'use client';

import React, { useEffect, useRef, useState } from 'react';
import Ranking from '@/components/Ranking';
import { SectionError, Skeleton, card, label, moneyC, plural, sectionTitle } from '@/app/barbero/_components/ui';
import { TEAM_PERIODS, TEAM_PERIOD_LABELS, type TeamPeriod, type TeamPerson, type TeamSummary } from '@/lib/team/summary';

type Response = TeamSummary & { period: TeamPeriod; timezone: string; window: { startDay: string; endDay: string } };

const PHRASE: Record<TeamPeriod, string> = { today: 'hoy', week: 'esta semana', month: 'este mes' };

const dayText = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function rangeText(w: { startDay: string; endDay: string }): string {
    if (w.startDay === w.endDay) return dayText(w.startDay);
    const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', timeZone: 'UTC' });
    const long = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    const sameMonth = w.startDay.slice(0, 7) === w.endDay.slice(0, 7);
    return sameMonth ? `Del ${day(w.startDay)} al ${long(w.endDay)}` : `Del ${long(w.startDay)} al ${long(w.endDay)}`;
}

function Stat({ title, value, hint, accent, testId }: { title: string; value: string; hint?: string; accent?: boolean; testId?: string }) {
    return (
        <div className={`${card} p-4`}>
            <p className={label}>{title}</p>
            <p data-testid={testId} className={`font-display text-3xl font-semibold tabular-nums leading-tight ${accent ? 'text-bos-accent-text' : ''}`}>{value}</p>
            {hint && <p className="text-sm text-bos-muted">{hint}</p>}
        </div>
    );
}

function Chips({ items, unit }: { items: { name: string; count: number }[]; unit: 'servicio' | 'pieza' }) {
    if (items.length === 0) return <p className="text-sm text-bos-muted">{unit === 'servicio' ? 'Ningún servicio todavía.' : 'Ninguna venta de producto.'}</p>;
    return (
        <ul className="flex flex-wrap gap-1.5">
            {items.map((i) => (
                <li key={i.name} className="inline-flex items-center gap-1.5 rounded-full bg-bos-raised px-2.5 py-1 text-[13px]">
                    <span>{i.name}</span><span className="font-semibold tabular-nums">× {i.count}</span>
                </li>
            ))}
        </ul>
    );
}

function Line({ title, value, strong }: { title: string; value: string; strong?: boolean }) {
    return (
        <div className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t border-bos-border pt-2 font-semibold' : ''}`}>
            <dt className={strong ? '' : 'text-bos-muted'}>{title}</dt>
            <dd className={`tabular-nums ${strong ? 'text-bos-accent-text' : ''}`}>{value}</dd>
        </div>
    );
}

function PersonCard({ person }: { person: TeamPerson }) {
    return (
        <article data-testid="team-person" aria-label={person.name} className={`${card} space-y-4 p-4 sm:p-5`}>
            <header className="flex items-center gap-3">
                <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bos-raised font-display text-lg font-semibold">{person.name.charAt(0).toUpperCase()}</span>
                <h3 className="min-w-0 flex-1 truncate font-display text-xl font-semibold">{person.name}</h3>
                <div className="text-right">
                    <p className="font-display text-xl font-semibold tabular-nums">{moneyC(person.generatedCents)}</p>
                    <p className="text-[13px] text-bos-muted">en ventas</p>
                </div>
            </header>

            {person.isBarber && (
                <section className="space-y-2">
                    <h4 className="text-[15px] font-semibold">Servicios <span className="font-normal text-bos-muted">· {person.services.count}</span></h4>
                    <Chips items={person.services.byType} unit="servicio" />
                </section>
            )}

            <section className="space-y-2">
                <h4 className="text-[15px] font-semibold">
                    Productos <span className="font-normal text-bos-muted">· {plural(person.products.units, 'pieza', 'piezas')}{person.products.units > 0 ? `, ${moneyC(person.products.revenueCents)}` : ''}</span>
                </h4>
                <Chips items={person.products.byItem} unit="pieza" />
            </section>

            <section className="space-y-2 border-t border-bos-border pt-3">
                <h4 className="text-[15px] font-semibold">Lo que lleva ganado <span className="font-normal text-bos-muted">· comisiones y propinas, sin sueldo</span></h4>
                <dl className="space-y-1 text-[15px]">
                    {person.isBarber && <Line title="Comisión de servicios" value={moneyC(person.earned.serviceCommissionCents)} />}
                    <Line title="Comisión de productos" value={moneyC(person.earned.productCommissionCents)} />
                    {person.isBarber && <Line title="Propinas" value={moneyC(person.earned.tipsCents)} />}
                    <Line title="Total" value={moneyC(person.earned.totalCents)} strong />
                </dl>
            </section>
        </article>
    );
}

export default function TeamToday() {
    const [period, setPeriod] = useState<TeamPeriod>('today');
    const [data, setData] = useState<Response | null>(null);
    const [error, setError] = useState('');
    const [key, setKey] = useState(0);
    const requestRef = useRef(0);

    useEffect(() => {
        const request = ++requestRef.current;
        setError('');
        fetch(`/api/team-summary?period=${period}`, { cache: 'no-store' })
            .then(async (res) => {
                const body = await res.json().catch(() => null);
                if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las cifras del equipo.');
                if (!Array.isArray(body?.people)) throw new Error('No se pudieron cargar las cifras del equipo.');
                return body as Response;
            })
            .then((body) => { if (request === requestRef.current) setData(body); })
            .catch((e) => { if (request === requestRef.current) setError(e instanceof Error && e.message ? e.message : 'No se pudieron cargar las cifras del equipo.'); });
    }, [period, key]);

    const current = data && data.period === period ? data : null;
    const barbers = current?.people.filter((p) => p.isBarber) ?? [];
    const others = current?.people.filter((p) => !p.isBarber) ?? [];
    const noSales = current !== null && current.totals.sales === 0;

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <header className="space-y-1">
                <p className="text-sm text-bos-muted first-letter:uppercase" data-testid="team-range">{current ? rangeText(current.window) : ' '}</p>
                <h1 className="font-display text-3xl font-semibold">Barberos hoy</h1>
            </header>

            <div role="group" aria-label="Periodo" className="grid grid-cols-3 gap-1 rounded-xl bg-bos-raised p-1 sm:inline-grid sm:grid-cols-[repeat(3,auto)]">
                {TEAM_PERIODS.map((p) => (
                    <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
                        className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors sm:px-5 sm:text-[15px] ${period === p ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>
                        {TEAM_PERIOD_LABELS[p]}
                    </button>
                ))}
            </div>

            {error && !current ? (
                <SectionError message={error} onRetry={() => setKey((k) => k + 1)} />
            ) : !current ? (
                <div aria-busy="true" aria-label="Cargando cifras del equipo" className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
                    <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-72" />)}</div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Stat testId="team-services" title="Servicios" value={String(current.totals.serviceCount)} hint={PHRASE[period]} />
                        <Stat testId="team-products" title="Productos vendidos" value={String(current.totals.productUnits)} hint={`${plural(current.totals.productUnits, 'pieza', 'piezas')}, ${moneyC(current.totals.productRevenueCents)}`} />
                        <Stat testId="team-generated" title="Ventas generadas" value={moneyC(current.totals.generatedCents)} hint="servicios y productos" accent />
                        <Stat testId="team-owed" title="Comisiones y propinas" value={moneyC(current.totals.commissionCents + current.totals.tipsCents)} hint={`${moneyC(current.totals.commissionCents)} y ${moneyC(current.totals.tipsCents)}`} />
                    </div>

                    {noSales && (
                        <p role="status" className="rounded-lg bg-bos-raised px-4 py-4 text-center text-[15px] text-bos-muted">Aún no hay ventas cobradas {PHRASE[period]}.</p>
                    )}

                    {barbers.length > 0 && (
                        <section aria-labelledby="barbers-title" className="space-y-3">
                            <h2 id="barbers-title" className={sectionTitle}>Barberos</h2>
                            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
                                {barbers.map((p) => <PersonCard key={p.employeeId ?? 'none'} person={p} />)}
                            </div>
                        </section>
                    )}

                    {others.length > 0 && (
                        <section aria-labelledby="front-title" className="space-y-3">
                            <h2 id="front-title" className={sectionTitle}>Recepción</h2>
                            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
                                {others.map((p) => <PersonCard key={p.employeeId ?? 'none'} person={p} />)}
                            </div>
                        </section>
                    )}
                </>
            )}

            <Ranking mine={false} />
        </div>
    );
}
