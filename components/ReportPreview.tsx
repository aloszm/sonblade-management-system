'use client';

import React, { useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
    money, percentChange, plainNumber, tableTexts,
    type ReportBars, type ReportKpis, type ReportModel, type ReportSection, type ReportTable,
} from '@/lib/reports/full-report';

const card = 'rounded-xl border border-bos-border bg-bos-surface';
const AXIS = { fill: 'var(--bos-muted)', fontSize: 12 };
const TOOLTIP = {
    contentStyle: { background: 'var(--bos-surface)', border: '1px solid var(--bos-border)', borderRadius: 12, color: 'var(--bos-text)', fontSize: 13 },
    labelStyle: { color: 'var(--bos-muted)', marginBottom: 4 },
    itemStyle: { color: 'var(--bos-text)' },
    cursor: { fill: 'var(--bos-raised)' },
};
const PAGE = 25;

function Change({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
    const d = percentChange(current, previous);
    if (d === null) return <span className="text-sm text-bos-muted">Sin datos para comparar</span>;
    if (d === 0) return <span className="text-sm text-bos-muted">Igual que el periodo anterior</span>;
    const good = invert ? d < 0 : d > 0;
    const Icon = d > 0 ? ArrowUpRight : ArrowDownRight;
    return (
        <span className={`inline-flex items-center gap-1 text-sm font-semibold ${good ? 'text-bos-success' : 'text-bos-danger'}`}>
            <Icon aria-hidden="true" className="h-4 w-4" />{d > 0 ? '+' : '−'}{Math.abs(d).toLocaleString('es-MX')}%
        </span>
    );
}

function KpiGrid({ block }: { block: ReportKpis }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {block.items.map((item) => (
                <div key={item.label} className="rounded-xl bg-bos-raised px-4 py-3">
                    <p className="text-[13px] font-medium text-bos-muted">{item.label}</p>
                    <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{item.format === 'money' ? money(item.value) : plainNumber(item.value)}</p>
                    <Change current={item.value} previous={item.previous} invert={item.invert} />
                    {item.note && <p className="mt-1 text-xs text-bos-muted">{item.note}</p>}
                </div>
            ))}
        </div>
    );
}

function Chart({ block }: { block: ReportBars }) {
    const fmt = (v: number) => (block.format === 'money' ? money(v) : plainNumber(v));
    return (
        <div>
            <h4 className="font-display text-base font-semibold mb-2">{block.title}</h4>
            <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={block.items} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--bos-border)" />
                        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={block.format === 'money' ? 56 : 32} allowDecimals={false}
                            tickFormatter={(v: number) => (block.format === 'money' ? `$${Math.round(v).toLocaleString('es-MX')}` : String(v))} />
                        <Tooltip {...TOOLTIP} formatter={(v) => [fmt(Number(v ?? 0)), block.title]} />
                        <Bar dataKey="value" name={block.title} fill={block.color === 'accent' ? 'var(--bos-accent)' : 'var(--bos-text)'} radius={[6, 6, 0, 0]} maxBarSize={40} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function DataTable({ table, timeZone }: { table: ReportTable; timeZone: string }) {
    const [all, setAll] = useState(false);
    const { head, body, total } = tableTexts(table, timeZone);
    const numeric = table.columns.map((c) => c.type === 'money' || c.type === 'number');
    const shown = all ? body : body.slice(0, PAGE);
    return (
        <div>
            {table.title && <h4 className="font-display text-base font-semibold mb-2">{table.title}</h4>}
            {body.length === 0 ? (
                <p className="text-sm text-bos-muted">{table.empty}</p>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-lg border border-bos-border">
                        <table className="w-full text-sm" data-testid="report-table">
                            <thead>
                                <tr className="bg-bos-raised text-left text-[13px] text-bos-muted">
                                    {head.map((h, i) => <th key={h + i} className={`px-3 py-2 font-semibold whitespace-nowrap ${numeric[i] ? 'text-right' : ''}`}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((row, r) => (
                                    <tr key={r} className="border-t border-bos-border">
                                        {row.map((cell, i) => <td key={i} className={`px-3 py-2 align-top ${numeric[i] ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{cell}</td>)}
                                    </tr>
                                ))}
                                {total && (
                                    <tr className="border-t border-bos-border bg-bos-raised font-semibold">
                                        {total.map((cell, i) => <td key={i} className={`px-3 py-2 ${numeric[i] ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{cell}</td>)}
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {body.length > PAGE && (
                        <button type="button" onClick={() => setAll(!all)} className="mt-2 h-9 px-3 rounded-lg border border-bos-border text-sm font-semibold text-bos-muted hover:text-bos-text hover:bg-bos-raised">
                            {all ? 'Mostrar menos' : `Mostrar las ${body.length} filas`}
                        </button>
                    )}
                    {body.length > PAGE && !all && <p className="mt-1 text-xs text-bos-muted">En pantalla se ven las primeras {PAGE}; el PDF y el Excel traen todas.</p>}
                </>
            )}
        </div>
    );
}

function Section({ section, timeZone }: { section: ReportSection; timeZone: string }) {
    const nodes: React.ReactNode[] = [];
    for (let i = 0; i < section.blocks.length; i++) {
        const block = section.blocks[i];
        if (block.kind === 'text') {
            nodes.push(<p key={i} className={block.tone === 'note' ? 'text-sm text-bos-muted' : 'text-[15px] leading-relaxed'}>{block.text}</p>);
        } else if (block.kind === 'kpis') {
            nodes.push(<KpiGrid key={i} block={block} />);
        } else if (block.kind === 'bars') {
            // Dos gráficas seguidas van juntas en una fila.
            const next = section.blocks[i + 1];
            const pair = next && next.kind === 'bars' ? next : null;
            nodes.push(
                <div key={i} className="grid gap-6 lg:grid-cols-2">
                    <Chart block={block} />
                    {pair && <Chart block={pair} />}
                </div>,
            );
            if (pair) i++;
        } else {
            nodes.push(<DataTable key={i} table={block} timeZone={timeZone} />);
        }
    }
    return (
        <section aria-labelledby={`sec-${section.id}`} data-testid={`section-${section.id}`} className={`${card} p-5 space-y-5`}>
            <header>
                <h3 id={`sec-${section.id}`} className="font-display text-xl font-semibold"><span className="text-bos-accent-text">{section.number}.</span> {section.title}</h3>
                <p className="text-sm text-bos-muted">{section.explain}</p>
            </header>
            {nodes}
        </section>
    );
}

/** Vista en pantalla de todo el reporte, con las mismas secciones, tablas y gráficas que el PDF. */
export default function ReportPreview({ model }: { model: ReportModel }) {
    return (
        <div className="space-y-6" data-testid="report-preview">
            {model.sections.map((section) => <Section key={section.id} section={section} timeZone={model.timezone} />)}
        </div>
    );
}
