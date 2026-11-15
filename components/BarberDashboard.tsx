'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2 } from 'lucide-react';
import { podiumIsEmpty, rankPodium, type PodiumRow, type RankedRow } from '@/lib/reports/podium';

type SaleItem = { item_name: string; item_type: 'service' | 'product' };
type TodaySale = { id: string; created_at: string; items: SaleItem[]; payment_method: string; total: number };
type BarberStats = {
    barber: { id: string; name: string };
    tier: { current: number };
    weeklyStats: { cuts: number; totalGenerated: number; tips: number; commission: number; serviceCommission: number; productCommission: number };
    todayStats: { cuts: number; tips: number; sales: TodaySale[] };
};
type Me = { id: string; role: 'admin' | 'recepcion' | 'barber'; employeeId: string | null };

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
const card = 'rounded-2xl border border-bos-border bg-bos-surface';
const label = 'text-xs font-semibold uppercase tracking-[0.08em] text-bos-muted';
const PODIUM_HEIGHTS = ['h-28', 'h-20', 'h-14']; // primero, segundo, tercero

function Podium({ rows }: { rows: RankedRow[] }) {
    // En pantalla: segundo, primero, tercero; el primero al centro y más alto.
    const [first, second, third] = rows;
    const slots: { row: RankedRow | undefined; height: string; delay: string }[] = [
        { row: second, height: PODIUM_HEIGHTS[1], delay: '.1s' },
        { row: first, height: PODIUM_HEIGHTS[0], delay: '.25s' },
        { row: third, height: PODIUM_HEIGHTS[2], delay: '.4s' },
    ];
    return (
        <div className="grid grid-cols-3 gap-3 items-end pt-2">
            {slots.map(({ row, height, delay }, index) => {
                if (!row) return <div key={index} />;
                const winner = row.place === 1;
                return (
                    <div key={row.employee_id} data-testid="podium-slot" className="flex flex-col items-center gap-2">
                        <div className="bos-rise flex flex-col items-center gap-1.5" style={{ animationDelay: delay }}>
                            <span aria-hidden="true" className={`rounded-full inline-flex items-center justify-center font-display font-bold ${winner ? 'h-16 w-16 text-2xl bg-bos-accent text-bos-on-accent' : 'h-12 w-12 text-lg bg-bos-raised text-bos-text'}`}>{row.name.charAt(0).toUpperCase()}</span>
                            <span className="text-sm font-semibold text-center leading-tight">{row.name}{row.is_me && <span className="block text-xs font-medium text-bos-accent-text">Tú</span>}</span>
                            <span className={`font-display font-bold tabular-nums ${winner ? 'text-2xl text-bos-accent-text' : 'text-xl text-bos-text'}`}>{row.cuts}</span>
                        </div>
                        <div className={`bos-grow w-full ${height} rounded-t-xl border border-b-0 flex items-start justify-center pt-2 ${winner ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border bg-bos-raised'}`} style={{ animationDelay: delay }}>
                            <span className={`font-display text-2xl font-bold ${winner ? 'text-bos-accent-text' : 'text-bos-muted'}`}>{row.place}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function BarberDashboard() {
    const [me, setMe] = useState<Me | null>(null);
    const [barbers, setBarbers] = useState<{ id: string; name: string }[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [stats, setStats] = useState<BarberStats | null>(null);
    const [podium, setPodium] = useState<RankedRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [today, setToday] = useState('');

    useEffect(() => {
        // La fecha se calcula en el dispositivo, no en el servidor (que está en UTC).
        setToday(new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
        (async () => {
            try {
                const [meRes, barbersRes, podiumRes] = await Promise.all([
                    fetch('/api/auth/me', { cache: 'no-store' }), fetch('/api/barbers', { cache: 'no-store' }), fetch('/api/podium', { cache: 'no-store' }),
                ]);
                const meBody = await meRes.json();
                const list = barbersRes.ok ? await barbersRes.json() : [];
                const podiumBody = podiumRes.ok ? await podiumRes.json() : null;
                if (!meBody?.authenticated) throw new Error('Vuelve a iniciar sesión.');
                const user: Me = meBody.user;
                setMe(user);
                setBarbers(Array.isArray(list) ? list : []);
                if (podiumBody?.rows) setPodium(rankPodium(podiumBody.rows as PodiumRow[]));
                // Un barbero ve lo suyo. Dueño y gerente eligen a quién ver; si la gerente también corta, empieza en ella.
                const own = Array.isArray(list) && list.some((b: { id: string }) => b.id === user.employeeId) ? user.employeeId : null;
                setSelectedId(user.role === 'barber' ? user.id : own ?? list[0]?.id ?? null);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'No se pudo cargar tu panel.');
                setLoading(false);
            }
        })();
    }, []);

    useEffect(() => {
        if (!selectedId) { if (me) setLoading(false); return; }
        setLoading(true);
        fetch(`/api/barbers/${selectedId}/stats?view=dashboard`, { cache: 'no-store' })
            .then(async (res) => { const body = await res.json(); if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las cifras.'); return body; })
            .then((body) => { setStats(body); setError(''); })
            .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las cifras.'))
            .finally(() => setLoading(false));
    }, [selectedId, me]);

    if (error && !stats) return <p role="alert" className={`${card} max-w-xl mx-auto p-6 text-bos-danger`}>{error}</p>;
    if (!me || (loading && !stats)) return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>;
    if (!stats) return <p className={`${card} max-w-xl mx-auto p-6 text-bos-muted`}>No hay barberos activos todavía.</p>;

    const canPick = me.role === 'admin';
    const mine = selectedId === me.employeeId || me.role === 'barber';
    const week = stats.weeklyStats;
    const earned = Math.round((week.commission + week.tips) * 100) / 100;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <header className="space-y-1">
                <p className="text-sm text-bos-muted first-letter:uppercase">{today}</p>
                <h1 className="font-display text-3xl font-bold">{mine ? `Hola, ${stats.barber.name}` : stats.barber.name}</h1>
            </header>

            {canPick && barbers.length > 1 && (
                <div role="group" aria-label="Barbero" className="flex flex-wrap gap-2">
                    {barbers.map((b) => (
                        <button key={b.id} type="button" aria-pressed={selectedId === b.id} onClick={() => setSelectedId(b.id)}
                            className={`min-h-11 px-4 rounded-full border text-sm font-semibold transition-colors ${selectedId === b.id ? 'border-bos-accent bg-bos-accent-soft text-bos-text' : 'border-bos-border bg-bos-surface text-bos-muted hover:text-bos-text'}`}>
                            {b.name}
                        </button>
                    ))}
                </div>
            )}

            <section aria-labelledby="week-earned" className={`${card} p-6 space-y-5`}>
                <div>
                    <p id="week-earned" className={label}>{mine ? 'Esta semana llevas' : 'Esta semana lleva'}</p>
                    <p data-testid="week-earned" className="mt-1 font-display text-5xl font-bold text-bos-accent-text tabular-nums">{money(earned)}</p>
                    <p className="mt-1 text-sm text-bos-muted">Se paga el sábado, al cierre de las 8:00 pm.</p>
                </div>
                <dl className="space-y-2 text-[15px] border-t border-bos-border pt-4">
                    <div className="flex justify-between"><dt className="text-bos-muted">Comisión de servicios ({stats.tier.current}%)</dt><dd className="font-semibold tabular-nums">{money(week.serviceCommission)}</dd></div>
                    <div className="flex justify-between"><dt className="text-bos-muted">Comisión de productos</dt><dd className="font-semibold tabular-nums">{money(week.productCommission)}</dd></div>
                    <div className="flex justify-between"><dt className="text-bos-muted">Propinas</dt><dd className="font-semibold tabular-nums">{money(week.tips)}</dd></div>
                </dl>
            </section>

            <section aria-label="Resumen" className="grid grid-cols-3 gap-3">
                <div className={`${card} p-4`}><p className={label}>Cortes semana</p><p data-testid="week-cuts" className="mt-1 font-display text-3xl font-bold tabular-nums">{week.cuts}</p></div>
                <div className={`${card} p-4`}><p className={label}>Cortes hoy</p><p className="mt-1 font-display text-3xl font-bold tabular-nums">{stats.todayStats.cuts}</p></div>
                <div className={`${card} p-4`}><p className={label}>Propinas hoy</p><p className="mt-1 font-display text-3xl font-bold tabular-nums">{money(stats.todayStats.tips)}</p></div>
            </section>

            {podium && (
                <section aria-labelledby="podium-title" data-testid="podium" className={`${card} p-6 space-y-4`}>
                    <div>
                        <h2 id="podium-title" className="font-display text-xl font-semibold">Podio de la semana</h2>
                        <p className="text-sm text-bos-muted">Por número de cortes.</p>
                    </div>
                    {podiumIsEmpty(podium) ? (
                        <p className="py-6 text-center text-bos-muted">Aún no hay cortes esta semana. El primero abre el podio.</p>
                    ) : (
                        <>
                            <Podium rows={podium} />
                            <ol className="space-y-2 border-t border-bos-border pt-4">
                                {podium.map((row) => (
                                    <li key={row.employee_id} className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,2fr)_48px] items-center gap-3 text-[15px]">
                                        <span className={`font-display font-bold ${row.place === 1 ? 'text-bos-accent-text' : 'text-bos-muted'}`}>{row.place}</span>
                                        <span className={`truncate ${row.is_me ? 'font-semibold' : ''}`}>{row.name}</span>
                                        <span aria-hidden="true" className="h-2 rounded-full bg-bos-raised overflow-hidden">
                                            <span className={`block h-full rounded-full transition-[width] duration-500 ${row.place === 1 ? 'bg-bos-accent' : 'bg-bos-muted'}`} style={{ width: `${Math.round(row.share * 100)}%` }} />
                                        </span>
                                        <span className="text-right font-semibold tabular-nums">{row.cuts}</span>
                                    </li>
                                ))}
                            </ol>
                        </>
                    )}
                </section>
            )}

            <section aria-labelledby="today-title" className="space-y-3">
                <h2 id="today-title" className={label}>Hoy</h2>
                {stats.todayStats.sales.length === 0 ? (
                    <p className={`${card} p-6 text-center text-bos-muted`}>Todavía no hay servicios cobrados hoy.</p>
                ) : (
                    <ul className="space-y-2">
                        {stats.todayStats.sales.map((sale) => (
                            <li key={sale.id} className={`${card} px-4 py-3 flex items-center justify-between gap-4`}>
                                <div className="min-w-0">
                                    <p className="text-[15px] font-medium truncate">{sale.items.map((i) => i.item_name).join(' + ') || 'Venta'}</p>
                                    <p className="text-sm text-bos-muted">{new Date(sale.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <span className="font-display text-lg font-bold tabular-nums">{money(Number(sale.total))}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {mine && (
                <Link href="/liquidaciones" className={`${card} px-5 min-h-14 flex items-center justify-between text-[15px] font-semibold hover:bg-bos-raised`}>
                    Mis recibos de pago <ChevronRight aria-hidden="true" className="h-5 w-5 text-bos-muted" />
                </Link>
            )}
        </div>
    );
}
