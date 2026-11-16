'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Minus, RotateCw, Trophy } from 'lucide-react';
import { PERIODS, PERIOD_LABELS, type Period } from '@/lib/barber/my-week';
import {
    METRIC_LABELS, RANK_METRICS, boardIsEmpty, gapToAbove, placeChange, rankingInsight,
    type Board, type BoardRow, type Boards, type RankMetric,
} from '@/lib/reports/ranking';
import { Skeleton, card, moneyWhole, plural, sectionTitle } from '@/app/barbero/_components/ui';

interface RankingResponse { period: Period; source: 'function' | 'fallback' | 'limited'; boards: Boards }

const PERIOD_PHRASE: Record<Period, string> = { week: 'esta semana', last_week: 'la semana pasada', month: 'este mes' };
const EMPTY_TEXT: Record<RankMetric, string> = { cuts: 'Aún no hay cortes', revenue: 'Aún no hay ventas', products: 'Aún no hay productos vendidos' };
const UNIT: Record<RankMetric, (n: number) => string> = {
    cuts: (n) => (n === 1 ? 'corte' : 'cortes'),
    revenue: () => '',
    products: (n) => (n === 1 ? 'pieza' : 'piezas'),
};
// Altura del escalón según el lugar (los empates comparten altura).
const STEP_HEIGHT = (place: number) => (place === 1 ? 'h-28' : place === 2 ? 'h-20' : 'h-14');

