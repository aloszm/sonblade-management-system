'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Download, Loader2, Search } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { localDateKey } from '@/lib/utils/dates';
import { downloadCsv } from '@/lib/utils/csv';
import {
    METHOD_LABELS, PRESETS, WEEKDAYS, activityRows, busiestHour, comparable, delta, presetRange,
    type Kpis, type Metrics, type PresetId,
} from '@/lib/reports/metrics';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Ranking from '@/components/Ranking';
import { formatMoney } from '@/lib/utils/money';
import { formatDateTime } from '@/lib/utils/dates';

// Lo que devuelve /api/admin/profit (la misma fuente que Finanzas); aquí solo se usan estas cifras.
type Finance = {
    revenue: { total: number }; commissions: { total: number }; tips: { total: number }; expenses: { total: number };
    productCost: { total: number }; profit: number; productsWithoutCost: number;
    /** Sueldos por día y bonos: conceptos propios de la utilidad (opcionales por si el servidor es anterior). */
    wages?: { total: number; days: number }; bonuses?: { total: number; count: number };
    comparison: { hasBase: boolean; revenue: { previous: number }; profit: { previous: number }; commissions: { previous: number }; tips: { previous: number }; expenses: { previous: number } };
};
const isFinance = (v: unknown): v is Finance => !!v && typeof v === 'object' && typeof (v as Finance).profit === 'number' && !!(v as Finance).revenue && !!(v as Finance).comparison;

const money = (n: number) => formatMoney(n);
const money2 = (n: number) => formatMoney(n);
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

const card = 'rounded-xl border border-bos-border bg-bos-surface';
const label = 'text-[13px] font-medium text-bos-muted';
const AXIS = { fill: 'var(--bos-muted)', fontSize: 12 };
const TOOLTIP = {
    contentStyle: { background: 'var(--bos-surface)', border: '1px solid var(--bos-border)', borderRadius: 12, color: 'var(--bos-text)', fontSize: 13 },
    labelStyle: { color: 'var(--bos-muted)', marginBottom: 4 },
    itemStyle: { color: 'var(--bos-text)' },
    cursor: { fill: 'var(--bos-raised)' },
};

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
    const d = delta(current, previous);
    if (d === null || !comparable(current, previous)) return <span className="text-sm text-bos-muted">Sin datos suficientes para comparar</span>;
    if (d === 0) return <span className="text-sm text-bos-muted">Igual que el periodo anterior</span>;
    const good = invert ? d < 0 : d > 0;
    const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
    return (
        <span className={`inline-flex items-center gap-1 text-sm font-semibold ${good ? 'text-bos-success' : 'text-bos-danger'}`}>
            <Icon aria-hidden="true" className="h-4 w-4" />{d > 0 ? '+' : ''}{d}%
            <span className="font-normal text-bos-muted">vs. periodo anterior</span>
        </span>
    );
}

function BigStat({ title, hint, value, current, previous, testId, invert, accent }: { title: string; hint: string; value: string; current: number; previous: number; testId: string; invert?: boolean; accent?: boolean }) {
    return (
        <div className={`${card} p-5 flex flex-col gap-2 transition-colors hover:border-bos-control`}>
            <p className={label}>{title}</p>
            <p data-testid={testId} className={`font-display text-4xl font-semibold tabular-nums leading-none ${accent ? 'text-bos-accent-text' : ''}`}>{value}</p>
            <Delta current={current} previous={previous} invert={invert} />
            <p className="text-xs text-bos-muted">{hint}</p>
        </div>
    );
}

function SmallStat({ title, hint, value }: { title: string; hint: string; value: string }) {
    return (
        <div className="px-4 py-3 rounded-xl bg-bos-raised">
            <p className="text-xs text-bos-muted">{title}</p>
            <p className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</p>
            <p className="mt-0.5 text-xs text-bos-muted">{hint}</p>
        </div>
    );
}

