'use client';

import React from 'react';
import { WEEKDAYS } from '@/lib/barber/my-week';
import { podiumInsight, podiumIsEmpty, type RankedRow } from '@/lib/reports/podium';
import { card, plural, sectionTitle } from './ui';

const PODIUM_HEIGHTS = ['h-24', 'h-16', 'h-11']; // primero, segundo, tercero

export interface PodiumExtras {
    /** Servicios de esta semana y de la semana pasada de quien se mira (solo números, nunca dinero). */
    weekCuts: number | null;
    lastWeekCuts: number | null;
    bestDay: { dow: number; services: number } | null;
}

function Avatar({ name, size }: { name: string; size: 'lg' | 'md' | 'sm' }) {
    const box = size === 'lg' ? 'h-16 w-16 text-2xl' : size === 'md' ? 'h-12 w-12 text-lg' : 'h-8 w-8 text-sm';
    return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-bos-raised font-display font-semibold text-bos-text ${box}`}>{name.charAt(0).toUpperCase()}</span>;
}

function Stage({ rows, selectedId }: { rows: RankedRow[]; selectedId: string }) {
    // En pantalla: segundo, primero, tercero; el primero al centro y más alto.
    const [first, second, third] = rows;
    const slots = [
        { row: second, height: PODIUM_HEIGHTS[1], delay: '.1s' },
        { row: first, height: PODIUM_HEIGHTS[0], delay: '.25s' },
        { row: third, height: PODIUM_HEIGHTS[2], delay: '.4s' },
    ];
    return (
        <div className="grid grid-cols-3 items-end gap-3 pt-2">
            {slots.map(({ row, height, delay }, index) => {
                if (!row) return <div key={index} />;
                const winner = row.place === 1;
                const me = row.employee_id === selectedId;
                return (
                    <div key={row.employee_id} data-testid="podium-slot" className="flex min-w-0 flex-col items-center gap-2">
                        <div className="bos-rise flex min-w-0 flex-col items-center gap-1.5" style={{ animationDelay: delay }}>
                            <span className={winner ? 'rounded-full ring-2 ring-bos-accent ring-offset-2 ring-offset-bos-surface' : ''}><Avatar name={row.name} size={winner ? 'lg' : 'md'} /></span>
                            <span className="max-w-full truncate text-center text-sm font-semibold leading-tight">{row.name}</span>
                            {me && <span className="-mt-1 text-xs font-medium text-bos-accent-text">Tú</span>}
                            <span className={`font-display font-semibold tabular-nums ${winner ? 'text-2xl text-bos-accent-text' : 'text-xl text-bos-text'}`}>{row.cuts}</span>
                        </div>
                        <div className={`bos-grow flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2 ${height} ${winner ? 'border-bos-accent bg-bos-accent-soft' : 'border-bos-border bg-bos-raised'}`} style={{ animationDelay: delay }}>
                            <span className={`font-display text-2xl font-semibold ${winner ? 'text-bos-accent-text' : 'text-bos-muted'}`}>{row.place}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function PodiumInsightText({ rows, selectedId, mine }: { rows: RankedRow[]; selectedId: string; mine: boolean }) {
    const insight = podiumInsight(rows, selectedId);
    if (!insight) return <p className="text-[15px] text-bos-muted">{mine ? 'Aún no apareces en el podio.' : 'No aparece en el podio.'}</p>;
    const { me, above, gapToAbove, leadOverNext, tied } = insight;
    const who = mine ? 'Vas' : `${me.name} va`;
    let text: string;
    if (me.cuts === 0) text = `${mine ? 'Todavía no tienes' : 'Todavía no tiene'} cortes esta semana.${above ? ` ${above.name} va al frente con ${above.cuts}.` : ''}`;
    else if (above) text = `${who} en ${me.place}.º lugar${tied ? ' (empatado)' : ''}. ${mine ? 'Te' : 'Le'} ${gapToAbove === 1 ? 'falta' : 'faltan'} ${plural(gapToAbove, 'corte', 'cortes')} para alcanzar a ${above.name}.`;
    else if (leadOverNext > 0) text = `${who} al frente, con ${plural(leadOverNext, 'corte', 'cortes')} de ventaja.`;
    else text = `${who} al frente${tied ? ', empatado' : ''}.`;
    return <p data-testid="podium-insight" className="text-[15px] font-medium">{text}</p>;
}

export default function PodiumCard({ rows, selectedId, mine, extras }: { rows: RankedRow[]; selectedId: string; mine: boolean; extras: PodiumExtras | null }) {
    const diff = extras && extras.weekCuts !== null && extras.lastWeekCuts !== null ? extras.weekCuts - extras.lastWeekCuts : null;
    return (
        <section aria-labelledby="podium-title" data-testid="podium" className={`${card} space-y-4 p-4 sm:p-6`}>
            <div>
                <h2 id="podium-title" className={sectionTitle}>Podio de la semana</h2>
                <p className="text-sm text-bos-muted">Por número de cortes y servicios, no por dinero.</p>
            </div>
            {podiumIsEmpty(rows) ? (
                <p className="rounded-lg bg-bos-raised px-4 py-5 text-center text-[15px] text-bos-muted">Aún no hay cortes esta semana. El primero abre el podio.</p>
            ) : (
                <>
                    <Stage rows={rows} selectedId={selectedId} />
                    <div className="space-y-1 rounded-lg bg-bos-raised px-4 py-3">
                        <PodiumInsightText rows={rows} selectedId={selectedId} mine={mine} />
                        {diff !== null && (
                            <p className="text-sm text-bos-muted">
                                {diff === 0 ? 'Igual que la semana pasada' : `${plural(Math.abs(diff), 'corte', 'cortes')} ${diff > 0 ? 'más' : 'menos'} que la semana pasada`}
                                {' '}({extras!.lastWeekCuts} → {extras!.weekCuts}).
                            </p>
                        )}
                        {extras?.bestDay && <p className="text-sm text-bos-muted">{mine ? 'Tu' : 'Su'} mejor día: {WEEKDAYS[extras.bestDay.dow]} ({plural(extras.bestDay.services, 'servicio', 'servicios')}).</p>}
                    </div>
                </>
            )}
            <ol className="space-y-2.5 border-t border-bos-border pt-4">
                {rows.map((row) => {
                    const me = row.employee_id === selectedId;
                    return (
                        <li key={row.employee_id} data-testid="podium-row" aria-current={me ? 'true' : undefined} className={`grid grid-cols-[20px_32px_minmax(0,1fr)_32px] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-[15px] ${me ? 'bg-bos-accent-soft' : ''}`}>
                            <span className={`font-display font-semibold ${row.place === 1 ? 'text-bos-accent-text' : 'text-bos-muted'}`}>{row.place}</span>
                            <Avatar name={row.name} size="sm" />
                            <span className={`truncate ${me ? 'font-semibold' : ''}`}>{row.name}{me && mine ? ' (tú)' : ''}</span>
                            <span className="text-right font-semibold tabular-nums">{row.cuts}</span>
                            <span aria-hidden="true" className="col-start-3 col-end-5 h-2 overflow-hidden rounded-full bg-bos-raised">
                                <span className={`block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${me || row.place === 1 ? 'bg-bos-accent' : 'bg-bos-muted'}`} style={{ width: `${Math.round(row.share * 100)}%` }} />
                            </span>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
