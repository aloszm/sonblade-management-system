'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, FileSpreadsheet, FileText, Loader2, ShieldCheck } from 'lucide-react';
import ReportPreview from '@/components/ReportPreview';
import { localDateKey } from '@/lib/utils/dates';
import {
    AUDIENCE_LABELS, AUDIENCE_NOTES, REPORT_PRESETS, buildReportModel, reportFileName, reportPresetRange, validateRange,
    type ReportPresetId,
} from '@/lib/reports/full-report';
import type { Audience, ExportedReport, FullReport } from '@/lib/reports/full-report-types';

const card = 'rounded-xl border border-bos-border bg-bos-surface';
const label = 'text-[13px] font-medium text-bos-muted';
const field = 'h-11 px-3 rounded-xl bg-bos-surface border border-bos-border text-base text-bos-text';
const primary = 'min-h-[48px] px-5 rounded-xl bg-bos-accent text-bos-on-accent text-[15px] font-bold hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';
const secondary = 'min-h-[48px] px-5 rounded-xl border border-bos-border text-bos-text text-[15px] font-semibold hover:bg-bos-raised disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

type Kind = 'pdf' | 'xlsx';
const MIME: Record<Kind, string> = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

function saveFile(bytes: Uint8Array, filename: string, mime: string) {
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

export default function ReportsPage() {
    const [today, setToday] = useState('');
    const [preset, setPreset] = useState<ReportPresetId>('week');
    const [range, setRange] = useState<{ from: string; to: string } | null>(null);
    const [audience, setAudience] = useState<Audience>('interno');
    const [report, setReport] = useState<FullReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<Kind | null>(null);
    const [issued, setIssued] = useState<{ folio: string; sha256: string; kind: Kind } | null>(null);

    // "Hoy" se calcula en el dispositivo (la barbería), nunca en el servidor.
    useEffect(() => {
        const t = localDateKey(new Date());
        setToday(t);
        setRange(reportPresetRange('week', t));
    }, []);

    const rangeError = range ? validateRange(range.from, range.to) : null;

    const load = useCallback(async () => {
        if (!range || validateRange(range.from, range.to)) return;
        setLoading(true);
        try {
            const qs = new URLSearchParams({ from: range.from, to: range.to, audience });
            const res = await fetch(`/api/reports/full?${qs}`, { cache: 'no-store' });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.detail && /[áéíóúñ¿]/.test(body.detail) ? body.detail : body?.error ?? 'No se pudo armar el reporte.');
            setReport(body as FullReport);
            setError('');
        } catch (e) {
            setReport(null);
            setError(e instanceof Error ? e.message : 'No se pudo armar el reporte.');
        } finally { setLoading(false); }
    }, [range, audience]);

    useEffect(() => { load(); }, [load]);

    const pickPreset = (id: ReportPresetId) => {
        setPreset(id);
        if (id !== 'custom' && today) setRange(reportPresetRange(id, today));
    };

    const model = useMemo(() => (report ? buildReportModel(report) : null), [report]);

    // Cada archivo sale con un folio y un código nuevos, que la base registra antes de generarlo.
    const download = async (kind: Kind) => {
        if (!range || rangeError) return;
        setBusy(kind);
        setError('');
        try {
            const res = await fetch('/api/reports/export', {
                method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: range.from, to: range.to, audience }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? 'No se pudo emitir el reporte.');
            const exported = body as ExportedReport;
            const finalModel = buildReportModel(exported.report, { folio: exported.folio, sha256: exported.sha256 });
            const bytes = kind === 'pdf'
                ? await (await import('@/lib/reports/full-report-pdf')).buildReportPdf(finalModel)
                : await (await import('@/lib/reports/full-report-xlsx')).buildReportXlsx(finalModel);
            saveFile(bytes, `${reportFileName(finalModel)}.${kind}`, MIME[kind]);
            setIssued({ folio: exported.folio, sha256: exported.sha256, kind });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo generar el archivo.');
        } finally { setBusy(null); }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-3xl font-semibold tracking-tight">Reportes</h1>
                    <p className="text-sm text-bos-muted max-w-2xl">Un reporte completo del periodo para el dueño, la gerencia y el contador. Cada archivo lleva un folio y un código para comprobar que es auténtico.</p>
                </div>
                <Link href="/reportes/verificar" className={`${secondary} min-h-[44px]`}>
                    <ShieldCheck aria-hidden="true" className="h-5 w-5" /> Verificar un reporte
                </Link>
            </header>

            <section aria-label="Opciones del reporte" className={`${card} p-5 space-y-5`}>
                <div className="space-y-2">
                    <p className={label}>Periodo</p>
                    <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1 p-1 rounded-xl bg-bos-raised w-fit max-w-full">
                        {REPORT_PRESETS.map((pr) => (
                            <button key={pr.id} type="button" aria-pressed={preset === pr.id} onClick={() => pickPreset(pr.id)}
                                className={`h-10 px-4 rounded-lg text-sm font-semibold transition-colors ${preset === pr.id ? 'bg-bos-surface text-bos-text shadow-sm' : 'text-bos-muted hover:text-bos-text'}`}>
                                {pr.label}
                            </button>
                        ))}
                    </div>
                    {preset === 'custom' && range && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <label className="sr-only" htmlFor="report-from">Desde</label>
                            <input id="report-from" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className={field} />
                            <span className="text-bos-muted">a</span>
                            <label className="sr-only" htmlFor="report-to">Hasta</label>
                            <input id="report-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className={field} />
                        </div>
                    )}
                    {rangeError && <p role="alert" className="text-sm text-bos-danger">{rangeError}</p>}
                </div>

                <div className="space-y-2">
                    <p className={label}>¿Para quién es?</p>
                    <div role="group" aria-label="Audiencia" className="grid gap-2 sm:grid-cols-2">
                        {(['interno', 'contador'] as const).map((a) => (
                            <button key={a} type="button" aria-pressed={audience === a} onClick={() => setAudience(a)} data-testid={`audience-${a}`}
                                className={`text-left rounded-xl border px-4 py-3 transition-colors ${audience === a ? 'border-bos-text bg-bos-raised' : 'border-bos-border hover:bg-bos-raised'}`}>
                                <span className="block font-semibold text-[15px]">{AUDIENCE_LABELS[a]}</span>
                                <span className="block text-sm text-bos-muted">{AUDIENCE_NOTES[a]}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                    <button type="button" data-testid="download-pdf" onClick={() => download('pdf')} disabled={busy !== null || !report || !!rangeError} className={primary}>
                        {busy === 'pdf' ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <FileText aria-hidden="true" className="h-5 w-5" />} Descargar PDF
                    </button>
                    <button type="button" data-testid="download-xlsx" onClick={() => download('xlsx')} disabled={busy !== null || !report || !!rangeError} className={secondary}>
                        {busy === 'xlsx' ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <FileSpreadsheet aria-hidden="true" className="h-5 w-5" />} Descargar Excel
                    </button>
                    <p className="text-sm text-bos-muted">Al descargar se emite un folio nuevo y queda anotado en la bitácora.</p>
                </div>
            </section>

            {issued && (
                <section aria-live="polite" data-testid="issued" className={`${card} p-5 flex flex-wrap items-start gap-4`}>
                    <span aria-hidden="true" className="h-10 w-10 rounded-full bg-bos-success-soft text-bos-success inline-flex items-center justify-center shrink-0"><Check className="h-5 w-5" /></span>
                    <div className="min-w-0 space-y-1">
                        <p className="font-semibold">Reporte emitido: {issued.kind === 'pdf' ? 'PDF' : 'Excel'} descargado</p>
                        <p className="text-sm text-bos-muted">Anota estos datos al archivarlo. Se comprueban en Verificar un reporte.</p>
                        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                            <dt className="text-bos-muted">Folio</dt><dd data-testid="issued-folio" className="font-semibold tabular-nums">{issued.folio}</dd>
                            <dt className="text-bos-muted">Código</dt><dd data-testid="issued-code" className="font-mono text-[13px] break-all">{issued.sha256}</dd>
                        </dl>
                    </div>
                </section>
            )}

            {error && <p role="alert" className={`${card} p-4 text-bos-danger`}>{error}</p>}
            {loading && !model && !error && <div className="flex justify-center py-24"><Loader2 aria-label="Cargando" className="h-8 w-8 animate-spin text-bos-muted" /></div>}

            {model && (
                <>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                            <h2 className="font-display text-xl font-semibold">Vista previa</h2>
                            <p className="text-sm text-bos-muted" data-testid="preview-period">{model.period.label} · {AUDIENCE_LABELS[model.audience]}. Todavía no tiene folio: se asigna al descargar.</p>
                        </div>
                        {loading && <Loader2 aria-label="Actualizando" className="h-5 w-5 animate-spin text-bos-muted" />}
                    </div>
                    <ReportPreview model={model} />
                </>
            )}
        </div>
    );
}
