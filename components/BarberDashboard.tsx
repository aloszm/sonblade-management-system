'use client';

import React, { useEffect, useRef, useState } from 'react';
import { PERIODS, PERIOD_LABELS, type MyWeek, type Period } from '@/lib/barber/my-week';
import { SectionError, SectionSkeleton, Skeleton, card } from '@/app/barbero/_components/ui';
import { ClientsSection, EarningsSection, ReceiptsSection, ServicesSection, TipsSection, TodaySection } from '@/app/barbero/_components/sections';
import Ranking from '@/components/Ranking';

type Me = { id: string; role: 'admin' | 'recepcion' | 'barber'; employeeId: string | null };
type Barber = { id: string; name: string };
type Stats = MyWeek & { barber: Barber };

async function getJson<T>(url: string, fallback: string): Promise<T> {
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? fallback);
    return body as T;
}

const fail = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function BarberDashboard() {
    const [me, setMe] = useState<Me | null>(null);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [startError, setStartError] = useState('');
    const [startKey, setStartKey] = useState(0);

    const [period, setPeriod] = useState<Period>('week');
    const [stats, setStats] = useState<Stats | null>(null);
        const [statsError, setStatsError] = useState('');
    const [statsKey, setStatsKey] = useState(0);

    const [today, setToday] = useState('');
    const requestRef = useRef(0);

    // Quién es la persona y a quién se puede ver. La fecha se toma del dispositivo, no del servidor (que está en UTC).
    useEffect(() => {
        setToday(new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
        let cancelled = false;
        (async () => {
            try {
                setStartError('');
                const [meBody, list] = await Promise.all([
                    getJson<{ authenticated?: boolean; user: Me }>('/api/auth/me', 'No se pudo cargar tu panel.'),
                    getJson<Barber[]>('/api/barbers', 'No se pudo cargar la lista de barberos.').catch(() => [] as Barber[]),
                ]);
                if (cancelled) return;
                if (!meBody?.authenticated) throw new Error('Vuelve a iniciar sesión.');
                const user = meBody.user;
                const barberList = Array.isArray(list) ? list : [];
                setMe(user);
                setBarbers(barberList);
                // Un barbero ve lo suyo. Dueño y gerente eligen a quién ver; si la gerente también corta, empieza en ella.
                const own = barberList.some((b) => b.id === user.employeeId) ? user.employeeId : null;
                setSelectedId(user.role === 'barber' ? user.employeeId ?? user.id : own ?? barberList[0]?.id ?? null);
            } catch (e) {
                if (!cancelled) setStartError(fail(e, 'No se pudo cargar tu panel.'));
            }
        })();
        return () => { cancelled = true; };
    }, [startKey]);

    useEffect(() => {
        if (!selectedId) return;
        const request = ++requestRef.current;
        setStatsError('');
        getJson<Stats>(`/api/barbers/${selectedId}/stats?view=my-week&period=${period}`, 'No se pudieron cargar tus cifras.')
            .then((body) => { if (request === requestRef.current) setStats(body); })
            .catch((e) => { if (request === requestRef.current) setStatsError(fail(e, 'No se pudieron cargar tus cifras.')); });
    }, [selectedId, period, statsKey, me]);

    if (startError) {
        return <div className="mx-auto max-w-xl"><SectionError message={startError} onRetry={() => setStartKey((k) => k + 1)} /></div>;
    }
    if (!me) {
        return (
            <div aria-busy="true" aria-label="Cargando tu panel" className="mx-auto max-w-5xl space-y-6">
                <div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-9 w-56" /></div>
                <Skeleton className="h-12 w-full max-w-md" />
                <div className="grid gap-6 lg:grid-cols-2"><SectionSkeleton title="Hoy" /><SectionSkeleton title="Ganado" /></div>
            </div>
        );
    }
    if (!selectedId) return <p className={`${card} mx-auto max-w-xl p-6 text-bos-muted`}>No hay barberos activos todavía.</p>;

    const canPick = me.role === 'admin';
    const mine = me.role === 'barber' || selectedId === me.employeeId;
    // Con otro barbero en pantalla (dueño o gerente) no se muestra su nombre hasta que sus cifras llegan.
    const shownName = stats && stats.barber.id === selectedId ? stats.barber.name : barbers.find((b) => b.id === selectedId)?.name ?? '';
    // Solo se muestran cifras que corresponden a la persona y al periodo elegidos; mientras llegan, esqueleto.
    const data = stats && stats.barber.id === selectedId && stats.period === period ? stats : null;

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <header className="space-y-1">
                <p className="text-sm text-bos-muted first-letter:uppercase">{today}</p>
                <h1 className="font-display text-3xl font-semibold">{mine ? `Hola, ${shownName || 'barbero'}` : shownName}</h1>
            </header>

            {canPick && barbers.length > 1 && (
                <div role="group" aria-label="Barbero" className="flex flex-wrap gap-2">
                    {barbers.map((b) => (
                        <button key={b.id} type="button" aria-pressed={selectedId === b.id} onClick={() => setSelectedId(b.id)}
                            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${selectedId === b.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border bg-bos-surface text-bos-muted hover:text-bos-text'}`}>
                            {b.name}
                        </button>
                    ))}
                </div>
            )}

            <div role="group" aria-label="Periodo" data-testid="period" className="grid grid-cols-3 gap-1 rounded-xl bg-bos-raised p-1 sm:inline-grid sm:grid-cols-[repeat(3,auto)]">
                {PERIODS.map((p) => (
                    <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
                        className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors sm:px-5 sm:text-[15px] ${period === p ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>
                        {PERIOD_LABELS[p]}
                    </button>
                ))}
            </div>

            {statsError && !data ? (
                <SectionError message={statsError} onRetry={() => setStatsKey((k) => k + 1)} />
            ) : (
                <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
                    {!data ? (
                        <>
                            <SectionSkeleton title="Hoy" rows={4} />
                            <SectionSkeleton title="Ganado" rows={4} />
                        </>
                    ) : (
                        <>
                            <TodaySection data={data} mine={mine} />
                            <EarningsSection data={data} mine={mine} />
                        </>
                    )}

                    <Ranking highlightId={selectedId} mine={mine} />

                    {data && (
                        <>
                            <ServicesSection data={data} mine={mine} />
                            <ClientsSection data={data} mine={mine} />
                            <TipsSection data={data} mine={mine} />
                            <ReceiptsSection data={data} mine={mine} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
