'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { isValidDay, MAX_RANGE_DAYS, profitPresetRange, rangeDays, type ProfitPreset, type ProfitReport } from '@/lib/admin/profit';
import { CLIENT_NAME } from '@/lib/brand';
import { localDateKey } from '@/lib/utils/dates';
import {
    Barbers, DashboardSkeleton, dayLabel, ExpensesByCategory, Hero, KpiStrip, Notices, PaymentMethods, Per100, Tips, Trend, Waterfall,
} from './sections';
import DateRangePicker from '@/components/ui/DateRangePicker';

type PeriodId = ProfitPreset | 'custom';
const PERIODS: { id: PeriodId; label: string }[] = [
    { id: 'week', label: 'Esta semana' },
    { id: 'month', label: 'Este mes' },
    { id: 'last_month', label: 'Mes pasado' },
    { id: 'custom', label: 'Rango' },
];

/** Finanzas: tablero del dueño con lo que entró, lo que salió y lo que realmente le quedó al negocio. Solo lectura. */
export default function FinanzasPage() {
    const today = useMemo(() => localDateKey(new Date()), []);
    const [period, setPeriod] = useState<PeriodId>('month');
    const [custom, setCustom] = useState(() => profitPresetRange('month', today));
    const [data, setData] = useState<ProfitReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const range = period === 'custom' ? custom : profitPresetRange(period, today);
    const rangeError = period !== 'custom' ? ''
        : !isValidDay(custom.from) || !isValidDay(custom.to) ? 'Elige ambas fechas.'
            : custom.from > custom.to ? 'La fecha inicial debe ser anterior o igual a la final.'
                : rangeDays(custom.from, custom.to) > MAX_RANGE_DAYS ? `El periodo no puede pasar de ${MAX_RANGE_DAYS} días.` : '';

    const load = useCallback(async (from: string, to: string) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/admin/profit?from=${from}&to=${to}`, { cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo calcular el tablero.');
            setData(body as ProfitReport);
        } catch (e) {
            setData(null);
            setError(e instanceof TypeError ? 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.' : e instanceof Error ? e.message : 'No se pudo calcular el tablero.');
        } finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (rangeError) { setLoading(false); return; }
        load(range.from, range.to);
    }, [load, range.from, range.to, rangeError]);

    const empty = !!data && data.revenue.total === 0 && data.expenses.total === 0 && data.counts.sales === 0 && data.tips.count === 0;
    const field = 'h-11 w-full px-3 rounded-xl bg-bos-bg border border-bos-border text-base text-bos-text outline-none focus:border-bos-accent';

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <header className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="hidden text-[13px] font-medium text-bos-muted print:block">{CLIENT_NAME}</p>
                        <h1 className="font-display text-3xl font-semibold tracking-tight">Finanzas</h1>
                        <p className="max-w-2xl text-sm text-bos-muted print:hidden">Cuánto entró, a dónde se fue y cuánto le quedó realmente al negocio.</p>
                    </div>
                    <button type="button" onClick={() => window.print()} disabled={!data}
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-bos-border px-3.5 text-sm font-medium text-bos-muted hover:text-bos-text disabled:opacity-60 print:hidden">
                        <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir
                    </button>
                </div>
                <div role="group" aria-label="Periodo" className="flex flex-wrap gap-2 print:hidden">
                    {PERIODS.map((p) => (
                        <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}
                            className={`h-9 px-3.5 rounded-full border text-sm font-medium ${period === p.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`}>{p.label}</button>
                    ))}
                </div>
                {period === 'custom' && (
                    <div className="max-w-md print:hidden">
                        <label htmlFor="fin-range" className="mb-1.5 block text-[13px] font-medium text-bos-muted">Periodo</label>
                        <DateRangePicker id="fin-range" shortcuts={false} value={custom} onChange={setCustom} className={field} />
                    </div>
                )}
                {!rangeError && <p className="text-[13px] text-bos-muted">Del {dayLabel(range.from)} al {dayLabel(range.to)}, hora de la barbería.</p>}
            </header>

            {rangeError && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-bos-danger">{rangeError}</p>}
            {!rangeError && error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bos-danger bg-bos-danger-soft p-4">
                    <p className="text-bos-text">{error}</p>
                    <button type="button" onClick={() => load(range.from, range.to)} className="inline-flex h-9 items-center gap-2 rounded-full border border-bos-border bg-bos-surface px-3.5 text-sm font-medium text-bos-text print:hidden">
                        <RefreshCw aria-hidden="true" className="h-4 w-4" /> Reintentar
                    </button>
                </div>
            )}
            {!rangeError && loading && <DashboardSkeleton />}

            {!rangeError && !loading && !error && data && (
                empty ? (
                    <p className="rounded-xl border border-bos-border bg-bos-surface p-8 text-center text-bos-muted">Todavía no hay ventas cobradas ni gastos en este periodo. Prueba con otro periodo.</p>
                ) : (
                    <>
                        <Hero data={data} />
                        <KpiStrip data={data} />
                        <Notices data={data} />
                        <div className="grid items-start gap-6 lg:grid-cols-2">
                            <Waterfall data={data} />
                            <Per100 data={data} />
                        </div>
                        <Trend data={data} />
                        <Tips data={data} />
                        <Barbers rows={data.barbers} />
                        <div className="grid gap-6 lg:grid-cols-2">
                            <PaymentMethods data={data} />
                            <ExpensesByCategory data={data} />
                        </div>
                    </>
                )
            )}
        </div>
    );
}
