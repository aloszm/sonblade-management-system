'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { presetRange, type PresetId } from '@/lib/reports/metrics';
import { ISSUE_LABELS, rowBalanced, totals, type Reconciliation } from '@/lib/reports/reconciliation';
import { localDateKey } from '@/lib/utils/dates';

const PRESETS: { id: Exclude<PresetId, 'custom' | 'last30'>; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
];
const money = (n: number) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const timeOf = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Cuadre: lo que dice la agenda, lo que se cobró, la comisión que eso generó y lo que ya se pagó en recibo
 * tienen que coincidir. Cada diferencia aparece con su causa para corregirla.
 */
export default function ReconciliationPage() {
    const today = useMemo(() => localDateKey(new Date()), []);
    const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('today');
    const [data, setData] = useState<Reconciliation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const { from, to } = presetRange(preset, today);
            const res = await fetch(`/api/reconciliation?from=${from}&to=${to}`, { cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo cargar el cuadre.');
            setData(body as Reconciliation);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo cargar el cuadre.');
        } finally { setLoading(false); }
    }, [preset, today]);

    useEffect(() => { load(); }, [load]);

    const sum = data ? totals(data.rows) : null;
    const balanced = !!data && data.issues.length === 0 && data.rows.every(rowBalanced);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Cuadre</h1>
                    <p className="text-sm text-bos-muted max-w-2xl">Agenda, cobros, comisiones y recibos deben contar lo mismo. Cada servicio cobrado queda en la agenda del barbero; si algo no coincide, aquí aparece la causa.</p>
                </div>
                <div role="group" aria-label="Periodo" className="flex gap-2">
                    {PRESETS.map((p) => (
                        <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}
                            className={`h-9 px-3.5 rounded-full border text-sm font-medium ${preset === p.id ? 'border-bos-text bg-bos-text text-bos-bg' : 'border-bos-border text-bos-muted hover:text-bos-text'}`}>{p.label}</button>
                    ))}
                </div>
            </header>

            {error && <p role="alert" className="rounded-xl border border-bos-border bg-bos-surface p-4 text-bos-danger">{error}</p>}
            {loading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-bos-muted" /></div>}

            {!loading && data && sum && (
                <>
                    <section data-testid="reconciliation-status"
                        className={`flex items-start gap-3 rounded-xl border p-4 ${balanced ? 'border-bos-border bg-bos-success-soft' : 'border-bos-border bg-bos-surface'}`}>
                        {balanced
                            ? <CheckCircle2 aria-hidden="true" className="h-6 w-6 shrink-0 text-bos-success" />
                            : <TriangleAlert aria-hidden="true" className="h-6 w-6 shrink-0 text-bos-danger" />}
                        <div>
                            <p className="font-semibold">{balanced ? 'Todo cuadra' : `${data.issues.length} diferencia${data.issues.length === 1 ? '' : 's'} por revisar`}</p>
                            <p className="text-sm text-bos-muted">
                                {sum.agenda} servicio{sum.agenda === 1 ? '' : 's'} en agenda · {sum.charged} cobrado{sum.charged === 1 ? '' : 's'} por {money(sum.amount)} ·
                                comisión {money(sum.commission)}, de la que {money(sum.inReceipt)} ya está en recibos pagados.
                            </p>
                        </div>
                    </section>

                    <section aria-label="Por barbero y día" className="rounded-xl border border-bos-border bg-bos-surface overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead>
                                    <tr className="border-b border-bos-border text-left text-[13px] text-bos-muted">
                                        <th className="px-4 py-3 font-medium">Día</th>
                                        <th className="px-4 py-3 font-medium">Barbero</th>
                                        <th className="px-4 py-3 font-medium text-right">En agenda</th>
                                        <th className="px-4 py-3 font-medium text-right">Cobrados</th>
                                        <th className="px-4 py-3 font-medium text-right">Importe</th>
                                        <th className="px-4 py-3 font-medium text-right">Comisión</th>
                                        <th className="px-4 py-3 font-medium text-right">En recibo</th>
                                        <th className="px-4 py-3 font-medium">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.length === 0 && (
                                        <tr><td colSpan={8} className="px-4 py-10 text-center text-bos-muted">Sin servicios en este periodo.</td></tr>
                                    )}
                                    {data.rows.map((r) => {
                                        const ok = rowBalanced(r);
                                        return (
                                            <tr key={`${r.day}-${r.employee_id}`} data-testid="reconciliation-row" className="border-b border-bos-border last:border-0">
                                                <td className="px-4 py-3 whitespace-nowrap first-letter:uppercase">{dayLabel(r.day)}</td>
                                                <td className="px-4 py-3 font-medium">{r.name}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{r.agenda_services}{Number(r.agenda_walk_in) > 0 && <span className="text-bos-muted"> ({r.agenda_walk_in} sin cita)</span>}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{r.charged_services}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{money(r.charged_amount)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{money(r.commission)}</td>
                                                <td className="px-4 py-3 text-right tabular-nums">{money(r.commission_in_receipt)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${ok ? 'bg-bos-success-soft text-bos-success' : 'bg-bos-raised text-bos-danger'}`}>
                                                        {ok ? 'Cuadra' : `${r.issues || 'Revisar'}${r.issues ? ' por revisar' : ''}`}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {data.issues.length > 0 && (
                        <section aria-label="Diferencias" className="rounded-xl border border-bos-border bg-bos-surface p-4">
                            <h2 className="text-[15px] font-semibold">Diferencias</h2>
                            <ul className="mt-3 divide-y divide-bos-border">
                                {data.issues.map((i, n) => (
                                    <li key={`${i.kind}-${i.appointment_id ?? ''}-${i.sale_id ?? ''}-${n}`} data-testid="reconciliation-issue" className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                                        <div className="min-w-0">
                                            <p><span className="font-semibold">{ISSUE_LABELS[i.kind]}</span><span className="text-bos-muted"> · {i.name ?? 'Sin barbero'} · {timeOf(i.at)}</span></p>
                                            <p className="text-bos-muted">{i.message}</p>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            {i.kind === 'llego_sin_cobro' && i.appointment_id && (
                                                <Link href={`/pos?cita=${i.appointment_id}`} className="min-h-11 px-4 rounded-xl bg-bos-accent text-bos-on-accent font-bold inline-flex items-center">Cobrar</Link>
                                            )}
                                            {i.sale_id && <Link href={`/ticket/${i.sale_id}`} className="min-h-11 px-4 rounded-xl border border-bos-border font-semibold inline-flex items-center hover:bg-bos-raised">Ver ticket</Link>}
                                            {i.appointment_id && i.kind !== 'llego_sin_cobro' && (
                                                <Link href="/citas" className="min-h-11 px-4 rounded-xl border border-bos-border font-semibold inline-flex items-center hover:bg-bos-raised">Ir a la agenda</Link>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
