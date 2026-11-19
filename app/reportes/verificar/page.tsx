'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, CircleX, Loader2 } from 'lucide-react';
import { AUDIENCE_LABELS, formatDateTime, formatDay } from '@/lib/reports/full-report';
import type { VerifyResult } from '@/lib/reports/full-report-types';

const card = 'rounded-xl border border-bos-border bg-bos-surface';
const label = 'text-[13px] font-medium text-bos-muted';
const field = 'w-full h-12 px-3 rounded-xl bg-bos-bg border border-bos-control text-base text-bos-text placeholder:text-bos-muted focus-visible:border-bos-accent-text';
const primary = 'min-h-[48px] px-5 rounded-xl bg-bos-accent text-bos-on-accent text-[15px] font-bold hover:bg-bos-accent-strong disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

const WHY: Record<string, string> = {
    format: 'El folio debe verse así: REP-000001, y el código tiene al menos 16 letras y números (de la a a la f y del 0 al 9).',
    not_found: 'No hay ningún reporte con ese folio en tu negocio.',
    code_mismatch: 'El folio existe, pero el código no es el que se emitió con él. Revisa que lo escribiste completo o pide el archivo original.',
    altered: 'El código coincide, pero el contenido guardado de este reporte ya no da el mismo resultado. Avisa a la cuenta principal: el registro fue alterado.',
};

export default function VerifyReportPage() {
    const [folio, setFolio] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<VerifyResult | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        setResult(null);
        try {
            const res = await fetch('/api/reports/verify', {
                method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folio, code }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error ?? 'No se pudo verificar.');
            setResult(body as VerifyResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo verificar.');
        } finally { setBusy(false); }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <header className="space-y-2">
                <Link href="/reportes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-bos-muted hover:text-bos-text"><ArrowLeft aria-hidden="true" className="h-4 w-4" /> Reportes</Link>
                <h1 className="font-display text-3xl font-semibold tracking-tight">Verificar un reporte</h1>
                <p className="text-sm text-bos-muted">Escribe el folio y el código que vienen en la portada y en el pie de cada página. Si coinciden, el sistema confirma de cuándo es, para quién y quién lo generó.</p>
            </header>

            <form onSubmit={submit} className={`${card} p-5 space-y-5`}>
                <div className="space-y-2">
                    <label htmlFor="verify-folio" className={label}>Folio</label>
                    <input id="verify-folio" type="text" autoComplete="off" autoCapitalize="characters" placeholder="REP-000001" value={folio} onChange={(e) => setFolio(e.target.value)} className={field} />
                </div>
                <div className="space-y-2">
                    <label htmlFor="verify-code" className={label}>Código de verificación</label>
                    <input id="verify-code" type="text" autoComplete="off" spellCheck={false} placeholder="Los primeros 16 caracteres bastan" value={code} onChange={(e) => setCode(e.target.value)} className={`${field} font-mono`} />
                </div>
                <button type="submit" disabled={busy || !folio.trim() || !code.trim()} className={primary} data-testid="verify-submit">
                    {busy && <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />} Verificar
                </button>
            </form>

            {error && <p role="alert" className={`${card} p-4 text-bos-danger`}>{error}</p>}

            {result && result.valid && (
                <section data-testid="verify-valid" aria-live="polite" className={`${card} p-5 space-y-3 border-bos-success`}>
                    <p className="flex items-center gap-2 font-display text-xl font-semibold text-bos-success"><CircleCheck aria-hidden="true" className="h-6 w-6" /> Reporte válido</p>
                    <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-[auto_1fr]">
                        <dt className="text-bos-muted">Folio</dt><dd className="font-semibold">{result.folio}</dd>
                        <dt className="text-bos-muted">Periodo</dt><dd>{formatDay(result.period_from)} al {formatDay(result.period_to)}</dd>
                        <dt className="text-bos-muted">Audiencia</dt><dd>{AUDIENCE_LABELS[result.audience]}</dd>
                        <dt className="text-bos-muted">Sucursal</dt><dd>{result.branch}</dd>
                        <dt className="text-bos-muted">Generado por</dt><dd>{result.generated_by}</dd>
                        <dt className="text-bos-muted">Fecha y hora</dt><dd>{formatDateTime(result.generated_at, result.timezone ?? 'America/Mexico_City', true)}</dd>
                    </dl>
                </section>
            )}
            {result && !result.valid && (
                <section data-testid="verify-invalid" role="alert" className={`${card} p-5 space-y-2 border-bos-danger`}>
                    <p className="flex items-center gap-2 font-display text-xl font-semibold text-bos-danger"><CircleX aria-hidden="true" className="h-6 w-6" /> No coincide</p>
                    <p className="text-[15px] text-bos-muted">{WHY[result.reason] ?? 'No se pudo comprobar el reporte.'}</p>
                </section>
            )}
        </div>
    );
}