function Avatar({ name, size }: { name: string; size: 'lg' | 'md' | 'sm' }) {
    const box = size === 'lg' ? 'h-16 w-16 text-2xl' : size === 'md' ? 'h-12 w-12 text-lg' : 'h-8 w-8 text-sm';
    return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-bos-raised font-display font-semibold text-bos-text ${box}`}>{name.charAt(0).toUpperCase()}</span>;
}

function valueText(metric: RankMetric, value: number | null): string {
    if (value === null) return '';
    return metric === 'revenue' ? moneyWhole(value) : String(value);
}

function Change({ row }: { row: BoardRow }) {
    const change = placeChange(row);
    if (change === null) return <span className="w-5" aria-hidden="true" />;
    if (change === 0) return <span className="inline-flex w-5 justify-center text-bos-muted"><Minus aria-hidden="true" className="h-4 w-4" /><span className="sr-only">Mismo lugar que el periodo anterior</span></span>;
    const up = change > 0;
    return (
        <span className={`inline-flex w-5 justify-center ${up ? 'text-bos-success' : 'text-bos-danger'}`}>
            {up ? <ArrowUp aria-hidden="true" className="h-4 w-4" /> : <ArrowDown aria-hidden="true" className="h-4 w-4" />}
            <span className="sr-only">{up ? 'Sube' : 'Baja'} {plural(Math.abs(change), 'lugar', 'lugares')} contra el periodo anterior</span>
        </span>
    );
}

function Podium({ rows, metric, isHi, showYou }: { rows: BoardRow[]; metric: RankMetric; isHi: (r: BoardRow) => boolean; showYou: (r: BoardRow) => boolean }) {
    const top = rows.slice(0, 3);
    // Primero al centro, segundo a la izquierda, tercero a la derecha; el orden de lectura sigue siendo 1, 2, 3.
    const columns = ['col-start-2', 'col-start-1', 'col-start-3'];
    const delays = ['.25s', '.1s', '.4s'];
    return (
        <ol aria-label="Podio" className="grid grid-cols-3 items-end gap-2 pt-2 sm:gap-4">
            {top.map((row, index) => {
                const winner = row.place === 1;
                const hi = isHi(row);
                return (
                    <li key={row.id} data-testid="podium-slot" className={`row-start-1 flex min-w-0 flex-col items-center gap-2 ${columns[index]}`}>
                        <div className="bos-rise flex min-w-0 max-w-full flex-col items-center gap-1" style={{ animationDelay: delays[index] }}>
                            {winner ? <Trophy aria-hidden="true" className="h-5 w-5 text-bos-accent-text" /> : <span className="h-5" aria-hidden="true" />}
                            <span className={winner ? 'rounded-full ring-2 ring-bos-accent ring-offset-2 ring-offset-bos-surface' : hi ? 'rounded-full ring-2 ring-bos-border ring-offset-2 ring-offset-bos-surface' : ''}>
                                <Avatar name={row.name} size={winner ? 'lg' : 'md'} />
                            </span>
                            <span className="max-w-full truncate text-center text-sm font-semibold leading-tight">{row.name}</span>
                            {showYou(row) && <span className="-mt-0.5 text-xs font-medium text-bos-accent-text">tú</span>}
                            <span className={`font-display font-semibold tabular-nums leading-none ${winner ? 'text-2xl text-bos-accent-text' : 'text-xl text-bos-text'}`}>
                                {valueText(metric, row.value)}
                            </span>
                            {row.value !== null && UNIT[metric](row.value) && <span className="text-xs text-bos-muted">{UNIT[metric](row.value)}</span>}
                        </div>
                        <div className={`bos-grow flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2 ${STEP_HEIGHT(row.place)} ${winner ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border bg-bos-raised'}`} style={{ animationDelay: delays[index] }}>
                            <span className={`font-display text-2xl font-semibold ${winner ? 'text-bos-accent-text' : 'text-bos-muted'}`}>{row.place}</span>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

function FullList({ board, metric, shown, isHi, showYou }: { board: Board; metric: RankMetric; shown: boolean; isHi: (r: BoardRow) => boolean; showYou: (r: BoardRow) => boolean }) {
    return (
        <ol aria-label="Lista completa" className="space-y-1.5 border-t border-bos-border pt-4">
            {board.rows.map((row) => {
                const hi = isHi(row);
                const gap = row.place > 1 ? gapToAbove(board.rows, row, metric) : null;
                return (
                    <li key={row.id} data-testid="podium-row" aria-current={hi ? 'true' : undefined}
                        className={`grid grid-cols-[20px_20px_32px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 rounded-lg px-2 py-2 text-[15px] sm:gap-x-3 ${hi ? 'bg-bos-accent-soft' : ''}`}>
                        <span className={`font-display font-semibold tabular-nums ${row.place === 1 ? 'text-bos-accent-text' : 'text-bos-muted'}`}>{row.place}</span>
                        <Change row={row} />
                        <Avatar name={row.name} size="sm" />
                        <span className="min-w-0">
                            <span className={`block truncate ${hi ? 'font-semibold' : ''}`}>{row.name}{showYou(row) ? ' (tú)' : ''}</span>
                            {gap && <span className="block truncate text-[13px] text-bos-muted">{gap.text}</span>}
                        </span>
                        <span className="text-right">
                            <span className="font-semibold tabular-nums">{valueText(metric, row.value) || <span aria-hidden="true" className="text-bos-muted">·</span>}</span>
                            {row.value === null && <span className="sr-only">Importe no disponible</span>}
                            {metric === 'products' && row.secondary !== null && row.secondary > 0 && <span className="block text-[13px] text-bos-muted tabular-nums">{moneyWhole(row.secondary)}</span>}
                        </span>
                        {row.share !== null && (
                            <span aria-hidden="true" className="col-start-4 col-end-6 h-2 overflow-hidden rounded-full bg-bos-raised">
                                <span className={`block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${hi || row.place === 1 ? 'bg-bos-accent' : 'bg-bos-muted'}`}
                                    style={{ width: shown ? `${Math.max(row.share > 0 ? 3 : 0, Math.round(row.share * 100))}%` : '0%' }} />
                            </span>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

export interface RankingProps {
    /** A quién se resalta; sin esto, a la persona que tiene la sesión. */
    highlightId?: string | null;
    /** La persona resaltada es quien mira (para escribir "tú" y "vas"). */
    mine?: boolean;
    initialPeriod?: Period;
    title?: string;
}

export default function Ranking({ highlightId = null, mine = true, initialPeriod = 'week', title = 'Ranking del equipo' }: RankingProps) {
    const [period, setPeriod] = useState<Period>(initialPeriod);
    const [metric, setMetric] = useState<RankMetric>('cuts');
    const [data, setData] = useState<RankingResponse | null>(null);
    const [error, setError] = useState('');
    const [key, setKey] = useState(0);
    const [shown, setShown] = useState(false);
    const requestRef = useRef(0);

    useEffect(() => {
        const request = ++requestRef.current;
        setError('');
        setData(null);
        fetch(`/api/ranking?period=${period}`, { cache: 'no-store' })
            .then(async (res) => {
                const body = await res.json().catch(() => null);
                if (!res.ok) throw new Error(body?.error ?? 'No se pudo cargar el ranking.');
                if (!body?.boards) throw new Error('No se pudo cargar el ranking.');
                return body as RankingResponse;
            })
            .then((body) => { if (request === requestRef.current) setData(body); })
            .catch((e) => { if (request === requestRef.current) setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar el ranking.'); });
    }, [period, key]);

    // Las barras entran de cero a su largo cada vez que cambia la clasificación o el periodo.
    useEffect(() => {
        setShown(false);
        const frame = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(frame);
    }, [metric, period, data]);

    const onKeyDown = useCallback((event: React.KeyboardEvent) => {
        const index = RANK_METRICS.indexOf(metric);
        const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null;
        if (next === null) return;
        event.preventDefault();
        const target = RANK_METRICS[(next + RANK_METRICS.length) % RANK_METRICS.length];
        setMetric(target);
        document.getElementById(`rank-tab-${target}`)?.focus();
    }, [metric]);

    const board = data?.boards[metric] ?? null;
    const isHi = (r: BoardRow) => (highlightId ? r.id === highlightId : r.isMe);
    const showYou = (r: BoardRow) => isHi(r) && (highlightId ? mine : true);
    const hiId = highlightId ?? board?.rows.find((r) => r.isMe)?.id ?? null;
    const insight = board && hiId ? rankingInsight(board, hiId, metric, mine) : null;

    return (
        <section aria-labelledby="ranking-title" data-testid="podium" className={`${card} space-y-4 p-4 sm:p-6`}>
            <div className="space-y-3">
                <h2 id="ranking-title" className={sectionTitle}>{title}</h2>
                <div role="group" aria-label="Periodo del ranking" className="grid grid-cols-3 gap-1 rounded-xl bg-bos-raised p-1">
                    {PERIODS.map((p) => (
                        <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
                            className={`min-h-11 rounded-lg px-2 text-sm font-semibold transition-colors ${period === p ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>
                            {PERIOD_LABELS[p]}
                        </button>
                    ))}
                </div>
                <div role="tablist" aria-label="Clasificación" onKeyDown={onKeyDown} className="grid grid-cols-3 border-b border-bos-border">
                    {RANK_METRICS.map((m) => {
                        const active = metric === m;
                        return (
                            <button key={m} id={`rank-tab-${m}`} type="button" role="tab" aria-selected={active} aria-controls="rank-panel" tabIndex={active ? 0 : -1}
                                aria-label={METRIC_LABELS[m]} onClick={() => setMetric(m)}
                                className={`-mb-px min-h-11 border-b-2 px-1 text-[15px] font-semibold transition-colors ${active ? 'border-bos-accent text-bos-text' : 'border-transparent text-bos-muted hover:text-bos-text'}`}>
                                {m === 'products' ? <><span className="sm:hidden">Productos</span><span className="hidden sm:inline">Productos vendidos</span></> : METRIC_LABELS[m]}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div id="rank-panel" role="tabpanel" aria-labelledby={`rank-tab-${metric}`} className="space-y-4">
                {error ? (
                    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-bos-raised p-4">
                        <p className="text-[15px] font-semibold text-bos-danger">{error}</p>
                        <button type="button" onClick={() => setKey((k) => k + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-bos-border px-4 text-[15px] font-semibold text-bos-text hover:bg-bos-surface">
                            <RotateCw aria-hidden="true" className="h-4 w-4" /> Reintentar
                        </button>
                    </div>
                ) : !board ? (
                    <div aria-busy="true" aria-label="Ranking: cargando" className="space-y-3">
                        <Skeleton className="h-44 w-full" />
                        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
                    </div>
                ) : board.status === 'unavailable' ? (
                    <p className="rounded-lg bg-bos-raised px-4 py-5 text-center text-[15px] text-bos-muted">
                        {metric === 'cuts' ? 'Los cortes de este periodo estarán disponibles pronto.' : `${METRIC_LABELS[metric]} estará disponible pronto.`}
                    </p>
                ) : boardIsEmpty(board) ? (
                    <p className="rounded-lg bg-bos-raised px-4 py-5 text-center text-[15px] text-bos-muted">{EMPTY_TEXT[metric]} {PERIOD_PHRASE[period]}.</p>
                ) : (
                    <>
                        <Podium rows={board.rows} metric={metric} isHi={isHi} showYou={showYou} />
                        {board.rows.length === 1 && <p className="text-center text-sm text-bos-muted">Por ahora es la única persona en esta clasificación.</p>}
                        {insight && <p data-testid="podium-insight" className="rounded-lg bg-bos-raised px-4 py-3 text-[15px] font-medium">{insight}</p>}
                        {metric === 'revenue' && board.rows.some((r) => r.value === null) && (
                            <p className="text-sm text-bos-muted">Ves el orden de todos y tu propio importe.</p>
                        )}
                        <FullList board={board} metric={metric} shown={shown} isHi={isHi} showYou={showYou} />
                    </>
                )}
            </div>
        </section>
    );
}