export default function Dashboard() {
    const [today, setToday] = useState('');
    const [preset, setPreset] = useState<PresetId>('week');
    const [range, setRange] = useState<{ from: string; to: string } | null>(null);
    const [barber, setBarber] = useState('');
    const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
    const [data, setData] = useState<Metrics | null>(null);
    const [finance, setFinance] = useState<Finance | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState<'all' | 'service' | 'product'>('all');
    const [shown, setShown] = useState(25);

    // "Hoy" se calcula en el dispositivo (la barbería), nunca en el servidor.
    useEffect(() => {
        const t = localDateKey(new Date());
        setToday(t);
        setRange(presetRange('week', t));
        fetch('/api/barbers?scope=team', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then((rows) => {
            if (Array.isArray(rows)) setTeam(rows.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
        }).catch(() => {});
    }, []);

    const load = useCallback(async () => {
        if (!range) return;
        setLoading(true);
        try {
            const qs = new URLSearchParams({ from: range.from, to: range.to, ...(barber ? { barber } : {}) });
            const res = await fetch(`/api/metrics?${qs}`, { cache: 'no-store' });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las métricas.');
            // La utilidad, comisiones, gastos y propinas salen de Finanzas (una sola fórmula). Si no se
            // puede leer (por ejemplo un rango de más de un año), se queda con las cifras de las métricas.
            let fin: Finance | null = null;
            if (!barber) {
                try {
                    const fr = await fetch(`/api/admin/profit?from=${range.from}&to=${range.to}`, { cache: 'no-store' });
                    const fb = fr.ok ? await fr.json() : null;
                    if (isFinance(fb)) fin = fb;
                } catch { /* se usan las métricas */ }
            }
            setFinance(fin);
            setData(body as Metrics);
            setError('');
            setShown(25);
        } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar las métricas.'); }
        finally { setLoading(false); }
    }, [range, barber]);

    useEffect(() => { load(); }, [load]);

    const pickPreset = (id: PresetId) => {
        setPreset(id);
        if (id !== 'custom' && today) setRange(presetRange(id, today));
    };

    // La API dice qué es `net`: utilidad (negocio completo) o aporte (con filtro por barbero, sin gastos generales).
    const netKind = data?.kpis.net_kind;
    const fromFinance = !barber && finance !== null;
    const k: Kpis | undefined = data && fromFinance && finance
        ? { ...data.kpis, revenue: finance.revenue.total, commissions: finance.commissions.total, tips: finance.tips.total, expenses: finance.expenses.total, net: finance.profit }
        : data?.kpis;
    const p: Kpis | undefined = data && fromFinance && finance?.comparison.hasBase
        ? { ...data.previous, revenue: finance.comparison.revenue.previous, commissions: finance.comparison.commissions.previous, tips: finance.comparison.tips.previous, expenses: finance.comparison.expenses.previous, net: finance.comparison.profit.previous }
        : data?.previous;
    const singleDay = (data?.range.days ?? 1) === 1;
    const tz = data?.range.timezone ?? 'America/Mexico_City';

    const hours = useMemo(() => {
        if (!data) return [];
        const withData = data.hourly.filter((h) => h.cuts > 0 || h.revenue > 0).map((h) => h.hour);
        const first = Math.min(9, ...withData);
        const last = Math.max(20, ...withData);
        return data.hourly.filter((h) => h.hour >= first && h.hour <= last).map((h) => ({ ...h, label: hourLabel(h.hour) }));
    }, [data]);

    const days = useMemo(() => (data?.daily ?? []).map((d) => ({
        ...d,
        label: new Date(`${d.day}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    })), [data]);

    const weekdays = useMemo(() => {
        if (!data) return [];
        // Lunes a domingo, que es como se lee la semana en la barbería.
        return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
            const w = data.weekday.find((x) => x.dow === dow);
            return { label: WEEKDAYS[dow].slice(0, 3), cuts: w?.cuts ?? 0, revenue: w?.revenue ?? 0 };
        });
    }, [data]);

    const activity = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (data?.activity ?? []).filter((a) => (kind === 'all' || a.type === kind)
            && (!term || [a.item, a.employee, a.client].some((v) => (v ?? '').toLowerCase().includes(term))));
    }, [data, search, kind]);

    const payTotal = data ? data.payments.cash + data.payments.card + data.payments.transfer + data.payments.other : 0;
    const topBarberCuts = Math.max(1, ...(data?.barbers ?? []).map((b) => b.cuts));
    const peak = data ? busiestHour(data.hourly) : null;
    const rangeLabel = data
        ? (data.range.from === data.range.to
            ? new Date(`${data.range.from}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
            : `${new Date(`${data.range.from}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${new Date(`${data.range.to}T12:00:00Z`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`)
        : '';

    const exportActivity = () => {
        if (!data) return;
        downloadCsv(`registro_${data.range.from}_a_${data.range.to}.csv`,
            ['Fecha', 'Hora', 'Barbero', 'Tipo', 'Concepto', 'Cantidad', 'Importe', 'Forma de pago', 'Cliente'],
            activityRows(activity, tz));
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold">Panel</h1>
                    <p className="text-sm text-bos-muted first-letter:uppercase" data-testid="range-label">{rangeLabel}</p>
                    <p className="text-sm text-bos-muted mt-0.5">Resumen del periodo. La utilidad al detalle está en Finanzas.</p>
                </div>
                <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1 p-1 rounded-xl bg-bos-raised">
                    {PRESETS.map((pr) => (
                        <button key={pr.id} type="button" aria-pressed={preset === pr.id} onClick={() => pickPreset(pr.id)}
                            className={`min-h-11 px-4 rounded-lg text-sm font-semibold transition-colors ${preset === pr.id ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>
                            {pr.label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex flex-wrap items-center gap-3">
                {preset === 'custom' && range && (
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor="metrics-range">Periodo personalizado</label>
                        <DateRangePicker id="metrics-range" shortcuts={false} value={range} onChange={setRange}
                            className="h-11 min-w-64 px-3 rounded-xl bg-bos-surface border border-bos-control text-base text-bos-text" />
                    </div>
                )}
                <label className="sr-only" htmlFor="metrics-person">Filtrar por persona</label>
                <select id="metrics-person" value={barber} onChange={(e) => setBarber(e.target.value)}
                    className="sm:hidden h-11 min-w-0 flex-1 px-3 rounded-xl bg-bos-surface border border-bos-control text-base text-bos-text">
                    {[{ id: '', name: 'Toda la barbería' }, ...team].map((t) => <option key={t.id || 'all'} value={t.id}>{t.name}</option>)}
                </select>
                <div role="group" aria-label="Filtrar por persona" className="hidden sm:flex flex-wrap gap-2">
                    {[{ id: '', name: 'Toda la barbería' }, ...team].map((t) => (
                        <button key={t.id || 'all'} type="button" aria-pressed={barber === t.id} onClick={() => setBarber(t.id)}
                            className={`min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${barber === t.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`}>
                            {t.name}
                        </button>
                    ))}
                </div>
                {loading && data && <Loader2 aria-label="Actualizando" className="h-5 w-5 animate-spin text-bos-muted" />}
                <Link href="/reportes" className="ml-auto inline-flex items-center gap-2 min-h-11 text-sm font-semibold text-bos-accent-text hover:underline underline-offset-2">
                    <ArrowRight aria-hidden="true" className="h-4 w-4" /> Ver reportes
                </Link>
            </div>

            {error && <p role="alert" className={`${card} p-4 text-bos-danger`}>{error}</p>}
            {!data && loading && <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>}

            {data && k && p && (
                <>
                    <section aria-label="Indicadores principales" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <BigStat title="Ingresos" hint="Total cobrado en el periodo." value={money(k.revenue)} current={k.revenue} previous={p.revenue} testId="kpi-revenue" accent />
                        <BigStat title="Cortes" hint="Solo servicios de corte, sin productos." value={String(k.cuts)} current={k.cuts} previous={p.cuts} testId="kpi-cuts" />
                        <BigStat title="Ticket promedio" hint="Ingresos entre número de ventas." value={money(k.avg_ticket)} current={k.avg_ticket} previous={p.avg_ticket} testId="kpi-ticket" />
                        {netKind === 'contribution' ? (
                            <BigStat title="Aporte" hint="Ventas del barbero − sus comisiones − costo de sus productos. No incluye gastos generales." value={money(k.net)} current={k.net} previous={p.net} testId="kpi-net" />
                        ) : netKind === 'profit' ? (
                            <BigStat title="Utilidad" hint="Ingresos − comisiones − sueldos − costo de producto − gastos." value={money(k.net)} current={k.net} previous={p.net} testId="kpi-net" />
                        ) : barber ? (
                            <BigStat title="Comisión generada" hint="Lo que ganó por sus servicios." value={money(k.commissions)} current={k.commissions} previous={p.commissions} testId="kpi-net" />
                        ) : (
                            <BigStat title="Utilidad" hint="Lo que queda tras comisiones, producto y gastos." value={money(k.net)} current={k.net} previous={p.net} testId="kpi-net" />
                        )}
                    </section>

                    <section aria-label="Más indicadores" className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
                        <SmallStat title="Ventas" hint="Cobros registrados" value={String(k.tickets)} />
                        <SmallStat title="Clientes con registro" hint="Solo ventas con cliente registrado" value={String(k.clients)} />
                        <SmallStat title="Clientes nuevos" hint="Dados de alta en el periodo" value={String(data.new_clients)} />
                        <SmallStat title="Productos vendidos" hint="Piezas, no servicios" value={String(k.products)} />
                        <SmallStat title="Propinas" hint="Son del barbero" value={money(k.tips)} />
                        {barber ? <SmallStat title="Ventas registradas" hint="Cobros de este barbero" value={String(data.activity.length)} /> : <SmallStat title="Comisiones" hint="Pagadas a barberos" value={money(k.commissions)} />}
                        {fromFinance && finance?.wages && <SmallStat title="Sueldos" hint={`${finance.wages.days} día${finance.wages.days === 1 ? '' : 's'} de sueldo`} value={money(finance.wages.total)} />}
                        {fromFinance && finance?.bonuses && finance.bonuses.total > 0 && <SmallStat title="Bonos" hint="Metas cumplidas" value={money(finance.bonuses.total)} />}
                    </section>
                    {!barber && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-bos-muted" data-testid="profit-note">
                            <p>
                                {fromFinance && finance
                                    ? `Utilidad = ingresos − comisiones − sueldos (${money(finance.wages?.total ?? 0)})${finance.bonuses && finance.bonuses.total > 0 ? ` − bonos (${money(finance.bonuses.total)})` : ''} − costo de producto (${money(finance.productCost.total)}) − gastos (${money(k.expenses)}). Las propinas son del barbero y no cuentan.`
                                    : `Utilidad = ingresos − comisiones − gastos (${money(k.expenses)}), sin costo de producto: puede no coincidir con Finanzas.`}
                            </p>
                            <Link href="/administracion" className="inline-flex items-center gap-1 font-semibold text-bos-accent-text hover:underline underline-offset-2">
                                Ver detalle en Finanzas <ArrowRight aria-hidden="true" className="h-4 w-4" />
                            </Link>
                        </div>
                    )}

                    <div className="grid gap-6 lg:grid-cols-2">
                        <section aria-labelledby="cuts-chart-title" className={`${card} p-5`}>
                            <h2 id="cuts-chart-title" className="font-display text-lg font-semibold">{singleDay ? 'Cortes por hora' : 'Cortes por día'}</h2>
                            <p className="text-sm text-bos-muted mb-4">Servicios cobrados, {rangeLabel}. Cada barra es {singleDay ? "una hora" : "un día"}.</p>
                            <div className="h-64" data-testid="chart-cuts">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={singleDay ? hours : days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid vertical={false} stroke="var(--bos-border)" />
                                        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                                        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={32} />
                                        <Tooltip {...TOOLTIP} formatter={(v) => [Number(v ?? 0), 'Cortes']} />
                                        <Bar dataKey="cuts" name="Cortes" fill="var(--bos-accent)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                        <section aria-labelledby="revenue-chart-title" className={`${card} p-5`}>
                            <h2 id="revenue-chart-title" className="font-display text-lg font-semibold">{singleDay ? 'Ingresos por hora' : 'Ingresos por día'}</h2>
                            <p className="text-sm text-bos-muted mb-4">Pesos cobrados con servicios y productos, {rangeLabel}.</p>
                            <div className="h-64" data-testid="chart-revenue">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={singleDay ? hours : days} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid vertical={false} stroke="var(--bos-border)" />
                                        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                                        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => money(v)} />
                                        <Tooltip {...TOOLTIP} formatter={(v) => [money2(Number(v ?? 0)), 'Ingresos']} />
                                        <Area dataKey="revenue" name="Ingresos" type="linear" stroke="var(--bos-text)" strokeWidth={2} fill="var(--bos-text)" fillOpacity={0.1} dot={{ r: 2.5, fill: 'var(--bos-text)', strokeWidth: 0 }} activeDot={{ r: 4 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <section aria-labelledby="hours-title" className={`${card} p-5`}>
                            <h2 id="hours-title" className="font-display text-lg font-semibold">Horas fuertes</h2>
                            <p className="text-sm text-bos-muted mb-4">{peak === null ? 'Aún no hay cortes en este periodo.' : `La hora con más cortes es de ${hourLabel(peak)} a ${hourLabel(peak + 1)}.`}</p>
                            <div className="h-56">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={hours} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={1} />
                                        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={28} />
                                        <Tooltip {...TOOLTIP} formatter={(v) => [Number(v ?? 0), 'Cortes']} />
                                        <Bar dataKey="cuts" name="Cortes" fill="var(--bos-accent)" radius={[6, 6, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                        <section aria-labelledby="days-title" className={`${card} p-5`}>
                            <h2 id="days-title" className="font-display text-lg font-semibold">Días fuertes</h2>
                            <p className="text-sm text-bos-muted mb-4">Cortes por día de la semana, {rangeLabel}.</p>
                            <div className="h-56">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={weekdays} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
                                        <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={28} />
                                        <Tooltip {...TOOLTIP} formatter={(v) => [Number(v ?? 0), 'Cortes']} />
                                        <Bar dataKey="cuts" name="Cortes" fill="var(--bos-text)" radius={[6, 6, 0, 0]} maxBarSize={44} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    </div>

                    <section aria-labelledby="team-title" className={`${card} overflow-hidden`}>
                        <h2 id="team-title" className="font-display text-lg font-semibold px-5 pt-5">Equipo</h2>
                        <div className="overflow-x-auto">
                            <table className="bos-stack w-full md:min-w-[720px] text-[15px] mt-3">
                                <thead>
                                    <tr className="text-left text-[13px] text-bos-muted">
                                        <th className="px-5 py-3 font-semibold">Persona</th>
                                        <th className="px-5 py-3 font-semibold">Cortes</th>
                                        <th className="px-5 py-3 font-semibold text-right">Ingresos</th>
                                        <th className="px-5 py-3 font-semibold text-right">Ticket prom.</th>
                                        <th className="px-5 py-3 font-semibold text-right">Propinas</th>
                                        <th className="px-5 py-3 font-semibold text-right">Comisión</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.barbers.map((b, i) => (
                                        <tr key={b.id} data-testid="team-row" className="border-t border-bos-border tabular-nums">
                                            <td data-label="" className="px-5 py-3">
                                                <span className="inline-flex items-center gap-3">
                                                    <span aria-hidden="true" className={`h-8 w-8 rounded-full inline-flex items-center justify-center text-sm font-bold ${i === 0 && b.cuts > 0 ? 'bg-bos-accent text-bos-on-accent' : 'bg-bos-raised'}`}>{b.name.charAt(0)}</span>
                                                    <span className="font-medium">{b.name}</span>
                                                    {!b.is_barber && <span className="text-xs text-bos-muted">Recepción</span>}
                                                </span>
                                            </td>
                                            <td data-label="Cortes" className="px-5 py-3">
                                                <span className="flex items-center gap-3">
                                                    <span className="w-8 font-semibold">{b.cuts}</span>
                                                    <span aria-hidden="true" className="hidden sm:block h-1.5 w-28 rounded-full bg-bos-raised overflow-hidden">
                                                        <span className="block h-full rounded-full bg-bos-accent" style={{ width: `${Math.round((b.cuts / topBarberCuts) * 100)}%` }} />
                                                    </span>
                                                </span>
                                            </td>
                                            <td data-label="Ingresos" className="px-5 py-3 text-right font-semibold">{money(b.revenue)}</td>
                                            <td data-label="Ticket prom." className="px-5 py-3 text-right">{money(b.avg_ticket)}</td>
                                            <td data-label="Propinas" className="px-5 py-3 text-right">{money(b.tips)}</td>
                                            <td data-label="Comisión" className="px-5 py-3 text-right">{money(b.commission)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                        <section aria-labelledby="services-title" className={`${card} p-5`}>
                            <h2 id="services-title" className="font-display text-lg font-semibold mb-3">Lo más vendido</h2>
                            {data.services.length === 0 ? <p className="text-bos-muted">Sin ventas en este periodo.</p> : (
                                <ol className="space-y-2">
                                    {data.services.slice(0, 8).map((s) => (
                                        <li key={`${s.type}-${s.name}`} className="flex items-center justify-between gap-3 py-1.5 border-b border-bos-border last:border-b-0">
                                            <span className="min-w-0">
                                                <span className="block font-medium truncate">{s.name}</span>
                                                <span className="text-xs text-bos-muted">{s.type === 'service' ? 'Servicio' : 'Producto'}</span>
                                            </span>
                                            <span className="text-right tabular-nums">
                                                <span className="block font-semibold">{s.count}</span>
                                                <span className="text-xs text-bos-muted">{money(s.revenue)}</span>
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                        <section aria-labelledby="pay-title" className={`${card} p-5`}>
                            <h2 id="pay-title" className="font-display text-lg font-semibold mb-3">Cómo pagan</h2>
                            {payTotal === 0 ? <p className="text-bos-muted">Sin pagos en este periodo.</p> : (
                                <>
                                    <div aria-hidden="true" className="flex h-3 rounded-full overflow-hidden bg-bos-raised mb-4">
                                        <span className="bg-bos-accent" style={{ width: `${(data.payments.cash / payTotal) * 100}%` }} />
                                        <span className="bg-bos-text" style={{ width: `${(data.payments.card / payTotal) * 100}%` }} />
                                        <span className="bg-bos-muted" style={{ width: `${(data.payments.transfer / payTotal) * 100}%` }} />
                                    </div>
                                    <dl className="space-y-2 text-[15px]">
                                        {([['cash', 'bg-bos-accent'], ['card', 'bg-bos-text'], ['transfer', 'bg-bos-muted']] as const).map(([m, color]) => (
                                            <div key={m} className="flex items-center justify-between gap-3">
                                                <dt className="flex items-center gap-2"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${color}`} />{METHOD_LABELS[m]}</dt>
                                                <dd className="tabular-nums"><span className="font-semibold">{money(data.payments[m])}</span> <span className="text-bos-muted">· {Math.round((data.payments[m] / payTotal) * 100)}%</span></dd>
                                            </div>
                                        ))}
                                    </dl>
                                    {barber && <p className="mt-3 text-xs text-bos-muted">Incluye el total de las ventas donde participó, también lo de otras personas en la misma venta.</p>}
                                </>
                            )}
                        </section>
                    </div>

                    <Ranking mine={false} />

                    <section aria-labelledby="log-title" className={`${card} overflow-hidden`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
                            <div>
                                <h2 id="log-title" className="font-display text-lg font-semibold">Registro</h2>
                                <p className="text-sm text-bos-muted">Cada servicio y producto cobrado, con su hora exacta.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-bos-muted" />
                                    <input type="search" aria-label="Buscar en el registro" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)}
                                        className="h-10 w-44 pl-9 pr-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text" />
                                </div>
                                <select aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
                                    className="h-10 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text">
                                    <option value="all">Todo</option><option value="service">Servicios</option><option value="product">Productos</option>
                                </select>
                                <button type="button" onClick={exportActivity} className="min-h-11 px-4 rounded-xl border border-bos-border text-sm font-semibold inline-flex items-center gap-2 hover:bg-bos-raised">
                                    <Download aria-hidden="true" className="h-4 w-4" /> Descargar
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto mt-3">
                            <table className="bos-stack w-full md:min-w-[760px] text-[15px]">
                                <thead>
                                    <tr className="text-left text-[13px] text-bos-muted">
                                        <th className="px-5 py-3 font-semibold">Fecha y hora</th>
                                        <th className="px-5 py-3 font-semibold">Persona</th>
                                        <th className="px-5 py-3 font-semibold">Concepto</th>
                                        <th className="px-5 py-3 font-semibold">Pago</th>
                                        <th className="px-5 py-3 font-semibold text-right">Importe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.slice(0, shown).map((a, i) => (
                                        <tr key={`${a.sale_id}-${i}`} data-testid="log-row" className="border-t border-bos-border">
                                            <td data-label="Fecha y hora" className="px-5 py-3 tabular-nums whitespace-nowrap">
                                                {formatDateTime(a.at, tz, { year: false })}
                                            </td>
                                            <td data-label="Persona" className="px-5 py-3">{a.employee ?? '—'}</td>
                                            <td data-label="" className="px-5 py-3">
                                                {a.item}{a.quantity > 1 ? ` × ${a.quantity}` : ''}
                                                {a.client && <span className="block text-xs text-bos-muted">{a.client}</span>}
                                            </td>
                                            <td data-label="Pago" className="px-5 py-3 text-bos-muted">{(a.methods ?? '').split(',').filter(Boolean).map((m) => METHOD_LABELS[m] ?? m).join(' + ')}</td>
                                            <td data-label="Importe" className="px-5 py-3 text-right font-semibold tabular-nums">{money2(a.amount)}</td>
                                        </tr>
                                    ))}
                                    {activity.length === 0 && <tr><td colSpan={5} data-label="" className="px-5 py-8 text-center text-bos-muted">Nada que mostrar con estos filtros.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        {activity.length > shown && (
                            <div className="p-4 border-t border-bos-border text-center">
                                <button type="button" onClick={() => setShown(shown + 50)} className="min-h-11 px-5 rounded-xl text-sm font-semibold text-bos-muted hover:text-bos-text hover:bg-bos-raised">
                                    Ver más ({activity.length - shown} restantes)
                                </button>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
